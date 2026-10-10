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

/** 認証の経路。組み込み側の URL 構成を受け取る。欠落を実行時の分岐として抱え込まないため、すべて必須 */
export interface AuthRoutes {
	readonly signIn: string;
	readonly signUp: string;
	readonly verifyEmail: string;
	readonly passwordReset: string;
	/** 認証を終えた利用者の既定の行き先 */
	readonly afterSignIn: string;
}

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
	/** 認証の経路。画面の遷移と到達ガードが同じ値を読む */
	readonly routes: AuthRoutes;
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

/** 到達ガードの判定。効果を持たない */
export type AuthGuardDecision =
	/** 初回の判定が未了。何もしない */
	| { readonly kind: 'wait' }
	/** 現在の経路に留まってよい */
	| { readonly kind: 'allow' }
	| {
			readonly kind: 'redirect';
			readonly to: string;
			/** 振り替えの後に保持すべき戻り先。`null` は破棄を意味する */
			readonly returnTo: string | null;
	  };

export interface AuthGuardInput {
	readonly stage: AuthStage;
	/** 現在の経路。根からの相対パス（`pathname` と問い合わせ文字列） */
	readonly currentPath: string;
	readonly routes: AuthRoutes;
	/** 保持されている戻り先。無ければ `null` */
	readonly returnTo: string | null;
}

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
	/** 認証の経路。画面と到達ガードが読む唯一の出所 */
	readonly routes: AuthRoutes;

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

/** 到達の制御。組み込み側は根の配置でこれを1つ置き、子を包む */
export interface AuthGateProps {
	readonly store: AuthStore;
	/** 到達を許された利用者に見せるもの */
	readonly children: Snippet;
	/** 初回の判定が済むまでのあいだ見せるもの。省略時は何も描画しない */
	readonly pending?: Snippet;
}

// =============================================================================
// 文言
// =============================================================================

/** 同じ語彙でも案内が分かれる画面を区別する */
export type AuthErrorContext =
	'sign-in' | 'sign-up' | 'verify-email' | 'password-change' | 'password-reset';

/** 画面に出す文言のすべて。差し替えは項目単位で行う */
export interface AuthMessages {
	// 入力欄
	readonly email: string;
	readonly password: string;
	readonly currentPassword: string;
	readonly newPassword: string;

	// 送信
	readonly signInSubmit: string;
	readonly signUpSubmit: string;
	readonly passwordChangeSubmit: string;
	readonly passwordResetSubmit: string;

	// 移動。行き先の画面を名にする。出発した画面は名に持たない
	readonly goToSignUp: string;
	readonly goToPasswordReset: string;
	readonly backToSignIn: string;
	/** 変更を終えた利用者に示す、ただ1つの次の一手。行き先は組み込み側のページ（afterSignIn） */
	readonly back: string;

	// そのほかの操作
	readonly signOut: string;
	readonly cancel: string;

	// 確認待ち
	readonly verifyEmailSentTo: (email: string) => string;
	readonly verifyEmailResend: string;
	readonly verifyEmailResent: string;

	// パスワードの変更
	readonly passwordChangeDone: string;

	// パスワードの再設定
	readonly passwordResetDescription: string;
	readonly passwordResetSent: string;

	/** 確認待ちと再設定の、どちらの送信の後にも出す */
	readonly checkSpam: string;

	/** 語彙ごとの既定の案内。語彙を増やすと、既定の文言を足すまで型検査が通らない */
	readonly errors: Readonly<Record<AuthErrorKind, string>>;
	/** 画面によって案内が分かれるものだけ、専用の項目を持つ */
	readonly currentPasswordInvalid: string;
	readonly weakPasswordReason: (requirements: readonly PasswordRequirement[]) => string;
}

/** 差し替え。`errors` だけは語彙単位で差し替えられる */
export type AuthMessagesOverride = Partial<Omit<AuthMessages, 'errors'>> & {
	readonly errors?: Partial<Record<AuthErrorKind, string>>;
};

// =============================================================================
// 画面の props
// =============================================================================

/**
 * 画面の props。**題字・名乗りなどのページの要素は持たない**。
 * 画面をどう名乗らせ、どこへ置くかは組み込み側が決める
 */
export interface AuthBaseProps {
	readonly store: AuthStore;
	/** 渡さなかった項目は同梱の日本語を使う */
	readonly messages?: AuthMessagesOverride;
	/**
	 * 画面の役目が果たされたときに呼ばれる。**遷移は行わない**。
	 *
	 * サインイン・登録・確認は、完了で段階が変わるため到達の制御が利用者を動かす。
	 * **パスワードの変更と再設定メールの送信は段階を変えない**ため、そこで何をするかを
	 * 決められるのは組み込み側だけである。
	 *
	 * | 画面           | 呼ばれる時点                     |
	 * | -------------- | -------------------------------- |
	 * | SignIn         | サインインに成功したとき         |
	 * | SignUp         | 登録に成功したとき               |
	 * | VerifyEmail    | 確認が済んだと分かったとき（1度） |
	 * | PasswordChange | パスワードを変更したとき         |
	 * | PasswordReset  | 再設定用のメールを送ったとき     |
	 */
	readonly onCompleted?: () => void;
}
