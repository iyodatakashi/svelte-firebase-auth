import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import SignUp from '$lib/components/SignUp.svelte';
import { jaMessages } from '$lib/messages/ja';
import {
	authFailureOf,
	fakeRoutes,
	fakeStore,
	operationFailureOf
} from '../support/fakeStore.svelte';

const setup = async () => {
	const { store } = fakeStore();
	const onCompleted = vi.fn();
	const screen = await render(SignUp, { props: { store, onCompleted } });
	return { screen, store, onCompleted };
};

const fillAndSubmit = async (
	screen: Awaited<ReturnType<typeof setup>>['screen'],
	email = 'user@example.com',
	password = 'secret'
) => {
	await screen.getByLabelText(jaMessages.email).fill(email);
	await screen.getByLabelText(jaMessages.password).fill(password);
	await screen.getByRole('button', { name: jaMessages.signUpSubmit }).click();
};

describe('SignUp — 要件 3 の注', () => {
	it('入力した内容で登録する', async () => {
		const { screen, store } = await setup();
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(store.signUp).toHaveBeenCalledWith('user@example.com', 'secret'));
	});

	it('完了しても自ら遷移しない。段階の変化は到達の制御に任せる', async () => {
		const { screen, store } = await setup();
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(store.signUp).toHaveBeenCalledOnce());
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('完了を組み込み側へ返す', async () => {
		const { screen, onCompleted } = await setup();
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
	});
});

describe('SignUp の導線 — 要件 3.3', () => {
	it('サインインへ戻る導線が、設定された経路へ遷移する', async () => {
		const { screen } = await setup();
		await screen.getByRole('button', { name: jaMessages.backToSignIn }).click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(fakeRoutes.signIn);
	});

	it('既に使われているメールアドレスのときだけ、再設定の経路へ遷移する導線を出す', async () => {
		const { screen, store } = await setup();

		const resetLink = screen.getByRole('button', { name: jaMessages.goToPasswordReset });
		await expect.element(resetLink).not.toBeInTheDocument();

		vi.mocked(store.signUp).mockResolvedValueOnce(authFailureOf('email-already-in-use'));
		await fillAndSubmit(screen);
		await resetLink.click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(fakeRoutes.passwordReset);
	});
});

describe('SignUp の失敗 — 要件 4.3, 4.4, 4.5（auth-store-and-screens）', () => {
	it('既に使われているメールアドレスは、その旨を示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(authFailureOf('email-already-in-use'));
		await fillAndSubmit(screen);

		await expect
			.element(screen.getByText(jaMessages.errors['email-already-in-use']))
			.toBeInTheDocument();
	});

	it('強度が足りないときは、満たしていない要件を示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(
			authFailureOf('weak-password', ['min-length', 'numeric'])
		);
		await fillAndSubmit(screen, 'user@example.com', 'x');

		await expect
			.element(screen.getByText(jaMessages.weakPasswordReason(['min-length', 'numeric'])))
			.toBeInTheDocument();
	});

	it('失敗しても入力した内容を失わせず、入力し直せる状態を保つ', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(authFailureOf('weak-password', ['min-length']));
		await fillAndSubmit(screen, 'user@example.com', 'x');

		await expect
			.element(screen.getByText(jaMessages.weakPasswordReason(['min-length'])))
			.toBeInTheDocument();
		await expect.element(screen.getByLabelText(jaMessages.email)).toHaveValue('user@example.com');
		await expect.element(screen.getByLabelText(jaMessages.password)).toHaveValue('x');
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signUpSubmit }))
			.not.toBeDisabled();
	});

	it('失敗しても遷移せず、完了も返さない', async () => {
		const { screen, store, onCompleted } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(authFailureOf('registration-disabled'));
		await fillAndSubmit(screen);

		await expect
			.element(screen.getByText(jaMessages.errors['registration-disabled']))
			.toBeInTheDocument();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
		expect(onCompleted).not.toHaveBeenCalled();
	});
});

describe('SignUp の処理中 — 要件 4.7（auth-store-and-screens）', () => {
	it('処理中は同じ操作の重複した実行を受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signUp).mockImplementation(() => new Promise(() => {}) as Promise<never>);
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(store.signUp).toHaveBeenCalledOnce());
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signUpSubmit }))
			.toBeDisabled();
	});
});

describe('SignUp の結果の型 — 要件 2.6, 7.5（multi-account-auth）', () => {
	it('認証以外の失敗は、その理由の案内を示す', async () => {
		const { screen, store, onCompleted } = await setup();
		vi.mocked(store.signUp).mockResolvedValueOnce(operationFailureOf({ kind: 'busy' }));
		await fillAndSubmit(screen);

		await expect.element(screen.getByText(jaMessages.operationBusy)).toBeInTheDocument();
		expect(onCompleted).not.toHaveBeenCalled();
	});
});
