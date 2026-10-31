<script lang="ts">
	import '$lib/assets/styles/variables.css';
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { AccountOperationError, SignUpProps } from '$lib/models/auth/auth.types';

	let {
		store,
		messages: overrides,
		onCompleted,
		actions = true,
		id,
		onGoToSignIn,
		onGoToPasswordReset,
		isSubmitting = $bindable(false)
	}: SignUpProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let password = $state('');
	let failure = $state<AccountOperationError | null>(null);
	/** 送信のたびに替わる。取りやめた送信の結果を表示に反映しない */
	let attempt: object | null = null;

	const errorMessage = $derived(
		failure === null ? null : accountErrorMessageOf(failure, messages, 'sign-up')
	);
	// 既に使われているメールアドレスのときだけ、パスワードの再設定へ導く
	const canOfferPasswordReset = $derived(
		failure?.kind === 'auth' && failure.cause.kind === 'email-already-in-use'
	);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		const current = {};
		attempt = current;
		isSubmitting = true;
		failure = null;

		const result = await store.signUp(email, password);
		if (attempt !== current) {
			return;
		}
		isSubmitting = false;
		// ストアで取りやめられた試行は、失敗として示さない
		if (!result.ok && result.error.kind === 'cancelled') {
			return;
		}
		if (result.ok) {
			// 遷移しない。段階が変わるため、到達の制御が動かす
			onCompleted?.();
			return;
		}
		failure = result.error;
	};

	/**
	 * 取りやめる。送信中の試行を無効にし、後から成功が返っても反映しない。
	 * 中のボタンを描かない組み込み側は、ダイアログを閉じるときなどにこれを呼ぶ
	 */
	export const cancel = (): void => {
		attempt = null;
		isSubmitting = false;
		// Firebase の要求は中断できない。ストアに試行を無効にさせ、後から成功しても反映させない
		store.cancelPendingSignIn();
	};
</script>

<section class="sign-up">
	<form {id} class="sign-up__form" onsubmit={submit} novalidate>
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

		<!-- 組み込み側が送信をフッターに置くときは描かない -->
		{#if actions}
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
		{/if}
	</form>

	<!-- ページを移る導線。ダイアログに置く組み込み側は、行き来を自分で決める -->
	{#if actions}
		<div class="sign-up__links">
			{#if canOfferPasswordReset}
				<Button
					fullWidth
					onclick={() =>
						onGoToPasswordReset ? onGoToPasswordReset() : goto(store.routes.passwordReset)}
					disabled={isSubmitting}
				>
					{messages.goToPasswordReset}
				</Button>
			{/if}
			<Button
				fullWidth
				onclick={() => (onGoToSignIn ? onGoToSignIn() : goto(store.routes.signIn))}
				disabled={isSubmitting}
			>
				{messages.backToSignIn}
			</Button>
		</div>
	{/if}
</section>

<style>
	/*
		余白は2つだけ持つ。ブロック間の --auth-block-gap と、ブロック内の --auth-inner-gap。
		値は $lib/assets/styles/variables.css が決める
	*/
	.sign-up {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap);
		color: var(--svelte-ui-text-color);
	}

	/* 入力要素のまとまり。入力欄・提示・操作を、ブロック間と同じ間隔で積む */
	.sign-up__form {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap);
	}

	.sign-up__fields {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	.sign-up__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--auth-inner-gap);
	}

	.sign-up__links {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	.sign-up__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
