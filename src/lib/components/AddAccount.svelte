<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { AddAccountProps } from '$lib/models/auth/auth.types';

	/**
	 * 別のアカウントでのサインインだけを受け持つ。ページの遷移は持たない（置く場所と開閉は組み込み側が決める）。
	 * 登録・パスワードの再設定へ進むかどうかと、進んだ先に何を出すかは組み込み側が決める
	 */
	let {
		store,
		messages: overrides,
		onCompleted,
		onCancel,
		actions = true,
		id,
		isSubmitting = $bindable(false)
	}: AddAccountProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let email = $state('');
	let password = $state('');
	let errorMessage = $state<string | null>(null);
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
			// 入力したパスワードを残さない
			password = '';
			onCompleted?.(result.value);
			return;
		}
		errorMessage = accountErrorMessageOf(result.error, messages, 'sign-in');
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

			<Input
				id="add-account-password"
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
			<p class="add-account__error" role="alert">{errorMessage}</p>
		{/if}

		<!-- 取りやめが左、実行が右。取りやめは送信中も押せる。組み込み側が外に置くときは描かない -->
		{#if actions}
			<div class="add-account__actions">
				<Button onclick={cancelFromButton}>{messages.cancel}</Button>
				<Button type="submit" variant="filled" loading={isSubmitting} disabled={isSubmitting}>
					{messages.signInSubmit}
				</Button>
			</div>
		{/if}
	</form>
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

	.add-account__actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--auth-inner-gap, 16px);
	}

	.add-account__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
