import { vi } from 'vitest';
import type { Auth, PasswordValidationStatus, User } from 'firebase/auth';

/** `firebase/auth` の差し替え。ストアが呼ぶものだけを並べる */
export const firebaseAuthMock = (() => {
	const listeners = new Set<(user: unknown) => void>();
	return {
		listeners,
		onAuthStateChanged: vi.fn((_auth: unknown, next: (user: unknown) => void) => {
			listeners.add(next);
			return () => listeners.delete(next);
		}),
		signInWithEmailAndPassword: vi.fn(async () => ({})),
		createUserWithEmailAndPassword: vi.fn(async () => ({})),
		signOut: vi.fn(async () => undefined),
		sendEmailVerification: vi.fn(async () => undefined),
		sendPasswordResetEmail: vi.fn(async () => undefined),
		reauthenticateWithCredential: vi.fn(async () => ({})),
		updatePassword: vi.fn(async () => undefined),
		reload: vi.fn(async () => undefined),
		getIdToken: vi.fn(async () => 'token'),
		validatePassword: vi.fn(
			async (): Promise<PasswordValidationStatus> =>
				({ isValid: false }) as PasswordValidationStatus
		),
		EmailAuthProvider: {
			credential: vi.fn((email: string, password: string) => ({ email, password }))
		}
	};
})();

/** 購読しているすべての受け手へ、認証状態の変化を届ける */
export const emitAuthState = (user: User | null): void => {
	for (const listener of firebaseAuthMock.listeners) {
		listener(user);
	}
};

export const resetFirebaseAuthMock = (): void => {
	firebaseAuthMock.listeners.clear();
	for (const value of Object.values(firebaseAuthMock)) {
		if (vi.isMockFunction(value)) {
			value.mockClear();
		}
	}
	firebaseAuthMock.EmailAuthProvider.credential.mockClear();
};

export const fakeUser = (overrides: Partial<User> = {}): User =>
	({ uid: 'uid-1', email: 'User@Example.com', emailVerified: false, ...overrides }) as User;

/** ストアが currentUser を読むため、購読の受け手と同じ利用者を持たせる */
export const fakeAuth = (currentUser: User | null = null): Auth => ({ currentUser }) as Auth;
