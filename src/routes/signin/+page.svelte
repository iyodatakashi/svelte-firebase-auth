<script lang="ts">
	import { getContext } from 'svelte';
	import { SignIn, type AuthStore } from '$lib/index';

	const store = getContext<AuthStore>('authStore');
</script>

<!-- 題字と名乗りは、画面を置く側が決める。ライブラリの画面は持たない -->
<h1 class="showcase-signin__brand">ショーケース</h1>

<!-- 導線の遷移も完了時の振る舞いも配線しない。画面と到達の制御が持つ -->
<SignIn {store} />

<style>
	.showcase-signin__brand {
		margin: 0 0 1.5rem;
		font-size: var(--svelte-ui-font-size-xl);
		color: var(--svelte-ui-text-color);
	}
</style>
