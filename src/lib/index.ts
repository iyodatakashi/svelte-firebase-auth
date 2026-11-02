// 組み込み側が依存してよい面のすべて。ここに無いものは内部実装であり、いつ変えてもよい

export { createAuthStore } from './stores/auth.svelte';
export { normalizeEmail } from './models/auth/auth';
export { jaMessages } from './messages/ja';
export { enMessages } from './messages/en';
export { resolveMessages } from './messages/resolveMessages';
export { authErrorMessageOf } from './messages/authErrorMessage';
export { accountErrorMessageOf } from './messages/accountErrorMessage';

export { default as AuthSession } from './components/AuthSession.svelte';
export { default as AuthGate } from './components/AuthGate.svelte';

export { default as SignIn } from './components/SignIn.svelte';
export { default as SignUp } from './components/SignUp.svelte';
export { default as VerifyEmail } from './components/VerifyEmail.svelte';
export { default as PasswordChange } from './components/PasswordChange.svelte';
export { default as PasswordReset } from './components/PasswordReset.svelte';

export type {
	AccountFailure,
	AccountOperation,
	AccountOperationError,
	AccountResult,
	AccountSummary,
	AuthBaseProps,
	AuthConfig,
	AuthError,
	AuthErrorContext,
	AuthErrorKind,
	AuthGateProps,
	AuthMessages,
	AuthMessagesOverride,
	AuthResult,
	AuthRoutes,
	AuthSessionProps,
	AuthStage,
	AuthStore,
	CreateAuthStore,
	PasswordRequirement,
	PasswordResetProps,
	SignInProps,
	SignOutAllResult,
	SignUpProps,
	StorageStatus
} from './models/auth/auth.types';
