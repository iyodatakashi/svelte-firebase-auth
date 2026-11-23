<script lang="ts">
	import { Button, Dialog } from '@14ch/svelte-ui';
	import { SignUp } from '#lib/index';
	import { authStore } from '#showcase/stores/auth';

	let dialog: ReturnType<typeof Dialog> | undefined = $state();
	let form: ReturnType<typeof SignUp> | undefined = $state();
	let isSubmitting = $state(false);

	export const open = () => dialog?.open();
</script>

<!-- 登録の画面をダイアログに置き、送信と取りやめをフッターに出す。閉じたら送信中の試行を無効にする -->
<Dialog
	bind:this={dialog}
	title="新しいアカウントを登録"
	ariaLabel="新しいアカウントを登録"
	onClose={() => form?.cancel()}
>
	<SignUp
		store={authStore}
		bind:this={form}
		bind:isSubmitting
		id="account-sign-up-dialog-form"
		actions={false}
		onCompleted={() => dialog?.close()}
	/>
	{#snippet footer()}
		<Button onclick={() => dialog?.close()}>キャンセル</Button>
		<Button
			type="submit"
			form="account-sign-up-dialog-form"
			variant="filled"
			loading={isSubmitting}
			disabled={isSubmitting}
		>
			登録する
		</Button>
	{/snippet}
</Dialog>
