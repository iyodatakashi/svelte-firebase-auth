<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { AuthBaseProps, AuthError } from '$lib/models/auth/auth.types';

	let { store, messages: overrides, onCompleted }: AuthBaseProps = $props();

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
			// 遷移しない。段階が変わるため、到達の制御が動かす
			onCompleted?.();
			return;
		}
		failure = result.error;
	};
</script>

<section class="sign-up">
	<form class="sign-up__form" onsubmit={submit} novalidate>
		<Input
			id="sign-up-email"
			type="email"
			autocomplete="email"
			placeholder={messages.email}
			ariaLabel={messages.email}
			fullWidth
			bind:value={email}
			disabled={isSubmitting}
		/>

		<Input
			id="sign-up-password"
			type="password"
			autocomplete="new-password"
			placeholder={messages.password}
			ariaLabel={messages.password}
			enablePasswordVisibilityToggle
			fullWidth
			bind:value={password}
			disabled={isSubmitting}
		/>

		{#if errorMessage}
			<p class="sign-up__error" role="alert">{errorMessage}</p>
		{/if}

		<Button type="submit" variant="filled" fullWidth loading={isSubmitting} disabled={isSubmitting}>
			{messages.signUpSubmit}
		</Button>
	</form>

	<div class="sign-up__links">
		{#if canOfferPasswordReset}
			<Button onclick={() => goto(store.routes.passwordReset)} disabled={isSubmitting}>
				{messages.goToPasswordReset}
			</Button>
		{/if}
		<Button fullWidth onclick={() => goto(store.routes.signIn)} disabled={isSubmitting}>
			{messages.backToSignIn}
		</Button>
	</div>
</section>

<style>
	.sign-up {
		display: flex;
		flex-direction: column;
		gap: 32px;
		color: var(--svelte-ui-text-color);
	}

	.sign-up__form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.sign-up__error {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-error-color);
	}

	.sign-up__links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
