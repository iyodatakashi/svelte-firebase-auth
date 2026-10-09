<script lang="ts">
	import '@14ch/svelte-ui/styles';
	import { setContext, type Snippet } from 'svelte';
	import { AuthGate, createAuthStore, type AuthConfig } from '$lib/index';
	import { auth } from './firebase';

	let { children }: { children: Snippet } = $props();

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
		}
	};

	const store = createAuthStore(auth, config);
	setContext('authStore', store);

	// 生成と開始を分ける。捨てたストアの購読が生き続けないよう、停止と対で持つ
	$effect(() => {
		store.start();
		return () => store.stop();
	});
</script>

{#snippet pending()}
	<p class="showcase__pending">読み込み中…</p>
{/snippet}

<main class="showcase">
	<!-- 到達の制御はここに1つ置くだけでよい。判定が済むまで子を描画しない -->
	<AuthGate {store} {pending}>
		{@render children()}
	</AuthGate>
</main>

<style>
	.showcase {
		max-width: 26rem;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.showcase__pending {
		margin: 0;
		color: var(--svelte-ui-text-color);
	}
</style>
