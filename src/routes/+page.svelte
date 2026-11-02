<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input } from '@14ch/svelte-ui';
	import { doc, onSnapshot, setDoc } from 'firebase/firestore';
	import type { AuthStore } from '$lib/index';
	import { firestore } from './firebase';

	const store = getContext<AuthStore>('authStore');

	/**
	 * 購読の鍵は uid にする。`store.user` は同じアカウントのままでも置き換わるため、
	 * それを鍵にすると、アカウントが変わっていないのに購読が張り直される
	 */
	const uid = $derived(store.activeAccount?.uid ?? null);

	let note = $state<string | null>(null);
	let draft = $state('');
	let noteError = $state<string | null>(null);

	// 土台の App の Firestore は、作り直さずに選択中のアカウントの認証で動く。
	// ただし切り替え元で張った購読と表示は残るため、組み込み側が張り直して破棄する
	$effect(() => {
		const current = uid;
		note = null;
		draft = '';
		noteError = null;
		if (current === null) {
			return;
		}
		return onSnapshot(
			doc(firestore, 'users', current),
			(snapshot) => {
				note = snapshot.get('note') ?? null;
			},
			(error) => {
				noteError = error.message;
			}
		);
	});

	const saveNote = async () => {
		if (uid === null) {
			return;
		}
		try {
			await setDoc(doc(firestore, 'users', uid), { note: draft });
			draft = '';
		} catch (error) {
			noteError = error instanceof Error ? error.message : String(error);
		}
	};
</script>

<section class="showcase-home">
	<h2 class="showcase-home__title">サインイン済み</h2>
	<p class="showcase-home__email">{store.email}</p>
	<p class="showcase-home__verified">
		メールアドレスの確認: {store.isEmailVerified ? '済み' : '未確認'}
	</p>

	<!-- 選択中のアカウントの文書を読み書きする。セキュリティルールは自分の文書だけを許す -->
	<div class="showcase-home__note">
		<p class="showcase-home__saved">保存したメモ: {note ?? '（なし）'}</p>
		<Input ariaLabel="メモ" placeholder="メモ" fullWidth bind:value={draft} />
		<Button onclick={saveNote}>メモを保存する</Button>
		{#if noteError}
			<p class="showcase-home__error" role="alert">{noteError}</p>
		{/if}
	</div>

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

	.showcase-home p {
		margin: 0;
	}

	.showcase-home__note {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.showcase-home__error {
		color: var(--svelte-ui-error-color);
	}

	.showcase-home__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
