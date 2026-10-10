import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import PasswordChange from '$lib/components/PasswordChange.svelte';
import { jaMessages } from '$lib/messages/ja';
import { failureOf, fakeRoutes, fakeStore } from '../support/fakeStore.svelte';

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
