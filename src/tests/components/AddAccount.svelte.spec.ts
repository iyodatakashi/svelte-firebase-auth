import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { goto } from '$app/navigation';
import AddAccount from '$lib/components/AddAccount.svelte';
import { jaMessages } from '$lib/messages/ja';
import type { Component } from 'svelte';
import type { AccountResult, AccountSummary, AddAccountProps } from '$lib/models/auth/auth.types';
import AddAccountInDialog from './fixtures/AddAccountInDialog.svelte';
import AddAccountWithFooter from './fixtures/AddAccountWithFooter.svelte';
import {
	authFailureOf,
	failureOf,
	fakeAccount,
	fakeStore,
	operationFailureOf,
	type FakeStoreOptions
} from '../support/fakeStore.svelte';

const added = fakeAccount({ id: 'account-2', uid: 'uid-2', email: 'added@example.com' });

const setup = async (
	options: FakeStoreOptions = {},
	placement: Component<AddAccountProps> = AddAccount
) => {
	const { store } = fakeStore(options);
	vi.mocked(store.signIn).mockResolvedValue({ ok: true, value: added });
	vi.mocked(store.signUp).mockResolvedValue({ ok: true, value: added });
	const onCompleted = vi.fn();
	const onCancel = vi.fn();
	const screen = await render(placement, { props: { store, onCompleted, onCancel } });
	return { screen, store, onCompleted, onCancel };
};

type Screen = Awaited<ReturnType<typeof setup>>['screen'];

const fillAndSubmit = async (screen: Screen, submitLabel = jaMessages.signInSubmit) => {
	await screen.getByLabelText(jaMessages.email).fill('added@example.com');
	await screen.getByLabelText(jaMessages.password).fill('secret');
	await screen.getByRole('button', { name: submitLabel }).click();
};

/** Tab で、指定した名前のボタンまでフォーカスを進める */
const tabTo = async (name: string) => {
	for (let step = 0; step < 10; step++) {
		if (document.activeElement?.textContent?.trim() === name) {
			return;
		}
		await userEvent.tab();
	}
	throw new Error(`${name} へ Tab で移れない`);
};

describe('AddAccount のサインイン — 要件 2.1, 2.4, 7.15, 7.17（multi-account-auth）', () => {
	it('入力した資格情報でサインインし、対象のアカウントを含む完了通知を返す', async () => {
		const { screen, store, onCompleted } = await setup();
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(added));
		expect(store.signIn).toHaveBeenCalledWith('added@example.com', 'secret');
		// ページの遷移は行わない。閉じるかどうかは組み込み側が決める
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('失敗したら、既存の語彙の案内を示して入力を保ち、再試行できる', async () => {
		const { screen, store, onCompleted } = await setup();
		vi.mocked(store.signIn).mockResolvedValueOnce(authFailureOf('invalid-credential'));
		await fillAndSubmit(screen);

		await expect
			.element(screen.getByText(jaMessages.errors['invalid-credential']))
			.toBeInTheDocument();
		await expect.element(screen.getByLabelText(jaMessages.email)).toHaveValue('added@example.com');
		expect(onCompleted).not.toHaveBeenCalled();

		await screen.getByRole('button', { name: jaMessages.signInSubmit }).click();
		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(added));
	});

	it('送信中は処理中であることを示し、重複した送信を受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.signIn).mockImplementationOnce(() => new Promise(() => {}));
		await fillAndSubmit(screen);

		await expect
			.element(screen.getByRole('button', { name: jaMessages.signInSubmit }))
			.toBeDisabled();
	});

	it('キーボードだけで入力して送信できる — 要件 7.3', async () => {
		const { screen, store } = await setup();
		await screen.getByLabelText(jaMessages.email).click();
		await userEvent.keyboard('added@example.com');
		await userEvent.tab();
		await userEvent.keyboard('secret');
		await tabTo(jaMessages.signInSubmit);
		await userEvent.keyboard('{Enter}');

		await vi.waitFor(() =>
			expect(store.signIn).toHaveBeenCalledWith('added@example.com', 'secret')
		);
	});
});

