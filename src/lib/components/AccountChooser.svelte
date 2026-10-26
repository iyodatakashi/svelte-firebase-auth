<script lang="ts">
	import { Button } from '@14ch/svelte-ui';
	import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
	import { resolveMessages } from '$lib/messages/resolveMessages';
	import type {
		AccountChooserProps,
		AccountOperationError,
		AccountSummary
	} from '$lib/models/auth/auth.types';

	let { store, messages: overrides, onAddRequested }: AccountChooserProps = $props();

	const messages = $derived(resolveMessages(overrides));

	/** 失敗したアカウントごとの案内。成功すれば消し、失敗分だけを再試行させる */
	let failures = $state<Record<string, string>>({});

	// 実行中の追加・切り替え・ログアウトがあれば、競合する入力を止める
	const isBusy = $derived(store.operation !== null);

	const labelOf = (account: AccountSummary): string => account.email ?? account.uid;

	const reasonOf = (error: AccountOperationError): string =>
		accountErrorMessageOf(error, messages, 'sign-in');

	const settle = (id: string, failure: string | null) => {
		const next = { ...failures };
		delete next[id];
		if (failure !== null) {
			next[id] = failure;
		}
		failures = next;
	};

	const select = async (account: AccountSummary) => {
		if (account.id === store.activeId) {
			return;
		}
		const result = await store.selectAccount(account.id);
		settle(
			account.id,
			result.ok ? null : messages.selectFailed(labelOf(account), reasonOf(result.error))
		);
	};

	const signOutOf = async (account: AccountSummary) => {
		const result = await store.signOutAccount(account.id);
		settle(
			account.id,
			result.ok ? null : messages.signOutFailed(labelOf(account), reasonOf(result.error))
		);
	};

	const signOutAll = async () => {
		// 実行前の一覧から名前を引く。成功した分は一覧から消える
		const labels = new Map(store.accounts.map((account) => [account.id, labelOf(account)]));
		const result = await store.signOutAll();
		if (result.ok) {
			failures = {};
			return;
		}
		if (result.reason === 'busy') {
			return;
		}
		failures = Object.fromEntries(
			result.failed.map(({ id, error }) => [
				id,
				messages.signOutFailed(labels.get(id) ?? id, reasonOf(error))
			])
		);
	};
</script>

<section class="account-chooser">
	{#if store.storageStatus === 'unavailable'}
		<p class="account-chooser__storage" role="status">{messages.storageUnavailable}</p>
	{/if}

	{#if store.accounts.length === 0}
		<p class="account-chooser__empty">{messages.noAccounts}</p>
	{:else}
		<ul class="account-chooser__list" aria-label={messages.accountListLabel}>
			{#each store.accounts as account (account.id)}
				{@const isActive = account.id === store.activeId}
				<li class="account-chooser__item">
					<!-- 選択中は色だけでなく、文字と aria-current でも伝える -->
					<Button
						fullWidth
						align="left"
						aria-current={isActive ? 'true' : undefined}
						onclick={() => select(account)}
						disabled={isBusy}
					>
						<span class="account-chooser__email">{labelOf(account)}</span>
						{#if isActive}
							<span class="account-chooser__active">{messages.accountActive}</span>
						{/if}
					</Button>
					<Button
						ariaLabel={messages.signOutAccountLabel(labelOf(account))}
						onclick={() => signOutOf(account)}
						disabled={isBusy}
					>
						{messages.signOut}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if Object.keys(failures).length > 0}
		<div class="account-chooser__failures" role="alert">
			{#each Object.entries(failures) as [id, failure] (id)}
				<p class="account-chooser__error">{failure}</p>
			{/each}
		</div>
	{/if}

	<div class="account-chooser__actions">
		<Button fullWidth onclick={() => onAddRequested?.()} disabled={isBusy}>
			{messages.addAccount}
		</Button>
		{#if store.accounts.length > 0}
			<Button fullWidth onclick={signOutAll} disabled={isBusy}>
				{messages.signOutAll}
			</Button>
		{/if}
	</div>
</section>

<style>
	/*
		余白は2つだけ持つ。ブロック間の --auth-block-gap と、ブロック内の --auth-inner-gap。
		いずれも継承するため、組み込み側は包む要素に1度書けば全画面に効く
	*/
	.account-chooser {
		display: flex;
		flex-direction: column;
		gap: var(--auth-block-gap, 32px);
		color: var(--svelte-ui-text-color);
	}

	.account-chooser p {
		margin: 0;
	}

	.account-chooser__list {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.account-chooser__item {
		display: flex;
		align-items: center;
		gap: var(--auth-inner-gap, 16px);
	}

	.account-chooser__email {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.account-chooser__active {
		margin-left: auto;
		padding-left: var(--auth-inner-gap, 16px);
		color: var(--svelte-ui-primary-color);
	}

	.account-chooser__failures {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}

	.account-chooser__error {
		color: var(--svelte-ui-error-color);
	}

	.account-chooser__actions {
		display: flex;
		flex-direction: column;
		gap: var(--auth-inner-gap, 16px);
	}
</style>
