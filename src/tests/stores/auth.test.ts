import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { AuthConfig, AuthStore } from '$lib/models/auth/auth.types';
import { memoryBrowser } from '../support/memoryPersistence';
import {
	authOf,
	firebaseAppMock,
	firebaseAuthMock,
	holdNextCopy,
	holdNextReload,
	holdNextSignIn,
	holdNextSignOut,
	reloadFirebase,
	resetFirebaseFake,
	signInElsewhere,
	signOutElsewhere
} from './firebaseFake';

vi.mock('firebase/auth', () => firebaseAuthMock);
// FirebaseError は本物を使う。差し替えは、このファイルの import より先に評価されるため読み込み直す
vi.mock('firebase/app', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/app')>()),
	...(await import('./firebaseFake')).firebaseAppMock
}));

const { createAuthStore } = await import('$lib/stores/auth.svelte');

const routes = {
	signIn: '/signin',
	signUp: '/signup',
	verifyEmail: '/verify-email',
	passwordReset: '/password-reset',
	afterSignIn: '/'
};

const config: AuthConfig = {
	selfRegistration: true,
	emailVerification: true,
	continueUrl: 'https://example.com/after',
	routes,
	multiAccount: true
};

const single: AuthConfig = { ...config, multiAccount: false };

const PASSWORD = 'secret-password';
const SLOT_PREFIX = 'svelte-firebase-auth/';

let browser: ReturnType<typeof memoryBrowser>;

beforeEach(() => {
	resetFirebaseFake();
	browser = memoryBrowser();
});

/** 組み込み側が初期化する土台の App の Auth */
const createBaseAuth = (): Auth =>
	firebaseAuthMock.getAuth(
		firebaseAppMock.initializeApp(
			{ apiKey: 'fake-api-key', projectId: 'demo-svelte-firebase-auth' },
			'[DEFAULT]'
		)
	);

type Tab = ReturnType<typeof browser.openTab>;

const open = async (options: { config?: AuthConfig; tab?: Tab } = {}) => {
	const base = createBaseAuth();
	const store = createAuthStore(base, options.config ?? config);
	const tab = options.tab ?? browser.openTab();
	await store.start(tab.persistence);
	return { store, base, tab };
};

/** 同じタブで開き直す。App を作り直し、保存されたものだけが残る */
const reopen = async (store: AuthStore, tab: Tab, nextConfig: AuthConfig = config) => {
	store.stop();
	reloadFirebase();
	return open({ config: nextConfig, tab });
};

