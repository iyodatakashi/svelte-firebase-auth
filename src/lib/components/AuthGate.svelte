<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolveAuthGuard } from '$lib/models/auth/authGuard';
	import type { AuthGateProps } from '$lib/models/auth/auth.types';

	let { store, children, pending }: AuthGateProps = $props();

	/**
	 * サインインの後に戻る経路の保持。タブ単位で、再読み込みと経路の移動を跨いで保つ。
	 * 保持するのは経路だけであり、認証の状態は持たない
	 */
	const RETURN_TO_KEY = 'svelte-firebase-auth:return-to';

	/** 保持先が使えない環境でも機能を止めない。戻り先を持たない状態として振る舞う */
	const withStorage = <T,>(use: (storage: Storage) => T): T | null => {
		try {
			return use(sessionStorage);
		} catch {
			return null;
		}
	};

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
			returnTo: withStorage((storage) => storage.getItem(RETURN_TO_KEY))
		})
	);

	// 効果はブラウザでのみ走る。サーバ側の描画では遷移しない
	$effect(() => {
		if (decision.kind !== 'redirect') {
			redirectingTo = null;
			return;
		}

		// 受け入れられる形かは判定が済ませている。ここは保持するだけ
		const returnTo = decision.returnTo;
		if (returnTo === null) {
			withStorage((storage) => storage.removeItem(RETURN_TO_KEY));
		} else {
			withStorage((storage) => storage.setItem(RETURN_TO_KEY, returnTo));
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