describe('AddAccount の取消 — 要件 2.5（multi-account-auth）', () => {
	it('送信中に取りやめたら進行中の試行を無効にし、取消を通知する', async () => {
		const { screen, store, onCompleted, onCancel } = await setup();
		let complete: (result: AccountResult<AccountSummary>) => void = () => {};
		vi.mocked(store.signIn).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await fillAndSubmit(screen);
		await screen.getByRole('button', { name: jaMessages.cancel }).click();

		expect(store.cancelPendingSignIn).toHaveBeenCalledOnce();
		expect(onCancel).toHaveBeenCalledOnce();

		complete({ ok: true, value: added });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onCompleted).not.toHaveBeenCalled();
	});

	it('取りやめは左、実行は右に並ぶ', async () => {
		const { screen } = await setup();
		const buttons = [...screen.container.querySelectorAll('.add-account__actions button')].map(
			(button) => button.textContent?.trim()
		);
		expect(buttons).toEqual([jaMessages.cancel, jaMessages.signInSubmit]);
	});
});

describe('AddAccount の登録 — 要件 2.6, 2.7（multi-account-auth）', () => {
	it('自由登録が許可されていれば、同じ領域で登録の入力へ切り替えて登録できる', async () => {
		const { screen, store, onCompleted } = await setup({ canSelfRegister: true });
		await screen.getByRole('button', { name: jaMessages.goToSignUp }).click();
		await fillAndSubmit(screen, jaMessages.signUpSubmit);

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(added));
		expect(store.signUp).toHaveBeenCalledWith('added@example.com', 'secret');
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('登録から追加のサインインへ戻れる', async () => {
		const { screen } = await setup({ canSelfRegister: true });
		await screen.getByRole('button', { name: jaMessages.goToSignUp }).click();
		await screen.getByRole('button', { name: jaMessages.backToSignIn }).click();

		await expect
			.element(screen.getByRole('button', { name: jaMessages.signInSubmit }))
			.toBeInTheDocument();
	});

	it('自由登録が許可されていなければ、登録の導線を出さない', async () => {
		const { screen } = await setup({ canSelfRegister: false });
		await expect
			.element(screen.getByRole('button', { name: jaMessages.goToSignUp }))
			.not.toBeInTheDocument();
	});
});

describe('AddAccount の再設定 — 要件 2.8（multi-account-auth）', () => {
	it('同じ領域で再設定の入力へ切り替えて送信し、追加のサインインへ戻れる', async () => {
		const { screen, store } = await setup();
		await screen.getByRole('button', { name: jaMessages.goToPasswordReset }).click();
		await screen.getByLabelText(jaMessages.email).fill('added@example.com');
		await screen.getByRole('button', { name: jaMessages.passwordResetSubmit }).click();

		await expect.element(screen.getByText(jaMessages.passwordResetSent)).toBeInTheDocument();
		expect(store.sendPasswordReset).toHaveBeenCalledWith('added@example.com');
		expect(store.signOut).not.toHaveBeenCalled();

		await screen.getByRole('button', { name: jaMessages.backToSignIn }).click();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.signInSubmit }))
			.toBeInTheDocument();
	});

	it('再設定の失敗は、再設定の案内を示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.sendPasswordReset).mockResolvedValueOnce(failureOf('invalid-email'));
		await screen.getByRole('button', { name: jaMessages.goToPasswordReset }).click();
		await screen.getByLabelText(jaMessages.email).fill('broken');
		await screen.getByRole('button', { name: jaMessages.passwordResetSubmit }).click();

		await expect.element(screen.getByText(jaMessages.errors['invalid-email'])).toBeInTheDocument();
	});
});

describe('AddAccount の配置 — 要件 7.15, 7.16（multi-account-auth）', () => {
	it('ダイアログの外枠や見出しを持たない', async () => {
		const { screen } = await setup();
		expect(screen.container.querySelector('h1, h2, h3, h4, h5, h6, dialog')).toBeNull();
		expect(screen.container.querySelector('[role="dialog"]')).toBeNull();
	});

	it('組み込み側のダイアログの内容領域に置いて、サインインできる', async () => {
		const { screen, onCompleted } = await setup({}, AddAccountInDialog);
		await fillAndSubmit(screen);

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(added));
	});
});

