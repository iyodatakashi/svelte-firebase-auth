import type { PasswordRequirement } from '#lib/models/auth/auth.types';
import type { AuthMessages } from './messages.types';

/** 満たしていない要件を、利用者に伝わる文へ写す */
const JA_REQUIREMENT_TEXTS: Readonly<Record<PasswordRequirement, string>> = {
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

	accountLimitReached: 'これ以上アカウントを追加できません。',
	operationBusy: '別の処理を実行中です。終わってからお試しください。',
	accountUnavailable: 'このアカウントは、サインインし直す必要があります。',

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
					.map((requirement) => JA_REQUIREMENT_TEXTS[requirement])
					.join('、')}。`
};

/** 満たしていない要件を、利用者に伝わる文へ写す */
const EN_REQUIREMENT_TEXTS: Readonly<Record<PasswordRequirement, string>> = {
	'min-length': 'more characters',
	'max-length': 'fewer characters',
	lowercase: 'a lowercase letter',
	uppercase: 'an uppercase letter',
	numeric: 'a number',
	'non-alphanumeric': 'a symbol'
};

/** 英語 */
export const enMessages: AuthMessages = {
	email: 'Email address',
	password: 'Password',
	currentPassword: 'Current password',
	newPassword: 'New password',

	signInSubmit: 'Sign in',
	signUpSubmit: 'Create account',
	passwordChangeSubmit: 'Change password',
	passwordResetSubmit: 'Send a reset email',

	goToSignUp: 'Sign up',
	goToPasswordReset: 'Forgot your password?',
	backToSignIn: 'Back to sign in',
	back: 'Back',

	signOut: 'Sign out',
	cancel: 'Cancel',

	verifyEmailSentTo: (email) =>
		`We sent a confirmation email to ${email}. Open the link in that email.`,
	verifyEmailResend: 'Resend the confirmation email',
	verifyEmailResent: 'We resent the confirmation email.',

	passwordChangeDone: 'Your password has been changed.',

	passwordResetDescription:
		'Enter the email address you registered with. We will send you a link to reset your password.',
	passwordResetSent: 'We sent a reset email to the address you entered.',

	checkSpam: 'If you cannot find the email, check your spam folder as well.',

	accountLimitReached: 'You cannot add more accounts.',
	operationBusy: 'Another action is in progress. Try again when it finishes.',
	accountUnavailable: 'You need to sign in to this account again.',

	errors: {
		'invalid-credential': 'The email address or password is incorrect.',
		'invalid-email': 'That email address is not in a valid format.',
		'email-already-in-use': 'That email address is already in use.',
		'weak-password': 'The password does not meet the requirements.',
		'requires-recent-login': 'Enter your current password again to confirm.',
		'user-disabled': 'This account is not available.',
		'too-many-requests': 'Too many attempts. Wait a while and try again.',
		'registration-disabled': 'New registrations are not being accepted.',
		'network-error': 'The connection failed. Check your network and try again.',
		unknown: 'Something went wrong. Wait a while and try again.'
	},
	currentPasswordInvalid: 'Your current password is incorrect.',
	weakPasswordReason: (requirements) =>
		requirements.length === 0
			? enMessages.errors['weak-password']
			: `The password needs ${requirements
					.map((requirement) => EN_REQUIREMENT_TEXTS[requirement])
					.join(', ')}.`
};
