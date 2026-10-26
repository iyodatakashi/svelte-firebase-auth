import { vi } from 'vitest';
import type { FirebaseOptions } from 'firebase/app';
import type { Auth, PasswordValidationStatus, User } from 'firebase/auth';

/**
 * `firebase/auth` と `firebase/app` の差し替え。ストアが呼ぶものだけを並べる。
 *
 * Firebase の振る舞いのうちストアが前提にするもの（サインインで `currentUser` が変わり購読へ届く、
 * 名前付き App の Auth は再読み込みを跨いでログイン状態を保つ）だけを模す。
 * 実際の振る舞いはエミュレータのテストで確かめる
 */

interface FakeApp {
	readonly name: string;
	readonly options: FirebaseOptions;
}

type Listener = (user: User | null) => void;

const listeners = new Map<object, Set<Listener>>();
const apps = new Map<string, FakeApp>();
const auths = new Map<FakeApp, Auth>();
/** 名前付き App ごとのログイン状態。ブラウザの保存領域にあたり、再読み込みを跨いで残る */
const persisted = new Map<string, User>();
/** メモリのみの保存方法に切り替えた Auth。ログイン状態を保存しない */
const inMemory = new Set<object>();
let signInCount = 0;

const notify = (auth: object, user: User | null): void => {
	for (const listener of listeners.get(auth) ?? []) {
		listener(user);
	}
};

/** 認証インスタンスの利用者を差し替え、保存と購読へ反映する */
const setCurrentUser = (auth: Auth, user: User | null): void => {
	Object.assign(auth, { currentUser: user });
	const appName = (auth as Partial<Auth>).app?.name;
	if (appName !== undefined && !inMemory.has(auth)) {
		if (user) {
			persisted.set(appName, user);
		} else {
			persisted.delete(appName);
		}
	}
	notify(auth, user);
};

/** メールアドレスごとに同じ UID を返す。サインインのたびに最終サインイン時刻を進める */
const signedInUserFor = (email: string): User => {
	signInCount += 1;
	return fakeUser({
		uid: `uid-${email}`,
		email,
		metadata: { lastSignInTime: new Date(Date.UTC(2026, 0, 1, 0, 0, signInCount)).toUTCString() }
	} as Partial<User>);
};

export const firebaseAuthMock = {
	getAuth: vi.fn((app: FakeApp): Auth => {
		const existing = auths.get(app);
		if (existing) {
			return existing;
		}
		const auth = {
			app,
			name: app.name,
			currentUser: persisted.get(app.name) ?? null,
			emulatorConfig: null
		} as unknown as Auth;
		auths.set(app, auth);
		return auth;
	}),
	connectAuthEmulator: vi.fn(),
	inMemoryPersistence: { type: 'NONE' },
	setPersistence: vi.fn(async (auth: Auth) => {
		// 切り替えると、それまで保存されていたログイン状態は保存領域から消え、メモリへ移る
		inMemory.add(auth);
		const appName = (auth as Partial<Auth>).app?.name;
		if (appName !== undefined) {
			persisted.delete(appName);
		}
	}),
	updateCurrentUser: vi.fn(async (auth: Auth, user: User | null) => {
		// 複製は別のオブジェクトになる
		setCurrentUser(auth, user ? { ...user } : null);
	}),
	onAuthStateChanged: vi.fn((auth: Auth, next: Listener) => {
		const set = listeners.get(auth) ?? new Set<Listener>();
		listeners.set(auth, set);
		set.add(next);
		// Firebase と同じく、登録の直後に現在の状態を非同期で届ける
		queueMicrotask(() => {
			if (set.has(next)) {
				next(auth.currentUser);
			}
		});
		return () => set.delete(next);
	}),
	signInWithEmailAndPassword: vi.fn(async (auth: Auth, email: string) => {
		const user = signedInUserFor(email);
		setCurrentUser(auth, user);
		return { user };
	}),
	createUserWithEmailAndPassword: vi.fn(async (auth: Auth, email: string) => {
		const user = signedInUserFor(email);
		setCurrentUser(auth, user);
		return { user };
	}),
	signOut: vi.fn(async (auth: Auth) => {
		setCurrentUser(auth, null);
	}),
	sendEmailVerification: vi.fn(async () => undefined),
	sendPasswordResetEmail: vi.fn(async () => undefined),
	reauthenticateWithCredential: vi.fn(async () => ({})),
	updatePassword: vi.fn(async () => undefined),
	reload: vi.fn<(user: User) => Promise<void>>(async () => undefined),
	getIdToken: vi.fn(async () => 'token'),
	validatePassword: vi.fn(
		async (): Promise<PasswordValidationStatus> => ({ isValid: false }) as PasswordValidationStatus
	),
	EmailAuthProvider: {
		credential: vi.fn((email: string, password: string) => ({ email, password }))
	}
};

