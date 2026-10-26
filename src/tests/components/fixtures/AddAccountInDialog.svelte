<script lang="ts">
	import { Dialog } from '@14ch/svelte-ui';
	import AddAccount from '$lib/components/AddAccount.svelte';
	import type { AddAccountProps } from '$lib/models/auth/auth.types';

	let props: AddAccountProps = $props();
	let dialog: ReturnType<typeof Dialog> | undefined = $state();

	// 組み込み側がダイアログの外枠と開閉を持つ形
	$effect(() => {
		dialog?.open();
	});
</script>

<Dialog bind:this={dialog} title="Add account">
	<AddAccount {...props} />
</Dialog>
