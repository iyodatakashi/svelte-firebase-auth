import type { AuthMessages, PasswordRequirement } from '$lib/models/auth/auth.types';

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
	email: 'メールアドレス',
	password: 'パスワード',
	currentPassword: '現在のパスワード',
	newPassword: '新しいパスワード',

	signInSubmit: 'サインイン',
	signUpSubmit: '登録する',
	passwordChangeSubmit: '変更する',
	passwordResetSubmit: '再設定用のメールを送る',

	goToSignUp: 'サインアップ',
	goToPasswordReset: 'パスワードを忘れた方',
	backToSignIn: 'サインインへ戻る',
	back: '戻る',

	signOut: 'サインアウト',
	cancel: 'キャンセル',

	verifyEmailSentTo: (email) =>
		`${email} 宛に確認メールを送りました。メールのリンクを開いてください。`,
	verifyEmailResend: '確認メールを再送する',
	verifyEmailResent: '確認メールを再送しました。',

	passwordChangeDone: 'パスワードを変更しました。',

	passwordResetDescription:
		'登録したメールアドレスを入力してください。再設定用のリンクをお送りします。',
	passwordResetSent: '入力されたメールアドレス宛に、再設定用のメールを送りました。',

	checkSpam: 'メールが見つからないときは、迷惑メールフォルダもご確認ください。',

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
	currentPasswordInvalid: '現在のパスワードが違います。',
	weakPasswordReason: (requirements) =>
		requirements.length === 0
			? jaMessages.errors['weak-password']
			: `パスワードが必要な条件を満たしていません。${requirements
					.map((requirement) => REQUIREMENT_TEXTS[requirement])
					.join('、')}。`
};