const signIn = async (store: AuthStore, email: string) => {
	const result = await store.signIn(email, PASSWORD);
	if (!result.ok) {
		throw new Error(`サインインに失敗した: ${JSON.stringify(result.error)}`);
	}
	return result.value;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const slotAppName = (id: string) => `${SLOT_PREFIX}${id}`;

/** 指定した名前の App だけ、生成に失敗させる */
const failAppCreation = (failingName: string) => {
	const createApp = firebaseAppMock.initializeApp.getMockImplementation();
	firebaseAppMock.initializeApp.mockImplementation((options, name) => {
		if (name === failingName || !createApp) {
			throw new Error('app unavailable');
		}
		return createApp(options, name);
	});
};

describe('開始と復元 — 要件 1.1, 4.1, 4.4, 4.10', () => {
	it('土台の Auth をメモリのみの保存方法に切り替える', async () => {
		const { base } = await open();
		expect(firebaseAuthMock.setPersistence).toHaveBeenCalledWith(
			base,
			firebaseAuthMock.inMemoryPersistence
		);
	});

	it('開始の処理が済むまで、未ログインと区別した判定待ちを公開する', async () => {
		const store = createAuthStore(createBaseAuth(), config);
		expect(store.isResolved).toBe(false);
		expect(store.stage).toBe('unresolved');

		const started = store.start(browser.openTab().persistence);
		expect(store.stage).toBe('unresolved');
		await started;
		expect(store.stage).toBe('signed-out');
	});

	it('2件以上の異なるアカウントのログイン状態を同時に保持する', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		expect(store.accounts.map((account) => account.email)).toEqual([
			'a@example.com',
			'b@example.com'
		]);
		// それぞれのスロットがログインしたまま
		expect(authOf(slotAppName(a.id))?.currentUser?.email).toBe('a@example.com');
		expect(authOf(slotAppName(b.id))?.currentUser?.email).toBe('b@example.com');
	});

	it('開き直すと、保存された有効なログイン状態と選択を復元する', async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');
		await signIn(first.store, 'b@example.com');
		await first.store.selectAccount(a.id);

		const { store, base } = await reopen(first.store, first.tab);

		expect(store.accounts.map((account) => account.email)).toEqual([
			'a@example.com',
			'b@example.com'
		]);
		expect(store.activeId).toBe(a.id);
		expect(base.currentUser?.email).toBe('a@example.com');
		expect(store.stage).toBe('email-unverified');
	});

	it('ログイン状態を失ったスロットは、保存記録があってもログイン済みとして復元しない', async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');
		const b = await signIn(first.store, 'b@example.com');
		first.store.stop();
		signOutElsewhere(slotAppName(a.id));

		const { store } = await reopen(first.store, first.tab);

		expect(store.accounts.map((account) => account.id)).toEqual([b.id]);
		expect(browser.slots.has(a.id)).toBe(false);
	});

	it('開始時、土台の Auth に残っていたログインを使わず、選択中の複製か空にする', async () => {
		// 従来の方式で土台に保存されていたログイン
		signInElsewhere('[DEFAULT]', 'legacy@example.com');
		const { store, base } = await open();

		expect(store.stage).toBe('signed-out');
		expect(base.currentUser).toBeNull();
	});

	it('パスワードもトークンも保存しない。スロット記録は版・ID・UID だけを持つ', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		expect(browser.slots.get(a.id)).toEqual({ version: 1, id: a.id, uid: a.uid });
	});

	it('土台がエミュレータに接続されていれば、スロットも同じ接続先へつなぐ', async () => {
		const base = createBaseAuth();
		Object.assign(base, {
			emulatorConfig: { protocol: 'http', host: '127.0.0.1', port: 9099, options: {} }
		});
		const store = createAuthStore(base, config);
		await store.start(browser.openTab().persistence);
		await signIn(store, 'a@example.com');

		expect(firebaseAuthMock.connectAuthEmulator).toHaveBeenCalledWith(
			expect.anything(),
			'http://127.0.0.1:9099',
			{ disableWarnings: true }
		);
	});

	it('停止すると購読を解除してスロットの App を破棄し、ログイン状態は消さない', async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');
		first.store.stop();

		expect(firebaseAppMock.deleteApp).toHaveBeenCalledWith(
			expect.objectContaining({ name: slotAppName(a.id) })
		);
		expect(firebaseAuthMock.signOut).not.toHaveBeenCalledWith(
			expect.objectContaining({ name: slotAppName(a.id) })
		);
		expect(first.store.stage).toBe('unresolved');

		reloadFirebase();
		const { store } = await open({ tab: first.tab });
		expect(store.accounts.map((account) => account.id)).toEqual([a.id]);
	});
});

describe('開始時の失敗 — 要件 4.4, 4.15, 7.1, 7.5', () => {
	it('土台の切り替えに失敗したら、開始失敗を公開して判定待ちのまま止める', async () => {
		firebaseAuthMock.setPersistence.mockRejectedValueOnce(new Error('persistence unavailable'));
		const { store } = await open();

		expect(store.startError?.kind).toBe('initialization');
		expect(store.isResolved).toBe(false);
		expect(store.stage).toBe('unresolved');
	});

	it('複数アカウント指定では、復元できなかったスロットを公開し、他のアカウントで続ける', async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');
		const b = await signIn(first.store, 'b@example.com');
		await first.store.selectAccount(b.id);
		first.store.stop();
		reloadFirebase();

		failAppCreation(slotAppName(a.id));
		const { store } = await open({ tab: first.tab });

		expect(store.isResolved).toBe(true);
		expect(store.startError).toBeNull();
		expect(store.restoreFailures.map((failure) => failure.id)).toEqual([a.id]);
		expect(store.accounts.map((account) => account.id)).toEqual([b.id]);
		expect(store.activeId).toBe(b.id);
		// 記録は消さず、次回の開始で再び試す
		expect(browser.slots.has(a.id)).toBe(true);
	});

	it('複数アカウント指定で選択を複製できなければ、選択を復元できなかったものとして扱う', async () => {
		const first = await open();
		await signIn(first.store, 'a@example.com');
		first.store.stop();
		reloadFirebase();

		firebaseAuthMock.updateCurrentUser.mockRejectedValueOnce(new Error('copy failed'));
		const { store, base } = await open({ tab: first.tab });

		expect(store.isResolved).toBe(true);
		expect(store.stage).toBe('account-unselected');
		expect(base.currentUser).toBeNull();
	});

	it('単一アカウント指定でスロットを復元できなければ、開始失敗として止める', async () => {
		const first = await open({ config: single });
		const a = await signIn(first.store, 'a@example.com');
		first.store.stop();
		reloadFirebase();

		failAppCreation(slotAppName(a.id));
		const { store } = await open({ config: single, tab: first.tab });

		expect(store.startError?.kind).toBe('initialization');
		expect(store.stage).toBe('unresolved');
	});

	it('単一アカウント指定で開始時の複製に失敗したら、未選択へ進まず開始失敗として止める', async () => {
		const first = await open({ config: single });
		await signIn(first.store, 'a@example.com');
		first.store.stop();
		reloadFirebase();

		firebaseAuthMock.updateCurrentUser.mockRejectedValueOnce(
			new FirebaseError('auth/network-request-failed', '')
		);
		const { store } = await open({ config: single, tab: first.tab });

		expect(store.startError).not.toBeNull();
		expect(store.stage).toBe('unresolved');
	});
});

