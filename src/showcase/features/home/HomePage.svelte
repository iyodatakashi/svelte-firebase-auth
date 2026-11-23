<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input } from '@14ch/svelte-ui';
	import { authStore } from '#showcase/stores/auth';
	import { createNoteStore } from '#showcase/stores/note.svelte';

	/**
	 * 購読の鍵は uid にする。`authStore.user` は同じアカウントのままでも置き換わるため、
	 * それを鍵にすると、アカウントが変わっていないのに購読が張り直される
	 */
	const uid = $derived(authStore.activeAccount?.uid ?? null);
	const noteStore = $derived(uid === null ? null : createNoteStore(uid));

	let draft = $state('');

	$effect(() => {
		draft = '';
		return noteStore?.start();
	});

	const saveNote = async () => {
		if (noteStore === null) {
			return;
		}
		if (await noteStore.save(draft)) {
			draft = '';
		}
	};
</script>

<svelte:head>
	<title>ショーケース</title>
</svelte:head>

<section class="home-page">
	<h2 class="home-page__title">サインイン済み</h2>
	<p class="home-page__email">{authStore.email}</p>
	<p class="home-page__verified">
		メールアドレスの確認: {authStore.isEmailVerified ? '済み' : '未確認'}
	</p>

	<!-- 選択中のアカウントの文書を読み書きする -->
	<div class="home-page__note">
		<p class="home-page__saved">保存したメモ: {noteStore?.note ?? '（なし）'}</p>
		<Input ariaLabel="メモ" placeholder="メモ" fullWidth bind:value={draft} />
		<Button onclick={saveNote}>メモを保存する</Button>
		{#if noteStore?.error}
			<p class="home-page__error" role="alert">{noteStore.error}</p>
		{/if}
	</div>

	<div class="home-page__actions">
		<!-- パスワードの変更は認証の経路ではない。到達の制御は振り替えの対象にしない -->
		<Button variant="filled" onclick={() => goto(resolve('/password-change'))}>
			パスワードを変更する
		</Button>
		<!-- サインアウトの後の遷移は書かない。段階が変わり、到達の制御が動かす -->
		<Button onclick={() => authStore.signOut()}>サインアウト</Button>
	</div>
</section>

<style>
	.home-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		color: var(--svelte-ui-text-color);
	}

	.home-page__title {
		margin: 0;
		font-size: var(--svelte-ui-font-size-xl);
	}

	.home-page p {
		margin: 0;
	}

	.home-page__note {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.home-page__error {
		color: var(--svelte-ui-error-color);
	}

	.home-page__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
