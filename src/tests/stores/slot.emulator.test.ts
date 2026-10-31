import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getIdTokenResult, reload, signInWithEmailAndPassword } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { createSlotStore } from '$lib/stores/slot.svelte';
import type { SlotStore } from '$lib/models/auth/auth.types';
import {
	clearEmulatorUsers,
	createEmulatorAuth,
	createEmulatorUser,
	fetchOobCodes,
	markEmulatorUserVerified
} from '../support/emulator';

const config = {
	selfRegistration: true,
	emailVerification: true,
	continueUrl: 'http://localhost:4173/',
	routes: {
		signIn: '/signin',
		signUp: '/signup',
		verifyEmail: '/verify-email',
		passwordReset: '/password-reset',
		afterSignIn: '/'
	},
	multiAccount: true
};

let auth: Auth;
let store: SlotStore;
let dispose: () => Promise<void>;

beforeEach(async () => {
	await clearEmulatorUsers();
	({ auth, dispose } = createEmulatorAuth());
	store = createSlotStore(auth, config);
	await store.start();
});

afterEach(async () => {
	store.stop();
	await dispose();
});

/** ID トークンのクレーム。組み込み側のアクセス制御が見るのはこちら */
const emailVerifiedClaim = async (target: Auth): Promise<unknown> => {
	const user = target.currentUser;
	if (!user) {
		throw new Error('サインインしていない');
	}
	return (await getIdTokenResult(user)).claims.email_verified;
};

/** 別のセッションで確認を済ませる。待機側のクライアントには触れない */
const verifyInAnotherSession = async (email: string): Promise<void> => {
	const codes = await fetchOobCodes();
	const code = codes.find((each) => each.email === email && each.requestType === 'VERIFY_EMAIL');
	if (!code) {
		throw new Error(`${email} 宛の確認メールが発行されていない`);
	}
	// 確認を適用したあと戻り先へ転送されるため、転送は追わない（戻り先はここでは動いていない）
	const response = await fetch(code.oobLink, { redirect: 'manual' });
	if (response.status >= 400) {
		throw new Error(`確認に失敗した: ${response.status}`);
	}
};

describe('確認済みが ID トークンのクレームへ届く — 要件 2.8, 4.1, 4.2, 5.1', () => {
	it('別セッションで確認したあと、確認済みとクレームの双方が真になる', async () => {
		const email = 'verify@example.com';
		expect((await store.signUp(email, 'secret-password')).ok).toBe(true);

		// 登録するとサインイン済みになる（要件 4.1）
		expect(store.user?.email).toBe(email);
		expect(store.isEmailVerified).toBe(false);
		// 取り直す前は、クレームも古い値のまま
		expect(await emailVerifiedClaim(auth)).toBeFalsy();

		// 確認メールが発行されている（要件 4.2, 5.1）
		await verifyInAnotherSession(email);

		expect(await store.refreshVerification()).toBe(true);

		// 利用者の値と、クレームを別々に確かめる
		expect(store.isEmailVerified).toBe(true);
		expect(auth.currentUser?.emailVerified).toBe(true);
		expect(await emailVerifiedClaim(auth)).toBe(true);
	});

	it('確認メールに、設定した戻り先が反映される — 要件 1.9', async () => {
		const email = 'continue-url@example.com';
		await store.signUp(email, 'secret-password');

		const codes = await fetchOobCodes();
		const code = codes.find((each) => each.email === email);
		expect(code?.oobLink).toContain(encodeURIComponent(config.continueUrl));
	});
});

describe('再認証を伴うパスワードの変更 — 要件 6.1, 6.2, 6.6', () => {
	const email = 'change@example.com';
	const original = 'original-password';
	const next = 'next-password';

	beforeEach(async () => {
		await store.signUp(email, original);
	});

	it('正しい現在のパスワードで変更でき、新しいパスワードでサインインできる', async () => {
		expect((await store.changePassword(original, next)).ok).toBe(true);
		// 完了後もサインイン状態を保つ（要件 6.4）
		expect(store.user).not.toBeNull();

		const other = createEmulatorAuth();
		await expect(signInWithEmailAndPassword(other.auth, email, next)).resolves.toBeDefined();
		await other.dispose();
	});

	it('誤った現在のパスワードは資格情報の誤りとして返り、元のパスワードが有効なまま残る', async () => {
		const result = await store.changePassword('wrong-password', next);

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error.kind).toBe('invalid-credential');

		const other = createEmulatorAuth();
		// 変更前のパスワードで入れる
		await expect(signInWithEmailAndPassword(other.auth, email, original)).resolves.toBeDefined();
		// 新しいパスワードは設定されていない
		await expect(signInWithEmailAndPassword(other.auth, email, next)).rejects.toThrow();
		await other.dispose();
	});
});

describe('メールアドレスの確認を求めない組み込み先 — 要件 1.11, 4.2', () => {
	it('登録してもサインイン済みになり、確認メールは発行されない', async () => {
		const { auth: other, dispose: disposeOther } = createEmulatorAuth();
		const notRequiring = createSlotStore(other, { ...config, emailVerification: false });
		await notRequiring.start();

		const email = 'no-verification@example.com';
		expect((await notRequiring.signUp(email, 'secret-password')).ok).toBe(true);
		expect(notRequiring.user).not.toBeNull();

		// 実際に確認メールが発行されていないことを、エミュレータ側で確かめる
		const codes = await fetchOobCodes();
		expect(codes.filter((each) => each.email === email)).toEqual([]);

		notRequiring.stop();
		await disposeOther();
	});
});

describe('復元した利用者の確認済みと ID トークンの印をそろえる（multi-account-auth の組み込み）', () => {
	it('確認済みになった利用者を復元すると、開始の時点で印も確認済みになっている', async () => {
		store.stop();
		const email = 'restored@example.com';
		const uid = await createEmulatorUser(email, 'secret-password');
		const credential = await signInWithEmailAndPassword(auth, email, 'secret-password');
		await markEmulatorUserVerified(uid);
		// Firebase が復元のときに行う取り直しと同じく、利用者の情報だけを取り直す
		await reload(credential.user);
		expect(credential.user.emailVerified).toBe(true);
		expect((await getIdTokenResult(credential.user)).claims.email_verified).toBeFalsy();

		store = createSlotStore(auth, config);
		await store.start();

		expect(store.isEmailVerified).toBe(true);
		expect(await emailVerifiedClaim(auth)).toBe(true);
	});
});
