import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import VerifyEmail from '$lib/components/VerifyEmail.svelte';
import { jaMessages } from '$lib/messages/ja';
import { VERIFICATION_POLL_INTERVAL_MS } from '$lib/models/auth/auth.constants';
import type { AuthResult } from '$lib/models/auth/auth.types';
import { failureOf, fakeAccount, fakeStore } from '../support/fakeStore.svelte';

const setup = async (email: string | null = 'user@example.com') => {
	const { store, markVerified, switchTo } = fakeStore({ email });
	const onCompleted = vi.fn();
	const screen = await render(VerifyEmail, { props: { store, onCompleted } });
	return { screen, store, markVerified, switchTo, onCompleted };
};

afterEach(() => {
	vi.useRealTimers();
});

describe('VerifyEmail の提示 — 要件 5.2, 5.3（auth-store-and-screens）', () => {
	it('確認メールの送信先のメールアドレスを示す', async () => {
		const { screen } = await setup();
		await expect
			.element(screen.getByText(jaMessages.verifyEmailSentTo('user@example.com')))
			.toBeInTheDocument();
	});

	it('迷惑メールフォルダを確認するよう示す', async () => {
		const { screen } = await setup();
		await expect.element(screen.getByText(jaMessages.checkSpam)).toBeInTheDocument();
	});
});

describe('VerifyEmail の取り直し — 要件 5.5, 5.6, 5.7（auth-store-and-screens）', () => {
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

	it('確認済みになった後は、取り直しを続けない', async () => {
		vi.useFakeTimers();
		const { store, markVerified } = await setup();

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);

		markVerified();
		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS * 4);
		expect(store.refreshVerification).toHaveBeenCalledTimes(1);
	});

	it('確認済みになっても自ら遷移しない。段階の変化は到達の制御に任せる', async () => {
		vi.useFakeTimers();
		const { markVerified } = await setup();
		markVerified();

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS * 4);
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	it('確認が済んだら、完了を1度だけ組み込み側へ返す', async () => {
		vi.useFakeTimers();
		const { store, markVerified, onCompleted } = await setup();

		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);
		expect(onCompleted).not.toHaveBeenCalled();

		vi.mocked(store.refreshVerification).mockImplementationOnce(async () => {
			markVerified();
			return true;
		});
		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS * 4);

		expect(onCompleted).toHaveBeenCalledOnce();
	});
});

describe('VerifyEmail の再送 — 要件 5.4, 5.8（auth-store-and-screens）', () => {
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

describe('VerifyEmail の導線 — 要件 3.4', () => {
	it('サインアウトは選択中のアカウントのログアウトになる — 要件 5.9（multi-account-auth）', async () => {
		const { screen, store } = await setup();
		await screen.getByRole('button', { name: jaMessages.signOut }).click();

		await vi.waitFor(() => expect(store.signOut).toHaveBeenCalledOnce());
		expect(store.signOutAll).not.toHaveBeenCalled();
	});

	it('サインアウトの導線は遷移せず、段階の変化に任せる', async () => {
		const { screen, store } = await setup();
		await screen.getByRole('button', { name: jaMessages.signOut }).click();

		await vi.waitFor(() => expect(store.signOut).toHaveBeenCalledOnce());
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});
});

describe('VerifyEmail の表示中の切り替え — 要件 3.6, 7.18（multi-account-auth）', () => {
	const other = fakeAccount({ id: 'account-2', uid: 'uid-2', email: 'other@example.com' });

	it('選択中のアカウントが変わったら、送信結果を破棄して切り替え先の状態で表示し直す', async () => {
		const { screen, switchTo } = await setup();
		await screen.getByRole('button', { name: jaMessages.verifyEmailResend }).click();
		await expect.element(screen.getByText(jaMessages.verifyEmailResent)).toBeInTheDocument();

		switchTo(other);

		await expect.element(screen.getByText(jaMessages.verifyEmailResent)).not.toBeInTheDocument();
		await expect
			.element(screen.getByText(jaMessages.verifyEmailSentTo('other@example.com')))
			.toBeInTheDocument();
	});

	it('切り替え前に始めた再送が後から完了しても、表示を更新しない', async () => {
		const { screen, store, switchTo } = await setup();
		let complete: (result: AuthResult) => void = () => {};
		vi.mocked(store.sendEmailVerification).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await screen.getByRole('button', { name: jaMessages.verifyEmailResend }).click();

		switchTo(other);
		complete({ ok: true });
		await new Promise((resolve) => setTimeout(resolve, 0));

		await expect.element(screen.getByText(jaMessages.verifyEmailResent)).not.toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: jaMessages.verifyEmailResend }))
			.toBeEnabled();
	});

	it('切り替え前に始めた取り直しが後から確認済みを返しても、完了を返さない', async () => {
		vi.useFakeTimers();
		const { store, switchTo, onCompleted } = await setup();
		let complete: (verified: boolean) => void = () => {};
		vi.mocked(store.refreshVerification).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);
		expect(store.refreshVerification).toHaveBeenCalledOnce();

		switchTo(other);
		complete(true);
		await vi.advanceTimersByTimeAsync(0);

		expect(onCompleted).not.toHaveBeenCalled();
	});

	it('画面が破棄された後に取り直しが確認済みを返しても、完了を返さない', async () => {
		vi.useFakeTimers();
		const { screen, store, onCompleted } = await setup();
		let complete: (verified: boolean) => void = () => {};
		vi.mocked(store.refreshVerification).mockImplementationOnce(
			() => new Promise((resolve) => (complete = resolve))
		);
		await vi.advanceTimersByTimeAsync(VERIFICATION_POLL_INTERVAL_MS);

		await screen.unmount();
		complete(true);
		await vi.advanceTimersByTimeAsync(0);

		expect(onCompleted).not.toHaveBeenCalled();
	});
});
