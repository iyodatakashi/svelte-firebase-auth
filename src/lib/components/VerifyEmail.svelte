<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '@14ch/svelte-ui';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import { VERIFICATION_POLL_INTERVAL_MS } from '$lib/models/auth/auth.constants';
	import type { AuthBaseProps } from '$lib/models/auth/auth.types';

	let { store, messages: overrides, onCompleted }: AuthBaseProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let errorMessage = $state<string | null>(null);
	let hasResent = $state(false);
	// 受け付けられなくなった再送を、押せる状態のまま失敗させ続けない
	let isResendBlocked = $state(false);
	let isResending = $state(false);
	let isLeaving = $state(false);
	// 完了は1度だけ返す。取り直しは繰り返し走る
	let hasCompleted = false;
	let isDestroyed = false;
	/** 表示しているアカウント。替わったら、切り替え元の送信結果を破棄して表示し直す */
	let shownId = untrack(() => store.activeId);

	$effect.pre(() => {
		const current = store.activeId;
		if (current === shownId) {
			return;
		}
		shownId = current;
		errorMessage = null;
		hasResent = false;
		isResendBlocked = false;
		isResending = false;
		isLeaving = false;
		hasCompleted = false;
	});

	$effect(() => () => {
		isDestroyed = true;
	});

	/** 処理を始めたときのアカウントのまま、画面が残っているか。違えば結果を表示に反映しない */
	const isStillShowing = (accountId: string | null) => !isDestroyed && store.activeId === accountId;

	// 表示されている間だけ取り直す。停止し損ねると、画面を離れた後も通信が続く
	// 選択中のアカウントが替われば、取り直しも張り直す
	$effect(() => {
		const accountId = store.activeId;
		// 確認が済めば段階が変わる。この画面は遷移せず、到達の制御に任せる
		const refresh = async () => {
			if (hasCompleted || store.isEmailVerified) {
				return;
			}
			const isVerified = await store.refreshVerification();
			if (isVerified && !hasCompleted && isStillShowing(accountId)) {
				hasCompleted = true;
				onCompleted?.();
			}
		};

		const timer = setInterval(refresh, VERIFICATION_POLL_INTERVAL_MS);
		// 別のタブ・別の端末で確認を済ませて戻った瞬間に反映する
		const refreshOnReturn = () => {
			if (document.visibilityState !== 'hidden') {
				void refresh();
			}
		};
		document.addEventListener('visibilitychange', refreshOnReturn);

		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refreshOnReturn);
		};
	});

	const resend = async () => {
		if (isResending || isResendBlocked) {
			return;
		}
		const accountId = store.activeId;
		isResending = true;
		errorMessage = null;
		hasResent = false;

		const result = await store.sendEmailVerification();
		if (!isStillShowing(accountId)) {
			return;
		}
		isResending = false;

		if (result.ok) {
			hasResent = true;
			return;
		}
		errorMessage = authErrorMessageOf(result.error, messages, 'verify-email');
		isResendBlocked = result.error.kind === 'too-many-requests';
	};

	const signOut = async () => {
		if (isLeaving) {
			return;
		}
		isLeaving = true;
		// 選択中のアカウントからログアウトする。遷移しない。段階が変わるため、到達の制御が動かす
		await store.signOut();
	};
</script>

<section class="verify-email">
	<div class="verify-email__lead">
		{#if store.email}
			<p class="verify-email__sent-to">{messages.verifyEmailSentTo(store.email)}</p>
		{/if}
		<p class="verify-email__spam">{messages.checkSpam}</p>
	</div>

	{#if hasResent}
		<p class="verify-email__notice" role="status">{messages.verifyEmailResent}</p>
	{/if}
	{#if errorMessage}
		<p class="verify-email__error" role="alert">{errorMessage}</p>
	{/if}

	<div class="verify-email__actions">
		<Button
			variant="filled"
			fullWidth
			onclick={resend}
			loading={isResending}
			disabled={isResending || isResendBlocked}
		>
			{messages.verifyEmailResend}
		</Button>
		<Button fullWidth onclick={signOut} disabled={isLeaving}>
			{messages.signOut}
		</Button>
	</div>
</section>

<style>
	/*
		余白は2つだけ持つ。ブロック間の --auth-block-gap と、ブロック内の --auth-inner-gap。
		いずれも継承するため、組み込み側は包む要素に1度書けば全画面に効く
	*/
	.verify-email {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
		color: var(--svelte-ui-text-color);
	}

	/* 読ませる文のまとまり */
	.verify-email__lead {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.verify-email__lead p {
		margin: 0;
	}

	.verify-email__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--auth-inner-gap, 16px);
	}

	.verify-email__notice {
		margin: 0;
		color: var(--svelte-ui-success-color);
	}

	.verify-email__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
