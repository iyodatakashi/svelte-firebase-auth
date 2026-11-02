import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Auth } from 'firebase/auth';
import AuthSession from '$lib/components/AuthSession.svelte';
import type { AccountPersistence, AuthConfig, AuthStore } from '$lib/models/auth/auth.types';
import {
	firebaseAppMock,
	firebaseAuthMock,
	reloadFirebase,
	resetFirebaseFake
} from '../stores/firebaseFake';

vi.mock('firebase/auth', async () => (await import('../stores/firebaseFake')).firebaseAuthMock);
vi.mock('firebase/app', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/app')>()),
	...(await import('../stores/firebaseFake')).firebaseAppMock
}));

const { createAuthStore } = await import('$lib/stores/auth.svelte');

const NAMESPACE = 'session-test';

afterEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	vi.restoreAllMocks();
	resetFirebaseFake();
});

/** 開始で渡された保存の窓口を捕まえるストア */
const capturingStore = () => {
	let captured: AccountPersistence | null = null;
	const store = {
		start: vi.fn(async (persistence: AccountPersistence) => {
			captured = persistence;
		}),
		stop: vi.fn()
	} as unknown as AuthStore;
	return {
		store,
		persistence: (): AccountPersistence => {
			if (!captured) {
				throw new Error('開始されていない');
			}
			return captured;
		}
	};
};

const mount = async (namespace = NAMESPACE) => {
	const capturing = capturingStore();
	const screen = await render(AuthSession, { props: { store: capturing.store, namespace } });
	await vi.waitFor(() => expect(capturing.store.start).toHaveBeenCalledOnce());
	return { ...capturing, screen };
};

describe('ストアの寿命 — 要件 4.1（multi-account-auth）', () => {
	it('マウントでストアを開始し、アンマウントで停止する', async () => {
		const { store, screen } = await mount();
		expect(store.stop).not.toHaveBeenCalled();

		await screen.unmount();
		expect(store.stop).toHaveBeenCalledOnce();
	});

	it('描画を持たない', async () => {
		const { screen } = await mount();
		expect(screen.container.textContent).toBe('');
	});
});

describe('スロット記録 — 要件 4.1, 4.9, 4.10（multi-account-auth）', () => {
	it('スロット記録をスロットごとのキーで書き、読み戻す', async () => {
		const { persistence } = await mount();
		persistence().writeSlot({ version: 1, id: 'a', uid: 'uid-a' });
		persistence().writeSlot({ version: 1, id: 'b', uid: 'uid-b' });

		const read = persistence().readSlots();
		expect(read.ok && [...read.value].sort((x, y) => x.id.localeCompare(y.id))).toEqual([
			{ version: 1, id: 'a', uid: 'uid-a' },
			{ version: 1, id: 'b', uid: 'uid-b' }
		]);

		persistence().removeSlot('a');
		const afterRemove = persistence().readSlots();
		expect(afterRemove.ok && afterRemove.value.map((slot) => slot.id)).toEqual(['b']);
	});

	it('形の合わない記録と、他の名前空間の記録を読まない', async () => {
		const { persistence } = await mount();
		persistence().writeSlot({ version: 1, id: 'a', uid: 'uid-a' });
		localStorage.setItem(`svelte-firebase-auth:${NAMESPACE}:slot:broken`, '{not json');
		localStorage.setItem(
			`svelte-firebase-auth:${NAMESPACE}:slot:old`,
			JSON.stringify({ version: 0, id: 'old', uid: 'uid-old' })
		);
		localStorage.setItem(
			'svelte-firebase-auth:other:slot:c',
			JSON.stringify({ version: 1, id: 'c', uid: 'uid-c' })
		);

		const read = persistence().readSlots();
		expect(read.ok && read.value.map((slot) => slot.id)).toEqual(['a']);
	});

	it('別のタブでのスロット記録の変更を知らせ、最後に開いたアカウントの変更は知らせない', async () => {
		const { persistence } = await mount();
		const listener = vi.fn();
		const unsubscribe = persistence().onSlotsChanged(listener);

		window.dispatchEvent(
			new StorageEvent('storage', {
				key: `svelte-firebase-auth:${NAMESPACE}:slot:a`,
				storageArea: localStorage
			})
		);
		window.dispatchEvent(
			new StorageEvent('storage', {
				key: `svelte-firebase-auth:${NAMESPACE}:last-opened`,
				storageArea: localStorage
			})
		);
		expect(listener).toHaveBeenCalledOnce();

		unsubscribe();
		window.dispatchEvent(
			new StorageEvent('storage', {
				key: `svelte-firebase-auth:${NAMESPACE}:slot:b`,
				storageArea: localStorage
			})
		);
		expect(listener).toHaveBeenCalledOnce();
	});
});

