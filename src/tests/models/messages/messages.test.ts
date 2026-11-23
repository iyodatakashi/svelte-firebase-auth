import { describe, expect, it } from 'vitest';
import type { AuthError, AuthErrorKind } from '#lib/models/auth/auth.types';
import { enMessages, jaMessages } from '#lib/models/messages/messages.constants';
import {
	accountErrorMessageOf,
	authErrorMessageOf,
	resolveMessages
} from '#lib/models/messages/messages';
import type { AuthErrorContext } from '#lib/models/messages/messages.types';

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

const ALL_CONTEXTS: readonly AuthErrorContext[] = [
	'sign-in',
	'sign-up',
	'verify-email',
	'password-change',
	'password-reset'
];

const errorOf = (
	kind: AuthErrorKind,
	unmetPasswordRequirements: AuthError['unmetPasswordRequirements'] = []
): AuthError => ({ kind, detail: 'detail', unmetPasswordRequirements });

describe('resolveMessages — 要件 9.5', () => {
	it('何も指定しなければ既定をそのまま返す', () => {
		expect(resolveMessages()).toEqual(jaMessages);
	});

	it('指定された項目だけを差し替える', () => {
		const messages = resolveMessages({ signInSubmit: 'ログイン' });
		expect(messages.signInSubmit).toBe('ログイン');
		expect(messages.email).toBe(jaMessages.email);
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

describe('基準の差し替え — 要件 9.4', () => {
	it('基準を渡さなければ日本語を用いる', () => {
		expect(resolveMessages({}).signInSubmit).toBe(jaMessages.signInSubmit);
	});

	it('基準に英語を渡せば、指定のない項目も英語になる', () => {
		const messages = resolveMessages({ signInSubmit: 'Log in' }, enMessages);
		expect(messages.signInSubmit).toBe('Log in');
		expect(messages.email).toBe(enMessages.email);
		expect(messages.errors.unknown).toBe(enMessages.errors.unknown);
	});

	it('基準を書き換えない', () => {
		const before = enMessages.errors['network-error'];
		resolveMessages({ errors: { 'network-error': 'offline' } }, enMessages);
		expect(enMessages.errors['network-error']).toBe(before);
	});
});

describe('アカウントの操作の文言の差し替え — 要件 7.4（multi-account-auth）', () => {
	it('既存と同じく項目単位で差し替えられる', () => {
		const messages = resolveMessages({
			operationBusy: 'Busy'
		});
		expect(messages.operationBusy).toBe('Busy');
		expect(messages.accountUnavailable).toBe(jaMessages.accountUnavailable);
	});
});

describe('authErrorMessageOf — 要件 8.5', () => {
	it('語彙のすべてに対して、どの文脈でも文言を返す', () => {
		for (const kind of ALL_KINDS) {
			for (const context of ALL_CONTEXTS) {
				expect(authErrorMessageOf(errorOf(kind), jaMessages, context)).toBeTruthy();
			}
		}
	});

	it('原因の詳細を利用者への文言に混ぜない', () => {
		for (const kind of ALL_KINDS) {
			expect(authErrorMessageOf(errorOf(kind), jaMessages, 'sign-in')).not.toContain('detail');
		}
	});

	it('強度の不足は、満たしていない要件から文を組み立てる', () => {
		const message = authErrorMessageOf(
			errorOf('weak-password', ['min-length', 'numeric']),
			jaMessages,
			'sign-up'
		);
		expect(message).not.toBe(jaMessages.errors['weak-password']);
		expect(message).toBe(jaMessages.weakPasswordReason(['min-length', 'numeric']));
	});

	it('満たしていない要件が取得できなかったときは、語彙ごとの案内へ落ちる', () => {
		expect(authErrorMessageOf(errorOf('weak-password'), jaMessages, 'sign-up')).toBe(
			jaMessages.errors['weak-password']
		);
	});

	it('パスワードの変更の文脈では、資格情報の誤りを現在のパスワードの誤りとして示す', () => {
		expect(authErrorMessageOf(errorOf('invalid-credential'), jaMessages, 'password-change')).toBe(
			jaMessages.currentPasswordInvalid
		);
	});

	it('パスワードの変更以外の文脈では、資格情報の誤りは語彙ごとの案内を引く', () => {
		for (const context of ALL_CONTEXTS.filter((each) => each !== 'password-change')) {
			expect(authErrorMessageOf(errorOf('invalid-credential'), jaMessages, context)).toBe(
				jaMessages.errors['invalid-credential']
			);
		}
	});

	it('差し替えられた文言を引く', () => {
		const messages = resolveMessages({
			errors: { 'network-error': '通信できません' },
			currentPasswordInvalid: '今のパスワードが違います'
		});
		expect(authErrorMessageOf(errorOf('network-error'), messages, 'sign-in')).toBe(
			'通信できません'
		);
		expect(authErrorMessageOf(errorOf('invalid-credential'), messages, 'password-change')).toBe(
			'今のパスワードが違います'
		);
	});
});

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
