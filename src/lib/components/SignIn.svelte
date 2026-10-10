<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { AuthBaseProps } from '$lib/models/auth/auth.types';

	let { store, messages: overrides, onCompleted }: AuthBaseProps = $props();

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
			// 遷移しない。段階が変わるため、到達の制御が動かす
			onCompleted?.();
			return;
		}
		// 語彙ごとの分岐も文言もこの画面は持たない
		errorMessage = authErrorMessageOf(result.error, messages, 'sign-in');
	};
</script>

<section class="sign-in">
	<form class="sign-in__form" onsubmit={submit} novalidate>
		<Input
			id="sign-in-email"
			type="email"
			autocomplete="email"
			placeholder={messages.email}
			ariaLabel={messages.email}
			fullWidth
			bind:value={email}
			disabled={isSubmitting}
		/>

		<Input
			id="sign-in-password"
			type="password"
			autocomplete="current-password"
			placeholder={messages.password}
			ariaLabel={messages.password}
			enablePasswordVisibilityToggle
			fullWidth
			bind:value={password}
			disabled={isSubmitting}
		/>

		{#if errorMessage}
			<p class="sign-in__error" role="alert">{errorMessage}</p>
		{/if}

		<Button type="submit" variant="filled" fullWidth loading={isSubmitting} disabled={isSubmitting}>
			{messages.signInSubmit}
		</Button>
	</form>

	<div class="sign-in__links">
		<Button fullWidth onclick={() => goto(store.routes.passwordReset)} disabled={isSubmitting}>
			{messages.goToPasswordReset}
		</Button>
		{#if store.canSelfRegister}
			<Button fullWidth onclick={() => goto(store.routes.signUp)} disabled={isSubmitting}>
				{messages.goToSignUp}
			</Button>
		{/if}
	</div>
</section>

<style>
	.sign-in {
		display: flex;
		flex-direction: column;
		gap: 32px;
		color: var(--svelte-ui-text-color);
	}

	.sign-in__form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.sign-in__error {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-error-color);
	}

	.sign-in__links {
		display: flex;
		flex-direction: column;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
