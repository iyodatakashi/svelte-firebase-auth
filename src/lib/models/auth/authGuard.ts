import type { AuthGuardDecision, AuthGuardInput, AuthRoutes } from './auth.types';

/**
 * 到達の判定。副作用を持たず、`$app/*` を参照しない。
 * 段階・現在の経路・設定・保持している戻り先だけから、留まるか振り替えるかを決める。
 *
 * **各段階は、その段階のための経路への到達を許す。** 許さないと振り替え先がふたたび
 * 振り替えの対象になり、遷移が止まらない
 */
export const resolveAuthGuard = ({
	stage,
	currentPath,
	routes,
	returnTo
}: AuthGuardInput): AuthGuardDecision => {
	// 受け入れられない戻り先は、持っていないものとして扱う。用いも保持し直しもしない
	const held = returnTo !== null && isSafeReturnTo(returnTo) ? returnTo : null;

	switch (stage) {
		case 'unresolved':
			return { kind: 'wait' };

		case 'signed-out': {
			if (matchesAny(currentPath, [routes.signIn, routes.signUp, routes.passwordReset])) {
				return { kind: 'allow' };
			}
			// 認証の経路は戻り先にしない。サインインの後にサインインへ戻ると遷移が止まらない
			const origin = isAuthRoute(currentPath, routes) ? held : currentPath;
			return { kind: 'redirect', to: routes.signIn, returnTo: origin };
		}

		case 'account-unselected':
			// サインインは常に新しいアカウントとして入り、保持している他のアカウントを上書きしない
			if (matchesAny(currentPath, [routes.signIn, routes.signUp, routes.passwordReset])) {
				return { kind: 'allow' };
			}
			// 遷移しない。組み込み側の選択 UI からアカウントが選ばれるのを待つ
			return {
				kind: 'select',
				returnTo: matchesRoute(currentPath, routes.verifyEmail) ? held : currentPath
			};

		case 'email-unverified':
			return matchesRoute(currentPath, routes.verifyEmail)
				? { kind: 'allow' }
				: // 確認を終えるまでのあいだ、保持している戻り先を失わせない
					{ kind: 'redirect', to: routes.verifyEmail, returnTo: held };

		case 'ready':
			return isAuthRoute(currentPath, routes)
				? { kind: 'redirect', to: destinationOf(held, routes), returnTo: null }
				: { kind: 'allow' };
	}
};

/**
 * 現在の経路が、設定された経路であるかを判定する。
 *
 * **前方一致にしない。** `/signin` が `/signin-help` に当たると、振り替え先が振り替えの
 * 対象から外れ、遷移が止まらなくなる
 */
export const matchesRoute = (currentPath: string, route: string): boolean =>
	normalizePath(currentPath) === normalizePath(route);

/**
 * 戻り先として受け入れる形。**根からの相対の経路だけ**とする。
 * 外部を指し得ない形に限ることで、オリジンの照合を各所で行う必要が無くなる。
 * `//evil.example` と `/\evil.example` はブラウザが外部として解決するため弾く
 */
const isSafeReturnTo = (value: string): boolean => value.startsWith('/') && !/^\/[/\\]/.test(value);

/** 認証の経路は4つ。既定の行き先とパスワードの変更は含まない */
const isAuthRoute = (path: string, routes: AuthRoutes): boolean =>
	matchesAny(path, [routes.signIn, routes.signUp, routes.verifyEmail, routes.passwordReset]);

const matchesAny = (path: string, candidates: readonly string[]): boolean =>
	candidates.some((route) => matchesRoute(path, route));

/** 戻り先が認証の経路であれば用いない。振り替えが止まらなくなるため */
const destinationOf = (held: string | null, routes: AuthRoutes): string =>
	held !== null && !isAuthRoute(held, routes) ? held : routes.afterSignIn;

/** 問い合わせ文字列を落とし、末尾の区切りを取り除く。根（`/`）は空にしない */
const normalizePath = (path: string): string => {
	const pathname = path.split('?')[0];
	return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
};
