<script lang="ts">
	import { getContext } from 'svelte';
	import { SignIn, type AuthStore } from '$lib/index';

	const store = getContext<AuthStore>('authStore');
</script>

{#snippet header()}
	<p class="showcase-signin__brand">ショーケース</p>
{/snippet}

<!-- 導線の遷移も完了時の振る舞いも配線しない。画面と到達の制御が持つ -->
<SignIn {store} {header} />

<style>
	.showcase-signin__brand {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-text-subtle-color);
	}
</style>
