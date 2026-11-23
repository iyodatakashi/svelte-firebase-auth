import type { AuthErrorKind, PasswordRequirement } from '#lib/models/auth/auth.types';

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
