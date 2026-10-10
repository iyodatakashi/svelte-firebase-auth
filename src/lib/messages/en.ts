import type { AuthMessages, PasswordRequirement } from '$lib/models/auth/auth.types';

/** 満たしていない要件を、利用者に伝わる文へ写す */
const REQUIREMENT_TEXTS: Readonly<Record<PasswordRequirement, string>> = {
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
					.map((requirement) => REQUIREMENT_TEXTS[requirement])
					.join(', ')}.`
};
