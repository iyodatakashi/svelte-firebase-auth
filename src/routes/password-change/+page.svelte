<script lang="ts">
	import { getContext } from 'svelte';
	import { PasswordChange, type AuthStore } from '$lib/index';

	const store = getContext<AuthStore>('authStore');
</script>

<PasswordChange {store} />
