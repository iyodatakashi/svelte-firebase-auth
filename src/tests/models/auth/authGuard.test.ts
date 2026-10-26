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

describe('保持アカウントはあるが選択が無い — 要件 6.1, 6.2, 6.3, 6.7, 6.9（multi-account-auth）', () => {
	it('サインイン・登録・再設定の経路には留まれる。そこからのサインインは他のアカウントを上書きしない', () => {
		expect(resolve('account-unselected', '/signin')).toEqual({ kind: 'allow' });
		expect(resolve('account-unselected', '/signup')).toEqual({ kind: 'allow' });
		expect(resolve('account-unselected', '/password-reset')).toEqual({ kind: 'allow' });
	});

	it('保護された経路では遷移せずに選択を待ち、現在の経路を戻り先として保持する', () => {
		expect(resolve('account-unselected', '/documents/42?tab=history')).toEqual({
			kind: 'select',
			returnTo: '/documents/42?tab=history'
		});
	});

	it('確認待ちの経路では遷移せずに選択を待ち、保持している戻り先を失わせない', () => {
		expect(resolve('account-unselected', '/verify-email', '/documents/42')).toEqual({
			kind: 'select',
			returnTo: '/documents/42'
		});
		expect(resolve('account-unselected', '/verify-email')).toEqual({
			kind: 'select',
			returnTo: null
		});
	});

	it('選択した後は、通過した段階で保持した戻り先へ戻す', () => {
		const held = resolve('account-unselected', '/documents/42');
		expect(held.kind === 'select' && held.returnTo).toBe('/documents/42');
		// 選択後に同じ経路へ留まれる
		expect(resolve('ready', '/documents/42', '/documents/42')).toEqual({ kind: 'allow' });
		// サインイン経路から選択した場合は戻り先へ進む
		expect(resolve('ready', '/signin', '/documents/42')).toEqual({
			kind: 'redirect',
			to: '/documents/42',
			returnTo: null
		});
	});

	it('受け入れられない戻り先は保持し直さない', () => {
		expect(resolve('account-unselected', '/verify-email', '//evil.example')).toEqual({
			kind: 'select',
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

describe('受け入れられない戻り先 — 要件 5.4', () => {
	/** 外部として解決される値・経路として解釈できない値 */
	const unsafe = [
		'//evil.example/path',
		'/\\evil.example/path',
		'https://evil.example/path',
		'',
		'../documents/42'
	];

	it('保持されていても用いず、既定の行き先へ振り替える', () => {
		for (const held of unsafe) {
			expect(resolve('ready', '/signin', held)).toEqual({
				kind: 'redirect',
				to: '/',
				returnTo: null
			});
		}
	});

	it('保持し直さない', () => {
		for (const held of unsafe) {
			expect(resolve('email-unverified', '/documents/42', held)).toEqual({
				kind: 'redirect',
				to: '/verify-email',
				returnTo: null
			});
		}
	});

	it('根からの相対の経路は受け入れる', () => {
		expect(resolve('ready', '/signin', '/documents/42?tab=history')).toEqual({
			kind: 'redirect',
			to: '/documents/42?tab=history',
			returnTo: null
		});
	});
});

describe('振り替えが止まること — 要件 4.2, 4.3, 4.4', () => {
	const stages: AuthStage[] = [
		'unresolved',
		'signed-out',
		'account-unselected',
		'email-unverified',
		'ready'
	];
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
