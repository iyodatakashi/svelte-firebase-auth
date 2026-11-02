<script lang="ts">
	import PasswordReset from '$lib/components/PasswordReset.svelte';
	import type { PasswordResetProps } from '$lib/models/auth/auth.types';

	let props: PasswordResetProps = $props();
	let isSubmitting = $state(false);
	let isBlocked = $state(false);
</script>

<!-- 組み込み側がダイアログのフッターに送信を置く形 -->
<PasswordReset
	{...props}
	bind:isSubmitting
	bind:isBlocked
	id="password-reset-form"
	actions={false}
/>
<footer>
	<span data-testid="state"
		>{isSubmitting ? 'submitting' : 'idle'}/{isBlocked ? 'blocked' : 'open'}</span
	>
	<button type="submit" form="password-reset-form" disabled={isSubmitting || isBlocked}>送る</button
	>
</footer>
