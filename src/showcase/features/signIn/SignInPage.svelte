<script lang="ts">
	import { SignIn } from '#lib/index';
	import { authStore } from '#showcase/stores/auth';
</script>

<svelte:head>
	<title>サインイン | ショーケース</title>
</svelte:head>

<!-- 題字と名乗りは、画面を置く側が決める。ライブラリの画面は持たない -->
<h1 class="sign-in-page__brand">ショーケース</h1>

<!-- 導線の遷移も完了時の振る舞いも配線しない。画面と到達の制御が持つ -->
<SignIn store={authStore} />

<style>
	.sign-in-page__brand {
		margin: 0 0 1.5rem;
		font-size: var(--svelte-ui-font-size-xl);
		color: var(--svelte-ui-text-color);
	}
</style>
