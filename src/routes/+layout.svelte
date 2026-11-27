<script lang="ts">
	import '@14ch/svelte-ui/styles';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { AuthGate, AuthSession } from '#lib/index';
	import ShowcaseLayout from '#showcase/features/layout/ShowcaseLayout.svelte';
	import ShowcasePending from '#showcase/features/layout/ShowcasePending.svelte';
	import { authStore, multiAccount } from '#showcase/stores/auth';
	import { syncAccountAcrossTabs } from '#showcase/stores/syncAccountAcrossTabs';

	// 名前空間は指定ごとに分ける。複数アカウントの記録を単一アカウント指定で読むと、1件を残して他をログアウトする
	const namespace = multiAccount
		? syncAccountAcrossTabs
			? 'showcase-synced'
			: 'showcase'
		: 'showcase-single';

	let { children }: { children: Snippet } = $props();
</script>

{#snippet pending()}
	<ShowcasePending />
{/snippet}

<!-- ブラウザ保存とストアの寿命。根の配置に1つ置く -->
<AuthSession store={authStore} {namespace} {syncAccountAcrossTabs} />

<ShowcaseLayout>
	{#if page.url.searchParams.has('preview')}
		<!-- 画面の見た目の確認用。?preview を付けると到達の制御を通さず、その URL の画面を描く -->
		{@render children()}
	{:else}
		<!-- 到達の制御はここに1つ置くだけでよい。判定が済むまで子を描画しない -->
		<AuthGate store={authStore} {pending}>
			{@render children()}
		</AuthGate>
	{/if}
</ShowcaseLayout>
