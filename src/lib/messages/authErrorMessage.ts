import type { AuthError, AuthErrorContext, AuthMessages } from '$lib/models/auth/auth.types';

/**
 * 失敗から利用者への文言を引く唯一の関数。
 * 画面はこれを呼ぶだけで、エラーの文言も語彙ごとの分岐も持たない
 */
export const authErrorMessageOf = (
	error: AuthError,
	messages: AuthMessages,
	context: AuthErrorContext
): string => {
	if (error.kind === 'weak-password' && error.unmetPasswordRequirements.length > 0) {
		return messages.weakPasswordReason(error.unmetPasswordRequirements);
	}
	if (error.kind === 'invalid-credential' && context === 'password-change') {
		return messages.errorCurrentPasswordInvalid;
	}
	return messages.errors[error.kind];
};
