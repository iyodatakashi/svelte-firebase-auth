<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import { untrack } from 'svelte';
	import type { AddAccountMode, AddAccountProps } from '$lib/models/auth/auth.types';

	/**
	 * 表示（サインイン・登録・再設定）は同じ領域の中で切り替える。ページの遷移は持たない
	 * （置く場所と開閉は組み込み側が決める）。組み込み側は `bind:mode` で読み書きできる
	 */
	let {
		store,
		messages: overrides,
		onCompleted,
		onCancel,
		passwordReset = true,
		signUp = true,
		actions = true,
		id,
		isSubmitting = $bindable(false),
		mode = $bindable<AddAccountMode>('sign-in')
	}: AddAccountProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let password = $state('');
	let errorMessage = $state<string | null>(null);
	let hasRequestedReset = $state(false);
	/** 送信のたびに替わる。取りやめた送信の結果を表示に反映しない */
	let attempt: object | null = null;
	/** 表示している切り替え。中の導線からでも組み込み側からでも、替わったら途中の結果を捨てる */
	let shownMode = untrack(() => mode);

	$effect.pre(() => {
		if (mode === shownMode) {
			return;
		}
		shownMode = mode;
		password = '';
		errorMessage = null;
		hasRequestedReset = false;
	});

	const submitLabel = $derived(
		mode === 'sign-in'
			? messages.signInSubmit
			: mode === 'sign-up'
				? messages.signUpSubmit
				: messages.passwordResetSubmit
	);

	const canSignUp = $derived(signUp && store.canSelfRegister);
	/** サインインの表示では、出す導線が1つも無ければ導線のまとまりごと出さない */
	const hasLinks = $derived(mode !== 'sign-in' || passwordReset || canSignUp);

	const switchTo = (next: AddAccountMode) => {
		mode = next;
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
		// ストアで取りやめられた試行は、失敗として示さない
		if (!result.ok && result.error.kind === 'cancelled') {
			return;
		}
		if (result.ok) {
			// 入力したパスワードを残さない
			password = '';
			onCompleted?.(result.value);
			return;
		}
		errorMessage = accountErrorMessageOf(result.error, messages, mode);
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

	const cancelFromButton = () => {
		cancel();
		onCancel?.();
	};
</script>

<section class="add-account">
	{#if mode === 'password-reset'}
		<div class="add-account__lead">
			<p class="add-account__description">{messages.passwordResetDescription}</p>
		</div>
	{/if}

	<form {id} class="add-account__form" onsubmit={submit} novalidate>
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

		<!-- 取りやめが左、実行が右。取りやめは送信中も押せる。組み込み側が外に置くときは描かない -->
		{#if actions}
			<div class="add-account__actions">
				<Button onclick={cancelFromButton}>{messages.cancel}</Button>
				<Button type="submit" variant="filled" loading={isSubmitting} disabled={isSubmitting}>
					{submitLabel}
				</Button>
			</div>
		{/if}
	</form>

	{#if hasLinks}
		<div class="add-account__links">
			{#if mode === 'sign-in'}
				{#if passwordReset}
					<Button fullWidth onclick={() => switchTo('password-reset')} disabled={isSubmitting}>
						{messages.goToPasswordReset}
					</Button>
				{/if}
				{#if canSignUp}
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
	{/if}
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