describe('切り替え — 要件 1.3, 3.1, 3.2, 3.3, 3.4, 7.6', () => {
	it('再入力なしに選択中のアカウントを切り替え、利用者情報と認証状態を同じアカウントで公開する', async () => {
		const { store, base } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');
		expect(store.activeId).toBe(b.id);

		const result = await store.selectAccount(a.id);

		expect(result.ok && result.value.id).toBe(a.id);
		expect(store.activeId).toBe(a.id);
		expect(store.activeAccount?.uid).toBe(a.uid);
		expect(store.user?.uid).toBe(a.uid);
		expect(store.email).toBe('a@example.com');
		expect(base.currentUser?.uid).toBe(a.uid);
		expect(firebaseAuthMock.signInWithEmailAndPassword).toHaveBeenCalledTimes(2);
	});

	it('切り替えても、切り替え元と他のアカウントのログイン状態を保つ', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');
		await store.selectAccount(a.id);

		expect(authOf(slotAppName(b.id))?.currentUser?.uid).toBe(b.uid);
		expect(store.accounts).toHaveLength(2);
	});

	it('存在しないアカウントへの切り替えは失敗として返し、現在の選択を保つ', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');

		const result = await store.selectAccount('missing');

		expect(result.ok === false && result.error.kind).toBe('not-found');
		expect(store.activeId).toBe(a.id);
	});

	it('複製に失敗した切り替えは失敗として返し、現在の選択と土台を保つ', async () => {
		const { store, base } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		firebaseAuthMock.updateCurrentUser.mockRejectedValueOnce(
			new FirebaseError('auth/network-request-failed', '')
		);
		const result = await store.selectAccount(a.id);
		await settle();

		expect(result.ok === false && result.error.kind).toBe('auth');
		expect(store.activeId).toBe(b.id);
		expect(base.currentUser?.uid).toBe(b.uid);
	});

	it('切り替えの途中に届いたログアウトの目標を、切り替えの失敗で戻さない', async () => {
		const { store, base } = await open();
		const a = await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');
		await signIn(store, 'c@example.com');

		const copy = holdNextCopy();
		const switching = store.selectAccount(a.id);
		// 切り替え先が別のタブでログアウトされた
		signOutElsewhere(slotAppName(a.id));
		copy.fail(new FirebaseError('auth/user-token-expired', ''));
		await switching;
		await settle();

		expect(store.activeId).toBeNull();
		expect(store.stage).toBe('account-unselected');
		expect(base.currentUser).toBeNull();
	});

	it('切り替え先が途中でログアウトされたら、複製が済んでも切り替え先を公開しない', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');
		await signIn(store, 'c@example.com');

		const copy = holdNextCopy();
		const switching = store.selectAccount(a.id);
		await settle();
		// 土台を空にする処理は、複製の後ろに並ぶ
		const clearing = holdNextSignOut();
		signOutElsewhere(slotAppName(a.id));
		copy.release();
		const result = await switching;

		expect(result.ok === false && result.error.kind).toBe('not-signed-in');
		expect(store.activeId).toBeNull();
		expect(store.user).toBeNull();
		clearing.release();
	});

	it('切り替えの実行中は、競合する操作を受け付けない', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		const copy = holdNextCopy();
		const switching = store.selectAccount(a.id);
		expect(store.operation).toEqual({ kind: 'select', id: a.id });

		const competing = await store.selectAccount(b.id);
		expect(competing.ok === false && competing.error.kind).toBe('busy');

		copy.release();
		await switching;
		expect(store.operation).toBeNull();
	});
});

