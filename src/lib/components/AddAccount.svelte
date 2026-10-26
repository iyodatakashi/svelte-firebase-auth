<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { AddAccountProps } from '$lib/models/auth/auth.types';

	let { store, messages: overrides, onCompleted, onCancel }: AddAccountProps = $props();

	const messages = $derived(resolveMessages(overrides));

	/** 同じ領域の中で切り替える。ページの遷移は持たない（置く場所と開閉は組み込み側が決める） */
	type Mode = 'sign-in' | 'sign-up' | 'password-reset';

	let mode = $state<Mode>('sign-in');
	let email = $state('');
	let password = $state('');
	let errorMessage = $state<string | null>(null);
	let hasRequestedReset = $state(false);
	let isSubmitting = $state(false);
	/** 送信のたびに替わる。取りやめた送信の結果を表示に反映しない */
	let attempt: object | null = null;

	const submitLabel = $derived(
		mode === 'sign-in'
			? messages.signInSubmit
			: mode === 'sign-up'
				? messages.signUpSubmit
				: messages.passwordResetSubmit
	);

	const switchTo = (next: Mode) => {
		mode = next;
		password = '';
		errorMessage = null;
		hasRequestedReset = false;
	};

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		const current = {};
		attempt = current;
		isSubmitting = true;
		errorMessage = null;
		hasRequestedReset = false;

		if (mode === 'password-reset') {
			const result = await store.sendPasswordReset(email);
			if (attempt !== current) {
				return;
			}
			isSubmitting = false;
			if (result.ok) {
				hasRequestedReset = true;
			} else {
				errorMessage = authErrorMessageOf(result.error, messages, 'password-reset');
			}
			return;
		}

		const result =
			mode === 'sign-in'
				? await store.signIn(email, password)
				: await store.signUp(email, password);
		if (attempt !== current) {
			return;
		}
		isSubmitting = false;
		if (result.ok) {
			// 入力したパスワードを残さない
			password = '';
			onCompleted?.(result.value);
			return;
		}
		errorMessage = accountErrorMessageOf(result.error, messages, mode);
	};

	const cancel = () => {
		attempt = null;
		isSubmitting = false;
		// Firebase の要求は中断できない。ストアに試行を無効にさせ、後から成功しても反映させない
		store.cancelPendingSignIn();
		onCancel?.();
	};
</script>

<section class="add-account">
	{#if mode === 'password-reset'}
		<div class="add-account__lead">
			<p class="add-account__description">{messages.passwordResetDescription}</p>
		</div>
	{/if}

	<form class="add-account__form" onsubmit={submit} novalidate>
		<div class="add-account__fields">
			<Input
				id="add-account-email"
				type="email"
				autocomplete="email"
				placeholder={messages.email}
				ariaLabel={messages.email}
				fullWidth
				bind:value={email}
				disabled={isSubmitting}
			/>

			{#if mode !== 'password-reset'}
				<Input
					id="add-account-password"
					type="password"
					autocomplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
					placeholder={messages.password}
					ariaLabel={messages.password}
					enablePasswordVisibilityToggle
					fullWidth
					bind:value={password}
					disabled={isSubmitting}
				/>
			{/if}
		</div>

		{#if hasRequestedReset}
			<div class="add-account__sent">
				<p class="add-account__notice" role="status">{messages.passwordResetSent}</p>
				<p class="add-account__spam">{messages.checkSpam}</p>
			</div>
		{/if}
		{#if errorMessage}
			<p class="add-account__error" role="alert">{errorMessage}</p>
		{/if}

		<!-- 取りやめが左、実行が右。取りやめは送信中も押せる -->
		<div class="add-account__actions">
			<Button onclick={cancel}>{messages.cancel}</Button>
			<Button type="submit" variant="filled" loading={isSubmitting} disabled={isSubmitting}>
				{submitLabel}
			</Button>
		</div>
	</form>

	<div class="add-account__links">
		{#if mode === 'sign-in'}
			<Button fullWidth onclick={() => switchTo('password-reset')} disabled={isSubmitting}>
				{messages.goToPasswordReset}
			</Button>
			{#if store.canSelfRegister}
				<Button fullWidth onclick={() => switchTo('sign-up')} disabled={isSubmitting}>
					{messages.goToSignUp}
				</Button>
			{/if}
		{:else}
			<Button fullWidth onclick={() => switchTo('sign-in')} disabled={isSubmitting}>
				{messages.backToSignIn}
			</Button>
		{/if}
	</div>
</section>

<style>
	/*
		余白は2つだけ持つ。ブロック間の --auth-block-gap と、ブロック内の --auth-inner-gap。
		いずれも継承するため、組み込み側は包む要素に1度書けば全画面に効く
	*/
	.add-account {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
		color: var(--svelte-ui-text-color);
	}

	/* 読ませる文のまとまり */
	.add-account__lead {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.add-account__lead p {
		margin: 0;
	}

	/* 入力要素のまとまり。入力欄・提示・操作を、ブロック間と同じ間隔で積む */
	.add-account__form {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
	}

	.add-account__fields {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	/* 送信できたことの提示。通知と、迷惑メールの案内を1つのまとまりにする */
	.add-account__sent {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.add-account__sent p {
		margin: 0;
	}

	.add-account__actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--auth-inner-gap, 16px);
	}

	.add-account__links {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.add-account__notice {
		color: var(--svelte-ui-success-color);
	}

	.add-account__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
