<script lang="ts">
	import { VerifyEmail } from '#lib/index';
	import { authStore } from '#showcase/stores/auth';
</script>

<svelte:head>
	<title>メールアドレスの確認 | ショーケース</title>
</svelte:head>

<VerifyEmail store={authStore} />