describe('選択の保存 — 要件 4.2, 4.11, 4.12（multi-account-auth）', () => {
	it('タブの選択は、記録なしと明示的な未選択を区別する', async () => {
		const { persistence } = await mount();
		expect(persistence().readActiveId()).toEqual({ ok: true, value: undefined });

		persistence().writeActiveId(null);
		expect(persistence().readActiveId()).toEqual({ ok: true, value: null });

		persistence().writeActiveId('a');
		expect(persistence().readActiveId()).toEqual({ ok: true, value: 'a' });
		// タブ単位の保存領域に置く
		expect(localStorage.length).toBe(0);
	});

	it('最後に開いたアカウントは、ブラウザ共通の保存領域に置く', async () => {
		const { persistence } = await mount();
		expect(persistence().readLastOpenedId()).toEqual({ ok: true, value: null });

		persistence().writeLastOpenedId('a');
		expect(persistence().readLastOpenedId()).toEqual({ ok: true, value: 'a' });
		expect(sessionStorage.length).toBe(0);

		persistence().writeLastOpenedId(null);
		expect(persistence().readLastOpenedId()).toEqual({ ok: true, value: null });
	});
});

describe('保存領域を使えないとき — 要件 4.7（multi-account-auth）', () => {
	it('例外を投げず、失敗として返す', async () => {
		const { persistence } = await mount();
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('quota', 'QuotaExceededError');
		});

		expect(persistence().writeSlot({ version: 1, id: 'a', uid: 'uid-a' })).toEqual({ ok: false });
		expect(persistence().writeActiveId('a')).toEqual({ ok: false });
		expect(persistence().writeLastOpenedId('a')).toEqual({ ok: false });
	});
});

describe('根の配置での復元 — 要件 4.1, 4.2（multi-account-auth）', () => {
	const config: AuthConfig = {
		selfRegistration: true,
		emailVerification: false,
		continueUrl: 'https://example.com/after',
		routes: {
			signIn: '/signin',
			signUp: '/signup',
			verifyEmail: '/verify-email',
			passwordReset: '/password-reset',
			afterSignIn: '/'
		},
		multiAccount: true
	};

	const baseAuth = (): Auth =>
		firebaseAuthMock.getAuth(firebaseAppMock.initializeApp({ apiKey: 'fake' }, '[DEFAULT]'));

	it('再読み込みの後に、選択とログイン状態が復元される', async () => {
		const first = createAuthStore(baseAuth(), config);
		const screen = await render(AuthSession, { props: { store: first, namespace: NAMESPACE } });
		await vi.waitFor(() => expect(first.isResolved).toBe(true));
		const a = await first.signIn('a@example.com', 'secret-password');
		await first.signIn('b@example.com', 'secret-password');
		if (!a.ok) {
			throw new Error('サインインに失敗した');
		}
		await first.selectAccount(a.value.id);
		await screen.unmount();

		// 再読み込み
		reloadFirebase();
		const second = createAuthStore(baseAuth(), config);
		await render(AuthSession, { props: { store: second, namespace: NAMESPACE } });
		await vi.waitFor(() => expect(second.isResolved).toBe(true));

		expect(second.accounts.map((account) => account.email)).toEqual([
			'a@example.com',
			'b@example.com'
		]);
		expect(second.activeId).toBe(a.value.id);
		expect(second.stage).toBe('ready');
	});
});
