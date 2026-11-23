<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PopupMenuButton } from '@14ch/svelte-ui';
	import AccountSelectDialog from '#showcase/features/account/accountSelect/AccountSelectDialog.svelte';
	import AccountSignInDialog from '#showcase/features/account/accountSignIn/AccountSignInDialog.svelte';
	import AccountSignUpDialog from '#showcase/features/account/accountSignUp/AccountSignUpDialog.svelte';
	import { authStore, multiAccount } from '#showcase/stores/auth';

	let { children }: { children: Snippet } = $props();

	let signInDialog: ReturnType<typeof AccountSignInDialog> | undefined = $state();
	let signUpDialog: ReturnType<typeof AccountSignUpDialog> | undefined = $state();

	/** 組み込み側のユーザーメニューを模した入口。項目を選ぶだけで切り替える */
	const menuItems = $derived([
		...authStore.accounts.map((account) => ({
			label:
				account.id === authStore.activeId
					? `${account.email}（使用中）`
					: (account.email ?? account.uid),
			// 未保存のデータがあれば、ここで確かめてから切り替える
			callback: () => void authStore.selectAccount(account.id),
			disabled: authStore.operation !== null
		})),
		'separator' as const,
		{
			label: '別のアカウントにログイン',
			callback: () => signInDialog?.open(),
			disabled: authStore.operation !== null
		},
		{
			label: '新しいアカウントを登録',
			callback: () => signUpDialog?.open(),
			disabled: authStore.operation !== null
		},
		...authStore.accounts.map((account) => ({
			label: `${account.email} からサインアウト`,
			callback: () => void authStore.signOutAccount(account.id),
			disabled: authStore.operation !== null
		})),
		{
			label: 'すべてのアカウントからサインアウト',
			callback: () => void authStore.signOutAll(),
			disabled: authStore.operation !== null
		}
	]);
</script>

<header class="showcase-layout__header">
	<!-- 単一アカウント指定では、アカウントの一覧・選択の UI を置かない -->
	{#if multiAccount && authStore.accounts.length > 0}
		<PopupMenuButton {menuItems} ariaLabel="アカウントのメニュー">
			{authStore.activeAccount?.email ?? 'アカウントを選択'}
		</PopupMenuButton>
	{/if}
</header>

<main class="showcase-layout__main">
	{@render children()}
</main>

<!-- 選択と追加のダイアログは、ガードの外に置く。保護された内容が隠れていても操作できる -->
{#if multiAccount}
	<AccountSelectDialog />
	<AccountSignInDialog bind:this={signInDialog} onGoToSignUp={() => signUpDialog?.open()} />
	<AccountSignUpDialog bind:this={signUpDialog} />
{/if}

<style>
	.showcase-layout__header {
		display: flex;
		justify-content: flex-end;
		max-width: 26rem;
		margin: 0 auto;
		padding: 1rem 1rem 0;
	}

	.showcase-layout__main {
		max-width: 26rem;
		margin: 0 auto;
		padding: 2rem 1rem;
	}
</style>
