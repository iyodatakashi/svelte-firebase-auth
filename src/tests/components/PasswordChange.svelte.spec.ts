import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import PasswordChange from '$lib/components/PasswordChange.svelte';
import { jaMessages } from '$lib/messages/ja';
import type { AuthResult } from '$lib/models/auth/auth.types';
import { failureOf, fakeAccount, fakeRoutes, fakeStore } from '../support/fakeStore.svelte';

const setup = async (onCompleted?: () => void) => {
	const { store } = fakeStore();
	const screen = await render(PasswordChange, { props: { store, onCompleted } });
	return { screen, store };
};

const fillAndSubmit = async (
	screen: Awaited<ReturnType<typeof setup>>['screen'],
	current = 'current',
	next = 'next-secret'
) => {
	await screen.getByLabelText(jaMessages.currentPassword).fill(current);
	await screen.getByLabelText(jaMessages.newPassword).fill(next);
	await screen.getByRole('button', { name: jaMessages.passwordChangeSubmit }).click();
};

describe('PasswordChange — 要件 3.5', () => {
	it('現在のパスワードと新しいパスワードを受け取り、変更を実行する', async () => {
		const { screen, store } = await setup();
		await fillAndSubmit(screen);

		await vi.waitFor(() =>
			expect(store.changePassword).toHaveBeenCalledWith('current', 'next-secret')
		);
	});

	it('完了時には自ら遷移せず、完了したことを利用者に示す', async () => {
		const { screen } = await setup();
		await fillAndSubmit(screen);

		await expect.element(screen.getByText(jaMessages.passwordChangeDone)).toBeInTheDocument();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('完了したら、もう押せる意味のない操作と、入力した内容を残さない', async () => {
		const { screen } = await setup();
		await fillAndSubmit(screen);

		await expect.element(screen.getByText(jaMessages.passwordChangeDone)).toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.passwordChangeSubmit }))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.cancel }))
			.not.toBeInTheDocument();
		await expect.element(screen.getByLabelText(jaMessages.currentPassword)).not.toBeInTheDocument();
	});

	it('完了を組み込み側へ返す', async () => {
		const onCompleted = vi.fn();
		const { screen } = await setup(onCompleted);
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
	});

	it('失敗したときは完了を返さない', async () => {
		const onCompleted = vi.fn();
		const { screen, store } = await setup(onCompleted);
		vi.mocked(store.changePassword).mockResolvedValueOnce(failureOf('invalid-credential'));
		await fillAndSubmit(screen, 'wrong');

		await expect.element(screen.getByText(jaMessages.currentPasswordInvalid)).toBeInTheDocument();
		expect(onCompleted).not.toHaveBeenCalled();
	});

	it('完了したら、次の一手を1つだけ示し、それが既定の行き先へ遷移する', async () => {
		const { screen } = await setup();
		await fillAndSubmit(screen);

		await screen.getByRole('button', { name: jaMessages.back }).click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(fakeRoutes.afterSignIn);
	});
});

describe('PasswordChange の操作の並び', () => {
	it('取りやめが左、実行が右に並ぶ', async () => {
		const { screen } = await setup();
		const labels = [...screen.container.querySelectorAll('.password-change__actions button')].map(
			(button) => button.textContent?.trim()
		);

		expect(labels).toEqual([jaMessages.cancel, jaMessages.passwordChangeSubmit]);
	});
});

describe('PasswordChange の導線 — 要件 3.5', () => {
	it('取りやめが、既定の行き先へ遷移する', async () => {
		const { screen } = await setup();
		await screen.getByRole('button', { name: jaMessages.cancel }).click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(fakeRoutes.afterSignIn);
	});
});

