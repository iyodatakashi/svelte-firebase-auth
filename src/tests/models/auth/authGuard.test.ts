import { describe, expect, it } from 'vitest';
import { matchesRoute, resolveAuthGuard } from '$lib/models/auth/authGuard';
import type { AuthGuardDecision, AuthRoutes, AuthStage } from '$lib/models/auth/auth.types';

describe('経路の一致 — 要件 2.5', () => {
	it('問い合わせ文字列を判定に用いない', () => {
		expect(matchesRoute('/signin?next=/documents/42', '/signin')).toBe(true);
	});

	it('末尾の区切りを正規化して同じ経路とみなす', () => {
		expect(matchesRoute('/signin/', '/signin')).toBe(true);
		expect(matchesRoute('/signin', '/signin/')).toBe(true);
	});

	it('既定の行き先（根）は、他の経路と一致しない', () => {
		expect(matchesRoute('/', '/')).toBe(true);
		expect(matchesRoute('/documents/42', '/')).toBe(false);
	});

	it('前方一致にしない。語を足した経路を巻き込まない', () => {
		expect(matchesRoute('/signin-help', '/signin')).toBe(false);
		expect(matchesRoute('/signin/detail', '/signin')).toBe(false);
	});
});

const routes: AuthRoutes = {
	signIn: '/signin',
	signUp: '/signup',
	verifyEmail: '/verify-email',
	passwordReset: '/password-reset',
	afterSignIn: '/'
};

const resolve = (
	stage: AuthStage,
	currentPath: string,
	returnTo: string | null = null
): AuthGuardDecision => resolveAuthGuard({ stage, currentPath, routes, returnTo });

describe('初回の判定が済むまで — 要件 4.1', () => {
	it('何も決めない', () => {
		expect(resolve('unresolved', '/documents/42')).toEqual({ kind: 'wait' });
		expect(resolve('unresolved', '/signin')).toEqual({ kind: 'wait' });
	});
});

describe('サインインしていない利用者 — 要件 4.2, 5.1, 5.6', () => {
	it('サインイン・登録・パスワードの再設定の経路には留まれる', () => {
		expect(resolve('signed-out', '/signin')).toEqual({ kind: 'allow' });
		expect(resolve('signed-out', '/signup')).toEqual({ kind: 'allow' });
		expect(resolve('signed-out', '/password-reset')).toEqual({ kind: 'allow' });
	});

	it('それ以外の経路は、原因になった経路を戻り先としてサインインへ振り替える', () => {
		expect(resolve('signed-out', '/documents/42?tab=history')).toEqual({
			kind: 'redirect',
			to: '/signin',
			returnTo: '/documents/42?tab=history'
		});
	});

	it('認証の経路そのものを戻り先として保持しない', () => {
		expect(resolve('signed-out', '/verify-email')).toEqual({
			kind: 'redirect',
			to: '/signin',
			returnTo: null
		});
	});
});

describe('確認が済んでいない利用者 — 要件 4.3, 5.5', () => {
	it('確認待ちの経路には留まれる', () => {
		expect(resolve('email-unverified', '/verify-email')).toEqual({ kind: 'allow' });
	});

	it('それ以外の経路は確認待ちへ振り替える', () => {
		expect(resolve('email-unverified', '/signin')).toEqual({
			kind: 'redirect',
			to: '/verify-email',
			returnTo: null
		});
	});

	it('確認を終えるまでのあいだ、保持している戻り先を失わせない', () => {
		expect(resolve('email-unverified', '/documents/42', '/documents/42')).toEqual({
			kind: 'redirect',
			to: '/verify-email',
			returnTo: '/documents/42'
		});
	});
});

describe('条件を満たした利用者 — 要件 4.4, 4.5, 5.2, 5.3', () => {
	it('認証の経路からは、既定の行き先へ振り替える', () => {
		for (const path of ['/signin', '/signup', '/verify-email', '/password-reset']) {
			expect(resolve('ready', path)).toEqual({ kind: 'redirect', to: '/', returnTo: null });
		}
	});

	it('保持している戻り先があれば、そこへ振り替えて戻り先を破棄する', () => {
		expect(resolve('ready', '/signin', '/documents/42')).toEqual({
			kind: 'redirect',
			to: '/documents/42',
			returnTo: null
		});
	});

	it('認証の経路以外への到達を妨げない', () => {
		expect(resolve('ready', '/')).toEqual({ kind: 'allow' });
		expect(resolve('ready', '/password-change')).toEqual({ kind: 'allow' });
		expect(resolve('ready', '/documents/42')).toEqual({ kind: 'allow' });
	});
});

describe('振り替えが止まること — 要件 4.2, 4.3, 4.4', () => {
	const stages: AuthStage[] = ['unresolved', 'signed-out', 'email-unverified', 'ready'];
	const paths = [
		'/',
		'/signin',
		'/signup',
		'/verify-email',
		'/password-reset',
		'/password-change',
		'/documents/42?tab=history'
	];

	it('すべての振り替えについて、振り替え先では留まるか何も決めない', () => {
		for (const stage of stages) {
			for (const path of paths) {
				for (const held of [null, '/documents/42']) {
					const decision = resolve(stage, path, held);
					if (decision.kind !== 'redirect') {
						continue;
					}
					expect(resolve(stage, decision.to, decision.returnTo).kind).not.toBe('redirect');
				}
			}
		}
	});
});
