import type { AccountOperationError, AuthError } from '#lib/models/auth/auth.types';
import { jaMessages } from './messages.constants';
import type { AuthErrorContext, AuthMessages, AuthMessagesOverride } from './messages.types';

/** 指定された項目だけを差し替える。指定のない項目は基準の文言を用いる */
export const resolveMessages = (
	overrides?: AuthMessagesOverride,
	base: AuthMessages = jaMessages
): AuthMessages => {
	if (!overrides) {
		return base;
	}
	const { errors, ...rest } = overrides;
	return {
		...base,
		...definedOnly(rest),
		errors: { ...base.errors, ...definedOnly(errors ?? {}) }
	};
};

/**
 * アカウントの操作の失敗から、利用者への文言を引く。
 * 認証の失敗は既存の語彙の案内へ写し、内部の詳細は見せない
 */
export const accountErrorMessageOf = (
	error: AccountOperationError,
	messages: AuthMessages,
	context: AuthErrorContext
): string => {
	switch (error.kind) {
		case 'auth':
			return authErrorMessageOf(error.cause, messages, context);
		case 'busy':
			return messages.operationBusy;
		case 'limit-reached':
			return messages.accountLimitReached;
		case 'not-found':
		case 'not-signed-in':
			return messages.accountUnavailable;
		case 'cancelled':
		case 'initialization':
			return messages.errors.unknown;
	}
};

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
		return messages.currentPasswordInvalid;
	}
	return messages.errors[error.kind];
};

/** 明示的に undefined を渡した項目で基準を消さない */
const definedOnly = <T extends object>(source: T): Partial<T> =>
	Object.fromEntries(
		Object.entries(source).filter(([, value]) => value !== undefined)
	) as Partial<T>;
