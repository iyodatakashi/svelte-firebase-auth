// 組み込み側が依存してよい面のすべて。ここに無いものは内部実装であり、いつ変えてもよい

export { createAuthStore } from '#lib/stores/auth.svelte';
export { normalizeEmail } from '#lib/models/auth/auth';
export { enMessages, jaMessages } from '#lib/models/messages/messages.constants';
export {
	accountErrorMessageOf,
	authErrorMessageOf,
	resolveMessages
} from '#lib/models/messages/messages';

export { default as AuthSession } from '#lib/features/authSession/AuthSession.svelte';
export { default as AuthGate } from '#lib/features/authGate/AuthGate.svelte';

export { default as SignIn } from '#lib/features/signIn/SignIn.svelte';
export { default as SignUp } from '#lib/features/signUp/SignUp.svelte';
export { default as VerifyEmail } from '#lib/features/verifyEmail/VerifyEmail.svelte';
export { default as PasswordChange } from '#lib/features/passwordChange/PasswordChange.svelte';
export { default as PasswordReset } from '#lib/features/passwordReset/PasswordReset.svelte';

export type {
	AccountFailure,
	AccountOperation,
	AccountOperationError,
	AccountResult,
	AccountSummary,
	AuthBaseProps,
	AuthConfig,
	AuthError,
	AuthErrorKind,
	AuthGateProps,
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
} from '#lib/models/auth/auth.types';
export type {
	AuthErrorContext,
	AuthMessages,
	AuthMessagesOverride
} from '#lib/models/messages/messages.types';