export const firebaseAppMock = {
	initializeApp: vi.fn((options: FirebaseOptions, name: string): FakeApp => {
		if (apps.has(name)) {
			throw new Error(`duplicate-app: ${name}`);
		}
		const app = { name, options };
		apps.set(name, app);
		return app;
	}),
	deleteApp: vi.fn(async (app: FakeApp) => {
		apps.delete(app.name);
		const auth = auths.get(app);
		if (auth) {
			listeners.delete(auth);
			auths.delete(app);
		}
	})
};

/** 購読しているすべての受け手へ、認証状態の変化を届ける。対象を指定すればその Auth だけに届ける */
export const emitAuthState = (user: User | null, auth?: Auth): void => {
	if (auth) {
		notify(auth, user);
		return;
	}
	for (const target of listeners.keys()) {
		notify(target, user);
	}
};

/** 止めた呼び出しの再開。失敗させるときは原因を渡す */
export interface Held {
	readonly release: () => void;
	readonly fail: (error: unknown) => void;
}

const holdGate = () => {
	let open: (failure: unknown) => void = () => {};
	const opened = new Promise<unknown>((resolve) => {
		open = resolve;
	});
	const held: Held = { release: () => open(undefined), fail: (error) => open(error) };
	return { opened, held };
};

/** 次の複製（`updateCurrentUser`）を、再開されるまで止める */
export const holdNextCopy = (): Held => {
	const { opened, held } = holdGate();
	firebaseAuthMock.updateCurrentUser.mockImplementationOnce(async (auth, user) => {
		const failure = await opened;
		if (failure) {
			throw failure;
		}
		setCurrentUser(auth, user ? { ...user } : null);
	});
	return held;
};

/** 次のサインインを、再開されるまで止める */
export const holdNextSignIn = (): Held => {
	const { opened, held } = holdGate();
	firebaseAuthMock.signInWithEmailAndPassword.mockImplementationOnce(async (auth, email) => {
		const failure = await opened;
		if (failure) {
			throw failure;
		}
		const user = signedInUserFor(email);
		setCurrentUser(auth, user);
		return { user };
	});
	return held;
};

/** 次のサインアウトを、再開されるまで止める */
export const holdNextSignOut = (): Held => {
	const { opened, held } = holdGate();
	firebaseAuthMock.signOut.mockImplementationOnce(async (auth) => {
		const failure = await opened;
		if (failure) {
			throw failure;
		}
		setCurrentUser(auth, null);
	});
	return held;
};

/** 次の利用者の取り直し（`reload`）を、再開されるまで止める。再開時に確認済みにする */
export const holdNextReload = (): Held => {
	const { opened, held } = holdGate();
	firebaseAuthMock.reload.mockImplementationOnce(async (user: User) => {
		const failure = await opened;
		if (failure) {
			throw failure;
		}
		Object.assign(user, { emailVerified: true });
	});
	return held;
};

/** 登録されている購読の数 */
export const listenerCount = (): number =>
	[...listeners.values()].reduce((count, set) => count + set.size, 0);

/** 生成済みの App・Auth を捨て、保存されたログイン状態だけを残す。再読み込みにあたる */
export const reloadFirebase = (): void => {
	listeners.clear();
	apps.clear();
	auths.clear();
	inMemory.clear();
};

/** 名前付き App の Auth を名前から引く。生成されていなければ `undefined` */
export const authOf = (appName: string): Auth | undefined => {
	const app = apps.get(appName);
	return app ? auths.get(app) : undefined;
};

/** 別のタブでのサインインにあたる。保存されたログイン状態を書き、生成済みの Auth へ同期する */
export const signInElsewhere = (appName: string, email: string): User => {
	const user = signedInUserFor(email);
	persisted.set(appName, user);
	const auth = authOf(appName);
	if (auth) {
		setCurrentUser(auth, user);
	}
	return user;
};

/** 別のタブでのログアウト・失効にあたる。生成済みの Auth へ同期する */
export const signOutElsewhere = (appName: string): void => {
	persisted.delete(appName);
	const auth = authOf(appName);
	if (auth) {
		setCurrentUser(auth, null);
	}
};

export const resetFirebaseFake = (): void => {
	reloadFirebase();
	persisted.clear();
	signInCount = 0;
	for (const value of [...Object.values(firebaseAuthMock), ...Object.values(firebaseAppMock)]) {
		if (vi.isMockFunction(value)) {
			// 一度きりの差し替えを次のテストへ持ち越さない
			value.mockReset();
		}
	}
	firebaseAuthMock.EmailAuthProvider.credential.mockReset();
};

export const fakeUser = (overrides: Partial<User> = {}): User =>
	({ uid: 'uid-1', email: 'User@Example.com', emailVerified: false, ...overrides }) as User;

/** ストアが currentUser を読むため、購読の受け手と同じ利用者を持たせる */
export const fakeAuth = (currentUser: User | null = null): Auth => ({ currentUser }) as Auth;
