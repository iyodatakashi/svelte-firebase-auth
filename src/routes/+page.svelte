<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '@14ch/svelte-ui';
	import type { AuthStore } from '$lib/index';

	const store = getContext<AuthStore>('authStore');
</script>

<section class="showcase-home">
	<h2 class="showcase-home__title">サインイン済み</h2>
	<p class="showcase-home__email">{store.email}</p>
	<p class="showcase-home__verified">
		メールアドレスの確認: {store.isEmailVerified ? '済み' : '未確認'}
	</p>
	<div class="showcase-home__actions">
		<!-- パスワードの変更は認証の経路ではない。到達の制御は振り替えの対象にしない -->
		<Button variant="filled" onclick={() => goto(resolve('/password-change'))}
			>パスワードを変更する</Button
		>
		<!-- サインアウトの後の遷移は書かない。段階が変わり、到達の制御が動かす -->
		<Button onclick={() => store.signOut()}>サインアウト</Button>
	</div>
</section>

<style>
	.showcase-home {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		color: var(--svelte-ui-text-color);
	}

	.showcase-home__title {
		margin: 0;
		font-size: var(--svelte-ui-font-size-xl);
	}

	.showcase-home__email,
	.showcase-home__verified {
		margin: 0;
	}

	.showcase-home__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
