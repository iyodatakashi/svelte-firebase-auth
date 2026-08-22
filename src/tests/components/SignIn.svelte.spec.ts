import { describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import SignIn from '$lib/components/SignIn.svelte';
import { jaMessages } from '$lib/messages/ja';
import { failureOf, fakeStore } from '../support/fakeStore.svelte';

const setup = async (options: Parameters<typeof fakeStore>[0] = {}) => {
	const { store } = fakeStore(options);
	const onSignedIn = vi.fn();
	const onRequestPasswordReset = vi.fn();
	const onRequestSignUp = vi.fn();
	const screen = await render(SignIn, {
		props: { store, onSignedIn, onRequestPasswordReset, onRequestSignUp }
	});
	return { screen, store, onSignedIn, onRequestPasswordReset, onRequestSignUp };
};

describe('SignIn — 要件 3.5, 9.2', () => {
	it('入力した資格情報でサインインし、完了を組み込み側へ通知する', async () => {
		const { screen, store, onSignedIn } = await setup();

		await screen.getByLabelText(jaMessages.emailLabel).fill('user@example.com');
		await screen.getByLabelText(jaMessages.passwordLabel).fill('secret');
		await screen.getByRole('button', { name: jaMessages.signInSubmit }).click();

		await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
		expect(store.signIn).toHaveBeenCalledWith('user@example.com', 'secret');
	});
});

describe('SignIn の失敗 — 要件 3.2, 3.3', () => {
	it('資格情報の誤りは、どちらが誤っているかを示さない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(failureOf('invalid-credential'));

		await screen.getByLabelText(jaMessages.emailLabel).fill('user@example.com');
		await screen.getByLabelText(jaMessages.passwordLabel).fill('wrong');
		await screen.getByRole('button', { name: jaMessages.signInSubmit }).click();

		await expect
			.element(screen.getByText(jaMessages.errors['invalid-credential']))
			.toBeInTheDocument();
	});

	it('失敗しても入力した内容を失わせない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(failureOf('invalid-credential'));

		await screen.getByLabelText(jaMessages.emailLabel).fill('user@example.com');
		await screen.getByLabelText(jaMessages.passwordLabel).fill('wrong');
		await screen.getByRole('button', { name: jaMessages.signInSubmit }).click();

		await expect
			.element(screen.getByLabelText(jaMessages.emailLabel))
			.toHaveValue('user@example.com');
		await expect.element(screen.getByLabelText(jaMessages.passwordLabel)).toHaveValue('wrong');
	});

	it('失敗しても完了を通知しない', async () => {
		const { screen, store, onSignedIn } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(failureOf('invalid-credential'));

		await screen.getByLabelText(jaMessages.emailLabel).fill('user@example.com');
		await screen.getByLabelText(jaMessages.passwordLabel).fill('wrong');
		await screen.getByRole('button', { name: jaMessages.signInSubmit }).click();

		await expect
			.element(screen.getByText(jaMessages.errors['invalid-credential']))
			.toBeInTheDocument();
		expect(onSignedIn).not.toHaveBeenCalled();
	});
});

describe('SignIn の処理中 — 要件 3.4', () => {
	it('処理中は同じ操作の重複した実行を受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signIn).mockImplementation(() => new Promise(() => {}) as Promise<never>);

		await screen.getByLabelText(jaMessages.emailLabel).fill('user@example.com');
		await screen.getByLabelText(jaMessages.passwordLabel).fill('secret');
		const submit = screen.getByRole('button', { name: jaMessages.signInSubmit });
		await submit.click();

		await vi.waitFor(() => expect(store.signIn).toHaveBeenCalledOnce());
		await expect.element(submit).toBeDisabled();
	});
});

describe('SignIn の導線 — 要件 3.7, 3.8, 3.9', () => {
	it('パスワードの再設定を要求する導線を常に置く', async () => {
		const { screen, onRequestPasswordReset } = await setup({ canSelfRegister: false });
		await screen.getByRole('button', { name: jaMessages.signInToPasswordReset }).click();
		expect(onRequestPasswordReset).toHaveBeenCalledOnce();
	});

	it('自由登録が許可されているときは、登録の導線を出す', async () => {
		const { screen, onRequestSignUp } = await setup({ canSelfRegister: true });
		await screen.getByRole('button', { name: jaMessages.signInToSignUp }).click();
		expect(onRequestSignUp).toHaveBeenCalledOnce();
	});

	it('自由登録が許可されていないときは、登録の導線を出さない', async () => {
		const { screen } = await setup({ canSelfRegister: false });
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signInToSignUp }))
			.not.toBeInTheDocument();
	});
});

describe('SignIn の外形 — 要件 9.6, 9.8, 9.9', () => {
	it('組み込み側の名乗りを画面の上部へ差し込める', async () => {
		const { store } = fakeStore();
		const screen = await render(SignIn, {
			props: {
				store,
				onSignedIn: vi.fn(),
				onRequestPasswordReset: vi.fn(),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				header: createRawSnippet(() => ({ render: () => '<h1>組み込み側の名乗り</h1>' })) as any
			}
		});
		await expect.element(screen.getByText('組み込み側の名乗り')).toBeInTheDocument();
	});

	it('画面全体を占める前提の外形を持たない', async () => {
		const { screen } = await setup();
		const root = screen.container.querySelector('.sign-in');
		expect(root).not.toBeNull();
		expect(getComputedStyle(root as Element).position).not.toBe('fixed');
	});
});
