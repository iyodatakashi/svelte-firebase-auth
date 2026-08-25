import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import * as surface from '$lib/index';
import {
	AuthGate,
	PasswordChange,
	PasswordReset,
	SignIn,
	SignUp,
	VerifyEmail,
	createAuthStore,
	type AuthBaseProps,
	type AuthGateProps,
	type AuthRoutes
} from '$lib/index';
import { jaMessages } from '$lib/messages/ja';
import { fakeStore } from './support/fakeStore.svelte';

describe('公開面 — 要件 1.3, 1.5', () => {
	it('単一の入口から、到達の制御・生成関数・5画面を取り出せる', () => {
		expect(AuthGate).toBeDefined();
		expect(createAuthStore).toBeTypeOf('function');
		for (const screen of [SignIn, SignUp, VerifyEmail, PasswordChange, PasswordReset]) {
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
		for (const screen of [SignIn, SignUp, VerifyEmail, PasswordChange, PasswordReset]) {
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