describe('土台の更新の順序 — 要件 3.2, 3.6, 7.12', () => {
	/** A を選んだまま確認状態の取り直しを始め、B へ切り替える */
	const prepare = async () => {
		const { store, base } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');
		await store.selectAccount(a.id);
		return { store, base, a, b };
	};

	it('切り替えの前に完了した取り直しは、切り替え先を上書きしない', async () => {
		const { store, base, a, b } = await prepare();
		const reload = holdNextReload();
		const refreshing = store.refreshVerification();
		reload.release();
		await refreshing;
		await store.selectAccount(b.id);

		expect(store.activeId).toBe(b.id);
		expect(base.currentUser?.uid).toBe(b.uid);
		expect(store.accounts.find((account) => account.id === a.id)?.isEmailVerified).toBe(true);
	});

	it('切り替えの途中に完了した取り直しは、切り替え先を上書きしない', async () => {
		const { store, base, a, b } = await prepare();
		const reload = holdNextReload();
		const refreshing = store.refreshVerification();
		const copy = holdNextCopy();
		const switching = store.selectAccount(b.id);
		reload.release();
		await settle();
		copy.release();
		await Promise.all([refreshing, switching]);
		await settle();

		expect(store.activeId).toBe(b.id);
		expect(store.user?.uid).toBe(b.uid);
		expect(base.currentUser?.uid).toBe(b.uid);
		expect(store.accounts.find((account) => account.id === a.id)?.isEmailVerified).toBe(true);
	});

	it('切り替えの後に完了した取り直しは、切り替え先を上書きせず、開始時のアカウントにだけ反映する', async () => {
		const { store, base, a, b } = await prepare();
		const reload = holdNextReload();
		const refreshing = store.refreshVerification();
		await store.selectAccount(b.id);
		reload.release();
		expect(await refreshing).toBe(true);
		await settle();

		expect(store.activeId).toBe(b.id);
		expect(base.currentUser?.uid).toBe(b.uid);
		expect(store.isEmailVerified).toBe(false);
		expect(store.accounts.find((account) => account.id === a.id)?.isEmailVerified).toBe(true);
	});
});

