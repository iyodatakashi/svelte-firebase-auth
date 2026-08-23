import type { Snippet } from 'svelte';
import type { Auth, User } from 'firebase/auth';

// =============================================================================
// エラーの語彙
// =============================================================================

/** 利用者への案内が分かれる粒度だけを区別する。Firebase のエラーコードは透過させない */
export type AuthErrorKind =
	| 'invalid-credential'
	| 'invalid-email'
	| 'email-already-in-use'
	| 'weak-password'
	| 'requires-recent-login'
	| 'user-disabled'
	| 'too-many-requests'
	| 'registration-disabled'
	| 'network-error'
	| 'unknown';

/** 満たしていないパスワードの要件。`weak-password` のときだけ値が入る */
export type PasswordRequirement =
	'min-length' | 'max-length' | 'lowercase' | 'uppercase' | 'numeric' | 'non-alphanumeric';

export interface AuthError {
	readonly kind: AuthErrorKind;
	/** 原因の詳細。利用者へ直接は出さず、組み込み側の記録に用いる */
	readonly detail: string;
	/** 満たしていない要件。該当しない場合と取得できなかった場合は空 */
	readonly unmetPasswordRequirements: readonly PasswordRequirement[];
}

/** 失敗を例外ではなく戻り値で表す */
export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly error: AuthError };

// =============================================================================
// 設定とストア
// =============================================================================

export interface AuthConfig {
	/** 登録の入口を画面に出すか。登録 API そのものは組み込み側が Firebase 側の設定で塞ぐ */
	readonly selfRegistration: boolean;
	/**
	 * メールアドレスの確認を求めるか。
	 * 求めない組み込み先では、登録のあとに確認メールを送らない。
	 * 到達ガード（確認済みでなければ使わせない）は、この設定の有無によらず組み込み側の担当
	 */
	readonly emailVerification: boolean;
	/** 確認と再設定の完了後に戻る URL。組み込み側の承認済みドメインである必要がある */
	readonly continueUrl: string;
}

/**
 * 認証の段階。到達の判断はこれを見て行う。
 *
 * どの組み込み先でも同じ判定になるため、ライブラリが持つ。
 * **その段階で何をするか（どこへ遷移するか）は組み込み側の担当**であり、ライブラリは行わない
 */
export type AuthStage =
	/** 初回の認証状態の判定が済んでいない。「サインインしていない」と取り違えない */
	| 'unresolved'
	| 'signed-out'
	/** サインイン済みだが確認が済んでいない。確認を求める組み込み先でのみ現れる */
	| 'email-unverified'
	/** 通過。組み込み先が求める条件を満たしている */
	| 'ready';

export interface AuthStore {
	readonly user: User | null;
	/** 初回の認証状態の判定が完了したか。1回の購読の中では false へ戻らない */
	readonly isResolved: boolean;
	readonly isLoggedIn: boolean;
	/** 正規化済みのメールアドレス。組み込み側の照合とアクセス制御に一致する */
	readonly email: string | null;
	readonly isEmailVerified: boolean;
	readonly canSelfRegister: boolean;
	/** 組み込み先がメールアドレスの確認を求めるか。到達の判断に用いる */
	readonly requiresEmailVerification: boolean;
	/** 認証の段階。到達の判断はこれを見る */
	readonly stage: AuthStage;

	signIn(email: string, password: string): Promise<AuthResult>;
	/** 成功時はサインイン済みにし、確認メールを送る */
	signUp(email: string, password: string): Promise<AuthResult>;
	signOut(): Promise<void>;
	/** 現在のパスワードによる再認証を伴う */
	changePassword(currentPassword: string, nextPassword: string): Promise<AuthResult>;
	/** 登録の有無にかかわらず同じ結果を返す */
	sendPasswordReset(email: string): Promise<AuthResult>;
	sendEmailVerification(): Promise<AuthResult>;
	/** 利用者と ID トークンのクレームを取り直し、確認済みかどうかを返す */
	refreshVerification(): Promise<boolean>;
	/** 認証状態の購読を開始する。既に開始していれば張り直す */
	start(): void;
	/** 購読を解除し、公開している状態を初期化する */
	stop(): void;
}

