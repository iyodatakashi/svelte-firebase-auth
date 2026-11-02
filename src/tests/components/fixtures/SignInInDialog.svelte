<script lang="ts">
	import SignIn from '$lib/components/SignIn.svelte';
	import type { SignInProps } from '$lib/models/auth/auth.types';

	let props: SignInProps = $props();
	let signIn: ReturnType<typeof SignIn> | undefined = $state();
</script>

<!-- 組み込み側がダイアログに置き、閉じたら送信中の試行を無効にする形 -->
<SignIn {...props} bind:this={signIn} />
<button type="button" onclick={() => signIn?.cancel()}>閉じる</button>