describe('サインインと登録 — 要件 2.2, 2.3, 2.4, 2.5, 4.14, 7.5, 7.11, 7.12', () => {
	it('サインインに成功したら、既存のログイン状態を保ったまま一覧へ加えて選択する', async () => {
		const { store, base, tab } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		expect(store.accounts.map((account) => account.id)).toEqual([a.id, b.id]);
		expect(store.activeId).toBe(b.id);
		expect(base.currentUser?.uid).toBe(b.uid);
		expect(authOf(slotAppName(a.id))?.currentUser?.uid).toBe(a.uid);
		// 最後に開いたアカウントとタブの選択として記録する
		expect(browser.lastOpenedId).toBe(b.id);
		expect(tab.activeId).toBe(b.id);
	});

	it('既に保持しているアカウントでサインインしても一覧を重複させず、そのアカウントを選択する', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');

		const again = await signIn(store, 'A@Example.com');

		expect(again.id).toBe(a.id);
		expect(store.accounts).toHaveLength(2);
		expect(store.activeId).toBe(a.id);
		// 新しく作ったスロットは破棄する
		expect(firebaseAppMock.deleteApp).toHaveBeenCalledTimes(1);
	});

	it('サインインに失敗したら、新しいスロットを破棄して既存のログイン状態と選択を保つ', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');

		firebaseAuthMock.signInWithEmailAndPassword.mockRejectedValueOnce(
			new FirebaseError('auth/invalid-credential', '')
		);
		const result = await store.signIn('b@example.com', 'wrong');

		expect(result).toEqual({
			ok: false,
			error: { kind: 'auth', cause: expect.objectContaining({ kind: 'invalid-credential' }) }
		});
		expect(store.accounts.map((account) => account.id)).toEqual([a.id]);
		expect(store.activeId).toBe(a.id);
		expect(firebaseAppMock.deleteApp).toHaveBeenCalledOnce();
		expect(store.operation).toBeNull();
	});

	it('取りやめたら追加前の選択を保ち、後から成功が返っても一覧と選択に反映しない', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');

		const held = holdNextSignIn();
		const signingIn = store.signIn('b@example.com', PASSWORD);
		expect(store.operation).toEqual({ kind: 'sign-in' });

		store.cancelPendingSignIn();
		expect(store.operation).toBeNull();
		held.release();
		const result = await signingIn;

		expect(result.ok === false && result.error.kind).toBe('cancelled');
		expect(store.accounts.map((account) => account.id)).toEqual([a.id]);
		expect(store.activeId).toBe(a.id);
		expect(firebaseAppMock.deleteApp).toHaveBeenCalledOnce();
	});

	it('サインインの実行中は、重複した要求を処理中として拒否する', async () => {
		const { store } = await open();
		const held = holdNextSignIn();
		const signingIn = store.signIn('a@example.com', PASSWORD);

		const competing = await store.signIn('b@example.com', PASSWORD);
		expect(competing.ok === false && competing.error.kind).toBe('busy');

		held.release();
		expect((await signingIn).ok).toBe(true);
	});

	it('明示的な未選択を上書きして、サインインしたアカウントを選択する', async () => {
		const { store, tab } = await open();
		const a = await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');
		await signIn(store, 'c@example.com');
		await store.signOut();
		expect(tab.activeId).toBeNull();

		const again = await signIn(store, 'c@example.com');

		expect(store.activeId).toBe(again.id);
		expect(tab.activeId).toBe(again.id);
		expect(store.accounts.map((account) => account.id)).toContain(a.id);
	});

	it('登録に成功したら、他のログイン状態を保ったまま一覧へ加えて選択する', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');

		const result = await store.signUp('new@example.com', PASSWORD);

		expect(result.ok).toBe(true);
		expect(store.accounts).toHaveLength(2);
		expect(store.activeAccount?.email).toBe('new@example.com');
		expect(authOf(slotAppName(a.id))?.currentUser?.uid).toBe(a.uid);
		expect(firebaseAuthMock.sendEmailVerification).toHaveBeenCalledOnce();
	});

	it('メールアドレスを正規化した形で公開する', async () => {
		const { store } = await open();
		await signIn(store, '  User@Example.COM ');
		expect(store.email).toBe('user@example.com');
		expect(store.accounts[0].email).toBe('user@example.com');
	});

	it('パスワードの再設定メールは、アカウントに依らず送れる', async () => {
		const { store, base } = await open();
		const result = await store.sendPasswordReset(' User@Example.COM ');

		expect(result.ok).toBe(true);
		expect(firebaseAuthMock.sendPasswordResetEmail).toHaveBeenCalledWith(base, 'user@example.com', {
			url: config.continueUrl
		});
	});

	it('登録されていないメールアドレスへの再設定でも、同じ結果を返す', async () => {
		firebaseAuthMock.sendPasswordResetEmail.mockRejectedValueOnce(
			new FirebaseError('auth/user-not-found', '')
		);
		const { store } = await open();
		expect((await store.sendPasswordReset('nobody@example.com')).ok).toBe(true);
	});

	it('登録の有無と無関係な再設定の失敗は、失敗として返す', async () => {
		firebaseAuthMock.sendPasswordResetEmail.mockRejectedValueOnce(
			new FirebaseError('auth/too-many-requests', '')
		);
		const { store } = await open();
		const result = await store.sendPasswordReset('user@example.com');
		expect(result.ok === false && result.error.kind).toBe('too-many-requests');
	});
});

describe('単一アカウント指定 — 要件 7.1, 7.19, 7.20', () => {
	it('保持アカウントがある間のサインイン・登録は、上限による失敗として既存のログイン状態を変えない', async () => {
		const { store } = await open({ config: single });
		const a = await signIn(store, 'a@example.com');

		const signingIn = await store.signIn('b@example.com', PASSWORD);
		const signingUp = await store.signUp('c@example.com', PASSWORD);

		expect(signingIn.ok === false && signingIn.error.kind).toBe('limit-reached');
		expect(signingUp.ok === false && signingUp.error.kind).toBe('limit-reached');
		expect(store.accounts.map((account) => account.id)).toEqual([a.id]);
		expect(store.activeId).toBe(a.id);
	});

	it('別のタブとの競合で2件になったら、後からサインインしたアカウントを残す', async () => {
		const { store } = await open({ config: single });
		const a = await signIn(store, 'a@example.com');

		const laterId = `${a.id}-later`;
		const later = signInElsewhere(slotAppName(laterId), 'b@example.com');
		const copy = holdNextCopy();
		browser.writeSlotElsewhere({ version: 1, id: laterId, uid: later.uid });
		await settle();
		await settle();
		// 残す方へ複製し終えるまでの間も、未選択や未ログインに見せない
		expect(store.stage).toBe('unresolved');
		copy.release();
		await settle();

		expect(store.accounts.map((account) => account.id)).toEqual([laterId]);
		expect(store.activeId).toBe(laterId);
		expect(browser.slots.has(a.id)).toBe(false);
	});

	it('タブの選択記録を参照せず、保持アカウントがあれば常に選択する', async () => {
		const first = await open({ config: single });
		await signIn(first.store, 'a@example.com');
		first.store.stop();
		reloadFirebase();

		// 明示的な未選択を引き継いだ新しいタブ
		const { store } = await open({ config: single, tab: browser.openTab(null) });

		expect(store.stage).toBe('email-unverified');
		expect(store.activeAccount?.email).toBe('a@example.com');
	});

	it('選択中のアカウントを失うと、未選択ではなく未ログインになる', async () => {
		const { store } = await open({ config: single });
		const a = await signIn(store, 'a@example.com');

		signOutElsewhere(slotAppName(a.id));
		await settle();

		expect(store.stage).toBe('signed-out');
	});
});

