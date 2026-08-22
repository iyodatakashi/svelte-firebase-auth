<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/ja';
	import type { AuthError, SignUpProps } from '$lib/models/auth/auth.types';

	let {
		store,
		messages: overrides,
		header,
		onSignedUp,
		onRequestSignIn,
		onRequestPasswordReset
	}: SignUpProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let password = $state('');
	let failure = $state<AuthError | null>(null);
	let isSubmitting = $state(false);

	const errorMessage = $derived(failure ? authErrorMessageOf(failure, messages, 'sign-up') : null);
	// 既に使われているメールアドレスのときだけ、パスワードの再設定へ導く
	const canOfferPasswordReset = $derived(failure?.kind === 'email-already-in-use');

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		isSubmitting = true;
		failure = null;

		const result = await store.signUp(email, password);
		isSubmitting = false;

		if (result.ok) {
			onSignedUp();
			return;
		}
		failure = result.error;
	};
</script>

<section class="sign-up">
	{#if header}
		<div class="sign-up__header">{@render header()}</div>
	{/if}

	<h2 class="sign-up__title">{messages.signUpTitle}</h2>

	<form class="sign-up__form" onsubmit={submit} novalidate>
		<div class="sign-up__field">
			<label class="sign-up__label" for="sign-up-email">{messages.emailLabel}</label>
			<Input
				id="sign-up-email"
				type="email"
				autocomplete="email"
				fullWidth
				bind:value={email}
				disabled={isSubmitting}
			/>
		</div>

		<div class="sign-up__field">
			<label class="sign-up__label" for="sign-up-password">{messages.passwordLabel}</label>
			<Input
				id="sign-up-password"
				type="password"
				autocomplete="new-password"
				enablePasswordVisibilityToggle
				fullWidth
				bind:value={password}
				disabled={isSubmitting}
			/>
		</div>

		{#if errorMessage}
			<p class="sign-up__error" role="alert">{errorMessage}</p>
		{/if}

		<Button type="submit" variant="filled" fullWidth loading={isSubmitting} disabled={isSubmitting}>
			{messages.signUpSubmit}
		</Button>
	</form>

	<div class="sign-up__links">
		{#if canOfferPasswordReset}
			<Button onclick={onRequestPasswordReset} disabled={isSubmitting}>
				{messages.signUpToPasswordReset}
			</Button>
		{/if}
		<Button onclick={onRequestSignIn} disabled={isSubmitting}>
			{messages.signUpToSignIn}
		</Button>
	</div>
</section>

<style>
	.sign-up {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		color: var(--svelte-ui-text-color);
	}

	.sign-up__title {
		margin: 0;
		font-size: var(--svelte-ui-font-size-xl);
	}

	.sign-up__form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.sign-up__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.sign-up__label {
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-text-subtle-color);
	}

	.sign-up__error {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-error-color);
	}

	.sign-up__links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
