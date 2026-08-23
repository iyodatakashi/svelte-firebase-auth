<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/ja';
	import type { AuthBaseProps } from '$lib/models/auth/auth.types';

	let { store, messages: overrides }: AuthBaseProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let errorMessage = $state<string | null>(null);
	let hasRequested = $state(false);
	// 受け付けられなくなった要求を、押せる状態のまま失敗させ続けない
	let isBlocked = $state(false);
	let isSubmitting = $state(false);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting || isBlocked) {
			return;
		}
		isSubmitting = true;
		errorMessage = null;
		hasRequested = false;

		// ストアは登録の有無によらず同じ結果を返す。画面は結果をそのまま示すだけでよい
		const result = await store.sendPasswordReset(email);
		isSubmitting = false;

		if (result.ok) {
			// 段階は変わらない。送ったことを示すだけで、この画面から離れない
			hasRequested = true;
			return;
		}
		errorMessage = authErrorMessageOf(result.error, messages, 'password-reset');
		isBlocked = result.error.kind === 'too-many-requests';
	};
</script>

<section class="password-reset">
	<p class="password-reset__description">{messages.passwordResetDescription}</p>

	<form class="password-reset__form" onsubmit={submit} novalidate>
		<div class="password-reset__field">
			<label class="password-reset__label" for="password-reset-email">
				{messages.emailLabel}
			</label>
			<Input
				id="password-reset-email"
				type="email"
				autocomplete="email"
				fullWidth
				bind:value={email}
				disabled={isSubmitting}
			/>
		</div>

		{#if hasRequested}
			<p class="password-reset__notice" role="status">{messages.passwordResetSent}</p>
			<p class="password-reset__spam">{messages.passwordResetCheckSpam}</p>
		{/if}
		{#if errorMessage}
			<p class="password-reset__error" role="alert">{errorMessage}</p>
		{/if}

		<Button
			type="submit"
			variant="filled"
			fullWidth
			loading={isSubmitting}
			disabled={isSubmitting || isBlocked}
		>
			{messages.passwordResetSubmit}
		</Button>
	</form>

	<div class="password-reset__links">
		<Button onclick={() => goto(store.routes.signIn)} disabled={isSubmitting}>
			{messages.passwordResetToSignIn}
		</Button>
	</div>
</section>

<style>
	.password-reset {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		color: var(--svelte-ui-text-color);
	}

	.password-reset__description {
		margin: 0;
	}

	.password-reset__form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.password-reset__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.password-reset__label {
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-text-subtle-color);
	}

	.password-reset__notice {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-success-color);
	}

	.password-reset__spam {
		margin: 0;
	}

	.password-reset__error {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-error-color);
	}

	.password-reset__links {
		display: flex;
		gap: 0.5rem;
	}
</style>
