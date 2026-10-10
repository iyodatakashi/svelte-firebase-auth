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
		<div class="sign-up__fields">
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
		</div>

		{#if errorMessage}
			<p class="sign-up__error" role="alert">{errorMessage}</p>
		{/if}

		<div class="sign-up__actions">
			<Button
				type="submit"
				variant="filled"
				fullWidth
				loading={isSubmitting}
				disabled={isSubmitting}
			>
				{messages.signUpSubmit}
			</Button>
		</div>
	</form>

	<div class="sign-up__links">
		{#if canOfferPasswordReset}
			<Button fullWidth onclick={() => goto(store.routes.passwordReset)} disabled={isSubmitting}>
				{messages.goToPasswordReset}
			</Button>
		{/if}
		<Button fullWidth onclick={() => goto(store.routes.signIn)} disabled={isSubmitting}>
			{messages.backToSignIn}
		</Button>
	</div>
</section>

<style>
	/*
		余白は2つだけ持つ。ブロック間の --auth-block-gap と、ブロック内の --auth-inner-gap。
		いずれも継承するため、組み込み側は包む要素に1度書けば全画面に効く
	*/
	.sign-up {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
		color: var(--svelte-ui-text-color);
	}

	/* 入力要素のまとまり。入力欄・提示・操作を、ブロック間と同じ間隔で積む */
	.sign-up__form {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
	}

	.sign-up__fields {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.sign-up__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--auth-inner-gap, 16px);
	}

	.sign-up__links {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.sign-up__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
