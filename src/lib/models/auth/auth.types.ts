import type { Snippet } from 'svelte';
import type { Auth, User } from 'firebase/auth';
import type { AuthMessagesOverride } from '#lib/models/messages/messages.types';
import type { AccountPersistence } from '#lib/models/slot/slot.types';

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
	/**
	 * 複数のアカウントのログイン状態を保持するか。
	 * `false` では保持するアカウントを最大1件にし、保持していれば常にそれを選択中とする
	 */
	readonly multiAccount: boolean;
}

/**
 * 認証の段階。到達の判断はこれを見て行う。
 * どの組み込み先でも同じ判定になるため、ライブラリが持つ
 */
export type AuthStage =
	/** 初回の認証状態の判定が済んでいない。「サインインしていない」と取り違えない */
	| 'unresolved'
	/** 保持しているアカウントが無い */
	| 'signed-out'
	/** 保持しているアカウントはあるが、選択が無い。複数アカウント指定でのみ現れる */
	| 'account-unselected'
	/** 選択中のアカウントの確認が済んでいない。確認を求める組み込み先でのみ現れる */
	| 'email-unverified'
	/** 通過。組み込み先が求める条件を満たしている */
	| 'ready';

// =============================================================================
// アカウント
// =============================================================================

/** 保持しているアカウント1件の要約 */
export interface AccountSummary {
	/** ライブラリが振る安定した識別子。メールアドレスや UID ではない */
	readonly id: string;
	readonly uid: string;
	/** 正規化済みのメールアドレス */
	readonly email: string | null;
	readonly isEmailVerified: boolean;
}

/** アカウントの操作の失敗。利用者への案内が分かれる粒度だけを区別する */
export type AccountOperationError =
	| { readonly kind: 'auth'; readonly cause: AuthError }
	| {
			readonly kind:
				| 'not-found'
				| 'not-signed-in'
				/** 別の操作が実行中 */
				| 'busy'
				/** 利用者が取りやめた */
				| 'cancelled'
				/** 単一アカウント指定で、既にアカウントを保持している */
				| 'limit-reached';
	  }
	/** 内部の準備に失敗した。`detail` は利用者へ直接は出さず、組み込み側の記録に用いる */
	| { readonly kind: 'initialization'; readonly detail: string };

export type AccountResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: AccountOperationError };

/** 対象のアカウントを特定できる失敗 */
export interface AccountFailure {
	readonly id: string;
	readonly error: AccountOperationError;
}

export type SignOutAllResult =
	| { readonly ok: true; readonly signedOutIds: readonly string[] }
	| {
			readonly ok: false;
			/** 一部が失敗した。成功した分は反映済み */
			readonly reason: 'partial';
			readonly signedOutIds: readonly string[];
			readonly failed: readonly AccountFailure[];
	  }
	| { readonly ok: false; readonly reason: 'busy'; readonly signedOutIds: readonly string[] };

/** 実行中の追加・切り替え・ログアウト。対象が1件に定まる操作は `id` を持つ */
export interface AccountOperation {
	readonly kind: 'sign-in' | 'select' | 'sign-out';
	readonly id?: string;
}

/** ブラウザの保存領域を使えるか。使えなければ再読み込み後の復元を保証しない */
export type StorageStatus = 'available' | 'unavailable';

// =============================================================================
// ストア
// =============================================================================

/**
 * 公開する唯一の認証ストア。保持しているアカウントを束ね、選択中の1件を公開する。
 *
 * **選択中のアカウントは、渡した Auth（土台の Auth）へ複製する。** 土台の App から作った
 * Firestore などは、作り直さずに選択中のアカウントの認証で動く
 */
export interface AuthStore {
	/** 保持しているアカウント */
	readonly accounts: readonly AccountSummary[];
	/** 選択中のアカウント。未選択なら `null` */
	readonly activeId: string | null;
	readonly activeAccount: AccountSummary | null;

	/**
	 * 選択中のアカウントの利用者。土台の Auth の複製であり、同じアカウントのままでも
	 * 置き換わることがある。アカウントが変わったかは `activeId` か uid で判定する
	 */
	readonly user: User | null;
	readonly isLoggedIn: boolean;
	/** 正規化済みのメールアドレス。組み込み側の照合とアクセス制御に一致する */
	readonly email: string | null;
	readonly isEmailVerified: boolean;

	/** 開始の処理が済んだか。開始に失敗して続行できないときは false のまま */
	readonly isResolved: boolean;
	/** 続行できない開始の失敗。`null` 以外なら `isResolved` は false のまま */
	readonly startError: AccountOperationError | null;
	/** 開始時に復元できなかったアカウント */
	readonly restoreFailures: readonly AccountFailure[];
	/** 認証の段階。到達の判断はこれを見る */
	readonly stage: AuthStage;
	readonly storageStatus: StorageStatus;
	/** 実行中の追加・切り替え・ログアウト。無ければ `null` */
	readonly operation: AccountOperation | null;
	readonly canSelfRegister: boolean;
	/** 組み込み先がメールアドレスの確認を求めるか。到達の判断に用いる */
	readonly requiresEmailVerification: boolean;
	/** 認証の経路。画面と到達ガードが読む唯一の出所 */
	readonly routes: AuthRoutes;

