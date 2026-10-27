import type { AuthGuardDecision, AuthGuardInput, AuthRoutes, HeldReturnTo } from './auth.types';

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
	returnTo,
	accountUid,
	accountUids,
	lastShown
}: AuthGuardInput): AuthGuardDecision => {
	// 受け入れられない戻り先は、持っていないものとして扱う。用いも保持し直しもしない
	const held = returnTo !== null && isSafeReturnTo(returnTo.path) ? returnTo : null;
	/**
	 * 現在の経路を戻り先にする。使用中のアカウントが離れたときに開いていた経路なら、
	 * そのアカウントにだけ戻す。別のアカウントに、前のアカウントの経路を引き継がせない
	 */
	const current: HeldReturnTo = {
		path: currentPath,
		ownerUid: lastShown !== null && lastShown.path === currentPath ? lastShown.uid : null
	};

	switch (stage) {
		case 'unresolved':
			return { kind: 'wait' };

		case 'signed-out': {
			if (matchesAny(currentPath, [routes.signIn, routes.signUp, routes.passwordReset])) {
				return { kind: 'allow' };
			}
			// 認証の経路は戻り先にしない。サインインの後にサインインへ戻ると遷移が止まらない
			const origin = isAuthRoute(currentPath, routes) ? held : current;
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
				returnTo: matchesRoute(currentPath, routes.verifyEmail) ? held : current
			};

		case 'email-unverified':
			return matchesRoute(currentPath, routes.verifyEmail)
				? { kind: 'allow' }
				: // 確認を終えるまでのあいだ、保持している戻り先を失わせない
					{ kind: 'redirect', to: routes.verifyEmail, returnTo: held };

		case 'ready': {
			const isOthers = held !== null && held.ownerUid !== null && held.ownerUid !== accountUid;
			if (isAuthRoute(currentPath, routes)) {
				return {
					kind: 'redirect',
					to: destinationOf(isOthers ? null : held, routes),
					returnTo: null
				};
			}
			// 前のアカウントが離れた後、同じ経路のまま別のアカウントになった。前のアカウントの経路に留めない。
			// 選択の解除を経た場合は保持した戻り先で、1件だけ残ってそのまま選ばれた場合は最後に見せた経路で分かる。
			// 前のアカウントをまだ保持しているなら、利用者が自分で切り替えたのであり、留める。
			// 既定の行き先そのものなら振り替えない。同じ経路への振り替えは終わらない
			const leftHere =
				(isOthers && held.path === currentPath) ||
				(lastShown !== null &&
					lastShown.path === currentPath &&
					lastShown.uid !== accountUid &&
					!accountUids.includes(lastShown.uid));
			if (leftHere && !matchesRoute(currentPath, routes.afterSignIn)) {
				return { kind: 'redirect', to: routes.afterSignIn, returnTo: null };
			}
			return { kind: 'allow' };
		}
	}
};

/** 保存された戻り先の形を検証する。合わないものは `null` として捨てる */
export const parseHeldReturnTo = (value: unknown): HeldReturnTo | null => {
	if (typeof value !== 'object' || value === null) {
		return null;
	}
	const { path, ownerUid } = value as Record<string, unknown>;
	if (typeof path !== 'string' || (ownerUid !== null && typeof ownerUid !== 'string')) {
		return null;
	}
	return { path, ownerUid };
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
const destinationOf = (held: HeldReturnTo | null, routes: AuthRoutes): string =>
	held !== null && !isAuthRoute(held.path, routes) ? held.path : routes.afterSignIn;

/** 問い合わせ文字列を落とし、末尾の区切りを取り除く。根（`/`）は空にしない */
const normalizePath = (path: string): string => {
	const pathname = path.split('?')[0];
	return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
};
