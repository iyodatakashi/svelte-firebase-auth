import type { AuthErrorKind, PasswordRequirement } from './auth.types';

/**
 * Firebase のエラーコードから語彙への写像。
 * ここに無いコードは `unknown` へ落ちる。コードをそのまま組み込み側へ透過させない
 */
export const ERROR_KIND_BY_CODE: Readonly<Record<string, AuthErrorKind>> = {
	'auth/invalid-credential': 'invalid-credential',
	'auth/user-not-found': 'invalid-credential',
	'auth/wrong-password': 'invalid-credential',
	'auth/invalid-email': 'invalid-email',
	'auth/email-already-in-use': 'email-already-in-use',
	'auth/weak-password': 'weak-password',
	// SDK の定数一覧に無い、バックエンド由来の文字列
	'auth/password-does-not-meet-requirements': 'weak-password',
	'auth/requires-recent-login': 'requires-recent-login',
	'auth/user-disabled': 'user-disabled',
	'auth/too-many-requests': 'too-many-requests',
	'auth/admin-restricted-operation': 'registration-disabled',
	'auth/operation-not-allowed': 'registration-disabled',
	'auth/network-request-failed': 'network-error'
};

/** 満たしていない要件を並べる順。`PasswordValidationStatus` の項目との対応もここが持つ */
export const PASSWORD_REQUIREMENTS: readonly {
	readonly requirement: PasswordRequirement;
	readonly field:
		| 'meetsMinPasswordLength'
		| 'meetsMaxPasswordLength'
		| 'containsLowercaseLetter'
		| 'containsUppercaseLetter'
		| 'containsNumericCharacter'
		| 'containsNonAlphanumericCharacter';
}[] = [
	{ requirement: 'min-length', field: 'meetsMinPasswordLength' },
	{ requirement: 'max-length', field: 'meetsMaxPasswordLength' },
	{ requirement: 'lowercase', field: 'containsLowercaseLetter' },
	{ requirement: 'uppercase', field: 'containsUppercaseLetter' },
	{ requirement: 'numeric', field: 'containsNumericCharacter' },
	{ requirement: 'non-alphanumeric', field: 'containsNonAlphanumericCharacter' }
];

/** 確認済みの取り直しを繰り返す間隔（ミリ秒）。公開面の設定にしない */
export const VERIFICATION_POLL_INTERVAL_MS = 3000;
