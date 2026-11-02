import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import SignUp from '$lib/components/SignUp.svelte';
import { jaMessages } from '$lib/messages/ja';
import type { AccountResult, AccountSummary } from '$lib/models/auth/auth.types';
import {
	authFailureOf,
	fakeAccount,
	fakeRoutes,
	fakeStore,
	operationFailureOf
} from '../support/fakeStore.svelte';
import SignUpWithFooter from './fixtures/SignUpWithFooter.svelte';

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

describe('送信と取りやめを組み込み側に置く — 要件 2.6（multi-account-auth）', () => {
	const setupFooter = async () => {
		const { store } = fakeStore();
		const onCompleted = vi.fn();
		const screen = await render(SignUpWithFooter, { props: { store, onCompleted } });
		await screen.getByLabelText(jaMessages.email).fill('new@example.com');
		await screen.getByLabelText(jaMessages.password).fill('secret');
		return { screen, store, onCompleted };
	};

	it('ボタンを描かない指定では、送信とページを移る導線を描かず、入力は残す', async () => {
		const { screen, store } = await setupFooter();
		vi.mocked(store.signUp).mockResolvedValueOnce(authFailureOf('email-already-in-use'));
		await screen.getByRole('button', { name: '送る' }).click();
		await expect
			.element(screen.getByText(jaMessages.errors['email-already-in-use']))
			.toBeInTheDocument();

		for (const name of [
			jaMessages.signUpSubmit,
			jaMessages.backToSignIn,
			jaMessages.goToPasswordReset
		]) {
			await expect.element(screen.getByRole('button', { name })).not.toBeInTheDocument();
		}
	});

	it('組み込み側の送信ボタンから登録できる', async () => {
		const { screen, store, onCompleted } = await setupFooter();
		await screen.getByRole('button', { name: '送る' }).click();

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
		expect(store.signUp).toHaveBeenCalledWith('new@example.com', 'secret');
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('送信中を組み込み側へ知らせる', async () => {
		const { screen, store } = await setupFooter();
		vi.mocked(store.signUp).mockImplementationOnce(() => new Promise(() => {}));
		await screen.getByRole('button', { name: '送る' }).click();

		await expect.element(screen.getByRole('button', { name: '送る' })).toBeDisabled();
	});

	it('組み込み側から取りやめると、送信中を解き、後から返った結果を反映しない', async () => {
		const { screen, store, onCompleted } = await setupFooter();
		let complete: (result: AccountResult<AccountSummary>) => void = () => {};
		vi.mocked(store.signUp).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await screen.getByRole('button', { name: '送る' }).click();
		await expect.element(screen.getByRole('button', { name: '送る' })).toBeDisabled();

		await screen.getByRole('button', { name: '閉じる' }).click();

		expect(store.cancelPendingSignIn).toHaveBeenCalledOnce();
		await expect.element(screen.getByRole('button', { name: '送る' })).toBeEnabled();
		complete({ ok: true, value: fakeAccount() });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onCompleted).not.toHaveBeenCalled();
	});

	it('ストアで取りやめられた結果は、失敗として示さない', async () => {
		const { screen, store } = await setupFooter();
		vi.mocked(store.signUp).mockResolvedValueOnce(operationFailureOf({ kind: 'cancelled' }));
		await screen.getByRole('button', { name: '送る' }).click();

		await expect.element(screen.getByRole('button', { name: '送る' })).toBeEnabled();
		await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
	});
});

describe('SignUp の導線を組み込み側が差し替える（multi-account-auth の組み込み）', () => {
	it('サインインへ戻る動きを渡されたら、ページを移らずにそれを呼ぶ', async () => {
		const { store } = fakeStore();
		const onGoToSignIn = vi.fn();
		const screen = await render(SignUp, { props: { store, onGoToSignIn } });
		await screen.getByRole('button', { name: jaMessages.backToSignIn }).click();

		expect(onGoToSignIn).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('既に使われているメールアドレスのときの再設定の案内も、渡された動きを呼ぶ', async () => {
		const { store } = fakeStore();
		const onGoToPasswordReset = vi.fn();
		vi.mocked(store.signUp).mockResolvedValueOnce(authFailureOf('email-already-in-use'));
		const screen = await render(SignUp, { props: { store, onGoToPasswordReset } });
		await fillAndSubmit(screen);
		await screen.getByRole('button', { name: jaMessages.goToPasswordReset }).click();

		expect(onGoToPasswordReset).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});
});

describe('自動入力の印（Apple の Password AutoFill の推奨）', () => {
	it('メールアドレス欄をログイン ID として、パスワード欄を新しいパスワードとして示す', async () => {
		const { screen } = await setup();

		await expect
			.element(screen.getByLabelText(jaMessages.email))
			.toHaveAttribute('autocomplete', 'username');
		await expect
			.element(screen.getByLabelText(jaMessages.password))
			.toHaveAttribute('autocomplete', 'new-password');
	});
});
