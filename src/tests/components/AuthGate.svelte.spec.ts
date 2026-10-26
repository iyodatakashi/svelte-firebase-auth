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
			expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe('/documents/42?tab=history')
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
