<script lang="ts">
	import SignUp from '$lib/components/SignUp.svelte';
	import type { SignUpProps } from '$lib/models/auth/auth.types';

	let props: SignUpProps = $props();
	let signUp: ReturnType<typeof SignUp> | undefined = $state();
	let isSubmitting = $state(false);
</script>

<!-- 組み込み側がダイアログのフッターに送信と取りやめを置く形 -->
<SignUp {...props} bind:this={signUp} bind:isSubmitting id="sign-up-form" actions={false} />
<footer>
	<button type="button" onclick={() => signUp?.cancel()}>閉じる</button>
	<button type="submit" form="sign-up-form" disabled={isSubmitting}>送る</button>
</footer>