	/** 新しいアカウントでサインインし、そのアカウントを選択する。他のログイン状態は保つ */
	signIn(email: string, password: string): Promise<AccountResult<AccountSummary>>;
	/** 登録してサインインし、そのアカウントを選択する。確認を求める設定なら確認メールを送る */
	signUp(email: string, password: string): Promise<AccountResult<AccountSummary>>;
	/** 送信中のサインイン・登録を無効にする。後から成功が返っても反映しない */
	cancelPendingSignIn(): void;
	selectAccount(id: string): Promise<AccountResult<AccountSummary>>;
	/** 選択中のアカウントからログアウトする。残ったアカウントは自動で選ばない */
	signOut(): Promise<AccountResult<{ readonly id: string }>>;
	signOutAccount(id: string): Promise<AccountResult<{ readonly id: string }>>;
	signOutAll(): Promise<SignOutAllResult>;

	/** 呼び出した時点で選択中のアカウントに対して行う */
	changePassword(currentPassword: string, nextPassword: string): Promise<AuthResult>;
	sendEmailVerification(): Promise<AuthResult>;
	/** 利用者と ID トークンのクレームを取り直し、確認済みかどうかを返す */
	refreshVerification(): Promise<boolean>;

	/** 登録の有無にかかわらず同じ結果を返す。アカウントに依らない */
	sendPasswordReset(email: string): Promise<AuthResult>;

	/** 保存されたアカウントを復元し、購読を始める。`AuthSession` が呼ぶ */
	start(persistence: AccountPersistence): Promise<void>;
	/** 購読を解除する。ログアウトはしない */
	stop(): void;
}

export type CreateAuthStore = (auth: Auth, config: AuthConfig) => AuthStore;

/** ブラウザ保存とストアの寿命。組み込み側は根の配置に1つ置く */
export interface AuthSessionProps {
	readonly store: AuthStore;
	/** 保存のキーの名前空間。同じオリジンの他の組み込み先と衝突させない */
	readonly namespace: string;
	/**
	 * 選択中のアカウントを全タブでそろえるか。既定はそろえない。
	 * - そろえない: 選択をタブごとに持つ。あるタブでの切り替えは、他のタブの選択を変えない
	 * - そろえる: 選択をブラウザで1つ持つ。あるタブでの切り替えに、他のタブも従う。
	 *   タブの間で共有するもの（Firestore の複数タブ共有キャッシュなど）が、1つのアカウントで動く
	 */
	readonly syncAccountAcrossTabs?: boolean;
}

/** 到達の制御。組み込み側は根の配置でこれを1つ置き、子を包む */
export interface AuthGateProps {
	readonly store: AuthStore;
	/** 到達を許された利用者に見せるもの */
	readonly children: Snippet;
	/** 初回の判定が済むまでのあいだ見せるもの。省略時は何も描画しない */
	readonly pending?: Snippet;
}

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

/**
 * サインインの画面の props。導線の動きを渡されたら、ページを移らずにそれを呼ぶ。
 * 渡されなければ設定された経路へ移る。ダイアログに置く組み込み側は、別のダイアログを開ける
 */
export interface SignInProps extends AuthBaseProps {
	readonly onGoToSignUp?: () => void;
	readonly onGoToPasswordReset?: () => void;
}

/**
 * 登録の画面の props。既定では送信のボタンとページを移る導線を中に描く。
 * ダイアログに置く組み込み側は、送信と取りやめをフッターに置き、行き来も自分で決められる
 */
export interface SignUpProps extends AuthBaseProps {
	/** 送信のボタンと、導線（サインインへ戻る・再設定へ）を中に描くか。既定は描く */
	readonly actions?: boolean;
	/** 導線の動き。渡されたらページを移らずにそれを呼ぶ */
	readonly onGoToSignIn?: () => void;
	readonly onGoToPasswordReset?: () => void;
	/** フォームの id。組み込み側が外に置いた送信ボタンから送信するのに使う */
	readonly id?: string;
	/** 送信中か。`bind:isSubmitting` で読む */
	isSubmitting?: boolean;
}

/**
 * パスワードの再設定の画面の props。既定では送信のボタンとサインインへ戻る導線を中に描く。
 * ダイアログに置く組み込み側は、送信をフッターに置き、行き来も自分で決められる
 */
export interface PasswordResetProps extends AuthBaseProps {
	/** 送信のボタンとサインインへ戻る導線を中に描くか。既定は描く */
	readonly actions?: boolean;
	/** サインインへ戻る導線の動き。渡されたらページを移らずにそれを呼ぶ */
	readonly onGoToSignIn?: () => void;
	/** フォームの id。組み込み側が外に置いた送信ボタンから送信するのに使う */
	readonly id?: string;
	/** 送信中か。`bind:isSubmitting` で読む */
	isSubmitting?: boolean;
	/** 試行が続いて受け付けられなくなったか。`bind:isBlocked` で読む */
	isBlocked?: boolean;
}
