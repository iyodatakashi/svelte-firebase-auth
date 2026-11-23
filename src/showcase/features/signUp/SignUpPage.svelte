<script lang="ts">
	import { SignUp } from '#lib/index';
	import { authStore } from '#showcase/stores/auth';
</script>

<svelte:head>
	<title>サインアップ | ショーケース</title>
</svelte:head>

<SignUp store={authStore} />
