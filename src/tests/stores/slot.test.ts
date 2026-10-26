import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { passwordStatus } from '../support/password';
import {
	emitAuthState,
	fakeAuth,
	fakeUser,
	firebaseAuthMock,
	listenerCount,
	resetFirebaseFake
} from './firebaseFake';

vi.mock('firebase/auth', () => firebaseAuthMock);

const { createSlotStore } = await import('$lib/stores/slot.svelte');

const routes = {
	signIn: '/signin',
	signUp: '/signup',
	verifyEmail: '/verify-email',
	passwordReset: '/password-reset',
	afterSignIn: '/'
};

const config = {
	selfRegistration: true,
	emailVerification: true,
	continueUrl: 'https://example.com/after',
	routes,
	multiAccount: true
};

/** メールアドレスの確認を求めない組み込み先 */
const withoutVerification = { ...config, emailVerification: false };

beforeEach(resetFirebaseFake);

describe('公開する状態 — 要件 2.1, 2.2, 2.4, 2.5, 2.6, 2.7', () => {
	it('開始する前は、初回の判定が完了していない', () => {
		const store = createSlotStore(fakeAuth(), config);
		expect(store.isResolved).toBe(false);
		expect(store.user).toBeNull();
	});

	it('開始すると認証状態に追随する', () => {
		const store = createSlotStore(fakeAuth(), config);
		store.start();
		emitAuthState(fakeUser());

		expect(store.isResolved).toBe(true);
		expect(store.user).not.toBeNull();
	});

	it('確認済みかどうかを公開する', () => {
		const store = createSlotStore(fakeAuth(), config);
		store.start();
		emitAuthState(fakeUser({ emailVerified: true }));
		expect(store.isEmailVerified).toBe(true);
	});
});

describe('初回の判定の単調性 — 要件 2.3', () => {
	it('一度完了したら、認証状態が変わっても未完了へ戻らない', () => {
		const store = createSlotStore(fakeAuth(), config);
		store.start();
		emitAuthState(fakeUser());
		emitAuthState(null);
		expect(store.isResolved).toBe(true);
	});
});

describe('購読の開始と停止 — 要件 2.11', () => {
	it('生成しただけでは購読しない', () => {
		createSlotStore(fakeAuth(), config);
		expect(firebaseAuthMock.onAuthStateChanged).not.toHaveBeenCalled();
	});

	it('開始は初回の判定が済んだ時点で解決する — 要件 4.4（multi-account-auth）', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		await store.start();
		expect(store.isResolved).toBe(true);
		expect(store.user?.uid).toBe('uid-1');
	});

	it('認証状態の変化を、生成時に渡した受け手へ知らせる — 要件 4.5（multi-account-auth）', async () => {
		const onChanged = vi.fn();
		const store = createSlotStore(fakeAuth(fakeUser()), config, onChanged);
		await store.start();
		emitAuthState(null);

		expect(onChanged).toHaveBeenLastCalledWith(null);
		expect(store.user).toBeNull();
	});

	it('開始は冪等で、続けて呼んでも購読が二重にならない', () => {
		const store = createSlotStore(fakeAuth(), config);
		store.start();
		store.start();
		expect(listenerCount()).toBe(1);
	});

	it('停止すると購読を解除する', () => {
		const store = createSlotStore(fakeAuth(), config);
		store.start();
		store.stop();
		expect(listenerCount()).toBe(0);
	});

	it('停止した後は公開している状態を更新しない', () => {
		const store = createSlotStore(fakeAuth(), config);
		store.start();
		emitAuthState(fakeUser());
		store.stop();

		expect(store.user).toBeNull();
		expect(store.isResolved).toBe(false);
		expect(store.isEmailVerified).toBe(false);
	});

	it('停止した後に再開できる', () => {
		const store = createSlotStore(fakeAuth(), config);
		store.start();
		store.stop();
		store.start();
		emitAuthState(fakeUser());
		expect(store.user).not.toBeNull();
	});
});

describe('サインインとサインアウト — 要件 3.1, 3.6, 8.1', () => {
	it('正規化したメールアドレスで認証する', async () => {
		const store = createSlotStore(fakeAuth(), config);
		await store.signIn('  User@Example.COM ', 'secret');
		expect(firebaseAuthMock.signInWithEmailAndPassword).toHaveBeenCalledWith(
			expect.anything(),
			'user@example.com',
			'secret'
		);
	});

	it('失敗を例外ではなく戻り値で返す', async () => {
		firebaseAuthMock.signInWithEmailAndPassword.mockRejectedValueOnce(
			new FirebaseError('auth/invalid-credential', '')
		);
		const store = createSlotStore(fakeAuth(), config);
		const result = await store.signIn('user@example.com', 'wrong');

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error.kind).toBe('invalid-credential');
	});

	it('サインアウトを Firebase へ伝える', async () => {
		const store = createSlotStore(fakeAuth(), config);
		await store.signOut();
		expect(firebaseAuthMock.signOut).toHaveBeenCalledOnce();
	});

	it('サインアウトの結果を返す — 要件 5.6（multi-account-auth）', async () => {
		const store = createSlotStore(fakeAuth(), config);
		expect(await store.signOut()).toEqual({ ok: true });
	});

	it('サインアウトの失敗を握りつぶさず、例外ではなく戻り値で返す — 要件 5.6（multi-account-auth）', async () => {
		firebaseAuthMock.signOut.mockRejectedValueOnce(
			new FirebaseError('auth/network-request-failed', '')
		);
		const store = createSlotStore(fakeAuth(), config);
		const result = await store.signOut();

		expect(result.ok === false && result.error.kind).toBe('network-error');
	});
});

