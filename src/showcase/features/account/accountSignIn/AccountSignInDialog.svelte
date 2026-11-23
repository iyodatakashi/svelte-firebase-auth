<script lang="ts">
	import { Dialog } from '@14ch/svelte-ui';
	import { SignIn } from '#lib/index';
	import { authStore } from '#showcase/stores/auth';

	let { onGoToSignUp }: { onGoToSignUp: () => void } = $props();

	let dialog: ReturnType<typeof Dialog> | undefined = $state();
	let form: ReturnType<typeof SignIn> | undefined = $state();

	export const open = () => dialog?.open();
</script>

<Dialog
	bind:this={dialog}
	title="別のアカウントにログイン"
	ariaLabel="別のアカウントにログイン"
	onClose={() => form?.cancel()}
>
	<!-- サインイン画面をそのまま置く。登録の導線は、ページを移らずに登録のダイアログを開く -->
	<SignIn
		store={authStore}
		bind:this={form}
		onCompleted={() => dialog?.close()}
		onGoToSignUp={() => {
			dialog?.close();
			onGoToSignUp();
		}}
	/>
</Dialog>
