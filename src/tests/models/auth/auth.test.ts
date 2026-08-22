import { describe, expect, it } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { passwordStatus } from '../../support/password';
import { normalizeEmail, toAuthError, unmetRequirementsOf } from '$lib/models/auth/auth';
import { ERROR_KIND_BY_CODE } from '$lib/models/auth/auth.constants';
import type { AuthErrorKind } from '$lib/models/auth/auth.types';

describe('normalizeEmail — 要件 1.7', () => {
	it('前後の空白を落とし、小文字へ揃える', () => {
		expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
	});

	it('冪等である', () => {
		const once = normalizeEmail(' Alice@Example.com ');
		expect(normalizeEmail(once)).toBe(once);
	});

	it('全角の空白も落とす', () => {
		expect(normalizeEmail('　user@example.com　')).toBe('user@example.com');
	});
});

describe('toAuthError — 要件 8.2, 8.3, 8.4', () => {
	it('写像表のすべてのエントリを、対応する語彙へ畳む', () => {
		for (const [code, kind] of Object.entries(ERROR_KIND_BY_CODE)) {
			expect(toAuthError(new FirebaseError(code, `message for ${code}`)).kind).toBe(kind);
		}
	});

	it('資格情報の誤りは、利用者と パスワード のどちらの誤りも同じ語彙へ畳む', () => {
		const kinds = ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].map(
			(code) => toAuthError(new FirebaseError(code, '')).kind
		);
		expect(kinds).toEqual(['invalid-credential', 'invalid-credential', 'invalid-credential']);
	});

	it('SDK の定数に無いバックエンド由来の強度の失敗も weak-password へ畳む', () => {
		expect(
			toAuthError(new FirebaseError('auth/password-does-not-meet-requirements', '')).kind
		).toBe('weak-password');
	});

	it('未知のコードは unknown へ落とす', () => {
		expect(toAuthError(new FirebaseError('auth/some-new-code', '')).kind).toBe('unknown');
	});

	it('FirebaseError 以外も unknown として受け取る', () => {
		expect(toAuthError(new Error('boom')).kind).toBe('unknown');
		expect(toAuthError('boom').kind).toBe('unknown');
		expect(toAuthError(undefined).kind).toBe('unknown');
	});

	it('Firebase のエラーコードをそのまま語彙へ出さない', () => {
		const kinds: readonly AuthErrorKind[] = [
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
		for (const kind of Object.values(ERROR_KIND_BY_CODE)) {
			expect(kinds).toContain(kind);
		}
	});

	it('原因の詳細を添えて返す', () => {
		expect(toAuthError(new FirebaseError('auth/some-new-code', 'なにかが起きた')).detail).toContain(
			'auth/some-new-code'
		);
	});

	it('満たしていない要件は、渡されなければ空である', () => {
		expect(
			toAuthError(new FirebaseError('auth/weak-password', '')).unmetPasswordRequirements
		).toEqual([]);
	});

	it('満たしていない要件を渡すと、そのまま添えて返す', () => {
		const error = toAuthError(new FirebaseError('auth/weak-password', ''), ['min-length']);
		expect(error.unmetPasswordRequirements).toEqual(['min-length']);
	});
});

describe('unmetRequirementsOf — 要件 4.4, 6.3', () => {
	const status = passwordStatus;

	it('満たしていない項目だけを取り出す', () => {
		expect(
			unmetRequirementsOf(status({ meetsMinPasswordLength: false, containsNumericCharacter: true }))
		).toEqual(['min-length']);
	});

	it('要求されていない項目（undefined）を理由に含めない', () => {
		expect(unmetRequirementsOf(status({}))).toEqual([]);
	});

	it('すべての項目を満たしていれば空を返す', () => {
		expect(
			unmetRequirementsOf(
				status({
					meetsMinPasswordLength: true,
					meetsMaxPasswordLength: true,
					containsLowercaseLetter: true,
					containsUppercaseLetter: true,
					containsNumericCharacter: true,
					containsNonAlphanumericCharacter: true
				})
			)
		).toEqual([]);
	});

	it('満たしていない項目を、要件の定義順に並べる', () => {
		expect(
			unmetRequirementsOf(
				status({
					meetsMinPasswordLength: false,
					meetsMaxPasswordLength: false,
					containsLowercaseLetter: false,
					containsUppercaseLetter: false,
					containsNumericCharacter: false,
					containsNonAlphanumericCharacter: false
				})
			)
		).toEqual([
			'min-length',
			'max-length',
			'lowercase',
			'uppercase',
			'numeric',
			'non-alphanumeric'
		]);
	});
});