describe('ログアウト — 要件 4.6, 4.9, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 7.10', () => {
	it('非選択のアカウントのログアウトは、選択中と他のログイン状態を保つ', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');
		const c = await signIn(store, 'c@example.com');

		const result = await store.signOutAccount(a.id);

		expect(result).toEqual({ ok: true, value: { id: a.id } });
		expect(store.accounts.map((account) => account.id)).toEqual([b.id, c.id]);
		expect(store.activeId).toBe(c.id);
		expect(authOf(slotAppName(b.id))?.currentUser?.uid).toBe(b.uid);
	});

	it('ログアウトしたアカウントは、開き直しても復元しない', async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');
		const b = await signIn(first.store, 'b@example.com');
		await first.store.signOutAccount(a.id);

		const { store } = await reopen(first.store, first.tab);

		expect(store.accounts.map((account) => account.id)).toEqual([b.id]);
	});

	it('選択中のアカウントのログアウトは選択を解除し、2件以上残ったアカウントを自動で選ばない', async () => {
		const { store, base, tab } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');
		await signIn(store, 'c@example.com');

		const result = await store.signOut();

		expect(result.ok).toBe(true);
		expect(store.activeId).toBeNull();
		expect(store.user).toBeNull();
		expect(store.stage).toBe('account-unselected');
		expect(store.accounts.map((account) => account.id)).toEqual([a.id, b.id]);
		expect(base.currentUser).toBeNull();
		// 明示的な未選択を保存し、最後に開いたアカウントが一致すれば消す
		expect(tab.activeId).toBeNull();
		expect(browser.lastOpenedId).toBeNull();
	});

	it('選択中のアカウントのログアウトで残りがちょうど1件なら、それを選ぶ', async () => {
		const { store, base, tab } = await open();
		const a = await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');

		const result = await store.signOut();

		expect(result.ok).toBe(true);
		expect(store.activeId).toBe(a.id);
		expect(store.stage).toBe('email-unverified');
		expect(base.currentUser?.uid).toBe(a.uid);
		expect(tab.activeId).toBe(a.id);
		expect(browser.lastOpenedId).toBe(a.id);
	});

	it('全件のログアウトは、保持アカウントと選択を空にする', async () => {
		const { store, base } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		const copies = firebaseAuthMock.updateCurrentUser.mock.calls.length;
		const result = await store.signOutAll();

		expect(result).toEqual({ ok: true, signedOutIds: [a.id, b.id] });
		// 途中で1件になっても、その1件を選ばない
		expect(firebaseAuthMock.updateCurrentUser).toHaveBeenCalledTimes(copies);
		expect(store.accounts).toEqual([]);
		expect(store.stage).toBe('signed-out');
		expect(base.currentUser).toBeNull();
	});

	it('全件のログアウトの一部が失敗したら、成功分を反映し、失敗したアカウントと理由を返す', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		firebaseAuthMock.signOut.mockImplementationOnce(async () => {
			throw new FirebaseError('auth/network-request-failed', '');
		});
		const result = await store.signOutAll();

		expect(result).toEqual({
			ok: false,
			reason: 'partial',
			signedOutIds: [b.id],
			failed: [
				{
					id: a.id,
					error: { kind: 'auth', cause: expect.objectContaining({ kind: 'network-error' }) }
				}
			]
		});
		expect(store.accounts.map((account) => account.id)).toEqual([a.id]);
		// 終わって1件だけ残れば、それを選ぶ
		expect(store.activeId).toBe(a.id);
	});

	it('ログアウトに失敗したら、対象と理由を返して一覧に残す', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');

		firebaseAuthMock.signOut.mockRejectedValueOnce(
			new FirebaseError('auth/network-request-failed', '')
		);
		const result = await store.signOutAccount(a.id);

		expect(result.ok === false && result.error.kind).toBe('auth');
		expect(store.activeId).toBe(a.id);
		expect(store.operation).toBeNull();
	});

	it('別のタブでのログアウトを観測したら、同じ状態更新を行う', async () => {
		const { store, base, tab } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');
		const c = await signIn(store, 'c@example.com');

		signOutElsewhere(slotAppName(c.id));
		await settle();

		expect(store.accounts.map((account) => account.id)).toEqual([a.id, b.id]);
		expect(store.activeId).toBeNull();
		expect(store.stage).toBe('account-unselected');
		expect(base.currentUser).toBeNull();
		expect(tab.activeId).toBeNull();
		expect(browser.lastOpenedId).toBeNull();
		expect(firebaseAppMock.deleteApp).toHaveBeenCalledWith(
			expect.objectContaining({ name: slotAppName(c.id) })
		);
	});

	it('別のタブで選択中のアカウントがログアウトされ、残りがちょうど1件なら、それを選ぶ', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		signOutElsewhere(slotAppName(b.id));
		await settle();
		await settle();

		expect(store.activeId).toBe(a.id);
	});

	it('別のタブで非選択のアカウントがログアウトされても、選択を保つ', async () => {
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		const b = await signIn(store, 'b@example.com');

		signOutElsewhere(slotAppName(a.id));
		await settle();

		expect(store.accounts.map((account) => account.id)).toEqual([b.id]);
		expect(store.activeId).toBe(b.id);
	});

	it('最後のアカウントのログアウトで未ログインになる', async () => {
		const { store } = await open();
		await signIn(store, 'a@example.com');
		await store.signOut();
		expect(store.stage).toBe('signed-out');
	});
});

