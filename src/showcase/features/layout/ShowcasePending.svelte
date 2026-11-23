<script lang="ts">
	import { authStore } from '#showcase/stores/auth';
</script>

{#if authStore.startError}
	<p class="showcase-pending">開始できませんでした。再読み込みしてください。</p>
{:else}
	<p class="showcase-pending">読み込み中…</p>
{/if}

<style>
	.showcase-pending {
		margin: 0;
		color: var(--svelte-ui-text-color);
	}
</style>
