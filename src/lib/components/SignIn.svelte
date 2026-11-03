<script lang="ts">
	import '$lib/assets/styles/variables.css';
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { SignInProps } from '$lib/models/auth/auth.types';

	let {
		store,
		messages: overrides,
		onCompleted,
		onGoToSignUp,
		onGoToPasswordReset
	}: SignInProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let password = $state('');
	let errorMessage = $state<string | null>(null);
	let isSubmitting = $state(false);
	/** 送信のたびに替わる。取りやめた送信の結果を表示に反映しない */
	let attempt: object | null = null;

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		const current = {};
		attempt = current;
		isSubmitting = true;
		errorMessage = null;

		const result = await store.signIn(email, password);
		if (attempt !== current) {
			return;
		}
		isSubmitting = false;
		// ストアで取りやめられた試行は、失敗として示さない
		if (!result.ok && result.error.kind === 'cancelled') {
			return;
		}
		if (result.ok) {
			// 遷移しない。新しいアカウントが選ばれて段階が変わるため、到達の制御が動かす
			onCompleted?.();
			return;
		}
		// 語彙ごとの分岐も文言もこの画面は持たない
		errorMessage = accountErrorMessageOf(result.error, messages, 'sign-in');
	};

	/**
	 * 取りやめる。送信中の試行を無効にし、後から成功が返っても反映しない。
	 * ダイアログに置く組み込み側は、閉じるときにこれを呼ぶ
	 */
	export const cancel = (): void => {
		attempt = null;
		isSubmitting = false;
		// Firebase の要求は中断できない。ストアに試行を無効にさせ、後から成功しても反映させない
		store.cancelPendingSignIn();
	};
</script>

<section class="sign-in">
	<form class="sign-in__form" onsubmit={submit} novalidate>
		<div class="sign-in__fields">
			<Input
				id="sign-in-email"
				type="email"
				autocomplete="username"
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
		<Button
			fullWidth
			onclick={() =>
				onGoToPasswordReset ? onGoToPasswordReset() : goto(store.routes.passwordReset)}
			disabled={isSubmitting}
		>
			{messages.goToPasswordReset}
		</Button>
		{#if store.canSelfRegister}
			<Button
				fullWidth
				onclick={() => (onGoToSignUp ? onGoToSignUp() : goto(store.routes.signUp))}
				disabled={isSubmitting}
			>
				{messages.goToSignUp}
			</Button>
		{/if}
	</div>
</section>

<style>
	/*
		余白はブロック間の --auth-block-gap、ブロック内の --auth-inner-gap、
		リンクの間の --auth-links-gap。
		値は $lib/assets/styles/variables.css が決める
	*/
	.sign-in {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap);
		color: var(--svelte-ui-text-color);
	}

	/* 入力要素のまとまり。入力欄・提示・操作を、ブロック内の間隔で積む */
	.sign-in__form {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	.sign-in__fields {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	.sign-in__actions {
		display: flex;
		flex-wrap: wrap;
	}

	.sign-in__links {
		display: flex;
		flex-direction: column;
		gap: var(--auth-links-gap);
	}

	.sign-in__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
