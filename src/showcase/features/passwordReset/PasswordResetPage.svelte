<script lang="ts">
	import { PasswordReset } from '#lib/index';
	import { authStore } from '#showcase/stores/auth';
</script>

<svelte:head>
	<title>パスワードの再設定 | ショーケース</title>
</svelte:head>

<PasswordReset store={authStore} />