describe('PasswordChange の失敗 — 要件 6.2, 6.3（auth-store-and-screens）', () => {
	it('現在のパスワードが誤っていれば、専用の案内を示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.changePassword).mockResolvedValueOnce(failureOf('invalid-credential'));
		await fillAndSubmit(screen, 'wrong');

		await expect.element(screen.getByText(jaMessages.currentPasswordInvalid)).toBeInTheDocument();
		await expect
			.element(screen.getByText(jaMessages.errors['invalid-credential']))
			.not.toBeInTheDocument();
	});

	it('現在のパスワードが誤っていれば、完了として示さない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.changePassword).mockResolvedValueOnce(failureOf('invalid-credential'));
		await fillAndSubmit(screen, 'wrong');

		await expect.element(screen.getByText(jaMessages.currentPasswordInvalid)).toBeInTheDocument();
		await expect.element(screen.getByText(jaMessages.passwordChangeDone)).not.toBeInTheDocument();
	});

	it('新しいパスワードの強度が足りなければ、理由を示して入力し直せる状態を保つ', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.changePassword).mockResolvedValueOnce(
			failureOf('weak-password', ['uppercase'])
		);
		await fillAndSubmit(screen, 'current', 'weak');

		await expect
			.element(screen.getByText(jaMessages.weakPasswordReason(['uppercase'])))
			.toBeInTheDocument();
		await expect.element(screen.getByLabelText(jaMessages.currentPassword)).toHaveValue('current');
		await expect.element(screen.getByLabelText(jaMessages.newPassword)).toHaveValue('weak');
	});

	it('処理中は同じ操作の重複した実行を受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.changePassword).mockImplementation(
			() => new Promise(() => {}) as Promise<never>
		);
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(store.changePassword).toHaveBeenCalledOnce());
		await expect
			.element(screen.getByRole('button', { name: jaMessages.passwordChangeSubmit }))
			.toBeDisabled();
	});
});

describe('PasswordChange の表示中の切り替え — 要件 3.6, 7.18（multi-account-auth）', () => {
	const other = fakeAccount({ id: 'account-2', uid: 'uid-2', email: 'other@example.com' });

	const setupSwitchable = async () => {
		const { store, switchTo } = fakeStore();
		const onCompleted = vi.fn();
		const screen = await render(PasswordChange, { props: { store, onCompleted } });
		return { screen, store, switchTo, onCompleted };
	};

	it('選択中のアカウントが変わったら、入力を破棄する', async () => {
		const { screen, switchTo } = await setupSwitchable();
		await screen.getByLabelText(jaMessages.currentPassword).fill('typed');

		switchTo(other);

		await expect.element(screen.getByLabelText(jaMessages.currentPassword)).toHaveValue('');
	});

	it('選択中のアカウントが変わったら、完了表示を破棄して入力し直せる状態にする', async () => {
		const { screen, switchTo } = await setupSwitchable();
		await fillAndSubmit(screen);
		await expect.element(screen.getByText(jaMessages.passwordChangeDone)).toBeInTheDocument();

		switchTo(other);

		await expect.element(screen.getByText(jaMessages.passwordChangeDone)).not.toBeInTheDocument();
		await expect.element(screen.getByLabelText(jaMessages.currentPassword)).toBeInTheDocument();
	});

	it('切り替え前に始めた変更が後から完了しても、完了表示も完了通知も行わない', async () => {
		const { screen, store, switchTo, onCompleted } = await setupSwitchable();
		let complete: (result: AuthResult) => void = () => {};
		vi.mocked(store.changePassword).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await fillAndSubmit(screen);
		await vi.waitFor(() => expect(store.changePassword).toHaveBeenCalledOnce());

		switchTo(other);
		complete({ ok: true });

		await expect.element(screen.getByLabelText(jaMessages.currentPassword)).toBeEnabled();
		await expect.element(screen.getByText(jaMessages.passwordChangeDone)).not.toBeInTheDocument();
		expect(onCompleted).not.toHaveBeenCalled();
	});

	it('画面が破棄された後に変更が完了しても、完了通知を行わない', async () => {
		const { screen, store, onCompleted } = await setupSwitchable();
		let complete: (result: AuthResult) => void = () => {};
		vi.mocked(store.changePassword).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await fillAndSubmit(screen);
		await vi.waitFor(() => expect(store.changePassword).toHaveBeenCalledOnce());

		await screen.unmount();
		complete({ ok: true });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onCompleted).not.toHaveBeenCalled();
	});
});
