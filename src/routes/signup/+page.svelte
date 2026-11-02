<script lang="ts">
	import { getContext } from 'svelte';
	import { SignUp, type AuthStore } from '$lib/index';

	const store = getContext<AuthStore>('authStore');
</script>

<SignUp {store} />
