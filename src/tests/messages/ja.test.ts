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

describe('jaMessages の追加と選択の文言 — 要件 5.7, 7.4（multi-account-auth）', () => {
	it('追加・選択・ログアウト・保存不能・上限・処理中の文言を持つ', () => {
		for (const text of [
			jaMessages.accountListLabel,
			jaMessages.accountActive,
			jaMessages.addAccount,
			jaMessages.signOutAll,
			jaMessages.noAccounts,
			jaMessages.storageUnavailable,
			jaMessages.accountLimitReached,
			jaMessages.operationBusy,
			jaMessages.accountUnavailable
		]) {
			expect(text).toBeTruthy();
		}
	});

	it('対象のアカウントが分かる案内を作る', () => {
		expect(jaMessages.signOutFailed('a@example.com', '理由。')).toContain('a@example.com');
		expect(jaMessages.selectFailed('a@example.com', '理由。')).toContain('a@example.com');
		expect(jaMessages.signOutAccountLabel('a@example.com')).toContain('a@example.com');
	});

	it('ログアウトをアカウントの削除として表さない', () => {
		const texts = [
			jaMessages.signOut,
			jaMessages.signOutAll,
			jaMessages.signOutAccountLabel('a@example.com'),
			jaMessages.signOutFailed('a@example.com', '')
		];
		for (const text of texts) {
			expect(text).not.toMatch(/削除/);
		}
	});
});
