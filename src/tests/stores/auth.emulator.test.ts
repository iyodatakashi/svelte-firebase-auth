import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getIdToken, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';
import { createAuthStore } from '$lib/stores/auth.svelte';
import type { AuthConfig, AuthStore } from '$lib/models/auth/auth.types';
import {
	clearEmulatorUsers,
	createEmulatorAuth,
	createEmulatorFirestore,
	createEmulatorUser,
	fetchOobCodes
} from '../support/emulator';
import { memoryBrowser } from '../support/memoryPersistence';

/**
 * Firebase の実際の振る舞いに依存する箇所を、エミュレータに当てて確かめる。
 * 再読み込みを跨いだ復元は、ブラウザの保存領域を要するため E2E で確かめる
 */

const PASSWORD = 'secret-password';

const config: AuthConfig = {
	selfRegistration: true,
	emailVerification: false,
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

let app: FirebaseApp;
let base: Auth;
let firestore: Firestore;
let store: AuthStore;
let dispose: () => Promise<void>;

beforeEach(async () => {
	await clearEmulatorUsers();
	({ app, auth: base, dispose } = createEmulatorAuth());
	firestore = createEmulatorFirestore(app);
	store = createAuthStore(base, config);
	await store.start(memoryBrowser().openTab().persistence);
});

afterEach(async () => {
	store.stop();
	await dispose();
});

const signIn = async (email: string) => {
	await createEmulatorUser(email, PASSWORD);
	const result = await store.signIn(email, PASSWORD);
	if (!result.ok) {
		throw new Error(`サインインに失敗した: ${JSON.stringify(result.error)}`);
	}
	return result.value;
};

/** 土台の App の Firestore で、その利用者の文書を書けるか */
const canWrite = async (uid: string): Promise<boolean> => {
	try {
		await setDoc(doc(firestore, 'users', uid), { at: Date.now() });
		return true;
	} catch {
		return false;
	}
};

describe('複数のスロット — 要件 1.1, 5.3', () => {
	it('2つのアカウントに同時にログインし、片方だけをログアウトできる', async () => {
		const a = await signIn('a@example.com');
		const b = await signIn('b@example.com');
		expect(store.accounts.map((account) => account.uid)).toEqual([a.uid, b.uid]);

		expect((await store.signOutAccount(a.id)).ok).toBe(true);

		expect(store.accounts.map((account) => account.uid)).toEqual([b.uid]);
		expect(store.activeId).toBe(b.id);
		expect(base.currentUser?.uid).toBe(b.uid);
	});
});

describe('土台の App のデータアクセス — 要件 3.2, 3.3, 7.7', () => {
	it('選択を切り替えると、同じ Firestore が切り替え先の利用者としてルールに扱われる', async () => {
		const a = await signIn('a@example.com');
		const b = await signIn('b@example.com');

		expect(await canWrite(b.uid)).toBe(true);
		expect(await canWrite(a.uid)).toBe(false);

		await store.selectAccount(a.id);
		expect(await canWrite(a.uid)).toBe(true);
		expect(await canWrite(b.uid)).toBe(false);
		expect((await getDoc(doc(firestore, 'users', a.uid))).exists()).toBe(true);
	});

	it('未選択になると土台は空になり、データへのアクセスは拒否される', async () => {
		const a = await signIn('a@example.com');
		await signIn('b@example.com');
		await store.signOut();

		expect(store.stage).toBe('account-unselected');
		expect(base.currentUser).toBeNull();
		expect(await canWrite(a.uid)).toBe(false);
	});

	it('パスワードを変更した後も、土台の複製でデータにアクセスできる', async () => {
		const a = await signIn('a@example.com');
		expect((await store.changePassword(PASSWORD, 'next-password')).ok).toBe(true);

		expect(base.currentUser?.uid).toBe(a.uid);
		expect(await canWrite(a.uid)).toBe(true);
	});
});

describe('土台とスロットの独立 — 要件 4.1, 5.3', () => {
	it('土台を空にしても、スロットのログイン状態は残り、選び直せる', async () => {
		const a = await signIn('a@example.com');
		const b = await signIn('b@example.com');
		await store.selectAccount(a.id);
		// B は選ばれていない間も、トークンを取り直せる
		await store.signOut();
		await store.selectAccount(b.id);

		const copied = base.currentUser;
		expect(copied?.uid).toBe(b.uid);
		expect(copied && (await getIdToken(copied, true))).toBeTruthy();
		expect(await canWrite(b.uid)).toBe(true);
	});

	it('開始時、土台に残っていたログインを使わず、選択中の複製か空にする', async () => {
		store.stop();
		await createEmulatorUser('legacy@example.com', PASSWORD);
		await signInWithEmailAndPassword(base, 'legacy@example.com', PASSWORD);
		expect(base.currentUser).not.toBeNull();

		store = createAuthStore(base, config);
		await store.start(memoryBrowser().openTab().persistence);

		expect(store.stage).toBe('signed-out');
		expect(base.currentUser).toBeNull();
	});
});

describe('アカウントに依らない再設定の要求 — 要件 7.2（auth-store-and-screens）', () => {
	it('登録の有無によらず、成功として返る', async () => {
		const unregistered = await store.sendPasswordReset('nobody@example.com');
		await createEmulatorUser('registered@example.com', PASSWORD);
		const registered = await store.sendPasswordReset('registered@example.com');

		expect(unregistered).toEqual(registered);
		expect(unregistered.ok).toBe(true);
	});

	it('未登録のアドレスには、再設定メールが発行されない', async () => {
		expect((await store.sendPasswordReset('nobody@example.com')).ok).toBe(true);

		const codes = await fetchOobCodes();
		expect(
			codes.filter(
				(each) => each.requestType === 'PASSWORD_RESET' && each.email === 'nobody@example.com'
			)
		).toEqual([]);
	});
});
