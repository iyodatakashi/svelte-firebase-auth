<script lang="ts">
	import '$lib/assets/styles/variables.css';
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { PasswordResetProps } from '$lib/models/auth/auth.types';

	let {
		store,
		messages: overrides,
		onCompleted,
		actions = true,
		id,
		onGoToSignIn,
		isSubmitting = $bindable(false),
		// 受け付けられなくなった要求を、押せる状態のまま失敗させ続けない
		isBlocked = $bindable(false)
	}: PasswordResetProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let errorMessage = $state<string | null>(null);
	let hasRequested = $state(false);

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
			// 段階は変わらない。送ったことを示し、その先は組み込み側が決める
			hasRequested = true;
			onCompleted?.();
			return;
		}
		errorMessage = authErrorMessageOf(result.error, messages, 'password-reset');
		isBlocked = result.error.kind === 'too-many-requests';
	};
</script>

<section class="password-reset">
	<div class="password-reset__lead">
		<p class="password-reset__description">{messages.passwordResetDescription}</p>
	</div>

	<form {id} class="password-reset__form" onsubmit={submit} novalidate>
		<div class="password-reset__fields">
			<Input
				id="password-reset-email"
				type="email"
				autocomplete="email"
				placeholder={messages.email}
				ariaLabel={messages.email}
				fullWidth
				bind:value={email}
				disabled={isSubmitting}
			/>
		</div>

		{#if hasRequested}
			<div class="password-reset__sent">
				<p class="password-reset__notice" role="status">{messages.passwordResetSent}</p>
				<p class="password-reset__spam">{messages.checkSpam}</p>
			</div>
		{/if}
		{#if errorMessage}
			<p class="password-reset__error" role="alert">{errorMessage}</p>
		{/if}

		<!-- 組み込み側が送信をフッターに置くときは描かない -->
		{#if actions}
			<div class="password-reset__actions">
				<Button
					type="submit"
					variant="filled"
					fullWidth
					loading={isSubmitting}
					disabled={isSubmitting || isBlocked}
				>
					{messages.passwordResetSubmit}
				</Button>
			</div>
		{/if}
	</form>

	<!-- サインインへ戻る導線はページを移る。ダイアログに置く組み込み側は、行き来を自分で決める -->
	{#if actions}
		<div class="password-reset__links">
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
		余白はブロック間の --auth-block-gap、ブロック内の --auth-inner-gap、
		リンクの間の --auth-links-gap。
		値は $lib/assets/styles/variables.css が決める
	*/
	.password-reset {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap);
		color: var(--svelte-ui-text-color);
	}

	/* 読ませる文のまとまり。段落の間は入力欄などの余白とは別物で、文字の大きさに合わせる */
	.password-reset__lead {
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.password-reset__lead p {
		margin: 0;
	}

	/* 入力要素のまとまり。入力欄・提示・操作を、ブロック内の間隔で積む */
	.password-reset__form {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	.password-reset__fields {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap);
	}

	/* 送信できたことの提示。通知と、迷惑メールの案内を1つのまとまりにする。段落の間は文字の大きさに合わせる */
	.password-reset__sent {
		display: flex;
		flex-direction: column;
		gap: 1em;
	}

	.password-reset__sent p {
		margin: 0;
	}

	.password-reset__actions {
		display: flex;
		flex-wrap: wrap;
	}

	.password-reset__links {
		display: flex;
		flex-direction: column;
		gap: var(--auth-links-gap);
	}

	.password-reset__notice {
		color: var(--svelte-ui-success-color);
	}

	.password-reset__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
