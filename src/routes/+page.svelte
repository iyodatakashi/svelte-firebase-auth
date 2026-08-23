<script lang="ts">
	import { getContext } from 'svelte';
	import { Button } from '@14ch/svelte-ui';
	import {
		PasswordChange,
		PasswordReset,
		SignIn,
		SignUp,
		VerifyEmail,
		type AuthStore
	} from '$lib/index';

	const store = getContext<AuthStore>('authStore');

	/** サインインしていない利用者に見せるもの */
	type PublicView = 'sign-in' | 'sign-up' | 'password-reset';
	/** 確認を通り抜けた利用者に見せるもの */
	type PrivateView = 'signed-in' | 'password-change';

	let publicView = $state<PublicView>('sign-in');
	let privateView = $state<PrivateView>('signed-in');

	/**
	 * 段階の判定は `store.stage` が持つ。組み込み側に残るのは、その段階で何をするかだけ。
	 *
	 * **状態から導く。** コールバックで一度だけ切り替える形にすると、既にサインイン済みで
	 * 開き直した利用者が素通りし、ガードとして働かない
	 */
	const view = $derived.by(() => {
		switch (store.stage) {
			case 'unresolved':
				return 'loading';
			case 'signed-out':
				return publicView;
			case 'email-unverified':
				return 'verify-email';
			case 'ready':
				return privateView;
		}
	});

	const signOut = async () => {
		await store.signOut();
		publicView = 'sign-in';
	};
</script>

{#snippet header()}
	<p class="showcase-page__brand">ショーケース</p>
{/snippet}

{#if view === 'loading'}
	<p class="showcase-page__loading">読み込み中…</p>
{:else if view === 'sign-in'}
	<SignIn
		{store}
		{header}
		onSignedIn={() => (privateView = 'signed-in')}
		onRequestPasswordReset={() => (publicView = 'password-reset')}
		onRequestSignUp={() => (publicView = 'sign-up')}
	/>
{:else if view === 'sign-up'}
	<SignUp
		{store}
		{header}
		onSignedUp={() => (privateView = 'signed-in')}
		onRequestSignIn={() => (publicView = 'sign-in')}
		onRequestPasswordReset={() => (publicView = 'password-reset')}
	/>
{:else if view === 'verify-email'}
	<VerifyEmail
		{store}
		{header}
		onVerified={() => (privateView = 'signed-in')}
		onSignOut={() => (publicView = 'sign-in')}
		onRequestSignUpWithAnotherEmail={() => (publicView = 'sign-up')}
	/>
{:else if view === 'password-change'}
	<PasswordChange
		{store}
		{header}
		onChanged={() => (privateView = 'signed-in')}
		onCancel={() => (privateView = 'signed-in')}
	/>
{:else if view === 'password-reset'}
	<PasswordReset
		{store}
		{header}
		onRequested={() => {}}
		onRequestSignIn={() => (publicView = 'sign-in')}
	/>
{:else}
	<section class="showcase-page__signed-in">
		<h2 class="showcase-page__title">サインイン済み</h2>
		<p class="showcase-page__email">{store.email}</p>
		<p class="showcase-page__verified">
			メールアドレスの確認: {store.isEmailVerified ? '済み' : '未確認'}
		</p>
		<div class="showcase-page__actions">
			<Button variant="filled" onclick={() => (privateView = 'password-change')}>
				パスワードを変更する
			</Button>
			<Button onclick={signOut}>サインアウト</Button>
		</div>
	</section>
{/if}

<style>
	.showcase-page__brand {
		margin: 0;
		font-size: var(--svelte-ui-font-size-sm);
		color: var(--svelte-ui-text-subtle-color);
	}

	.showcase-page__signed-in {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		color: var(--svelte-ui-text-color);
	}

	.showcase-page__title {
		margin: 0;
		font-size: var(--svelte-ui-font-size-xl);
	}

	.showcase-page__email,
	.showcase-page__verified,
	.showcase-page__loading {
		margin: 0;
	}

	.showcase-page__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
