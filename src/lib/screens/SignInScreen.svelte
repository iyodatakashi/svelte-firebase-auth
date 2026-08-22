<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/ja';
	import type { SignInScreenProps } from '$lib/models/auth/auth.types';

	let {
		store,
		messages: overrides,
		header,
		onSignedIn,
		onRequestPasswordReset,
		onRequestSignUp
	}: SignInScreenProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let password = $state('');
	let errorMessage = $state<string | null>(null);
	let isSubmitting = $state(false);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		isSubmitting = true;
		errorMessage = null;

		const result = await store.signIn(email, password);
		isSubmitting = false;

		if (result.ok) {
			onSignedIn();
			return;
		}
		// 語彙ごとの分岐も文言もこの画面は持たない
		errorMessage = authErrorMessageOf(result.error, messages, 'sign-in');
	};
</script>

<section class="sign-in-screen">
	{#if header}
		<div class="sign-in-screen__header">{@render header()}</div>
	{/if}

	<h2 class="sign-in-screen__title">{messages.signInTitle}</h2>

	<form class="sign-in-screen__form" onsubmit={submit} novalidate>
		<div class="sign-in-screen__field">
			<label class="sign-in-screen__label" for="sign-in-email">{messages.emailLabel}</label>
			<Input
				id="sign-in-email"
				type="email"
				autocomplete="email"
				fullWidth
				bind:value={email}
				disabled={isSubmitting}
			/>
		</div>

		<div class="sign-in-screen__field">
			<label class="sign-in-screen__label" for="sign-in-password">{messages.passwordLabel}</label>
			<Input
				id="sign-in-password"
				type="password"
				autocomplete="current-password"
				enablePasswordVisibilityToggle
				fullWidth
				bind:value={password}
				disabled={isSubmitting}
			/>
		</div>

		{#if errorMessage}
			<p class="sign-in-screen__error" role="alert">{errorMessage}</p>
		{/if}

		<Button type="submit" variant="filled" fullWidth loading={isSubmitting} disabled={isSubmitting}>
			{messages.signInSubmit}
		</Button>
	</form>

	<div class="sign-in-screen__links">
		<Button onclick={onRequestPasswordReset} disabled={isSubmitting}>
			{messages.signInToPasswordReset}
		</Button>
		{#if store.canSelfRegister && onRequestSignUp}
			<Button onclick={onRequestSignUp} disabled={isSubmitting}>
				{messages.signInToSignUp}
			</Button>
		{/if}
	</div>
</section>

<style>
	.sign-in-screen {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		color: var(--svelte-ui-text-color);
	}

	.sign-in-screen__title {
		margin: 0;
		font-size: var(--svelte-ui-font-size-xl);
	}

	.sign-in-screen__form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.sign-in-screen__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.sign-in-screen__label {
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-text-subtle-color);
	}

	.sign-in-screen__error {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-error-color);
	}

	.sign-in-screen__links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
