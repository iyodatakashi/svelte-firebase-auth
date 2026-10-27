import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { goto } from '$app/navigation';
import AuthGate from '$lib/components/AuthGate.svelte';
import { fakeAccount, fakeStore } from '../support/fakeStore.svelte';

// ルーターの無い環境では現在の経路が空になる。保護された経路を開いている状況を作る
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/documents/42?tab=history') }
}));

const RETURN_TO_KEY = 'svelte-firebase-auth:return-to';

const children = createRawSnippet(() => ({ render: () => '<p>保護された内容</p>' }));
const pending = createRawSnippet(() => ({ render: () => '<p>読み込み中</p>' }));

afterEach(() => {
	sessionStorage.clear();
});

const held = (): unknown => JSON.parse(sessionStorage.getItem(RETURN_TO_KEY) ?? 'null');

/** A と B を保持し、どちらも選んでいない */
const unselected = () =>
	fakeStore({
		accounts: [
			fakeAccount({ id: 'a', email: 'a@example.com', isEmailVerified: true }),
			fakeAccount({ id: 'b', email: 'b@example.com', isEmailVerified: true })
		],
		activeId: null
	});

describe('選択待ち — 要件 6.2, 6.3, 6.9（multi-account-auth）', () => {
	it('遷移せず、保護された子も判定待ちの表示も描画しない', async () => {
		const { store } = unselected();
		const screen = await render(AuthGate, { props: { store, children, pending } });

		await expect.element(screen.getByText('保護された内容')).not.toBeInTheDocument();
		await expect.element(screen.getByText('読み込み中')).not.toBeInTheDocument();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('現在の経路を戻り先として保持する', async () => {
		const { store } = unselected();
		await render(AuthGate, { props: { store, children, pending } });

		await vi.waitFor(() =>
			expect(held()).toEqual({ path: '/documents/42?tab=history', ownerUid: null })
		);
	});
});

describe('選択の後 — 要件 6.6, 6.7（multi-account-auth）', () => {
	it('選択されて通過の段階になると、同じ経路のまま子を描画する', async () => {
		const { store, switchTo } = unselected();
		const screen = await render(AuthGate, { props: { store, children, pending } });
		await expect.element(screen.getByText('保護された内容')).not.toBeInTheDocument();

		switchTo(fakeAccount({ id: 'b', email: 'b@example.com', isEmailVerified: true }));

		await expect.element(screen.getByText('保護された内容')).toBeInTheDocument();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('切り替え先に確認が必要なら、他のアカウントが確認済みでも確認待ちへ案内する — 要件 6.4, 6.8', async () => {
		const { store, switchTo } = fakeStore({
			accounts: [fakeAccount({ id: 'a', isEmailVerified: true })],
			activeId: 'a'
		});
		const screen = await render(AuthGate, { props: { store, children, pending } });
		await expect.element(screen.getByText('保護された内容')).toBeInTheDocument();

		switchTo(fakeAccount({ id: 'b', email: 'b@example.com', isEmailVerified: false }));

		await expect.element(screen.getByText('保護された内容')).not.toBeInTheDocument();
		await vi.waitFor(() =>
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/verify-email', { replaceState: true })
		);
	});
});

describe('戻り先とアカウントの結びつき — 要件 6.10, 6.11（multi-account-auth）', () => {
	const a = fakeAccount({ id: 'a', uid: 'uid-a', email: 'a@example.com', isEmailVerified: true });
	const b = fakeAccount({ id: 'b', uid: 'uid-b', email: 'b@example.com', isEmailVerified: true });

	/** A が保護された経路の内容を見ている状態から、A が離れる */
	const leaveFromA = async () => {
		const fake = fakeStore({ accounts: [a, b], activeId: 'a' });
		const screen = await render(AuthGate, { props: { store: fake.store, children, pending } });
		await expect.element(screen.getByText('保護された内容')).toBeInTheDocument();
		fake.switchTo(null);
		await vi.waitFor(() =>
			expect(held()).toEqual({ path: '/documents/42?tab=history', ownerUid: 'uid-a' })
		);
		return { ...fake, screen };
	};

	it('使用中のアカウントが離れたときに開いていた経路は、そのアカウントの戻り先として保持する', async () => {
		await leaveFromA();
	});

	it('同じ経路のまま別のアカウントが選ばれたら、内容を出さずに既定の行き先へ振り替える', async () => {
		const { screen, switchTo } = await leaveFromA();

		switchTo(b);

		await vi.waitFor(() =>
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true })
		);
		await expect.element(screen.getByText('保護された内容')).not.toBeInTheDocument();
		expect(held()).toBeNull();
	});

	it('同じアカウントが再び選ばれたら、同じ経路のまま内容を出す', async () => {
		const { screen, switchTo } = await leaveFromA();

		switchTo(a);

		await expect.element(screen.getByText('保護された内容')).toBeInTheDocument();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('A が離れて残りの B がそのまま選ばれても、A が見ていた経路から既定の行き先へ振り替える', async () => {
		const { store, remove, switchTo, setStage } = fakeStore({ accounts: [a, b], activeId: 'a' });
		const screen = await render(AuthGate, { props: { store, children, pending } });
		await expect.element(screen.getByText('保護された内容')).toBeInTheDocument();

		// 1件だけ残ると未選択を経ず、残す方へ複製し終えるまで判定待ちになる
		setStage('unresolved');
		remove('a');
		await expect.element(screen.getByText('読み込み中')).toBeInTheDocument();
		switchTo(b);
		setStage(null);

		await vi.waitFor(() =>
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true })
		);
		await expect.element(screen.getByText('保護された内容')).not.toBeInTheDocument();
	});

	it('A を保持したまま B へ切り替えたなら、同じ経路のまま内容を出す', async () => {
		const { store, switchTo } = fakeStore({ accounts: [a, b], activeId: 'a' });
		const screen = await render(AuthGate, { props: { store, children, pending } });
		await expect.element(screen.getByText('保護された内容')).toBeInTheDocument();

		switchTo(b);

		await expect.element(screen.getByText('保護された内容')).toBeInTheDocument();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});
});
