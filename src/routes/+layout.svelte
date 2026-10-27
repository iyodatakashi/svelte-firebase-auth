<script lang="ts">
	import '@14ch/svelte-ui/styles';
	import { setContext, type Snippet } from 'svelte';
	import { Button, Dialog, PopupMenuButton } from '@14ch/svelte-ui';
	import { page } from '$app/state';
	import { AddAccount, AuthGate, AuthSession, createAuthStore, type AuthConfig } from '$lib/index';
	import { auth } from './firebase';

	let { children }: { children: Snippet } = $props();

	/**
	 * ショーケースは、複数アカウント指定と単一アカウント指定の両方の組み込み例を兼ねる。
	 * 指定はストアを作るときに決まるため、ビルド時の環境変数で選ぶ。既定は複数アカウント
	 */
	const multiAccount = import.meta.env.VITE_MULTI_ACCOUNT !== 'false';

	const config: AuthConfig = {
		// 自由登録の可否。Firebase 側の設定と揃えるのは組み込み側の運用
		selfRegistration: true,
		// メールアドレスの確認を求めるか。false なら登録のあとに確認メールを送らない
		emailVerification: true,
		// 確認と再設定の完了後に戻る URL。承認済みドメインに含まれている必要がある
		continueUrl: 'http://localhost:4173/',
		// 認証の経路。組み込み側の URL 構成をライブラリへ渡す
		routes: {
			signIn: '/signin',
			signUp: '/signup',
			verifyEmail: '/verify-email',
			passwordReset: '/password-reset',
			afterSignIn: '/'
		},
		// 複数のアカウントのログイン状態を保持するか。false なら最大1件で、選択の UI は要らない
		multiAccount
	};

	// 土台の App の Auth を渡す。選択中のアカウントは、この Auth へ複製される
	const store = createAuthStore(auth, config);
	setContext('authStore', store);

	let addDialog: ReturnType<typeof Dialog> | undefined = $state();
	let chooserDialog: ReturnType<typeof Dialog> | undefined = $state();

	/** サインイン・登録・再設定の経路。未選択でもここではサインインでき、選択ダイアログで塞がない */
	const isOnSignInRoute = $derived(
		[config.routes.signIn, config.routes.signUp, config.routes.passwordReset].includes(
			page.url.pathname
		)
	);

	// 選択中のアカウントからログアウトして他のアカウントが残ったら、選択ダイアログを出す。
	// 自動では選ばない。全件のログアウトの途中など、操作の実行中に一時的に未選択になっても出さない
	$effect(() => {
		if (store.stage === 'account-unselected' && !isOnSignInRoute && store.operation === null) {
			chooserDialog?.open();
		} else {
			chooserDialog?.close();
		}
	});

	/** 組み込み側のユーザーメニューを模した入口。項目を選ぶだけで切り替える */
	const menuItems = $derived([
		...store.accounts.map((account) => ({
			label:
				account.id === store.activeId
					? `${account.email}（使用中）`
					: (account.email ?? account.uid),
			// 未保存のデータがあれば、ここで確かめてから切り替える
			callback: () => void store.selectAccount(account.id),
			disabled: store.operation !== null
		})),
		'separator' as const,
		{
			label: '別のアカウントにログイン',
			callback: () => addDialog?.open(),
			disabled: store.operation !== null
		},
		...store.accounts.map((account) => ({
			label: `${account.email} からサインアウト`,
			callback: () => void store.signOutAccount(account.id),
			disabled: store.operation !== null
		})),
		{
			label: 'すべてのアカウントからサインアウト',
			callback: () => void store.signOutAll(),
			disabled: store.operation !== null
		}
	]);
</script>

{#snippet pending()}
	{#if store.startError}
		<p class="showcase__pending">開始できませんでした。再読み込みしてください。</p>
	{:else}
		<p class="showcase__pending">読み込み中…</p>
	{/if}
{/snippet}

<!--
	ブラウザ保存とストアの寿命。根の配置に1つ置く。
	名前空間は指定ごとに分ける。複数アカウントの記録を単一アカウント指定で読むと、1件を残して他をログアウトする
-->
<AuthSession {store} namespace={multiAccount ? 'showcase' : 'showcase-single'} />

<header class="showcase__header">
	<!-- 単一アカウント指定では、アカウントの一覧・選択の UI を置かない -->
	{#if multiAccount && store.accounts.length > 0}
		<PopupMenuButton {menuItems} ariaLabel="アカウントのメニュー">
			{store.activeAccount?.email ?? 'アカウントを選択'}
		</PopupMenuButton>
	{/if}
</header>

<main class="showcase">
	<!-- 到達の制御はここに1つ置くだけでよい。判定が済むまで子を描画しない -->
	<AuthGate {store} {pending}>
		{@render children()}
	</AuthGate>
</main>

<!-- 選択と追加のダイアログは、ガードの外に置く。保護された内容が隠れていても操作できる -->
{#if multiAccount}
	<Dialog
		bind:this={chooserDialog}
		title="使うアカウントを選んでください"
		ariaLabel="使うアカウントを選んでください"
		closeIfClickOutside={false}
	>
		<!-- 次に使うアカウントを選ぶだけの場。ストアの一覧と selectAccount で組み込み側が作る -->
		<div class="showcase__chooser">
			{#each store.accounts as account (account.id)}
				<Button
					fullWidth
					align="left"
					onclick={() => void store.selectAccount(account.id)}
					disabled={store.operation !== null}
				>
					{account.email ?? account.uid}
				</Button>
			{/each}
		</div>
	</Dialog>

	<Dialog
		bind:this={addDialog}
		title="別のアカウントにログイン"
		ariaLabel="別のアカウントにログイン"
	>
		<AddAccount
			{store}
			onCompleted={() => addDialog?.close()}
			onCancel={() => addDialog?.close()}
		/>
	</Dialog>
{/if}

<style>
	.showcase__header {
		display: flex;
		justify-content: flex-end;
		max-width: 26rem;
		margin: 0 auto;
		padding: 1rem 1rem 0;
	}

	.showcase {
		max-width: 26rem;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.showcase__chooser {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.showcase__pending {
		margin: 0;
		color: var(--svelte-ui-text-color);
	}
</style>