describe('選択中アカウントへの操作 — 要件 3.5, 3.6, 3.7', () => {
	it('パスワードの変更は選択中のアカウントに行い、完了後に土台を複製し直す', async () => {
		const { store, base } = await open();
		const a = await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');
		await store.selectAccount(a.id);
		const before = base.currentUser;

		const result = await store.changePassword(PASSWORD, 'next-password');

		expect(result.ok).toBe(true);
		expect(firebaseAuthMock.EmailAuthProvider.credential).toHaveBeenCalledWith(
			'a@example.com',
			PASSWORD
		);
		expect(base.currentUser?.uid).toBe(a.uid);
		expect(base.currentUser).not.toBe(before);
		expect(store.user).toBe(base.currentUser);
	});

	it('確認メールは選択中のアカウントへ送る', async () => {
		const { store } = await open();
		await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');

		await store.sendEmailVerification();

		expect(firebaseAuthMock.sendEmailVerification).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'b@example.com' }),
			{ url: config.continueUrl }
		);
	});

	it('確認状態の取り直しで確認済みになれば、通過の段階へ移る', async () => {
		const { store } = await open();
		await signIn(store, 'a@example.com');
		expect(store.stage).toBe('email-unverified');

		holdNextReload().release();
		expect(await store.refreshVerification()).toBe(true);

		expect(store.isEmailVerified).toBe(true);
		expect(store.stage).toBe('ready');
		expect(store.user?.emailVerified).toBe(true);
	});

	it('選択中のアカウントが無ければ、Firebase へ問い合わせずに失敗として返す', async () => {
		const { store } = await open();

		expect((await store.changePassword(PASSWORD, 'next')).ok).toBe(false);
		expect((await store.sendEmailVerification()).ok).toBe(false);
		expect(await store.refreshVerification()).toBe(false);
		expect(firebaseAuthMock.reauthenticateWithCredential).not.toHaveBeenCalled();
	});
});

