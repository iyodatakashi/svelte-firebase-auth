import { describe, expect, it } from 'vitest';
import { enMessages } from '$lib/messages/en';
import { jaMessages } from '$lib/messages/ja';
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

describe('enMessages — 要件 9.4', () => {
	it('語彙のすべてに案内を持つ', () => {
		for (const kind of ALL_KINDS) {
			expect(enMessages.errors[kind]).toBeTruthy();
		}
	});

	it('語彙ごとの案内に Firebase のエラーコードを含めない', () => {
		for (const kind of ALL_KINDS) {
			expect(enMessages.errors[kind]).not.toContain('auth/');
		}
	});

	it('訳し漏れを残さない。日本語の文字を含まない', () => {
		const {
			errors,
			verifyEmailSentTo,
			weakPasswordReason,
			signOutAccountLabel,
			selectFailed,
			signOutFailed,
			...rest
		} = enMessages;
		const texts = [
			...Object.values(rest),
			...Object.values(errors),
			verifyEmailSentTo('a@example.com'),
			weakPasswordReason([]),
			weakPasswordReason(['min-length', 'uppercase']),
			signOutAccountLabel('a@example.com'),
			selectFailed('a@example.com', 'reason.'),
			signOutFailed('a@example.com', 'reason.')
		];
		for (const text of texts) {
			expect(text).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
		}
	});
});

describe('enMessages の追加と選択の文言 — 要件 7.4（multi-account-auth）', () => {
	it('日本語と同じ項目をすべて持つ', () => {
		expect(Object.keys(enMessages).sort()).toEqual(Object.keys(jaMessages).sort());
	});

	it('対象のアカウントが分かる案内を作る', () => {
		expect(enMessages.signOutFailed('a@example.com', 'Try again.')).toContain('a@example.com');
		expect(enMessages.selectFailed('a@example.com', 'Try again.')).toContain('a@example.com');
		expect(enMessages.signOutAccountLabel('a@example.com')).toContain('a@example.com');
	});
});
