import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import PasswordReset from '$lib/components/PasswordReset.svelte';
import { jaMessages } from '$lib/messages/ja';
import { failureOf, fakeRoutes, fakeStore } from '../support/fakeStore.svelte';

const setup = async () => {
	const { store } = fakeStore();
	const onCompleted = vi.fn();
	const screen = await render(PasswordReset, { props: { store, onCompleted } });
	return { screen, store, onCompleted };
};

const request = async (
	screen: Awaited<ReturnType<typeof setup>>['screen'],
	email = 'user@example.com'
) => {
	await screen.getByLabelText(jaMessages.emailLabel).fill(email);
	await screen.getByRole('button', { name: jaMessages.passwordResetSubmit }).click();
};

describe('PasswordReset — 要件 7.2, 7.3, 7.4（auth-store-and-screens）', () => {
	it('メールを送ったことと、迷惑メールフォルダの確認を示す', async () => {
		const { screen } = await setup();
		await request(screen);

		await expect.element(screen.getByText(jaMessages.passwordResetSent)).toBeInTheDocument();
		await expect.element(screen.getByText(jaMessages.passwordResetCheckSpam)).toBeInTheDocument();
	});

	it('入力したメールアドレスをそのまま渡し、完了しても遷移せず、完了を返す', async () => {
		const { screen, store, onCompleted } = await setup();
		await request(screen, ' User@Example.COM ');

		await vi.waitFor(() =>
			expect(store.sendPasswordReset).toHaveBeenCalledWith('User@Example.COM')
		);
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
		expect(onCompleted).toHaveBeenCalledOnce();
	});

	it('登録されているアドレスと未登録のアドレスで、同じ表示になる', async () => {
		const registered = await setup();
		await request(registered.screen, 'registered@example.com');
		await expect
			.element(registered.screen.getByText(jaMessages.passwordResetSent))
			.toBeInTheDocument();
		const registeredHtml = registered.screen.container.innerHTML;

		await registered.screen.unmount();

		// ストアは登録の有無によらず同じ結果を返す（要件 7.2）
		const unknown = await setup();
		await request(unknown.screen, 'nobody@example.com');
		await expect
			.element(unknown.screen.getByText(jaMessages.passwordResetSent))
			.toBeInTheDocument();

		expect(unknown.screen.container.innerHTML.replace('nobody', 'registered')).toBe(registeredHtml);
	});
});

describe('PasswordReset の導線 — 要件 3.6', () => {
	it('サインインへ戻る導線が、設定された経路へ遷移する', async () => {
		const { screen } = await setup();
		await screen.getByRole('button', { name: jaMessages.passwordResetToSignIn }).click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(fakeRoutes.signIn);
	});
});

describe('PasswordReset の失敗 — 要件 7.6（auth-store-and-screens）', () => {
	it('要求が受け付けられなくなったら、間隔を空けるよう示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.sendPasswordReset).mockResolvedValueOnce(failureOf('too-many-requests'));
		await request(screen);

		await expect
			.element(screen.getByText(jaMessages.errors['too-many-requests']))
			.toBeInTheDocument();
	});

	it('要求が受け付けられなくなったら、その操作を一時的に受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.sendPasswordReset).mockResolvedValueOnce(failureOf('too-many-requests'));
		await request(screen);

		await expect
			.element(screen.getByRole('button', { name: jaMessages.passwordResetSubmit }))
			.toBeDisabled();
	});

	it('失敗しても入力した内容を失わせず、完了として示さない', async () => {
		const { screen, store, onCompleted } = await setup();
		vi.mocked(store.sendPasswordReset).mockResolvedValueOnce(failureOf('invalid-email'));
		await request(screen, 'not-an-email');

		await expect.element(screen.getByText(jaMessages.errors['invalid-email'])).toBeInTheDocument();
		await expect.element(screen.getByLabelText(jaMessages.emailLabel)).toHaveValue('not-an-email');
		await expect.element(screen.getByText(jaMessages.passwordResetSent)).not.toBeInTheDocument();
		expect(onCompleted).not.toHaveBeenCalled();
	});
});
