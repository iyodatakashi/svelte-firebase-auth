<script lang="ts">
	import AddAccount from '$lib/components/AddAccount.svelte';
	import type { AddAccountProps } from '$lib/models/auth/auth.types';

	let props: AddAccountProps = $props();
	let addAccount: ReturnType<typeof AddAccount> | undefined = $state();
	let isSubmitting = $state(false);
</script>

<!-- 組み込み側がダイアログのフッターに送信と取りやめを置く形 -->
<AddAccount
	{...props}
	bind:this={addAccount}
	bind:isSubmitting
	id="add-account-form"
	actions={false}
/>
<footer>
	<button type="button" onclick={() => addAccount?.cancel()}>閉じる</button>
	<button type="submit" form="add-account-form" disabled={isSubmitting}>送る</button>
</footer>
