<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type { AuthBaseProps } from '$lib/models/auth/auth.types';

	let { store, messages: overrides, onCompleted }: AuthBaseProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let currentPassword = $state('');
	let newPassword = $state('');
	let errorMessage = $state<string | null>(null);
	let hasChanged = $state(false);
	let isSubmitting = $state(false);
	let isDestroyed = false;
	/** 表示しているアカウント。替わったら、切り替え元の入力と結果を破棄して表示し直す */
	let shownId = untrack(() => store.activeId);

	$effect.pre(() => {
		const current = store.activeId;
		if (current === shownId) {
			return;
		}
		shownId = current;
		currentPassword = '';
		newPassword = '';
		errorMessage = null;
		hasChanged = false;
		isSubmitting = false;
	});

	$effect(() => () => {
		isDestroyed = true;
	});

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		const accountId = store.activeId;
		isSubmitting = true;
		errorMessage = null;
		hasChanged = false;

		const result = await store.changePassword(currentPassword, newPassword);
		// 切り替え元の結果で、切り替え先の表示を上書きしない
		if (isDestroyed || store.activeId !== accountId) {
			return;
		}
		isSubmitting = false;

		if (result.ok) {
			// 変更したパスワードを画面に残さない
			currentPassword = '';
			newPassword = '';
			hasChanged = true;
			onCompleted?.();
			return;
		}
		// 現在のパスワードの誤りかどうかの判別も、文脈を渡してこの関数に任せる
		errorMessage = authErrorMessageOf(result.error, messages, 'password-change');
	};
</script>

<section class="password-change">
	{#if hasChanged}
		<!--
			パスワードの変更は段階を変えないため、到達の制御は利用者を動かさない。
			完了したまま操作を並べておくと、押せる意味のないものだけが残る。
			次の一手を1つだけ出す
		-->
		<p class="password-change__notice" role="status">{messages.passwordChangeDone}</p>
		<div class="password-change__actions">
			<Button variant="filled" onclick={() => goto(store.routes.afterSignIn)}>
				{messages.back}
			</Button>
		</div>
	{:else}
		<form class="password-change__form" onsubmit={submit} novalidate>
			<div class="password-change__fields">
				<Input
					id="password-change-current"
					type="password"
					autocomplete="current-password"
					placeholder={messages.currentPassword}
					ariaLabel={messages.currentPassword}
					enablePasswordVisibilityToggle
					fullWidth
					bind:value={currentPassword}
					disabled={isSubmitting}
				/>

				<Input
					id="password-change-new"
					type="password"
					autocomplete="new-password"
					placeholder={messages.newPassword}
					ariaLabel={messages.newPassword}
					enablePasswordVisibilityToggle
					fullWidth
					bind:value={newPassword}
					disabled={isSubmitting}
				/>
			</div>

			{#if errorMessage}
				<p class="password-change__error" role="alert">{errorMessage}</p>
			{/if}

			<!-- 取りやめが左、実行が右。描画の順と見た目の順を一致させ、読み上げと Tab の順も揃える -->
			<div class="password-change__actions">
				<Button onclick={() => goto(store.routes.afterSignIn)} disabled={isSubmitting}>
					{messages.cancel}
				</Button>
				<Button type="submit" variant="filled" loading={isSubmitting} disabled={isSubmitting}>
					{messages.passwordChangeSubmit}
				</Button>
			</div>
		</form>
	{/if}
</section>

<style>
	/*
		余白は2つだけ持つ。ブロック間の --auth-block-gap と、ブロック内の --auth-inner-gap。
		いずれも継承するため、組み込み側は包む要素に1度書けば全画面に効く
	*/
	.password-change {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
		color: var(--svelte-ui-text-color);
	}

	/* 入力要素のまとまり。入力欄・提示・操作を、ブロック間と同じ間隔で積む */
	.password-change__form {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
	}

	.password-change__fields {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.password-change__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--auth-inner-gap, 16px);
	}

	.password-change__notice {
		margin: 0;
		color: var(--svelte-ui-success-color);
	}

	.password-change__error {
		margin: 0;
		color: var(--svelte-ui-error-color);
	}
</style>