describe('登録と確認メール — 要件 1.6, 1.9, 4.1, 4.2, 5.1', () => {
	it('アカウントを作り、続けて確認メールを送る', async () => {
		const current = fakeUser();
		const store = createSlotStore(fakeAuth(current), config);
		const result = await store.signUp('User@Example.com', 'secret');

		expect(result.ok).toBe(true);
		expect(firebaseAuthMock.createUserWithEmailAndPassword).toHaveBeenCalledWith(
			expect.anything(),
			'user@example.com',
			'secret'
		);
		expect(firebaseAuthMock.sendEmailVerification).toHaveBeenCalledOnce();
	});

	it('確認メールの送信に失敗しても、登録の失敗としては返さない', async () => {
		firebaseAuthMock.sendEmailVerification.mockRejectedValueOnce(
			new FirebaseError('auth/too-many-requests', '')
		);
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		expect((await store.signUp('user@example.com', 'secret')).ok).toBe(true);
	});

	it('アカウントを作れなかったときは、確認メールを送らない', async () => {
		firebaseAuthMock.createUserWithEmailAndPassword.mockRejectedValueOnce(
			new FirebaseError('auth/email-already-in-use', '')
		);
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		const result = await store.signUp('user@example.com', 'secret');

		expect(result.ok === false && result.error.kind).toBe('email-already-in-use');
		expect(firebaseAuthMock.sendEmailVerification).not.toHaveBeenCalled();
	});

	it('強度が足りないときは、満たしていない要件を添えて返す', async () => {
		firebaseAuthMock.createUserWithEmailAndPassword.mockRejectedValueOnce(
			new FirebaseError('auth/password-does-not-meet-requirements', '')
		);
		firebaseAuthMock.validatePassword.mockResolvedValueOnce(
			passwordStatus({ meetsMinPasswordLength: false, containsNumericCharacter: false })
		);
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		const result = await store.signUp('user@example.com', 'x');

		expect(result.ok === false && result.error.unmetPasswordRequirements).toEqual([
			'min-length',
			'numeric'
		]);
	});

	it('強度の充足状況を取得できなくても、失敗として返せる', async () => {
		firebaseAuthMock.createUserWithEmailAndPassword.mockRejectedValueOnce(
			new FirebaseError('auth/weak-password', '')
		);
		firebaseAuthMock.validatePassword.mockRejectedValueOnce(new Error('policy unavailable'));
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		const result = await store.signUp('user@example.com', 'x');

		expect(result.ok === false && result.error.kind).toBe('weak-password');
		expect(result.ok === false && result.error.unmetPasswordRequirements).toEqual([]);
	});

	it('確認メールの送信を、登録とは別に単独でも提供する', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		expect((await store.sendEmailVerification()).ok).toBe(true);
	});

	it('サインインしていなければ、確認メールを送らずに失敗として返す', async () => {
		const store = createSlotStore(fakeAuth(null), config);
		expect((await store.sendEmailVerification()).ok).toBe(false);
		expect(firebaseAuthMock.sendEmailVerification).not.toHaveBeenCalled();
	});

	it('戻り先を確認メールに反映する', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		await store.sendEmailVerification();
		expect(firebaseAuthMock.sendEmailVerification).toHaveBeenCalledWith(expect.anything(), {
			url: config.continueUrl
		});
	});

	it('メールリンクに関する API を一切呼ばない', async () => {
		const source = await readFile(
			new URL('../../lib/stores/slot.svelte.ts', import.meta.url),
			'utf8'
		);
		for (const api of ['sendSignInLinkToEmail', 'isSignInWithEmailLink', 'signInWithEmailLink']) {
			expect(source).not.toContain(api);
		}
	});
});

