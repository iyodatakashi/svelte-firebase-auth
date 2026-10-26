import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import AccountChooser from '$lib/components/AccountChooser.svelte';
import { jaMessages } from '$lib/messages/ja';
import {
	authFailureOf,
	fakeAccount,
	fakeStore,
	operationFailureOf,
	type FakeStoreOptions
} from '../support/fakeStore.svelte';

const a = fakeAccount({ id: 'a', uid: 'uid-a', email: 'a@example.com' });
const b = fakeAccount({ id: 'b', uid: 'uid-b', email: 'b@example.com' });

const setup = async (options: FakeStoreOptions = { accounts: [a, b], activeId: 'a' }) => {
	const fake = fakeStore(options);
	const onAddRequested = vi.fn();
	const screen = await render(AccountChooser, {
		props: { store: fake.store, onAddRequested }
	});
	return { ...fake, screen, onAddRequested };
};

/** アカウントを選ぶボタン。選択中なら名前の後ろに選択中の表示が続く */
const accountButton = (screen: Awaited<ReturnType<typeof setup>>['screen'], email: string) =>
	screen.getByRole('button', {
		name: new RegExp(`^${email.replace('.', '\\.')}\\s*(${jaMessages.accountActive})?$`)
	});

describe('一覧と選択中の表示 — 要件 1.4, 7.3（multi-account-auth）', () => {
	it('各アカウントのメールアドレスと、選択中かどうかを色に頼らず示す', async () => {
		const { screen } = await setup();

		const active = accountButton(screen, 'a@example.com');
		await expect.element(active).toHaveTextContent(jaMessages.accountActive);
		await expect.element(active).toHaveAttribute('aria-current', 'true');
		await expect
			.element(accountButton(screen, 'b@example.com'))
			.not.toHaveTextContent(jaMessages.accountActive);
	});

	it('一覧を読み上げ名つきのリストとして示す', async () => {
		const { screen } = await setup();
		await expect
			.element(screen.getByRole('list', { name: jaMessages.accountListLabel }))
			.toBeInTheDocument();
	});
});

describe('切り替え — 要件 3.1, 6.5, 7.3（multi-account-auth）', () => {
	it('項目を選ぶだけで、そのアカウントへ直接切り替える', async () => {
		const { screen, store } = await setup();
		await accountButton(screen, 'b@example.com').click();

		expect(store.selectAccount).toHaveBeenCalledWith('b');
	});

	it('未選択のときも、残ったアカウントから選べる', async () => {
		const { screen, store } = await setup({ accounts: [a, b], activeId: null });
		await accountButton(screen, 'a@example.com').click();

		expect(store.selectAccount).toHaveBeenCalledWith('a');
	});

	it('キーボードで選べる', async () => {
		const { screen, store } = await setup();
		await accountButton(screen, 'a@example.com').click();
		vi.mocked(store.selectAccount).mockClear();

		for (let step = 0; step < 10; step++) {
			if (document.activeElement?.textContent?.includes('b@example.com')) {
				break;
			}
			await userEvent.tab();
		}
		await userEvent.keyboard('{Enter}');

		expect(store.selectAccount).toHaveBeenCalledWith('b');
	});

	it('切り替えに失敗したら、対象のアカウントが分かる案内を出す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.selectAccount).mockResolvedValueOnce(
			operationFailureOf({ kind: 'not-signed-in' })
		);
		await accountButton(screen, 'b@example.com').click();

		await expect
			.element(
				screen.getByText(jaMessages.selectFailed('b@example.com', jaMessages.accountUnavailable))
			)
			.toBeInTheDocument();
	});
});

describe('ログアウト — 要件 5.1, 5.6, 5.7（multi-account-auth）', () => {
	it('指定した1件のログアウトと、全件のログアウトを区別して示す', async () => {
		const { screen, store } = await setup();
		await screen
			.getByRole('button', { name: jaMessages.signOutAccountLabel('b@example.com') })
			.click();
		expect(store.signOutAccount).toHaveBeenCalledWith('b');

		await screen.getByRole('button', { name: jaMessages.signOutAll }).click();
		expect(store.signOutAll).toHaveBeenCalledOnce();
	});

	it('ログアウトに失敗したら対象のアカウントを示し、失敗分を再試行できる', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signOutAccount).mockResolvedValueOnce(authFailureOf('network-error'));
		const signOutB = screen.getByRole('button', {
			name: jaMessages.signOutAccountLabel('b@example.com')
		});
		await signOutB.click();

		const message = jaMessages.signOutFailed('b@example.com', jaMessages.errors['network-error']);
		await expect.element(screen.getByText(message)).toBeInTheDocument();

		await signOutB.click();
		await expect.element(screen.getByText(message)).not.toBeInTheDocument();
		expect(store.signOutAccount).toHaveBeenCalledTimes(2);
	});

	it('全件のログアウトの一部が失敗したら、失敗したアカウントを示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signOutAll).mockResolvedValueOnce({
			ok: false,
			reason: 'partial',
			signedOutIds: ['b'],
			failed: [
				{
					id: 'a',
					error: {
						kind: 'auth',
						cause: { kind: 'network-error', detail: '', unmetPasswordRequirements: [] }
					}
				}
			]
		});
		await screen.getByRole('button', { name: jaMessages.signOutAll }).click();

		await expect
			.element(
				screen.getByText(
					jaMessages.signOutFailed('a@example.com', jaMessages.errors['network-error'])
				)
			)
			.toBeInTheDocument();
	});

	it('ログアウトをアカウントの削除として表示しない', async () => {
		const { screen } = await setup();
		expect(screen.container.textContent).not.toMatch(/削除/);
	});
});

describe('操作中 — 要件 3.7（multi-account-auth）', () => {
	it('操作の実行中は、競合する入力を止める', async () => {
		const { screen, setOperation } = await setup();
		setOperation({ kind: 'sign-out', id: 'a' });

		await expect.element(accountButton(screen, 'b@example.com')).toBeDisabled();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signOutAll }))
			.toBeDisabled();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.addAccount }))
			.toBeDisabled();
	});
});

describe('追加と、保持アカウントが無いとき — 要件 1.5（multi-account-auth）', () => {
	it('追加を求められたら組み込み側へ知らせる', async () => {
		const { screen, onAddRequested } = await setup();
		await screen.getByRole('button', { name: jaMessages.addAccount }).click();
		expect(onAddRequested).toHaveBeenCalledOnce();
	});

	it('保持アカウントが無ければ、そのことと追加の導線を示す', async () => {
		const { screen } = await setup({ isLoggedIn: false });

		await expect.element(screen.getByText(jaMessages.noAccounts)).toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.addAccount }))
			.toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signOutAll }))
			.not.toBeInTheDocument();
	});
});

describe('保存不能 — 要件 4.7（multi-account-auth）', () => {
	it('保存領域を使えなければ、再読み込み後に復元できない可能性を示す', async () => {
		const { screen, setStorageStatus } = await setup();
		await expect.element(screen.getByText(jaMessages.storageUnavailable)).not.toBeInTheDocument();

		setStorageStatus('unavailable');
		await expect.element(screen.getByText(jaMessages.storageUnavailable)).toBeInTheDocument();
	});
});
