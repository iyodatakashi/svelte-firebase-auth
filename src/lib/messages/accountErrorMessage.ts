import type {
	AccountOperationError,
	AuthErrorContext,
	AuthMessages
} from '$lib/models/auth/auth.types';
import { authErrorMessageOf } from './authErrorMessage';

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