describe('タブの選択と復元 — 要件 4.2, 4.3, 4.7, 4.8, 4.11, 4.12', () => {
	/** A と B を保持し、A を最後に開いた状態で閉じる */
	const prepare = async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');
		const b = await signIn(first.store, 'b@example.com');
		await first.store.selectAccount(a.id);
		first.store.stop();
		reloadFirebase();
		return { a, b };
	};

	it('元のタブから引き継いだ有効な選択を初期選択にする', async () => {
		const { b } = await prepare();
		const { store } = await open({ tab: browser.openTab(b.id) });

		expect(store.activeId).toBe(b.id);
		expect(browser.lastOpenedId).toBe(b.id);
	});

	it('タブ内に選択記録がなければ、最後に開いたアカウントを初期選択し、タブに記録する', async () => {
		const { a } = await prepare();
		const tab = browser.openTab();
		const { store } = await open({ tab });

		expect(store.activeId).toBe(a.id);
		expect(tab.activeId).toBe(a.id);
	});

	it('明示的な未選択を引き継いだら、最後に開いたアカウントへ切り替えない', async () => {
		await prepare();
		const { store, base } = await open({ tab: browser.openTab(null) });

		expect(store.activeId).toBeNull();
		expect(store.stage).toBe('account-unselected');
		expect(base.currentUser).toBeNull();
	});

	it('タブ内の選択が無効なら、選択を求める', async () => {
		await prepare();
		const { store } = await open({ tab: browser.openTab('missing') });

		expect(store.stage).toBe('account-unselected');
	});

	it('最後に開いたアカウントが無効で、タブ内の記録も無ければ選択を求める', async () => {
		await prepare();
		browser.setLastOpenedId('missing');
		const { store } = await open();

		expect(store.stage).toBe('account-unselected');
	});

	it('保持アカウントが1件だけなら、明示的な未選択を引き継いでもそれを選ぶ', async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');
		first.store.stop();
		reloadFirebase();

		const tab = browser.openTab(null);
		const { store } = await open({ tab });

		expect(store.activeId).toBe(a.id);
		expect(tab.activeId).toBe(a.id);
	});

	it('選択の記録が無くても、保持アカウントが1件だけならそれを選んで記録する', async () => {
		// 単一アカウント指定から複数アカウント指定へ変えた直後。単一では選択を記録しない
		const first = await open({ config: single });
		const a = await signIn(first.store, 'a@example.com');
		first.store.stop();
		reloadFirebase();

		const tab = browser.openTab();
		const { store } = await open({ tab });

		expect(store.activeId).toBe(a.id);
		expect(tab.activeId).toBe(a.id);
		expect(browser.lastOpenedId).toBe(a.id);
	});

	it('保持アカウントがなければ、サインインへ案内する段階になる', async () => {
		const { store } = await open({ tab: browser.openTab('missing') });
		expect(store.stage).toBe('signed-out');
	});

	it('別のタブで最後に開いたアカウントが変わっても、現在のタブの選択を変えない', async () => {
		const { a, b } = await prepare();
		const { store } = await open({ tab: browser.openTab(a.id) });

		browser.setLastOpenedId(b.id);
		await settle();

		expect(store.activeId).toBe(a.id);
	});

	it('別のタブで追加されたアカウントは一覧へ加えるだけで、現在のタブの選択を変えない', async () => {
		const { a } = await prepare();
		const { store } = await open({ tab: browser.openTab(a.id) });

		const otherId = `${a.id}-other`;
		const other = signInElsewhere(slotAppName(otherId), 'c@example.com');
		browser.writeSlotElsewhere({ version: 1, id: otherId, uid: other.uid });
		await settle();
		await settle();

		expect(store.accounts.map((account) => account.email)).toContain('c@example.com');
		expect(store.activeId).toBe(a.id);
	});

	it('別のタブで同じアカウントのスロットが作られたら、ID の順で代表を決めて重複を解消する', async () => {
		const first = await open();
		const a = await signIn(first.store, 'a@example.com');

		const duplicateId = `0-${a.id}`;
		signInElsewhere(slotAppName(duplicateId), 'a@example.com');
		browser.writeSlotElsewhere({ version: 1, id: duplicateId, uid: a.uid });
		await settle();
		await settle();

		expect(first.store.accounts.map((account) => account.id)).toEqual([duplicateId]);
		expect(first.store.activeId).toBe(duplicateId);
		expect(first.store.stage).toBe('email-unverified');
	});

	it('保存領域を使えなければ保存不能を公開し、その場のサインインと切り替えは続けられる', async () => {
		browser.setAvailable(false);
		const { store } = await open();
		const a = await signIn(store, 'a@example.com');
		await signIn(store, 'b@example.com');

		expect(store.storageStatus).toBe('unavailable');
		expect((await store.selectAccount(a.id)).ok).toBe(true);
		expect(store.activeId).toBe(a.id);
	});
});
