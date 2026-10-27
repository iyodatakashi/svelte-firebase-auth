import { vi } from 'vitest';
import type { User } from 'firebase/auth';
import type {
	AccountOperation,
	AccountOperationError,
	AccountResult,
	AccountSummary,
	AuthErrorKind,
	AuthResult,
	AuthRoutes,
	AuthStage,
	AuthStore,
	PasswordRequirement,
	StorageStatus
} from '$lib/models/auth/auth.types';

export interface FakeStoreOptions {
	readonly email?: string | null;
	readonly isEmailVerified?: boolean;
	readonly canSelfRegister?: boolean;
	readonly requiresEmailVerification?: boolean;
	readonly isLoggedIn?: boolean;
	readonly routes?: AuthRoutes;
	/** 保持しているアカウント。省略時は `email` のアカウント1件 */
	readonly accounts?: readonly AccountSummary[];
	/** 選択中のアカウント。省略時は先頭のアカウント */
	readonly activeId?: string | null;
}

/** 画面のテストが読む既定の経路。設定どおりの経路へ遷移することを確かめる */
export const fakeRoutes: AuthRoutes = {
	signIn: '/signin',
	signUp: '/signup',
	verifyEmail: '/verify-email',
	passwordReset: '/password-reset',
	afterSignIn: '/'
};

export const fakeAccount = (overrides: Partial<AccountSummary> = {}): AccountSummary => ({
	id: 'account-1',
	uid: 'uid-1',
	email: 'user@example.com',
	isEmailVerified: false,
	...overrides
});

/**
 * 画面のテスト用のストア。画面は `store` を受け取るだけで Firebase を必要としない。
 * 選択・確認済み・段階は runes の状態として持ち、テストから書き換えられるようにする
 */
export const fakeStore = (options: FakeStoreOptions = {}) => {
	const initialAccounts =
		options.accounts ??
		((options.isLoggedIn ?? true)
			? [
					fakeAccount({
						email: options.email === undefined ? 'user@example.com' : options.email,
						isEmailVerified: options.isEmailVerified ?? false
					})
				]
			: []);
	let accounts = $state<AccountSummary[]>([...initialAccounts]);
	let activeId = $state<string | null>(
		options.activeId === undefined ? (initialAccounts[0]?.id ?? null) : options.activeId
	);
	let stageOverride = $state<AuthStage | null>(null);
	let operation = $state<AccountOperation | null>(null);
	let storageStatus = $state<StorageStatus>('available');
	const requiresEmailVerification = options.requiresEmailVerification ?? true;

	const activeAccount = (): AccountSummary | null =>
		accounts.find((account) => account.id === activeId) ?? null;
	const ok: AuthResult = { ok: true };
	const selected = (): AccountResult<AccountSummary> => {
		const account = activeAccount() ?? fakeAccount();
		return { ok: true, value: account };
	};

	const store: AuthStore = {
		get accounts() {
			return accounts;
		},
		get activeId() {
			return activeId;
		},
		get activeAccount() {
			return activeAccount();
		},
		get user() {
			const account = activeAccount();
			return account ? ({ uid: account.uid } as User) : null;
		},
		get isLoggedIn() {
			return activeAccount() !== null;
		},
		get email() {
			return activeAccount()?.email ?? null;
		},
		get isEmailVerified() {
			return activeAccount()?.isEmailVerified ?? false;
		},
		isResolved: true,
		startError: null,
		restoreFailures: [],
		get stage() {
			if (stageOverride !== null) {
				return stageOverride;
			}
			const account = activeAccount();
			if (accounts.length === 0) {
				return 'signed-out';
			}
			if (account === null) {
				return 'account-unselected';
			}
			return requiresEmailVerification && !account.isEmailVerified ? 'email-unverified' : 'ready';
		},
		get storageStatus() {
			return storageStatus;
		},
		get operation() {
			return operation;
		},
		canSelfRegister: options.canSelfRegister ?? true,
		requiresEmailVerification,
		routes: options.routes ?? fakeRoutes,
		signIn: vi.fn(async () => selected()),
		signUp: vi.fn(async () => selected()),
		cancelPendingSignIn: vi.fn(),
		selectAccount: vi.fn(async (id: string) => {
			activeId = id;
			return selected();
		}),
		signOut: vi.fn(async () => ({ ok: true as const, value: { id: activeId ?? '' } })),
		signOutAccount: vi.fn(async (id: string) => ({ ok: true as const, value: { id } })),
		signOutAll: vi.fn(async () => ({
			ok: true as const,
			signedOutIds: accounts.map((account) => account.id)
		})),
		changePassword: vi.fn(async () => ok),
		sendPasswordReset: vi.fn(async () => ok),
		sendEmailVerification: vi.fn(async () => ok),
		refreshVerification: vi.fn(async () => activeAccount()?.isEmailVerified ?? false),
		start: vi.fn(async () => undefined),
		stop: vi.fn()
	};

	return {
		store,
		/** 別の端末で、選択中のアカウントの確認が済んだ状況を作る */
		markVerified: () => {
			accounts = accounts.map((account) =>
				account.id === activeId ? { ...account, isEmailVerified: true } : account
			);
		},
		/** 選択中のアカウントを替える。一覧に無ければ加える */
		switchTo: (account: AccountSummary | null) => {
			if (account && !accounts.some((each) => each.id === account.id)) {
				accounts = [...accounts, account];
			}
			activeId = account?.id ?? null;
		},
		/** 一覧から外す。ログアウトにあたる */
		remove: (id: string) => {
			accounts = accounts.filter((account) => account.id !== id);
			if (activeId === id) {
				activeId = null;
			}
		},
		setStage: (stage: AuthStage | null) => {
			stageOverride = stage;
		},
		setOperation: (next: AccountOperation | null) => {
			operation = next;
		},
		setStorageStatus: (next: StorageStatus) => {
			storageStatus = next;
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

/** アカウントの操作の、認証による失敗 */
export const authFailureOf = <T>(
	kind: AuthErrorKind,
	unmetPasswordRequirements: PasswordRequirement[] = []
): AccountResult<T> => ({
	ok: false,
	error: {
		kind: 'auth',
		cause: { kind, detail: 'detail', unmetPasswordRequirements }
	}
});

/** アカウントの操作の、認証以外の失敗 */
export const operationFailureOf = <T>(error: AccountOperationError): AccountResult<T> => ({
	ok: false,
	error
});
