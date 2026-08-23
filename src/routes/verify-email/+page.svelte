<script lang="ts">
	import { getContext } from 'svelte';
	import { VerifyEmail, type AuthStore } from '$lib/index';

	const store = getContext<AuthStore>('authStore');
</script>

<VerifyEmail {store} />
