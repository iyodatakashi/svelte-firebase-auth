<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { parseHeldReturnTo, resolveAuthGuard } from '$lib/models/auth/authGuard';
	import type { AuthGateProps, ShownRoute } from '$lib/models/auth/auth.types';

	let { store, children, pending }: AuthGateProps = $props();

	/**
	 * サインインの後に戻る経路の保持。タブ単位で、再読み込みと経路の移動を跨いで保つ。
	 * 保持するのは経路と、その持ち主のアカウントの uid だけであり、認証の状態は持たない
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

	const parseJson = (value: string | null): unknown => {
		if (value === null) {
			return null;
		}
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	};

	/**
	 * 実行中の振り替え先。**遷移は非同期であり、完了前に段階が変わると二重に走る**。
	 * 追随の対象にしない（効果の中だけで読み書きする）
	 */
	let redirectingTo: string | null = null;

	/**
	 * 最後に内容を見せた経路と、そのときのアカウント。使用中のアカウントが離れたときに
	 * 開いていた経路を、そのアカウントの戻り先として保持するために使う。
	 * メモリだけに持つ。再読み込みの後に開いた経路は、アカウントを使っていない状態で開いたものとする
	 */
	let lastShown: ShownRoute | null = null;

	const currentPath = $derived(`${page.url.pathname}${page.url.search}`);

	// 段階・使用中のアカウント・現在の経路を読む。どれが変わっても判定し直す
	const decision = $derived(
		resolveAuthGuard({
			stage: store.stage,
			currentPath,
			routes: store.routes,
			returnTo: withStorage((storage) =>
				parseHeldReturnTo(parseJson(storage.getItem(RETURN_TO_KEY)))
			),
			accountUid: store.activeAccount?.uid ?? null,
			accountUids: store.accounts.map((account) => account.uid),
			lastShown
		})
	);

	// 効果はブラウザでのみ走る。サーバ側の描画では遷移しない
	$effect(() => {
		if (decision.kind !== 'redirect' && decision.kind !== 'select') {
			redirectingTo = null;
			// 内容を見せたときだけ記録する。判定待ちの間に消すと、離れたアカウントが分からなくなる
			if (decision.kind === 'allow') {
				const uid = store.activeAccount?.uid;
				lastShown = uid === undefined ? null : { path: currentPath, uid };
			}
			return;
		}

		// 受け入れられる形かは判定が済ませている。ここは保持するだけ
		const returnTo = decision.returnTo;
		if (returnTo === null) {
			withStorage((storage) => storage.removeItem(RETURN_TO_KEY));
		} else {
			withStorage((storage) => storage.setItem(RETURN_TO_KEY, JSON.stringify(returnTo)));
		}

		// 選択待ちでは遷移しない。組み込み側がガードの外に置いた選択 UI からアカウントが選ばれるのを待つ
		if (decision.kind === 'select') {
			redirectingTo = null;
			return;
		}
		if (redirectingTo === decision.to) {
			return;
		}
		redirectingTo = decision.to;
		// 振り替えを履歴に残さない。残すと戻る操作で振り替え前へ戻り、ふたたび振り替えられる
		void goto(decision.to, { replaceState: true });
	});
</script>

<!-- 選択待ちでは判定待ちの表示も出さない。選択 UI を妨げない -->
{#if decision.kind === 'allow'}
	{@render children()}
{:else if decision.kind !== 'select' && pending}
	{@render pending()}
{/if}
