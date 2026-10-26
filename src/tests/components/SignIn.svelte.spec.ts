import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import SignIn from '$lib/components/SignIn.svelte';
import { jaMessages } from '$lib/messages/ja';
import {
	authFailureOf,
	fakeRoutes,
	fakeStore,
	operationFailureOf
} from '../support/fakeStore.svelte';

const setup = async (options: Parameters<typeof fakeStore>[0] = {}) => {
	const { store } = fakeStore(options);
	const onCompleted = vi.fn();
	const screen = await render(SignIn, { props: { store, onCompleted } });
	return { screen, store, onCompleted };
};

const signIn = async (
	screen: Awaited<ReturnType<typeof setup>>['screen'],
	email = 'user@example.com',
	password = 'secret'
) => {
	await screen.getByLabelText(jaMessages.email).fill(email);
	await screen.getByLabelText(jaMessages.password).fill(password);
	await screen.getByRole('button', { name: jaMessages.signInSubmit }).click();
};

describe('SignIn — 要件 3 の注', () => {
	it('入力した資格情報でサインインする', async () => {
		const { screen, store } = await setup();
		await signIn(screen);

		await vi.waitFor(() => expect(store.signIn).toHaveBeenCalledWith('user@example.com', 'secret'));
	});

	it('完了しても自ら遷移しない。段階の変化は到達の制御に任せる', async () => {
		const { screen, store } = await setup();
		await signIn(screen);

		await vi.waitFor(() => expect(store.signIn).toHaveBeenCalledOnce());
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('完了を組み込み側へ返す', async () => {
		const { screen, onCompleted } = await setup();
		await signIn(screen);

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
	});

	it('失敗したときは完了を返さない', async () => {
		const { screen, store, onCompleted } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(authFailureOf('invalid-credential'));
		await signIn(screen, 'user@example.com', 'wrong');

		await expect
			.element(screen.getByText(jaMessages.errors['invalid-credential']))
			.toBeInTheDocument();
		expect(onCompleted).not.toHaveBeenCalled();
	});
});

describe('SignIn の導線 — 要件 2.3, 3.1, 3.2', () => {
	it('パスワードの再設定を要求する導線が、設定された経路へ遷移する', async () => {
		const { screen } = await setup({ canSelfRegister: false });
		await screen.getByRole('button', { name: jaMessages.goToPasswordReset }).click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(fakeRoutes.passwordReset);
	});

	it('自由登録が許可されているときは、登録の経路へ遷移する導線を出す', async () => {
		const { screen } = await setup({ canSelfRegister: true });
		await screen.getByRole('button', { name: jaMessages.goToSignUp }).click();

		expect(vi.mocked(goto)).toHaveBeenCalledWith(fakeRoutes.signUp);
	});

	it('自由登録が許可されていないときは、登録の導線を出さない', async () => {
		const { screen } = await setup({ canSelfRegister: false });
		await expect
			.element(screen.getByRole('button', { name: jaMessages.goToSignUp }))
			.not.toBeInTheDocument();
	});
});

describe('SignIn の失敗 — 要件 3.2, 3.3（auth-store-and-screens）', () => {
	it('資格情報の誤りは、どちらが誤っているかを示さない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(authFailureOf('invalid-credential'));
		await signIn(screen, 'user@example.com', 'wrong');

		await expect
			.element(screen.getByText(jaMessages.errors['invalid-credential']))
			.toBeInTheDocument();
	});

	it('失敗しても入力した内容を失わせない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(authFailureOf('invalid-credential'));
		await signIn(screen, 'user@example.com', 'wrong');

		await expect.element(screen.getByLabelText(jaMessages.email)).toHaveValue('user@example.com');
		await expect.element(screen.getByLabelText(jaMessages.password)).toHaveValue('wrong');
	});
});

describe('SignIn の処理中 — 要件 3.4（auth-store-and-screens）', () => {
	it('処理中は同じ操作の重複した実行を受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signIn).mockImplementation(() => new Promise(() => {}) as Promise<never>);
		await signIn(screen);

		await vi.waitFor(() => expect(store.signIn).toHaveBeenCalledOnce());
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signInSubmit }))
			.toBeDisabled();
	});
});

describe('SignIn の外形 — 要件 9.8, 9.9（auth-store-and-screens）', () => {
	it('画面全体を占める前提の外形を持たない', async () => {
		const { screen } = await setup();
		const root = screen.container.querySelector('.sign-in');
		expect(root).not.toBeNull();
		expect(getComputedStyle(root as Element).position).not.toBe('fixed');
	});
});

describe('SignIn の結果の型 — 要件 2.6, 7.5（multi-account-auth）', () => {
	it('認証以外の失敗は、その理由の案内を示す', async () => {
		const { screen, store, onCompleted } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(operationFailureOf({ kind: 'busy' }));
		await signIn(screen);

		await expect.element(screen.getByText(jaMessages.operationBusy)).toBeInTheDocument();
		expect(onCompleted).not.toHaveBeenCalled();
	});
});
