import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Component } from 'svelte';
import * as surface from '$lib/index';
import {
	AuthGate,
	AuthSession,
	accountErrorMessageOf,
	PasswordChange,
	PasswordReset,
	SignIn,
	SignUp,
	VerifyEmail,
	createAuthStore,
	type AccountFailure,
	type AccountOperation,
	type AccountOperationError,
	type AccountResult,
	type AccountSummary,
	type SignInProps,
	type AuthBaseProps,
	type AuthGateProps,
	type AuthRoutes,
	type AuthSessionProps,
	type SignOutAllResult,
	type StorageStatus
} from '$lib/index';
import { jaMessages } from '$lib/messages/ja';
import { fakeStore } from './support/fakeStore.svelte';

describe('公開面 — 要件 1.3, 1.5', () => {
	it('単一の入口から、到達の制御・生成関数・5画面を取り出せる', () => {
		expect(AuthGate).toBeDefined();
		expect(createAuthStore).toBeTypeOf('function');
		const screens: Component<AuthBaseProps>[] = [
			SignIn,
			SignUp,
			VerifyEmail,
			PasswordChange,
			PasswordReset
		];
		for (const screen of screens) {
			expect(screen).toBeDefined();
		}
	});

	it('取り出した画面を、公開されている型の props だけで配置できる', async () => {
		const { store } = fakeStore();
		const props: AuthBaseProps = { store };
		const screen = await render(SignIn, { props });

		await expect
			.element(screen.getByRole('button', { name: jaMessages.signInSubmit }))
			.toBeInTheDocument();
	});

	it('各画面は題字などのページの要素を持たない。置く側が決めるため', async () => {
		const screens: Component<AuthBaseProps>[] = [
			SignIn,
			SignUp,
			VerifyEmail,
			PasswordChange,
			PasswordReset
		];
		for (const screen of screens) {
			const { store } = fakeStore();
			const rendered = await render(screen, { props: { store } });

			expect(rendered.container.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
			await rendered.unmount();
		}
	});

	it('判定の純関数は公開しない。到達の制御の内部実装であるため', () => {
		expect(surface).not.toHaveProperty('resolveAuthGuard');
		expect(surface).not.toHaveProperty('matchesRoute');
	});

	it('公開する値に対応する型を、公開面から書ける', () => {
		const routes: AuthRoutes = {
			signIn: '/signin',
			signUp: '/signup',
			verifyEmail: '/verify-email',
			passwordReset: '/password-reset',
			afterSignIn: '/'
		};
		const gateProps: Pick<AuthGateProps, 'store'> = { store: fakeStore({ routes }).store };

		expect(gateProps.store.routes).toEqual(routes);
	});
});

describe('複数アカウントの公開面 — 要件 7.2, 7.9（multi-account-auth）', () => {
	it('ブラウザ保存の部品を、同じ入口から取り出せる', () => {
		for (const component of [AuthSession]) {
			expect(component).toBeDefined();
		}
		expect(accountErrorMessageOf).toBeTypeOf('function');
	});

	it('スロット単位の内部のストアと、照合の純関数は公開しない', () => {
		for (const name of [
			'createSlotStore',
			'parseStoredSlot',
			'reconcileSlots',
			'representativeOf',
			'latestSignedIn'
		]) {
			expect(surface).not.toHaveProperty(name);
		}
	});

	it('組み込み側が独自のメニューを書くための型を、公開面から書ける', () => {
		const account: AccountSummary = {
			id: 'a',
			uid: 'uid-a',
			email: 'a@example.com',
			isEmailVerified: true
		};
		const error: AccountOperationError = { kind: 'busy' };
		const failure: AccountFailure = { id: account.id, error };
		const result: AccountResult<AccountSummary> = { ok: true, value: account };
		const all: SignOutAllResult = {
			ok: false,
			reason: 'partial',
			signedOutIds: [],
			failed: [failure]
		};
		const operation: AccountOperation = { kind: 'select', id: account.id };
		const status: StorageStatus = 'available';
		const { store } = fakeStore();
		const props: [AuthSessionProps, SignInProps] = [
			{ store, namespace: 'app' },
			{ store, onGoToSignUp: () => {} }
		];

		expect([result.ok, all.ok, operation.kind, status, props.length]).toEqual([
			true,
			false,
			'select',
			'available',
			2
		]);
	});
});
