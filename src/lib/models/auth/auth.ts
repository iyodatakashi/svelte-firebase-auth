import { FirebaseError } from 'firebase/app';
import type { PasswordValidationStatus } from 'firebase/auth';
import { ERROR_KIND_BY_CODE, PASSWORD_REQUIREMENTS } from './auth.constants';
import type { AuthError, PasswordRequirement } from './auth.types';

/**
 * 前後の空白を落とし、小文字へ揃える。
 * 組み込み側の照合とアクセス制御が同じ値を得るための唯一の出所
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** 失敗を語彙へ畳む。FirebaseError 以外も受け取り、例外を投げない */
export const toAuthError = (
	error: unknown,
	unmetPasswordRequirements: readonly PasswordRequirement[] = []
): AuthError => ({
	kind: error instanceof FirebaseError ? (ERROR_KIND_BY_CODE[error.code] ?? 'unknown') : 'unknown',
	detail: detailOf(error),
	unmetPasswordRequirements
});

/** 充足状況から、満たしていない要件だけを取り出す。undefined の項目は要求されていない */
export const unmetRequirementsOf = (
	status: PasswordValidationStatus
): readonly PasswordRequirement[] =>
	PASSWORD_REQUIREMENTS.filter(({ field }) => status[field] === false).map(
		({ requirement }) => requirement
	);

const detailOf = (error: unknown): string => {
	if (error instanceof FirebaseError) {
		return `${error.code}: ${error.message}`;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};
