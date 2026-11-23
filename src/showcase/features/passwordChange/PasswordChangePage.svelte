<script lang="ts">
	import { PasswordChange } from '#lib/index';
	import { authStore } from '#showcase/stores/auth';
</script>

<svelte:head>
	<title>パスワードの変更 | ショーケース</title>
</svelte:head>

<PasswordChange store={authStore} />
