<script lang="ts">
	import { page } from '$app/state';
	import { Button, Dialog } from '@14ch/svelte-ui';
	import { authStore } from '#showcase/stores/auth';

	let dialog: ReturnType<typeof Dialog> | undefined = $state();

	/** サインイン・登録・再設定の経路。未選択でもここではサインインでき、選択ダイアログで塞がない */
	const isOnSignInRoute = $derived(
		[authStore.routes.signIn, authStore.routes.signUp, authStore.routes.passwordReset].includes(
			page.url.pathname
		)
	);

	// 選択中のアカウントからログアウトして他のアカウントが残ったら、選択ダイアログを出す。
	// 自動では選ばない。全件のログアウトの途中など、操作の実行中に一時的に未選択になっても出さない
	$effect(() => {
		if (
			authStore.stage === 'account-unselected' &&
			!isOnSignInRoute &&
			authStore.operation === null
		) {
			dialog?.open();
		} else {
			dialog?.close();
		}
	});
</script>

<Dialog
	bind:this={dialog}
	title="使うアカウントを選んでください"
	ariaLabel="使うアカウントを選んでください"
	closeIfClickOutside={false}
>
	<!-- 次に使うアカウントを選ぶだけの場。ストアの一覧と selectAccount で組み込み側が作る -->
	<div class="account-select-dialog__accounts">
		{#each authStore.accounts as account (account.id)}
			<Button
				fullWidth
				align="left"
				onclick={() => void authStore.selectAccount(account.id)}
				disabled={authStore.operation !== null}
			>
				{account.email ?? account.uid}
			</Button>
		{/each}
	</div>
</Dialog>

<style>
	.account-select-dialog__accounts {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
