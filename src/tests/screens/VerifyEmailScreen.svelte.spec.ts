import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import VerifyEmailScreen from '$lib/screens/VerifyEmailScreen.svelte';
import { jaMessages } from '$lib/messages/ja';
import { VERIFICATION_POLL_INTERVAL_MS } from '$lib/models/auth/auth.constants';
import { failureOf, fakeStore } from '../support/fakeStore.svelte';

const setup = async (email: string | null = 'user@example.com') => {
	const { store, markVerified } = fakeStore({ email });
	const onVerified = vi.fn();
	const onSignOut = vi.fn();
	const onRequestSignUpWithAnotherEmail = vi.fn();
	const screen = await render(VerifyEmailScreen, {
		props: { store, onVerified, onSignOut, onRequestSignUpWithAnotherEmail }
	});
	return { screen, store, markVerified, onVerified, onSignOut, onRequestSignUpWithAnotherEmail };
};

afterEach(() => {
	vi.useRealTimers();
});

describe('VerifyEmailScreen の提示 — 要件 5.2, 5.3', () => {
	it('確認メールの送信先のメールアドレスを示す', async () => {
		const { screen } = await setup();
		await expect
			.element(screen.getByText(jaMessages.verifyEmailSentTo('user@example.com')))
			.toBeInTheDocument();
	});

	it('迷惑メールフォルダを確認するよう示す', async () => {
		const { screen } = await setup();
		await expect.element(screen.getByText(jaMessages.verifyEmailCheckSpam)).toBeInTheDocument();
	});
});

describe('VerifyEmailScreen の取り直し — 要件 5.5, 5.6, 5.7', () => {
	it('利用者の操作を求めずに、取り直しを繰り返す', async () => {
		vi.useFakeTimers();
		const { store } = await setup();
		expect(store.refreshVerification).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);
		expect(store.refreshVerification).toHaveBeenCalledTimes(2);
	});

	it('画面が表示されなくなったら、取り直しを停止する', async () => {
		vi.useFakeTimers();
		const { screen, store } = await setup();

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);

		await screen.unmount();
		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS * 5);
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);
	});

	it('前面へ復帰したときにも取り直す', async () => {
		vi.useFakeTimers();
		const { store } = await setup();

		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(0);
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);
	});

	it('確認済みになったら、組み込み側へ通知する', async () => {
		vi.useFakeTimers();
		const { store, markVerified, onVerified } = await setup();
		markVerified();

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);
		expect(onVerified).toHaveBeenCalledOnce();
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);
	});

	it('確認済みになった後は、取り直しを続けない', async () => {
		vi.useFakeTimers();
		const { store, markVerified, onVerified } = await setup();
		markVerified();

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS * 4);
		expect(onVerified).toHaveBeenCalledOnce();
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);
	});
});

describe('VerifyEmailScreen の再送 — 要件 5.4, 5.8', () => {
	it('確認メールを再送する手段を提供する', async () => {
		const { screen, store } = await setup();
		await screen.getByRole('button', { name: jaMessages.verifyEmailResend }).click();

		await expect.element(screen.getByText(jaMessages.verifyEmailResent)).toBeInTheDocument();
		expect(store.sendEmailVerification).toHaveBeenCalledOnce();
	});

	it('再送が受け付けられなくなったら、間隔を空けるよう示す', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.sendEmailVerification).mockResolvedValueOnce(failureOf('too-many-requests'));
		await screen.getByRole('button', { name: jaMessages.verifyEmailResend }).click();

		await expect
			.element(screen.getByText(jaMessages.errors['too-many-requests']))
			.toBeInTheDocument();
	});

	it('再送が受け付けられなくなったら、再送の操作を一時的に受け付けない', async () => {
		const { screen, store } = await setup();
		vi.mocked(store.sendEmailVerification).mockResolvedValueOnce(failureOf('too-many-requests'));

		const resend = screen.getByRole('button', { name: jaMessages.verifyEmailResend });
		await resend.click();

		await expect.element(resend).toBeDisabled();
	});
});

describe('VerifyEmailScreen の導線 — 要件 5.9, 5.10', () => {
	it('サインアウトする手段を提供し、その要求を通知する', async () => {
		const { screen, store, onSignOut } = await setup();
		await screen.getByRole('button', { name: jaMessages.verifyEmailSignOut }).click();

		await vi.waitFor(() => expect(onSignOut).toHaveBeenCalledOnce());
		expect(store.signOut).toHaveBeenCalledOnce();
	});

	it('別のメールアドレスでの登録し直しは、サインアウトを終えてから通知する', async () => {
		const { screen, store, onRequestSignUpWithAnotherEmail } = await setup();
		const order: string[] = [];
		vi.mocked(store.signOut).mockImplementation(async () => {
			order.push('signOut');
		});
		onRequestSignUpWithAnotherEmail.mockImplementation(() => order.push('notify'));

		await screen.getByRole('button', { name: jaMessages.verifyEmailUseAnotherAddress }).click();

		await vi.waitFor(() => expect(onRequestSignUpWithAnotherEmail).toHaveBeenCalledOnce());
		expect(order).toEqual(['signOut', 'notify']);
	});
});
