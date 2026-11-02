import { describe, expect, it } from 'vitest';
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
