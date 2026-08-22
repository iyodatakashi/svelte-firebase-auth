// 組み込み側が依存してよい面のすべて。ここに無いものは内部実装であり、いつ変えてもよい

export { createAuthStore } from './stores/auth.svelte';
export { normalizeEmail } from './models/auth/auth';
export { jaMessages, resolveMessages } from './messages/ja';
export { authErrorMessageOf } from './messages/authErrorMessage';

export { default as SignInScreen } from './screens/SignInScreen.svelte';
export { default as SignUpScreen } from './screens/SignUpScreen.svelte';
export { default as VerifyEmailScreen } from './screens/VerifyEmailScreen.svelte';
export { default as PasswordChangeScreen } from './screens/PasswordChangeScreen.svelte';
export { default as PasswordResetScreen } from './screens/PasswordResetScreen.svelte';

export type {
	AuthConfig,
	AuthError,
	AuthErrorContext,
	AuthErrorKind,
	AuthMessages,
	AuthMessagesOverride,
	AuthResult,
	AuthScreenProps,
	AuthStore,
	CreateAuthStore,
	PasswordChangeScreenProps,
	PasswordRequirement,
	PasswordResetScreenProps,
	SignInScreenProps,
	SignUpScreenProps,
	VerifyEmailScreenProps
} from './models/auth/auth.types';