describe('確認状態の取り直し — 要件 2.8, 2.9, 2.10', () => {
	it('利用者の情報と ID トークンのクレームの両方を取り直す', async () => {
		const store = createSlotStore(fakeAuth(fakeUser({ emailVerified: true })), config);
		expect(await store.refreshVerification()).toBe(true);
		expect(firebaseAuthMock.reload).toHaveBeenCalledOnce();
		expect(firebaseAuthMock.getIdToken).toHaveBeenCalledWith(expect.anything(), true);
	});

	it('取り直した結果を、公開している確認済みへ反映する', async () => {
		const current = fakeUser({ emailVerified: false });
		const store = createSlotStore(fakeAuth(current), config);
		store.start();
		emitAuthState(current);
		expect(store.isEmailVerified).toBe(false);

		// 別の端末で確認を済ませた状況を、取り直しで受け取る
		firebaseAuthMock.reload.mockImplementationOnce(async () => {
			Object.assign(current, { emailVerified: true });
		});
		await store.refreshVerification();
		expect(store.isEmailVerified).toBe(true);
	});

	it('重ねて呼んでも、問い合わせは1回で済む', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		const results = await Promise.all([
			store.refreshVerification(),
			store.refreshVerification(),
			store.refreshVerification()
		]);

		expect(results).toEqual([false, false, false]);
		expect(firebaseAuthMock.reload).toHaveBeenCalledOnce();
		expect(firebaseAuthMock.getIdToken).toHaveBeenCalledOnce();
	});

	it('完了した後の要求は、あらためて問い合わせる', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		await store.refreshVerification();
		await store.refreshVerification();
		expect(firebaseAuthMock.reload).toHaveBeenCalledTimes(2);
	});

	it('サインインしていなければ、問い合わせずに未確認として返す', async () => {
		const store = createSlotStore(fakeAuth(null), config);
		expect(await store.refreshVerification()).toBe(false);
		expect(firebaseAuthMock.reload).not.toHaveBeenCalled();
	});

	it('取り直しに失敗しても例外を投げない', async () => {
		firebaseAuthMock.reload.mockRejectedValueOnce(
			new FirebaseError('auth/network-request-failed', '')
		);
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		await expect(store.refreshVerification()).resolves.toBe(false);
	});

	it('確認待ち画面以外からも要求できる手段として公開する', () => {
		expect(typeof createSlotStore(fakeAuth(), config).refreshVerification).toBe('function');
	});
});

describe('パスワードの変更 — 要件 6.1, 6.4, 6.6, 6.7', () => {
	it('再認証を行ってから新しいパスワードを設定する', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		const result = await store.changePassword('current', 'next');

		expect(result.ok).toBe(true);
		expect(firebaseAuthMock.EmailAuthProvider.credential).toHaveBeenCalledWith(
			'User@Example.com',
			'current'
		);
		expect(firebaseAuthMock.reauthenticateWithCredential).toHaveBeenCalledOnce();
		expect(firebaseAuthMock.updatePassword).toHaveBeenCalledWith(expect.anything(), 'next');
	});

	it('完了してもサインアウトしない', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		await store.changePassword('current', 'next');
		expect(firebaseAuthMock.signOut).not.toHaveBeenCalled();
	});

	it('現在のパスワードが誤っていれば、新しいパスワードを設定しない', async () => {
		firebaseAuthMock.reauthenticateWithCredential.mockRejectedValueOnce(
			new FirebaseError('auth/invalid-credential', '')
		);
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		const result = await store.changePassword('wrong', 'next');

		expect(result.ok === false && result.error.kind).toBe('invalid-credential');
		expect(firebaseAuthMock.updatePassword).not.toHaveBeenCalled();
	});

	it('サインインしていなければ、Firebase へ問い合わせずに失敗として返す', async () => {
		const store = createSlotStore(fakeAuth(null), config);
		const result = await store.changePassword('current', 'next');

		expect(result.ok).toBe(false);
		expect(firebaseAuthMock.reauthenticateWithCredential).not.toHaveBeenCalled();
		expect(firebaseAuthMock.updatePassword).not.toHaveBeenCalled();
	});

	it('新しいパスワードの強度が足りなければ、満たしていない要件を添えて返す', async () => {
		firebaseAuthMock.updatePassword.mockRejectedValueOnce(
			new FirebaseError('auth/weak-password', '')
		);
		firebaseAuthMock.validatePassword.mockResolvedValueOnce(
			passwordStatus({ containsUppercaseLetter: false })
		);
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		const result = await store.changePassword('current', 'weak');

		expect(result.ok === false && result.error.kind).toBe('weak-password');
		expect(result.ok === false && result.error.unmetPasswordRequirements).toEqual(['uppercase']);
	});
});

describe('メールアドレスの確認を求めるかどうか — 要件 1.11, 4.2', () => {
	it('求める設定では、登録のあとに確認メールを送る', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), config);
		expect((await store.signUp('user@example.com', 'secret')).ok).toBe(true);
		expect(firebaseAuthMock.sendEmailVerification).toHaveBeenCalledOnce();
	});

	it('求めない設定では、登録のあとに確認メールを送らない', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), withoutVerification);
		expect((await store.signUp('user@example.com', 'secret')).ok).toBe(true);
		expect(firebaseAuthMock.sendEmailVerification).not.toHaveBeenCalled();
	});

	it('求めない設定でも、アカウントの作成そのものは変わらない', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), withoutVerification);
		await store.signUp('User@Example.com', 'secret');
		expect(firebaseAuthMock.createUserWithEmailAndPassword).toHaveBeenCalledWith(
			expect.anything(),
			'user@example.com',
			'secret'
		);
	});

	it('求めない設定でも、明示的に要求されれば確認メールを送る', async () => {
		const store = createSlotStore(fakeAuth(fakeUser()), withoutVerification);
		expect((await store.sendEmailVerification()).ok).toBe(true);
		expect(firebaseAuthMock.sendEmailVerification).toHaveBeenCalledOnce();
	});
});