export type CreateAuthStore = (auth: Auth, config: AuthConfig) => AuthStore;

// =============================================================================
// 文言
// =============================================================================

/** 同じ語彙でも案内が分かれる画面を区別する */
export type AuthErrorContext =
	'sign-in' | 'sign-up' | 'verify-email' | 'password-change' | 'password-reset';

/** 画面に出す文言のすべて。差し替えは項目単位で行う */
export interface AuthMessages {
	// 入力欄
	readonly emailLabel: string;
	readonly passwordLabel: string;
	readonly currentPasswordLabel: string;
	readonly newPasswordLabel: string;

	// サインイン
	readonly signInTitle: string;
	readonly signInSubmit: string;
	readonly signInToPasswordReset: string;
	readonly signInToSignUp: string;

	// 登録
	readonly signUpTitle: string;
	readonly signUpSubmit: string;
	readonly signUpToSignIn: string;
	readonly signUpToPasswordReset: string;

	// 確認待ち
	readonly verifyEmailTitle: string;
	readonly verifyEmailSentTo: (email: string) => string;
	readonly verifyEmailCheckSpam: string;
	readonly verifyEmailResend: string;
	readonly verifyEmailResent: string;
	readonly verifyEmailUseAnotherAddress: string;
	readonly verifyEmailSignOut: string;

	// パスワードの変更
	readonly passwordChangeTitle: string;
	readonly passwordChangeSubmit: string;
	readonly passwordChangeCancel: string;
	readonly passwordChangeDone: string;

	// パスワードの再設定
	readonly passwordResetTitle: string;
	readonly passwordResetDescription: string;
	readonly passwordResetSubmit: string;
	readonly passwordResetSent: string;
	readonly passwordResetCheckSpam: string;
	readonly passwordResetToSignIn: string;

	/** 語彙ごとの既定の案内。語彙を増やすと、既定の文言を足すまで型検査が通らない */
	readonly errors: Readonly<Record<AuthErrorKind, string>>;
	/** 画面によって案内が分かれるものだけ、専用の項目を持つ */
	readonly errorCurrentPasswordInvalid: string;
	readonly weakPasswordReason: (requirements: readonly PasswordRequirement[]) => string;
}

/** 差し替え。`errors` だけは語彙単位で差し替えられる */
export type AuthMessagesOverride = Partial<Omit<AuthMessages, 'errors'>> & {
	readonly errors?: Partial<Record<AuthErrorKind, string>>;
};

// =============================================================================
// 画面の props
// =============================================================================

export interface AuthBaseProps {
	readonly store: AuthStore;
	/** 渡さなかった項目は同梱の日本語を使う */
	readonly messages?: AuthMessagesOverride;
	/** 画面の上部へ差し込む要素。組み込み側の名乗り（題字など）を置く */
	readonly header?: Snippet;
}

export interface SignInProps extends AuthBaseProps {
	readonly onSignedIn: () => void;
	readonly onRequestPasswordReset: () => void;
	/** 自由登録が許可されているときだけ呼ばれる */
	readonly onRequestSignUp?: () => void;
}

export interface SignUpProps extends AuthBaseProps {
	readonly onSignedUp: () => void;
	readonly onRequestSignIn: () => void;
	readonly onRequestPasswordReset: () => void;
}

export interface VerifyEmailProps extends AuthBaseProps {
	readonly onVerified: () => void;
	readonly onSignOut: () => void;
	/** サインアウトを終えてから呼ばれる */
	readonly onRequestSignUpWithAnotherEmail: () => void;
}

export interface PasswordChangeProps extends AuthBaseProps {
	readonly onChanged: () => void;
	readonly onCancel: () => void;
}

export interface PasswordResetProps extends AuthBaseProps {
	readonly onRequested: () => void;
	readonly onRequestSignIn: () => void;
}
