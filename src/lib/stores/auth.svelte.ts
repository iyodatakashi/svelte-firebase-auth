import { FirebaseError } from 'firebase/app';
import {
	EmailAuthProvider,
	createUserWithEmailAndPassword,
	getIdToken,
	onAuthStateChanged,
	reauthenticateWithCredential,
	reload,
	sendEmailVerification as sendEmailVerificationTo,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signOut as signOutOf,
	updatePassword,
	validatePassword,
	type ActionCodeSettings,
	type Auth,
	type User
} from 'firebase/auth';
import { normalizeEmail, toAuthError, unmetRequirementsOf } from '$lib/models/auth/auth';
import type {
	AuthConfig,
	AuthError,
	AuthResult,
	AuthStore,
	PasswordRequirement
} from '$lib/models/auth/auth.types';

/**
 * 認証状態の保持と、Firebase Auth への操作。
 * `Auth` は外から受け取り、初期化しない。グローバルな状態を持たず、複数生成できる
 */
export const createAuthStore = (auth: Auth, config: AuthConfig): AuthStore => {
	let user = $state<User | null>(null);
	let isResolved = $state(false);
	// 利用者はクラスのインスタンスで runes の追随の対象にならないため、確認済みは独立して持つ
	let isEmailVerified = $state(false);

	let unsubscribe: (() => void) | null = null;
	let runningRefresh: Promise<boolean> | null = null;

	/** 確認と再設定の完了後の戻り先。既定のアクションハンドラを経由させる */
	const actionCodeSettings: ActionCodeSettings = { url: config.continueUrl };

	const start = (): void => {
		stop();
		unsubscribe = onAuthStateChanged(auth, (next) => {
			user = next;
			isEmailVerified = next?.emailVerified ?? false;
			isResolved = true;
		});
	};

	const stop = (): void => {
		unsubscribe?.();
		unsubscribe = null;
		runningRefresh = null;
		user = null;
		isResolved = false;
		isEmailVerified = false;
	};

	const signIn = async (email: string, password: string): Promise<AuthResult> => {
		try {
			await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
			return { ok: true };
		} catch (error) {
			return { ok: false, error: toAuthError(error) };
		}
	};

	const signUp = async (email: string, password: string): Promise<AuthResult> => {
		try {
			await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
		} catch (error) {
			return { ok: false, error: await withPasswordRequirements(error, password) };
		}
		// アカウントができていれば、確認メールの送信の失敗を登録の失敗として返さない
		await sendEmailVerification();
		return { ok: true };
	};

	const signOut = async (): Promise<void> => {
		try {
			await signOutOf(auth);
		} catch {
			// 例外を投げない。サインアウトの失敗に、利用者ができることは無い
		}
	};

	const sendEmailVerification = async (): Promise<AuthResult> => {
		const current = auth.currentUser;
		if (!current) {
			return { ok: false, error: notSignedIn('sendEmailVerification') };
		}
		try {
			await sendEmailVerificationTo(current, actionCodeSettings);
			return { ok: true };
		} catch (error) {
			return { ok: false, error: toAuthError(error) };
		}
	};

	const changePassword = async (
		currentPassword: string,
		nextPassword: string
	): Promise<AuthResult> => {
		const current = auth.currentUser;
		if (!current?.email) {
			// Firebase へ問い合わせずに失敗として返す
			return { ok: false, error: notSignedIn('changePassword') };
		}
		try {
			await reauthenticateWithCredential(
				current,
				EmailAuthProvider.credential(current.email, currentPassword)
			);
		} catch (error) {
			// 再認証で止めるため、変更前のパスワードは有効なまま残る
			return { ok: false, error: toAuthError(error) };
		}
		try {
			await updatePassword(current, nextPassword);
			return { ok: true };
		} catch (error) {
			return { ok: false, error: await withPasswordRequirements(error, nextPassword) };
		}
	};

	const sendPasswordReset = async (email: string): Promise<AuthResult> => {
		try {
			await sendPasswordResetEmail(auth, normalizeEmail(email), actionCodeSettings);
			return { ok: true };
		} catch (error) {
			// 登録の有無を示さない。組み込み先の enableImprovedEmailPrivacy の設定に依存させない
			if (error instanceof FirebaseError && error.code === 'auth/user-not-found') {
				return { ok: true };
			}
			return { ok: false, error: toAuthError(error) };
		}
	};

	const refreshVerification = (): Promise<boolean> => {
		// 実行中の要求があれば、追加の問い合わせをせずその結果を共有する
		runningRefresh ??= runRefreshVerification().finally(() => {
			runningRefresh = null;
		});
		return runningRefresh;
	};

	const runRefreshVerification = async (): Promise<boolean> => {
		const current = auth.currentUser;
		if (!current) {
			return false;
		}
		try {
			await reload(current);
			// クレームも取り直す。片方だけでは、組み込み側のアクセス制御が古い値のまま残る
			await getIdToken(current, true);
		} catch {
			return isEmailVerified;
		}
		isEmailVerified = current.emailVerified;
		return current.emailVerified;
	};

	/** 強度の失敗のときだけ、満たしていない要件を添える */
	const withPasswordRequirements = async (error: unknown, password: string): Promise<AuthError> => {
		const authError = toAuthError(error);
		if (authError.kind !== 'weak-password') {
			return authError;
		}
		return toAuthError(error, await unmetRequirements(password));
	};

	const unmetRequirements = async (password: string): Promise<readonly PasswordRequirement[]> => {
		try {
			return unmetRequirementsOf(await validatePassword(auth, password));
		} catch {
			// ポリシーを取得できなければ理由なしの案内へ落とす
			return [];
		}
	};

	const notSignedIn = (operation: string): AuthError => ({
		kind: 'unknown',
		detail: `${operation}: サインインしていない`,
		unmetPasswordRequirements: []
	});

	return {
		get user() {
			return user;
		},
		get isResolved() {
			return isResolved;
		},
		get isLoggedIn() {
			return user !== null;
		},
		get email() {
			return user?.email ? normalizeEmail(user.email) : null;
		},
		get isEmailVerified() {
			return isEmailVerified;
		},
		get canSelfRegister() {
			return config.selfRegistration;
		},
		signIn,
		signUp,
		signOut,
		changePassword,
		sendPasswordReset,
		sendEmailVerification,
		refreshVerification,
		start,
		stop
	};
};
