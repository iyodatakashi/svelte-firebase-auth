import {
	EmailAuthProvider,
	createUserWithEmailAndPassword,
	getIdToken,
	getIdTokenResult,
	onAuthStateChanged,
	reauthenticateWithCredential,
	reload,
	sendEmailVerification as sendEmailVerificationTo,
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
	PasswordRequirement,
	SlotStore
} from '$lib/models/auth/auth.types';

/**
 * 1つのスロットの Auth が持つ認証状態と、その Auth への操作。
 * 公開しない。`AuthStore` がスロットごとに生成して束ねる
 */
export const createSlotStore = (
	auth: Auth,
	config: AuthConfig,
	onChanged?: (user: User | null) => void
): SlotStore => {
	let user = $state<User | null>(null);
	let isResolved = $state(false);
	// 利用者はクラスのインスタンスで runes の追随の対象にならないため、確認済みは独立して持つ
	let isEmailVerified = $state(false);

	let unsubscribe: (() => void) | null = null;
	let runningRefresh: Promise<boolean> | null = null;

	/** 確認と再設定の完了後の戻り先。既定のアクションハンドラを経由させる */
	const actionCodeSettings: ActionCodeSettings = { url: config.continueUrl };

	const start = (): Promise<void> => {
		stop();
		return new Promise((resolve) => {
			const apply = (next: User | null) => {
				user = next;
				isEmailVerified = next?.emailVerified ?? false;
				isResolved = true;
				resolve();
				onChanged?.(next);
			};
			const listener = (next: User | null) => {
				if (!next?.emailVerified) {
					apply(next);
					return;
				}
				void alignClaimWithVerification(next).then(() => {
					// 揃えている間に購読をやめたか、別の利用者に替わっていれば反映しない
					if (unsubscribe === stopListening && auth.currentUser === next) {
						apply(next);
					}
				});
			};
			const stopListening = onAuthStateChanged(auth, listener);
			unsubscribe = stopListening;
		});
	};

	/**
	 * 利用者の情報が確認済みなのに ID トークンの印が未確認なら、印を取り直す。
	 * Firebase は保存された利用者を復元するとき利用者の情報だけを取り直し、印は期限まで古いまま使う。
	 * 段階を通過させる時点で、組み込み側のアクセス制御が見る印も確認済みにしておく
	 */
	const alignClaimWithVerification = async (current: User): Promise<void> => {
		try {
			const { claims } = await getIdTokenResult(current);
			if (claims.email_verified !== true) {
				await getIdToken(current, true);
			}
		} catch {
			// 取り直せなくても判定は止めない。印は期限で新しくなる
		}
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
		if (config.emailVerification) {
			// アカウントができていれば、確認メールの送信の失敗を登録の失敗として返さない
			await sendEmailVerification();
		}
		return { ok: true };
	};

	const signOut = async (): Promise<AuthResult> => {
		try {
			await signOutOf(auth);
			return { ok: true };
		} catch (error) {
			// 握りつぶさない。ログアウトできなかったアカウントを、利用者が再試行できるようにする
			return { ok: false, error: toAuthError(error) };
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
		get isEmailVerified() {
			return isEmailVerified;
		},
		signIn,
		signUp,
		signOut,
		changePassword,
		sendEmailVerification,
		refreshVerification,
		start,
		stop
	};
};
