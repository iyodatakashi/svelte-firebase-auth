<script lang="ts">
	import { Button, Input } from '@14ch/svelte-ui';
	import { goto } from '$app/navigation';
	import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
	import { resolveMessages } from '$lib/messages/ja';
	import type { AuthBaseProps } from '$lib/models/auth/auth.types';

	let { store, messages: overrides, onCompleted }: AuthBaseProps = $props();

	const messages = $derived(resolveMessages(overrides));

	let currentPassword = $state('');
	let newPassword = $state('');
	let errorMessage = $state<string | null>(null);
	let hasChanged = $state(false);
	let isSubmitting = $state(false);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (isSubmitting) {
			return;
		}
		isSubmitting = true;
		errorMessage = null;
		hasChanged = false;

		const result = await store.changePassword(currentPassword, newPassword);
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
				{messages.passwordChangeBack}
			</Button>
		</div>
	{:else}
		<form class="password-change__form" onsubmit={submit} novalidate>
			<div class="password-change__field">
				<label class="password-change__label" for="password-change-current">
					{messages.currentPasswordLabel}
				</label>
				<Input
					id="password-change-current"
					type="password"
					autocomplete="current-password"
					enablePasswordVisibilityToggle
					fullWidth
					bind:value={currentPassword}
					disabled={isSubmitting}
				/>
			</div>

			<div class="password-change__field">
				<label class="password-change__label" for="password-change-new">
					{messages.newPasswordLabel}
				</label>
				<Input
					id="password-change-new"
					type="password"
					autocomplete="new-password"
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
					{messages.passwordChangeCancel}
				</Button>
				<Button type="submit" variant="filled" loading={isSubmitting} disabled={isSubmitting}>
					{messages.passwordChangeSubmit}
				</Button>
			</div>
		</form>
	{/if}
</section>

<style>
	.password-change {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		color: var(--svelte-ui-text-color);
	}

	.password-change__form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.password-change__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.password-change__label {
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-text-subtle-color);
	}

	.password-change__notice {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-success-color);
	}

	.password-change__error {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-error-color);
	}

	.password-change__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
