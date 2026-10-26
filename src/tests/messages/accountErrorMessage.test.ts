import { describe, expect, it } from 'vitest';
import { accountErrorMessageOf } from '$lib/messages/accountErrorMessage';
import { jaMessages } from '$lib/messages/ja';

describe('accountErrorMessageOf — 要件 2.4, 5.6, 7.11, 7.19（multi-account-auth）', () => {
	it('認証の失敗は、既存の語彙の案内へ写す', () => {
		expect(
			accountErrorMessageOf(
				{
					kind: 'auth',
					cause: { kind: 'invalid-credential', detail: '', unmetPasswordRequirements: [] }
				},
				jaMessages,
				'sign-in'
			)
		).toBe(jaMessages.errors['invalid-credential']);
	});

	it('処理中・上限・ログイン状態の喪失を、それぞれの案内へ写す', () => {
		expect(accountErrorMessageOf({ kind: 'busy' }, jaMessages, 'sign-in')).toBe(
			jaMessages.operationBusy
		);
		expect(accountErrorMessageOf({ kind: 'limit-reached' }, jaMessages, 'sign-in')).toBe(
			jaMessages.accountLimitReached
		);
		expect(accountErrorMessageOf({ kind: 'not-signed-in' }, jaMessages, 'sign-in')).toBe(
			jaMessages.accountUnavailable
		);
		expect(accountErrorMessageOf({ kind: 'not-found' }, jaMessages, 'sign-in')).toBe(
			jaMessages.accountUnavailable
		);
	});

	it('内部の準備の失敗は、詳細を見せず汎用の案内にする', () => {
		expect(
			accountErrorMessageOf({ kind: 'initialization', detail: 'internal' }, jaMessages, 'sign-in')
		).toBe(jaMessages.errors.unknown);
	});
});
