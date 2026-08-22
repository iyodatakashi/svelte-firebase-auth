<script lang="ts">
	import { getContext } from 'svelte';
	import { Button } from '@14ch/svelte-ui';
	import {
		PasswordChangeScreen,
		PasswordResetScreen,
		SignInScreen,
		SignUpScreen,
		VerifyEmailScreen,
		type AuthStore
	} from '$lib/index';

	const store = getContext<AuthStore>('authStore');

	type ShowcaseScreen =
		'sign-in' | 'sign-up' | 'verify-email' | 'password-change' | 'password-reset' | 'signed-in';

	let screen = $state<ShowcaseScreen>('sign-in');

	// 到達の判断は組み込み側の担当。ライブラリは完了を知らせるだけで、遷移は行わない
	const afterSignedIn = () => {
		screen = store.isEmailVerified ? 'signed-in' : 'verify-email';
	};

	const signOut = async () => {
		await store.signOut();
		screen = 'sign-in';
	};
</script>

{#snippet header()}
	<p class="showcase-page__brand">ショーケース</p>
{/snippet}

{#if !store.isResolved}
	<p class="showcase-page__loading">読み込み中…</p>
{:else if screen === 'sign-in'}
	<SignInScreen
		{store}
		{header}
		onSignedIn={afterSignedIn}
		onRequestPasswordReset={() => (screen = 'password-reset')}
		onRequestSignUp={() => (screen = 'sign-up')}
	/>
{:else if screen === 'sign-up'}
	<SignUpScreen
		{store}
		{header}
		onSignedUp={() => (screen = 'verify-email')}
		onRequestSignIn={() => (screen = 'sign-in')}
		onRequestPasswordReset={() => (screen = 'password-reset')}
	/>
{:else if screen === 'verify-email'}
	<VerifyEmailScreen
		{store}
		{header}
		onVerified={() => (screen = 'signed-in')}
		onSignOut={() => (screen = 'sign-in')}
		onRequestSignUpWithAnotherEmail={() => (screen = 'sign-up')}
	/>
{:else if screen === 'password-change'}
	<PasswordChangeScreen
		{store}
		{header}
		onChanged={() => (screen = 'signed-in')}
		onCancel={() => (screen = 'signed-in')}
	/>
{:else if screen === 'password-reset'}
	<PasswordResetScreen
		{store}
		{header}
		onRequested={() => {}}
		onRequestSignIn={() => (screen = 'sign-in')}
	/>
{:else}
	<section class="showcase-page__signed-in">
		<h2 class="showcase-page__title">サインイン済み</h2>
		<p class="showcase-page__email">{store.email}</p>
		<p class="showcase-page__verified">
			メールアドレスの確認: {store.isEmailVerified ? '済み' : '未確認'}
		</p>
		<div class="showcase-page__actions">
			<Button variant="filled" onclick={() => (screen = 'password-change')}>
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
