import type {
	AuthMessages,
	AuthMessagesOverride,
	PasswordRequirement
} from '$lib/models/auth/auth.types';

/** 満たしていない要件を、利用者に伝わる文へ写す */
const REQUIREMENT_TEXTS: Readonly<Record<PasswordRequirement, string>> = {
	'min-length': '必要な文字数に足りません',
	'max-length': '文字数が多すぎます',
	lowercase: '小文字を含めてください',
	uppercase: '大文字を含めてください',
	numeric: '数字を含めてください',
	'non-alphanumeric': '記号を含めてください'
};

/** 既定の日本語 */
export const jaMessages: AuthMessages = {
	emailLabel: 'メールアドレス',
	passwordLabel: 'パスワード',
	currentPasswordLabel: '現在のパスワード',
	newPasswordLabel: '新しいパスワード',

	signInTitle: 'サインイン',
	signInSubmit: 'サインイン',
	signInToPasswordReset: 'パスワードをお忘れですか',
	signInToSignUp: 'アカウントを作成する',

	signUpTitle: 'アカウントの作成',
	signUpSubmit: '登録する',
	signUpToSignIn: 'サインインへ戻る',
	signUpToPasswordReset: 'パスワードを再設定する',

	verifyEmailTitle: 'メールアドレスの確認',
	verifyEmailSentTo: (email) =>
		`${email} 宛に確認メールを送りました。メールのリンクを開いてください。`,
	verifyEmailCheckSpam: 'メールが見つからないときは、迷惑メールフォルダもご確認ください。',
	verifyEmailResend: '確認メールを再送する',
	verifyEmailResent: '確認メールを再送しました。',
	verifyEmailUseAnotherAddress: '別のメールアドレスで登録し直す',
	verifyEmailSignOut: 'サインアウト',

	passwordChangeTitle: 'パスワードの変更',
	passwordChangeSubmit: '変更する',
	passwordChangeCancel: '取りやめる',
	passwordChangeDone: 'パスワードを変更しました。',

	passwordResetTitle: 'パスワードの再設定',
	passwordResetDescription:
		'登録したメールアドレスを入力してください。再設定用のリンクをお送りします。',
	passwordResetSubmit: '再設定用のメールを送る',
	passwordResetSent: '入力されたメールアドレス宛に、再設定用のメールを送りました。',
	passwordResetCheckSpam: 'メールが見つからないときは、迷惑メールフォルダもご確認ください。',
	passwordResetToSignIn: 'サインインへ戻る',

	errors: {
		'invalid-credential': 'メールアドレスまたはパスワードが違います。',
		'invalid-email': 'メールアドレスの形式が正しくありません。',
		'email-already-in-use': 'このメールアドレスは既に使われています。',
		'weak-password': 'パスワードが必要な条件を満たしていません。',
		'requires-recent-login': '確認のため、現在のパスワードを入力し直してください。',
		'user-disabled': 'このアカウントは利用できません。',
		'too-many-requests':
			'試行が続いたため、しばらく受け付けられません。時間を空けてお試しください。',
		'registration-disabled': '現在、新規の登録を受け付けていません。',
		'network-error': '通信に失敗しました。接続を確かめてお試しください。',
		unknown: '処理に失敗しました。時間を空けてお試しください。'
	},
	errorCurrentPasswordInvalid: '現在のパスワードが違います。',
	weakPasswordReason: (requirements) =>
		requirements.length === 0
			? jaMessages.errors['weak-password']
			: `パスワードが必要な条件を満たしていません。${requirements
					.map((requirement) => REQUIREMENT_TEXTS[requirement])
					.join('、')}。`
};

/** 指定された項目だけを差し替える。指定のない項目は既定を用いる */
export const resolveMessages = (overrides?: AuthMessagesOverride): AuthMessages => {
	if (!overrides) {
		return jaMessages;
	}
	const { errors, ...rest } = overrides;
	return {
		...jaMessages,
		...definedOnly(rest),
		errors: { ...jaMessages.errors, ...definedOnly(errors ?? {}) }
	};
};

/** 明示的に undefined を渡した項目で既定を消さない */
const definedOnly = <T extends object>(source: T): Partial<T> =>
	Object.fromEntries(
		Object.entries(source).filter(([, value]) => value !== undefined)
	) as Partial<T>;
