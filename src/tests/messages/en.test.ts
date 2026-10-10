import { describe, expect, it } from 'vitest';
import { enMessages } from '$lib/messages/en';
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
		const { errors, verifyEmailSentTo, weakPasswordReason, ...rest } = enMessages;
		const texts = [
			...Object.values(rest),
			...Object.values(errors),
			verifyEmailSentTo('a@example.com'),
			weakPasswordReason([]),
			weakPasswordReason(['min-length', 'uppercase'])
		];
		for (const text of texts) {
			expect(text).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
		}
	});
});
