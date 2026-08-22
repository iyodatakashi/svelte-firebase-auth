import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PasswordChangeScreen from '$lib/screens/PasswordChangeScreen.svelte';
import { jaMessages } from '$lib/messages/ja';
import { failureOf, fakeStore } from '../support/fakeStore.svelte';

const setup = async () => {
	const { store } = fakeStore();
	const onChanged = vi.fn();
	const onCancel = vi.fn();
	const screen = await render(PasswordChangeScreen, { props: { store, onChanged, onCancel } });
	return { screen, store, onChanged, onCancel };
};

const fillAndSubmit = async (
	screen: Awaited<ReturnType<typeof setup>>['screen'],
	current = 'current',
	next = 'next-secret'
) => {
	await screen.getByLabelText(jaMessages.currentPasswordLabel).fill(current);
	await screen.getByLabelText(jaMessages.newPasswordLabel).fill(next);
	await screen.getByRole('button', { name: jaMessages.passwordChangeSubmit }).click();
};

describe('PasswordChangeScreen — 要件 6.5', () => {
	it('現在のパスワードと新しいパスワードを受け取り、変更を実行する', async () => {
		const { screen, store, onChanged } = await setup();
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
		expect(store.changePassword).toHaveBeenCalledWith('current', 'next-secret');
	});

	it('完了したことを利用者に示す', async () => {
		const { screen } = await setup();
		await fillAndSubmit(screen);
		await expect.element(screen.getByText(jaMessages.passwordChangeDone)).toBeInTheDocument();
	});
});

describe('PasswordChangeScreen の失敗 — 要件 6.2, 6.3', () => {
	it('現在のパスワードが誤っていれば、専用の案内を示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.changePassword).mockResolvedValueOnce(failureOf('invalid-credential'));
		await fillAndSubmit(screen, 'wrong');

		await expect
			.element(screen.getByText(jaMessages.errorCurrentPasswordInvalid))
			.toBeInTheDocument();
		await expect
			.element(screen.getByText(jaMessages.errors['invalid-credential']))
			.not.toBeInTheDocument();
	});

	it('現在のパスワードが誤っていれば、完了を通知しない', async () => {
		const { screen, store, onChanged } = await setup();
		vi.mocked(store.changePassword).mockResolvedValueOnce(failureOf('invalid-credential'));
		await fillAndSubmit(screen, 'wrong');

		await expect
			.element(screen.getByText(jaMessages.errorCurrentPasswordInvalid))
			.toBeInTheDocument();
		expect(onChanged).not.toHaveBeenCalled();
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
		await expect
			.element(screen.getByLabelText(jaMessages.currentPasswordLabel))
			.toHaveValue('current');
		await expect.element(screen.getByLabelText(jaMessages.newPasswordLabel)).toHaveValue('weak');
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

describe('PasswordChangeScreen の導線 — 要件 6.8', () => {
	it('変更を取りやめる手段を提供し、その要求を通知する', async () => {
		const { screen, onCancel } = await setup();
		await screen.getByRole('button', { name: jaMessages.passwordChangeCancel }).click();
		expect(onCancel).toHaveBeenCalledOnce();
	});
});
