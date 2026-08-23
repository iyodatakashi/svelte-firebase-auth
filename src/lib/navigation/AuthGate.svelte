<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolveAuthGuard } from '$lib/models/auth/authGuard';
	import { clearReturnTo, readReturnTo, writeReturnTo } from '$lib/navigation/returnTo';
	import type { AuthGateProps } from '$lib/models/auth/auth.types';

	let { store, children, pending }: AuthGateProps = $props();

	/**
	 * 実行中の振り替え先。**遷移は非同期であり、完了前に段階が変わると二重に走る**。
	 * 追随の対象にしない（効果の中だけで読み書きする）
	 */
	let redirectingTo: string | null = null;

	// 段階と現在の経路の双方を読む。どちらが変わっても判定し直す
	const decision = $derived(
		resolveAuthGuard({
			stage: store.stage,
			currentPath: `${page.url.pathname}${page.url.search}`,
			routes: store.routes,
			returnTo: readReturnTo()
		})
	);

	// 効果はブラウザでのみ走る。サーバ側の描画では遷移しない
	$effect(() => {
		if (decision.kind !== 'redirect') {
			redirectingTo = null;
			return;
		}

		if (decision.returnTo === null) {
			clearReturnTo();
		} else {
			writeReturnTo(decision.returnTo);
		}

		if (redirectingTo === decision.to) {
			return;
		}
		redirectingTo = decision.to;
		// 振り替えを履歴に残さない。残すと戻る操作で振り替え前へ戻り、ふたたび振り替えられる
		void goto(decision.to, { replaceState: true });
	});
</script>

{#if decision.kind === 'allow'}
	{@render children()}
{:else if pending}
	{@render pending()}
{/if}
