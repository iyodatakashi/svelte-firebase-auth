import { describe, expect, it } from 'vitest';
import type { AuthErrorKind } from '#lib/models/auth/auth.types';
import { enMessages, jaMessages } from '#lib/models/messages/messages.constants';

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

describe('jaMessages のアカウントの操作の文言 — 要件 7.4（multi-account-auth）', () => {
	it('上限・処理中・ログイン状態の喪失の文言を持つ', () => {
		for (const text of [
			jaMessages.accountLimitReached,
			jaMessages.operationBusy,
			jaMessages.accountUnavailable
		]) {
			expect(text).toBeTruthy();
		}
	});
});

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

describe('enMessages の追加と選択の文言 — 要件 7.4（multi-account-auth）', () => {
	it('日本語と同じ項目をすべて持つ', () => {
		expect(Object.keys(enMessages).sort()).toEqual(Object.keys(jaMessages).sort());
	});
});
