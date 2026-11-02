import { describe, expect, it } from 'vitest';
import { authErrorMessageOf } from '$lib/messages/authErrorMessage';
import { jaMessages } from '$lib/messages/ja';
import { resolveMessages } from '$lib/messages/resolveMessages';
import type { AuthError, AuthErrorContext, AuthErrorKind } from '$lib/models/auth/auth.types';

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
