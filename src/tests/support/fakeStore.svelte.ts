import { vi } from 'vitest';
import type { User } from 'firebase/auth';
import type {
	AuthErrorKind,
	AuthResult,
	AuthStore,
	PasswordRequirement
} from '$lib/models/auth/auth.types';

export interface FakeStoreOptions {
	readonly email?: string | null;
	readonly isEmailVerified?: boolean;
	readonly canSelfRegister?: boolean;
	readonly isLoggedIn?: boolean;
}

/**
 * 画面のテスト用のストア。画面は `store` を受け取るだけで Firebase を必要としない。
 * 確認済みは runes の状態として持ち、取り直しで書き換えられるようにする
 */
export const fakeStore = (options: FakeStoreOptions = {}) => {
	let isEmailVerified = $state(options.isEmailVerified ?? false);
	const ok: AuthResult = { ok: true };

	const store: AuthStore = {
		user: (options.isLoggedIn ?? true) ? ({ uid: 'uid-1' } as User) : null,
		isResolved: true,
		isLoggedIn: options.isLoggedIn ?? true,
		email: options.email === undefined ? 'user@example.com' : options.email,
		get isEmailVerified() {
			return isEmailVerified;
		},
		canSelfRegister: options.canSelfRegister ?? true,
		signIn: vi.fn(async () => ok),
		signUp: vi.fn(async () => ok),
		signOut: vi.fn(async () => undefined),
		changePassword: vi.fn(async () => ok),
		sendPasswordReset: vi.fn(async () => ok),
		sendEmailVerification: vi.fn(async () => ok),
		refreshVerification: vi.fn(async () => isEmailVerified),
		start: vi.fn(),
		stop: vi.fn()
	};

	return {
		store,
		/** 別の端末で確認が済んだ状況を作る */
		markVerified: () => {
			isEmailVerified = true;
		}
	};
};

/** 失敗を返す戻り値。語彙を渡して画面の提示を確かめる */
export const failureOf = (
	kind: AuthErrorKind,
	unmetPasswordRequirements: PasswordRequirement[] = []
): AuthResult => ({
	ok: false,
	error: { kind, detail: 'detail', unmetPasswordRequirements }
});
