import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SignUpScreen from '$lib/screens/SignUpScreen.svelte';
import { jaMessages } from '$lib/messages/ja';
import { failureOf, fakeStore } from '../support/fakeStore.svelte';

const setup = async () => {
	const { store } = fakeStore();
	const onSignedUp = vi.fn();
	const onRequestSignIn = vi.fn();
	const onRequestPasswordReset = vi.fn();
	const screen = await render(SignUpScreen, {
		props: { store, onSignedUp, onRequestSignIn, onRequestPasswordReset }
	});
	return { screen, store, onSignedUp, onRequestSignIn, onRequestPasswordReset };
};

const fillAndSubmit = async (
	screen: Awaited<ReturnType<typeof setup>>['screen'],
	email = 'user@example.com',
	password = 'secret'
) => {
	await screen.getByLabelText(jaMessages.emailLabel).fill(email);
	await screen.getByLabelText(jaMessages.passwordLabel).fill(password);
	await screen.getByRole('button', { name: jaMessages.signUpSubmit }).click();
};

describe('SignUpScreen — 要件 4.6', () => {
	it('登録が完了したら、組み込み側へ通知する', async () => {
		const { screen, store, onSignedUp } = await setup();
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(onSignedUp).toHaveBeenCalledOnce());
		expect(store.signUp).toHaveBeenCalledWith('user@example.com', 'secret');
	});
});

describe('SignUpScreen の失敗 — 要件 4.3, 4.4, 4.5', () => {
	it('既に使われているメールアドレスは、その旨を示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(failureOf('email-already-in-use'));
		await fillAndSubmit(screen);

		await expect
			.element(screen.getByText(jaMessages.errors['email-already-in-use']))
			.toBeInTheDocument();
	});

	it('既に使われているメールアドレスのときだけ、パスワードの再設定へ導く', async () => {
		const { screen, store, onRequestPasswordReset } = await setup();

		const resetLink = screen.getByRole('button', { name: jaMessages.signUpToPasswordReset });
		await expect.element(resetLink).not.toBeInTheDocument();

		vi.mocked(store.signUp).mockResolvedValueOnce(failureOf('email-already-in-use'));
		await fillAndSubmit(screen);

		await resetLink.click();
		expect(onRequestPasswordReset).toHaveBeenCalledOnce();
	});

	it('強度が足りないときは、満たしていない要件を示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(
			failureOf('weak-password', ['min-length', 'numeric'])
		);
		await fillAndSubmit(screen, 'user@example.com', 'x');

		await expect
			.element(screen.getByText(jaMessages.weakPasswordReason(['min-length', 'numeric'])))
			.toBeInTheDocument();
	});

	it('失敗しても入力した内容を失わせず、入力し直せる状態を保つ', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(failureOf('weak-password', ['min-length']));
		await fillAndSubmit(screen, 'user@example.com', 'x');

		await expect
			.element(screen.getByText(jaMessages.weakPasswordReason(['min-length'])))
			.toBeInTheDocument();
		await expect
			.element(screen.getByLabelText(jaMessages.emailLabel))
			.toHaveValue('user@example.com');
		await expect.element(screen.getByLabelText(jaMessages.passwordLabel)).toHaveValue('x');
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signUpSubmit }))
			.not.toBeDisabled();
	});

	it('失敗しても完了を通知しない', async () => {
		const { screen, store, onSignedUp } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(failureOf('registration-disabled'));
		await fillAndSubmit(screen);

		await expect
			.element(screen.getByText(jaMessages.errors['registration-disabled']))
			.toBeInTheDocument();
		expect(onSignedUp).not.toHaveBeenCalled();
	});
});

describe('SignUpScreen の処理中と導線 — 要件 4.7', () => {
	it('処理中は同じ操作の重複した実行を受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockImplementation(() => new Promise(() => {}) as Promise<never>);
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(store.signUp).toHaveBeenCalledOnce());
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signUpSubmit }))
			.toBeDisabled();
	});

	it('サインインへ戻る導線を置く', async () => {
		const { screen, onRequestSignIn } = await setup();
		await screen.getByRole('button', { name: jaMessages.signUpToSignIn }).click();
		expect(onRequestSignIn).toHaveBeenCalledOnce();
	});
});
