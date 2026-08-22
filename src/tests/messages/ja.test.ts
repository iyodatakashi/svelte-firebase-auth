import { describe, expect, it } from 'vitest';
import { jaMessages, resolveMessages } from '$lib/messages/ja';
import type { AuthErrorKind } from '$lib/models/auth/auth.types';

const ALL_KINDS: readonly AuthErrorKind[] = [
	'invalid-credential',
	'invalid-email',
	'email-already-in-use',
	'weak-password',
	'requires-recent-login',
	'user-disabled',
	'too-many-requests',
	'registration-disabled',
	'network-error',
	'unknown'
];

describe('jaMessages — 要件 9.4', () => {
	it('語彙のすべてに既定の案内を持つ', () => {
		for (const kind of ALL_KINDS) {
			expect(jaMessages.errors[kind]).toBeTruthy();
		}
	});

	it('語彙ごとの案内に Firebase のエラーコードを含めない', () => {
		for (const kind of ALL_KINDS) {
			expect(jaMessages.errors[kind]).not.toContain('auth/');
		}
	});
});

describe('resolveMessages — 要件 9.5', () => {
	it('何も指定しなければ既定をそのまま返す', () => {
		expect(resolveMessages()).toEqual(jaMessages);
	});

	it('指定された項目だけを差し替える', () => {
		const messages = resolveMessages({ signInSubmit: 'ログイン' });
		expect(messages.signInSubmit).toBe('ログイン');
		expect(messages.emailLabel).toBe(jaMessages.emailLabel);
	});

	it('errors は語彙単位で差し替え、指定のない語彙は既定を残す', () => {
		const messages = resolveMessages({ errors: { 'network-error': '通信できません' } });
		expect(messages.errors['network-error']).toBe('通信できません');
		expect(messages.errors.unknown).toBe(jaMessages.errors.unknown);
	});

	it('値を差し込む文言も差し替えられる', () => {
		const messages = resolveMessages({ verifyEmailSentTo: (email) => `sent to ${email}` });
		expect(messages.verifyEmailSentTo('a@example.com')).toBe('sent to a@example.com');
	});

	it('undefined を渡した項目は既定を残す', () => {
		const messages = resolveMessages({ signInSubmit: undefined });
		expect(messages.signInSubmit).toBe(jaMessages.signInSubmit);
	});

	it('既定を書き換えない', () => {
		const before = jaMessages.errors['network-error'];
		resolveMessages({ errors: { 'network-error': '通信できません' } });
		expect(jaMessages.errors['network-error']).toBe(before);
	});
});
