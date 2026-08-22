import type { PasswordValidationStatus } from 'firebase/auth';

/** 充足状況の作成。SDK の型に適合させ、手で書いた形に対するテストにしない */
export const passwordStatus = (
	overrides: Partial<PasswordValidationStatus>
): PasswordValidationStatus =>
	({ isValid: false, passwordPolicy: {}, ...overrides }) as PasswordValidationStatus;