describe('導線の出し分け — 要件 2.6, 2.8, 7.15（multi-account-auth）', () => {
	it('登録の導線だけを出さない指定では、再設定の導線を残す', async () => {
		const { store } = fakeStore({ canSelfRegister: true });
		const screen = await render(AddAccount, { props: { store, signUp: false } });

		await expect
			.element(screen.getByRole('button', { name: jaMessages.goToPasswordReset }))
			.toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.goToSignUp }))
			.not.toBeInTheDocument();
	});

	it('再設定の導線だけを出さない指定では、登録の導線を残す', async () => {
		const { store } = fakeStore({ canSelfRegister: true });
		const screen = await render(AddAccount, { props: { store, passwordReset: false } });

		await expect
			.element(screen.getByRole('button', { name: jaMessages.goToPasswordReset }))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.goToSignUp }))
			.toBeInTheDocument();
	});
});

describe('送信と取りやめを組み込み側に置く — 要件 7.15, 7.16（multi-account-auth）', () => {
	const setupFooter = async () => {
		const { store } = fakeStore();
		vi.mocked(store.signIn).mockResolvedValue({ ok: true, value: added });
		const onCompleted = vi.fn();
		const screen = await render(AddAccountWithFooter, { props: { store, onCompleted } });
		await screen.getByLabelText(jaMessages.email).fill('added@example.com');
		await screen.getByLabelText(jaMessages.password).fill('secret');
		return { screen, store, onCompleted };
	};

	it('ボタンを描かない指定では、取りやめと送信のボタンを持たない', async () => {
		const { screen } = await setupFooter();
		for (const name of [jaMessages.cancel, jaMessages.signInSubmit]) {
			await expect
				.element(screen.getByRole('button', { name, exact: true }))
				.not.toBeInTheDocument();
		}
	});

	it('組み込み側の送信ボタンからフォームを送信できる', async () => {
		const { screen, store, onCompleted } = await setupFooter();
		await screen.getByRole('button', { name: '送る' }).click();

		await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(added));
		expect(store.signIn).toHaveBeenCalledWith('added@example.com', 'secret');
	});

	it('送信中を組み込み側へ知らせる', async () => {
		const { screen, store } = await setupFooter();
		vi.mocked(store.signIn).mockImplementationOnce(() => new Promise(() => {}));
		await screen.getByRole('button', { name: '送る' }).click();

		await expect.element(screen.getByRole('button', { name: '送る' })).toBeDisabled();
	});

	it('組み込み側から取りやめると、送信中を解き、後から返った結果を反映しない', async () => {
		const { screen, store, onCompleted } = await setupFooter();
		let complete: (result: AccountResult<AccountSummary>) => void = () => {};
		vi.mocked(store.signIn).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await screen.getByRole('button', { name: '送る' }).click();
		await expect.element(screen.getByRole('button', { name: '送る' })).toBeDisabled();

		await screen.getByRole('button', { name: '閉じる' }).click();

		expect(store.cancelPendingSignIn).toHaveBeenCalledOnce();
		await expect.element(screen.getByRole('button', { name: '送る' })).toBeEnabled();
		complete({ ok: true, value: added });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onCompleted).not.toHaveBeenCalled();
	});

	it('ストアの取りやめで返った結果は、失敗として示さない', async () => {
		const { screen, store } = await setupFooter();
		vi.mocked(store.signIn).mockResolvedValueOnce(operationFailureOf({ kind: 'cancelled' }));
		await screen.getByRole('button', { name: '送る' }).click();

		await expect.element(screen.getByRole('button', { name: '送る' })).toBeEnabled();
		await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
	});
});

describe('表示の切り替えを組み込み側から扱う — 要件 2.8（multi-account-auth）', () => {
	it('いまの表示を組み込み側へ知らせ、組み込み側からサインインへ戻せる', async () => {
		const { store } = fakeStore();
		const screen = await render(AddAccountWithFooter, { props: { store } });
		await expect.element(screen.getByTestId('mode')).toHaveTextContent('sign-in');

		await screen.getByRole('button', { name: jaMessages.goToPasswordReset }).click();
		await expect.element(screen.getByTestId('mode')).toHaveTextContent('password-reset');
		await screen.getByLabelText(jaMessages.email).fill('added@example.com');
		await screen.getByRole('button', { name: '送る' }).click();
		await expect.element(screen.getByText(jaMessages.passwordResetSent)).toBeInTheDocument();

		await screen.getByRole('button', { name: '戻す' }).click();

		await expect.element(screen.getByTestId('mode')).toHaveTextContent('sign-in');
		await expect.element(screen.getByLabelText(jaMessages.password)).toBeInTheDocument();
		await expect.element(screen.getByText(jaMessages.passwordResetSent)).not.toBeInTheDocument();
	});
});
