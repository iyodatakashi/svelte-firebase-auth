import type { Snippet } from 'svelte';
import type { FirebaseApp } from 'firebase/app';
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

/** 保持する戻り先。保持したときのアカウントに結びつける */
export interface HeldReturnTo {
	readonly path: string;
	/**
	 * 使用中のアカウントが離れたときに開いていた経路なら、そのアカウントの uid。
	 * アカウントを使っていない状態で開いた経路なら `null` で、どのアカウントにも使う
	 */
	readonly ownerUid: string | null;
}

/** 到達ガードが最後に内容を見せた経路と、そのときのアカウント */
export interface ShownRoute {
	readonly path: string;
	readonly uid: string;
}

/** 到達ガードの判定。効果を持たない */
export type AuthGuardDecision =
	/** 初回の判定が未了。何もしない */
	| { readonly kind: 'wait' }
	/** 現在の経路に留まってよい */
	| { readonly kind: 'allow' }
	/** 遷移せず、保護された内容を出さずに、アカウントが選ばれるのを待つ */
	| {
			readonly kind: 'select';
			/** 選択の後に戻る先として保持すべきもの。`null` は破棄を意味する */
			readonly returnTo: HeldReturnTo | null;
	  }
	| {
			readonly kind: 'redirect';
			readonly to: string;
			/** 振り替えの後に保持すべき戻り先。`null` は破棄を意味する */
			readonly returnTo: HeldReturnTo | null;
	  };

export interface AuthGuardInput {
	readonly stage: AuthStage;
	/** 現在の経路。根からの相対パス（`pathname` と問い合わせ文字列） */
	readonly currentPath: string;
	readonly routes: AuthRoutes;
	/** 保持されている戻り先。無ければ `null` */
	readonly returnTo: HeldReturnTo | null;
	/** 使用中のアカウントの uid。無ければ `null` */
	readonly accountUid: string | null;
	/** 保持しているアカウントの uid */
	readonly accountUids: readonly string[];
	/** 最後に内容を見せた経路。戻り先の持ち主を決めるのに使う */
	readonly lastShown: ShownRoute | null;
}

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
// ブラウザ保存の契約
// =============================================================================

/** スロット記録。メールアドレス・パスワード・トークンは持たない */
export interface StoredSlot {
	readonly version: 1;
	readonly id: string;
	/** このスロットにログインしているはずの UID */
	readonly uid: string;
}

/** 保存の成否。保存領域を使えないときは失敗として返し、例外を投げない */
export type StorageResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** ストアがブラウザの保存領域に触るための窓口。`AuthSession` が渡す */
export interface AccountPersistence {
	readSlots(): StorageResult<readonly StoredSlot[]>;
	writeSlot(slot: StoredSlot): StorageResult<void>;
	removeSlot(id: string): StorageResult<void>;
	/** タブの選択。`undefined` はタブ内の記録なし、`null` は明示的な未選択 */
	readActiveId(): StorageResult<string | null | undefined>;
	writeActiveId(id: string | null): StorageResult<void>;
	/** 同じブラウザで最後に開いたアカウント */
	readLastOpenedId(): StorageResult<string | null>;
	writeLastOpenedId(id: string | null): StorageResult<void>;
	/** 別のタブでのスロット記録の変更を受け取る。解除する関数を返す */
	onSlotsChanged(listener: () => void): () => void;
}

/** 照合のために観測した、1つのスロットの状態 */
export interface SlotObservation {
	readonly id: string;
	/** 記録の UID */
	readonly expectedUid: string;
	/** 実際にログインしている UID。ログインしていなければ `null` */
	readonly uid: string | null;
}

/** スロットの照合の結果 */
export interface SlotReconciliation {
	/** 一覧に入れるスロット。ID の順 */
	readonly memberIds: readonly string[];
	/** ログインしていない、または UID が記録と異なるスロット */
	readonly droppedIds: readonly string[];
	/** 同じ UID の重複。重複側の ID から代表の ID への対応 */
	readonly duplicates: ReadonlyMap<string, string>;
}

// =============================================================================
// ストア
// =============================================================================

/**
 * 1つのスロットの Auth を扱う内部のストア。公開しない。
 * 画面と組み込み側は、これを束ねた `AuthStore` だけに触れる
 */
export interface SlotStore {
	readonly user: User | null;
	/** 初回の認証状態の判定が完了したか。1回の購読の中では false へ戻らない */
	readonly isResolved: boolean;
	readonly isEmailVerified: boolean;

	signIn(email: string, password: string): Promise<AuthResult>;
	/** 成功時はサインイン済みにし、確認を求める設定なら確認メールを送る */
	signUp(email: string, password: string): Promise<AuthResult>;
	signOut(): Promise<AuthResult>;
	/** 現在のパスワードによる再認証を伴う */
	changePassword(currentPassword: string, nextPassword: string): Promise<AuthResult>;
	sendEmailVerification(): Promise<AuthResult>;
	/** 利用者と ID トークンのクレームを取り直し、確認済みかどうかを返す */
	refreshVerification(): Promise<boolean>;
	/** 認証状態の購読を開始する。初回の判定が済んだ時点で解決する */
	start(): Promise<void>;
	/** 購読を解除し、公開している状態を初期化する */
	stop(): void;
}

/** スロット。アカウント1件のログイン状態を保持する、名前付き App・Auth と SlotStore の組 */
export interface Slot {
	readonly id: string;
	readonly app: FirebaseApp;
	readonly auth: Auth;
	readonly store: SlotStore;
}

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

	// アカウントの操作の失敗
	readonly accountLimitReached: string;
	readonly operationBusy: string;
	/** 切り替えようとしたアカウントのログイン状態が失われている */
	readonly accountUnavailable: string;

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

/** 追加ログインの中身。ダイアログの外枠・見出し・開閉は持たない */
export interface AddAccountProps {
	readonly store: AuthStore;
	readonly messages?: AuthMessagesOverride;
	/** サインイン・登録に成功したときに呼ばれる。閉じるかどうかは組み込み側が決める */
	readonly onCompleted?: (account: AccountSummary) => void;
	/** 利用者が取りやめたときに呼ばれる。送信中の試行は無効にしてある */
	readonly onCancel?: () => void;
}

/** アカウントの一覧・切り替え・ログアウトの中身。任意で使う */
export interface AccountChooserProps {
	readonly store: AuthStore;
	readonly messages?: AuthMessagesOverride;
	/** アカウントの追加を求められたときに呼ばれる。追加の表示は組み込み側が出す */
	readonly onAddRequested?: () => void;
}
