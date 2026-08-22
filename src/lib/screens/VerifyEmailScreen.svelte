<script lang="ts">
	import { Button } from '@14ch/svelte-ui';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/ja';
	import { VERIFICATION_POLL_INTERVAL_MS } from '$lib/models/auth/auth.constants';
	import type { VerifyEmailScreenProps } from '$lib/models/auth/auth.types';

	let {
		store,
		messages: overrides,
		header,
		onVerified,
		onSignOut,
		onRequestSignUpWithAnotherEmail
	}: VerifyEmailScreenProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let errorMessage = $state<string | null>(null);
	let hasResent = $state(false);
	// 受け付けられなくなった再送を、押せる状態のまま失敗させ続けない
	let isResendBlocked = $state(false);
	let isResending = $state(false);
	let isLeaving = $state(false);
	let hasNotifiedVerified = $state(false);

	// 表示されている間だけ取り直す。停止し損ねると、画面を離れた後も通信が続く
	$effect(() => {
		const refresh = async () => {
			if (hasNotifiedVerified) {
				return;
			}
			if (await store.refreshVerification()) {
				hasNotifiedVerified = true;
				onVerified();
			}
		};

		const timer = setInterval(refresh, VERIFICATION_POLL_INTERVAL_MS);
		// 別のタブ・別の端末で確認を済ませて戻った瞬間に反映する
		const refreshOnReturn = () => {
			if (document.visibilityState !== 'hidden') {
				void refresh();
			}
		};
		document.addEventListener('visibilitychange', refreshOnReturn);

		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refreshOnReturn);
		};
	});

	const resend = async () => {
		if (isResending || isResendBlocked) {
			return;
		}
		isResending = true;
		errorMessage = null;
		hasResent = false;

		const result = await store.sendEmailVerification();
		isResending = false;

		if (result.ok) {
			hasResent = true;
			return;
		}
		errorMessage = authErrorMessageOf(result.error, messages, 'verify-email');
		isResendBlocked = result.error.kind === 'too-many-requests';
	};

	const signOut = async () => {
		if (isLeaving) {
			return;
		}
		isLeaving = true;
		await store.signOut();
		onSignOut();
	};

	const signUpWithAnotherEmail = async () => {
		if (isLeaving) {
			return;
		}
		isLeaving = true;
		// サインアウトを終えてから通知する
		await store.signOut();
		onRequestSignUpWithAnotherEmail();
	};
</script>

<section class="verify-email-screen">
	{#if header}
		<div class="verify-email-screen__header">{@render header()}</div>
	{/if}

	<h2 class="verify-email-screen__title">{messages.verifyEmailTitle}</h2>

	{#if store.email}
		<p class="verify-email-screen__sent-to">{messages.verifyEmailSentTo(store.email)}</p>
	{/if}
	<p class="verify-email-screen__spam">{messages.verifyEmailCheckSpam}</p>

	{#if hasResent}
		<p class="verify-email-screen__notice" role="status">{messages.verifyEmailResent}</p>
	{/if}
	{#if errorMessage}
		<p class="verify-email-screen__error" role="alert">{errorMessage}</p>
	{/if}

	<div class="verify-email-screen__actions">
		<Button
			variant="filled"
			onclick={resend}
			loading={isResending}
			disabled={isResending || isResendBlocked}
		>
			{messages.verifyEmailResend}
		</Button>
		<Button onclick={signUpWithAnotherEmail} disabled={isLeaving}>
			{messages.verifyEmailUseAnotherAddress}
		</Button>
		<Button onclick={signOut} disabled={isLeaving}>
			{messages.verifyEmailSignOut}
		</Button>
	</div>
</section>

<style>
	.verify-email-screen {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		color: var(--svelte-ui-text-color);
	}

	.verify-email-screen__title {
		margin: 0;
		font-size: var(--svelte-ui-font-size-xl);
	}

	.verify-email-screen__sent-to,
	.verify-email-screen__spam,
	.verify-email-screen__notice,
	.verify-email-screen__error {
		margin: 0;
	}

	.verify-email-screen__spam {
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-text-subtle-color);
	}

	.verify-email-screen__notice {
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-success-color);
	}

	.verify-email-screen__error {
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-error-color);
	}

	.verify-email-screen__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
