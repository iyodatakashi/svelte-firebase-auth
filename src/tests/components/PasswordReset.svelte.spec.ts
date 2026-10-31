import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import PasswordReset from '$lib/components/PasswordReset.svelte';
import { jaMessages } from '$lib/messages/ja';
import { failureOf, fakeRoutes, fakeStore } from '../support/fakeStore.svelte';
import PasswordResetWithFooter from './fixtures/PasswordResetWithFooter.svelte';

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
	await screen.getByLabelText(jaMessages.email).fill(email);
	await screen.getByRole('button', { name: jaMessages.passwordResetSubmit }).click();
};

describe('PasswordReset — 要件 7.2, 7.3, 7.4（auth-store-and-screens）', () => {
	it('メールを送ったことと、迷惑メールフォルダの確認を示す', async () => {
		const { screen } = await setup();
		await request(screen);

		await expect.element(screen.getByText(jaMessages.passwordResetSent)).toBeInTheDocument();
		await expect.element(screen.getByText(jaMessages.checkSpam)).toBeInTheDocument();
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
		await screen.getByRole('button', { name: jaMessages.backToSignIn }).click();

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
		await expect.element(screen.getByLabelText(jaMessages.email)).toHaveValue('not-an-email');
		await expect.element(screen.getByText(jaMessages.passwordResetSent)).not.toBeInTheDocument();
		expect(onCompleted).not.toHaveBeenCalled();
	});
});

describe('送信を組み込み側に置く（multi-account-auth の組み込み）', () => {
	const setupFooter = async () => {
		const { store } = fakeStore();
		const onCompleted = vi.fn();
		const screen = await render(PasswordResetWithFooter, { props: { store, onCompleted } });
		await screen.getByLabelText(jaMessages.email).fill('user@example.com');
		return { screen, store, onCompleted };
	};

	it('ボタンを描かない指定では、送信とサインインへ戻る導線を描かず、説明と入力は残す', async () => {
		const { screen } = await setupFooter();

		for (const name of [jaMessages.passwordResetSubmit, jaMessages.backToSignIn]) {
			await expect.element(screen.getByRole('button', { name })).not.toBeInTheDocument();
		}
		await expect.element(screen.getByText(jaMessages.passwordResetDescription)).toBeInTheDocument();
	});

	it('組み込み側の送信ボタンから送信でき、送信済みの表示はそのまま出す', async () => {
		const { screen, store, onCompleted } = await setupFooter();
		await screen.getByRole('button', { name: '送る' }).click();

		await expect.element(screen.getByText(jaMessages.passwordResetSent)).toBeInTheDocument();
		expect(store.sendPasswordReset).toHaveBeenCalledWith('user@example.com');
		expect(onCompleted).toHaveBeenCalledOnce();
	});

	it('送信中を組み込み側へ知らせる', async () => {
		const { screen, store } = await setupFooter();
		vi.mocked(store.sendPasswordReset).mockImplementationOnce(() => new Promise(() => {}));
		await screen.getByRole('button', { name: '送る' }).click();

		await expect.element(screen.getByTestId('state')).toHaveTextContent('submitting/open');
	});

	it('受け付けられなくなったことを組み込み側へ知らせる', async () => {
		const { screen, store } = await setupFooter();
		vi.mocked(store.sendPasswordReset).mockResolvedValueOnce(failureOf('too-many-requests'));
		await screen.getByRole('button', { name: '送る' }).click();

		await expect
			.element(screen.getByText(jaMessages.errors['too-many-requests']))
			.toBeInTheDocument();
		await expect.element(screen.getByTestId('state')).toHaveTextContent('idle/blocked');
		await expect.element(screen.getByRole('button', { name: '送る' })).toBeDisabled();
	});
});

describe('PasswordReset の導線を組み込み側が差し替える（multi-account-auth の組み込み）', () => {
	it('サインインへ戻る動きを渡されたら、ページを移らずにそれを呼ぶ', async () => {
		const { store } = fakeStore();
		const onGoToSignIn = vi.fn();
		const screen = await render(PasswordReset, { props: { store, onGoToSignIn } });
		await screen.getByRole('button', { name: jaMessages.backToSignIn }).click();

		expect(onGoToSignIn).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});
});
