<script lang="ts">
	import { getContext } from 'svelte';
	import { PasswordReset, type AuthStore } from '$lib/index';

	const store = getContext<AuthStore>('authStore');
</script>

<PasswordReset {store} />
