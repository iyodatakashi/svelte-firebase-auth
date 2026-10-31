<script lang="ts">
	import '$lib/assets/styles/variables.css';
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
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
			// 遷移しない。新しいアカウントが選ばれて段階が変わるため、到達の制御が動かす
			onCompleted?.();
			return;
		}
		// 語彙ごとの分岐も文言もこの画面は持たない
		errorMessage = accountErrorMessageOf(result.error, messages, 'sign-in');
	};
</script>

<section class="sign-in">
	<form class="sign-in__form" onsubmit={submit} novalidate>
		<div class="sign-in__fields">
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
		</div>

		{#if errorMessage}
			<p class="sign-in__error" role="alert">{errorMessage}</p>
		{/if}

		<div class="sign-in__actions">
			<Button
				type="submit"
				variant="filled"
				fullWidth
				loading={isSubmitting}
				disabled={isSubmitting}
			>
				{messages.signInSubmit}
			</Button>
		</div>
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
	/*
		余白は2つだけ持つ。ブロック間の --auth-block-gap と、ブロック内の --auth-inner-gap。
		値は $lib/assets/styles/variables.css が決める
	*/
	.sign-in {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap);
		color: var(--svelte-ui-text-color);
	}

	/* 入力要素のまとまり。入力欄・提示・操作を、ブロック間と同じ間隔で積む */
	.sign-in__form {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap);
	}

	.sign-in__fields {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	.sign-in__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--auth-inner-gap);
	}

	.sign-in__links {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	.sign-in__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
