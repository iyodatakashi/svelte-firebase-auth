import { FirebaseError, deleteApp, initializeApp } from 'firebase/app';
import {
	connectAuthEmulator,
	getAuth,
	inMemoryPersistence,
	sendPasswordResetEmail,
	setPersistence,
	signOut as signOutOf,
	updateCurrentUser,
	type Auth,
	type User
} from 'firebase/auth';
import { normalizeEmail, toAuthError } from '$lib/models/auth/auth';
import { SLOT_APP_PREFIX } from '$lib/models/auth/auth.constants';
import { latestSignedIn, reconcileSlots, representativeOf } from '$lib/models/auth/slots';
import type {
	AccountFailure,
	AccountOperation,
	AccountOperationError,
	AccountPersistence,
	AccountResult,
	AccountSummary,
	AuthConfig,
	AuthResult,
	AuthStage,
	AuthStore,
	SignOutAllResult,
	Slot,
	SlotObservation,
	SlotReconciliation,
	StorageResult,
	StorageStatus
} from '$lib/models/auth/auth.types';
import { createSlotStore } from './slot.svelte';

/**
 * 公開する唯一の認証ストア。
 *
 * アカウントごとのログイン状態は、ライブラリが作る名前付き App の Auth（スロット）が保持する。
 * 渡された Auth（土台の Auth）には、選択中のスロットの利用者の複製だけを入れる。
 * 土台の App から作った Firestore などは、作り直さずに選択中のアカウントの認証で動く
 */
export const createAuthStore = (auth: Auth, config: AuthConfig): AuthStore => {
	// 以下の2つは内部の索引であり、追随の対象にしない。公開する一覧は `memberIds` が担う。
	// 追随の対象にすると、開始を呼んだ効果がこれらを依存として拾い、開始し直しが繰り返される

	/** 生成済みのスロット。一覧に入る前のもの（送信中のサインイン・照合前の復元）も含む */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const slots = new Map<string, Slot>();
	/** 一覧に入れたスロットの UID。ログアウトを観測した後も、同じアカウントの重複を判定するために残す */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const memberUids = new Map<string, string>();

	let memberIds = $state<readonly string[]>([]);
	let activeId = $state<string | null>(null);
	// 土台の Auth の複製。クラスのインスタンスで、中身は runes の追随の対象にならない
	let user = $state.raw<User | null>(null);
	let isResolved = $state(false);
	let startError = $state.raw<AccountOperationError | null>(null);
	let restoreFailures = $state.raw<readonly AccountFailure[]>([]);
	let storageStatus = $state<StorageStatus>('available');
	let operation = $state.raw<AccountOperation | null>(null);

	/**
	 * 土台の Auth が目指す選択。公開する `activeId` とは別に持つ。
	 * 切り替え・サインイン・ログアウト・失効は、まずこれを書き換えてから土台の更新を待ち行列へ積む
	 */
	let target: string | null = null;
	/** 全件のログアウトの途中。1件ずつ外す間に残りが1件になっても、それを選ばない */
	let isSigningOutAll = false;
	/** 土台を更新する処理の待ち行列。複製もサインアウトも非同期であり、並行すると完了の順で中身が決まる */
	let baseQueue: Promise<unknown> = Promise.resolve();
	let persistence: AccountPersistence | null = null;
	let unsubscribeSlots: (() => void) | null = null;
	/** 送信中のサインイン・登録。取りやめるとこれを捨て、後から返った結果を反映しない */
	let pendingAttempt: object | null = null;
	/** 開始のたびに進む。停止した後に、前の開始の続きが状態を書き換えないようにする */
	let generation = 0;
	/** 最後に振ったスロットの ID の時刻。同じミリ秒に作っても、ID の順が作った順になるようにする */
	let lastIssuedAt = 0;

	const actionCodeSettings = { url: config.continueUrl };

	// ---------------------------------------------------------------------------
	// 開始と停止
	// ---------------------------------------------------------------------------

	const start = async (nextPersistence: AccountPersistence): Promise<void> => {
		stop();
		const started = generation;
		const isCurrent = () => started === generation;
		persistence = nextPersistence;

		try {
			// 既定のブラウザ保存のままだと、土台の複製がタブ間で同期され、タブごとの選択が崩れる
			await setPersistence(auth, inMemoryPersistence);
		} catch (error) {
			if (isCurrent()) {
				startError = initializationError(error);
			}
			return;
		}
		if (!isCurrent()) {
			return;
		}

		const records = withStorage((storage) => storage.readSlots()) ?? [];
		const failures: AccountFailure[] = [];
		const observations = await Promise.all(
			records.map(async ({ id, uid }): Promise<SlotObservation | null> => {
				const opened = openSlot(id);
				if (!opened.ok) {
					failures.push({ id, error: opened.error });
					return null;
				}
				await opened.value.store.start();
				return { id, expectedUid: uid, uid: opened.value.store.user?.uid ?? null };
			})
		);
		if (!isCurrent()) {
			return;
		}
		// 単一アカウント指定は選択の UI を持たない。保持しているはずのアカウントを欠いたまま進めると行き詰まる
		if (failures.length > 0 && !config.multiAccount) {
			startError = failures[0].error;
			return;
		}
		restoreFailures = failures;

		const observed = observations.filter((each) => each !== null);
		const reconciliation = reconcileSlots(observed);
		for (const id of reconciliation.droppedIds) {
			withStorage((storage) => storage.removeSlot(id));
			disposeSlot(id);
		}
		for (const { id, expectedUid } of observed) {
			if (!reconciliation.droppedIds.includes(id)) {
				memberUids.set(id, expectedUid);
			}
		}
		memberIds = [...reconciliation.memberIds, ...reconciliation.duplicates.keys()];
		await discardDuplicates(reconciliation);
		await keepLatestOnly();
		if (!isCurrent()) {
			return;
		}

		const initial = initialSelection(reconciliation);
		const moved = await moveTo(initial);
		if (!isCurrent()) {
			return;
		}
		if (!moved.ok && !config.multiAccount) {
			startError = moved.error;
			return;
		}
		if (moved.ok && initial !== null) {
			rememberSelection(initial);
		}

		unsubscribeSlots = nextPersistence.onSlotsChanged(() => void adoptSlotsFromElsewhere());
		isResolved = true;
	};

	/** 購読を解除し、スロットの App を破棄する。ログアウトはしない */
	const stop = (): void => {
		generation += 1;
		unsubscribeSlots?.();
		unsubscribeSlots = null;
		for (const id of [...slots.keys()]) {
			disposeSlot(id);
		}
		memberUids.clear();
		memberIds = [];
		target = null;
		activeId = null;
		user = null;
		isResolved = false;
		startError = null;
		restoreFailures = [];
		operation = null;
		pendingAttempt = null;
		isSigningOutAll = false;
		persistence = null;
		storageStatus = 'available';
	};

	/**
	 * 複数アカウント指定では、タブ内の選択記録を優先し、記録が無ければ最後に開いたアカウントを選ぶ。
	 * 明示的な未選択を引き継いだときは未選択を保つ。ただし保持アカウントが1件だけなら、選ぶ場に
	 * 意味が無いため、どの場合もそれを選ぶ
	 */
	const initialSelection = (reconciliation: SlotReconciliation): string | null => {
		if (!config.multiAccount) {
			return soleMember();
		}
		const recorded = withStorage((storage) => storage.readActiveId());
		const candidate =
			recorded !== undefined
				? representativeOf(recorded, reconciliation)
				: representativeOf(
						withStorage((storage) => storage.readLastOpenedId()) ?? null,
						reconciliation
					);
		return candidate ?? soleMember();
	};

	/** 別のタブで書かれたスロット記録を一覧へ加える。現在のタブの選択は変えない */
	const adoptSlotsFromElsewhere = async (): Promise<void> => {
		const started = generation;
		const records = (withStorage((storage) => storage.readSlots()) ?? []).filter(
			({ id }) => !slots.has(id)
		);
		const adopted = await Promise.all(
			records.map(async ({ id, uid }) => {
				const opened = openSlot(id);
				if (!opened.ok) {
					return null;
				}
				await opened.value.store.start();
				if (opened.value.store.user?.uid !== uid) {
					// ログインが届いていない記録は、書いたタブに任せる
					disposeSlot(id);
					return null;
				}
				return { id, uid };
			})
		);
		if (started !== generation) {
			return;
		}
		const added = adopted.filter((each) => each !== null);
		for (const { id, uid } of added) {
			memberUids.set(id, uid);
		}
		memberIds = [...memberIds, ...added.map(({ id }) => id)];
		await discardDuplicates(
			reconcileSlots(
				memberIds.map((id) => {
					const uid = memberUids.get(id) ?? null;
					return { id, expectedUid: uid ?? '', uid };
				})
			)
		);
		await keepLatestOnly();
		await selectSoleAccount();
	};

	/** 選択が無く、保持アカウントが1件だけなら、それを選ぶ。選ぶ場は選択肢が複数あるときだけ意味がある */
	const selectSoleAccount = async (): Promise<void> => {
		const sole = soleMember();
		if (target !== null || sole === null) {
			return;
		}
		const moved = await moveTo(sole);
		if (moved.ok && target === sole) {
			rememberSelection(sole);
		}
	};

	const soleMember = (): string | null => (memberIds.length === 1 ? memberIds[0] : null);

	/**
	 * 同じ UID の重複を解消する。重複側をログアウトし、選択が重複側を指していれば代表へ付け替える
	 * （`forget`）。代表はどのタブで照合しても同じになる
	 */
	const discardDuplicates = async (reconciliation: SlotReconciliation): Promise<void> => {
		for (const id of reconciliation.duplicates.keys()) {
			if (memberIds.includes(id)) {
				await signOutSlot(id);
			}
		}
	};

	/** 単一アカウント指定で、別のタブとの競合により2件になったら、後からサインインした方だけを残す */
	const keepLatestOnly = async (): Promise<void> => {
		if (config.multiAccount || memberIds.length <= 1) {
			return;
		}
		const survivor = latestSignedIn(
			memberIds.map((id) => ({
				id,
				lastSignInTime: slots.get(id)?.store.user?.metadata?.lastSignInTime
			}))
		);
		for (const id of memberIds.filter((each) => each !== survivor)) {
			await signOutSlot(id);
		}
	};

	// ---------------------------------------------------------------------------
	// スロット
	// ---------------------------------------------------------------------------

	/** 土台の App の設定から名前付き App を作る。同じ ID で作り直せば、保存されたログインが復元される */
	const openSlot = (id: string): AccountResult<Slot> => {
		try {
			const app = initializeApp(auth.app.options, `${SLOT_APP_PREFIX}${id}`);
			const slotAuth = getAuth(app);
			const emulator = auth.emulatorConfig;
			if (emulator) {
				const port = emulator.port === null ? '' : `:${emulator.port}`;
				connectAuthEmulator(slotAuth, `${emulator.protocol}://${emulator.host}${port}`, {
					disableWarnings: true
				});
			}
			const slot: Slot = {
				id,
				app,
				auth: slotAuth,
				store: createSlotStore(slotAuth, config, (next) => onSlotChanged(id, next))
			};
			slots.set(id, slot);
			return { ok: true, value: slot };
		} catch (error) {
			return { ok: false, error: initializationError(error) };
		}
	};

	/** スロットの App はデータアクセスに使われないため、不要になった時点で破棄する */
	const disposeSlot = (id: string): void => {
		const slot = slots.get(id);
		if (!slot) {
			return;
		}
		slots.delete(id);
		slot.store.stop();
		void deleteApp(slot.app).catch(() => {
			// 破棄の失敗に、利用者ができることは無い
		});
	};

	/** 一覧に入れたスロットのログアウト・失効は、どの経路で起きても同じ扱いにする */
	const onSlotChanged = (id: string, next: User | null): void => {
		if (next === null && memberIds.includes(id)) {
			void forget(id);
		}
	};

	/**
	 * ログアウトしたアカウントを一覧から外す。選択中なら土台を空にして明示的な未選択を保存し、
	 * 2件以上残っていれば自動で選ばない。残りがちょうど1件ならそれを選ぶ。
	 * 同じアカウントの重複が残っていれば、そちらへ付け替える
	 */
	const forget = (id: string): Promise<unknown> => {
		if (!memberIds.includes(id)) {
			return baseQueue;
		}
		const uid = memberUids.get(id);
		memberIds = memberIds.filter((each) => each !== id);
		memberUids.delete(id);
		withStorage((storage) => storage.removeSlot(id));
		disposeSlot(id);

		const representative = memberIds.find((each) => memberUids.get(each) === uid) ?? null;
		if (withStorage((storage) => storage.readLastOpenedId()) === id) {
			withStorage((storage) => storage.writeLastOpenedId(representative));
		}
		if (target !== id) {
			return baseQueue;
		}
		target = representative ?? (isSigningOutAll ? null : soleMember());
		if (target === null) {
			// 複製を空にし終える前に、保護された内容を隠す
			activeId = null;
			user = null;
		}
		rememberSelection(target);
		return syncBase();
	};

	// ---------------------------------------------------------------------------
	// 土台の Auth
	// ---------------------------------------------------------------------------

	/**
	 * 土台の Auth を目標に合わせる。実行する時点で目標を読み、対象を持ち越さない。
	 * 完了時に目標が変わっていなければ、選択と利用者を同じ更新で公開する
	 */
	const syncBase = (): Promise<AccountResult<null>> => {
		const run = async (): Promise<AccountResult<null>> => {
			const goal = target;
			const source = goal === null ? null : (slots.get(goal)?.auth.currentUser ?? null);
			try {
				if (source) {
					await updateCurrentUser(auth, source);
				} else {
					await signOutOf(auth);
				}
			} catch (error) {
				return { ok: false, error: { kind: 'auth', cause: toAuthError(error) } };
			}
			if (target === goal) {
				activeId = source ? goal : null;
				user = source ? auth.currentUser : null;
			}
			return { ok: true, value: null };
		};
		const result = baseQueue.then(run);
		baseQueue = result;
		return result;
	};

	/**
	 * 目標を移して土台へ複製する。失敗したら、目標がまだこの操作の値のときに限り元へ戻す。
	 * その間に届いたログアウト・失効の目標は戻さない
	 */
	const moveTo = async (id: string | null): Promise<AccountResult<null>> => {
		const previous = target;
		target = id;
		const result = await syncBase();
		if (!result.ok && target === id) {
			target = previous;
			void syncBase();
		}
		return result;
	};

	/** 選択を確定したことを記録する。タブの選択と最後に開いたアカウントは複数アカウント指定でだけ使う */
	const rememberSelection = (id: string | null): void => {
		if (!config.multiAccount) {
			return;
		}
		withStorage((storage) => storage.writeActiveId(id));
		if (id !== null) {
			withStorage((storage) => storage.writeLastOpenedId(id));
		}
	};

	// ---------------------------------------------------------------------------
	// アカウントの出入りと選択
	// ---------------------------------------------------------------------------

	const signIn = (email: string, password: string) =>
		addAccount((slot) => slot.store.signIn(email, password));

	const signUp = (email: string, password: string) =>
		addAccount((slot) => slot.store.signUp(email, password));

	/** どの画面から呼ばれても新しいスロットで認証する。他の保持アカウントを上書きしない */
	const addAccount = async (
		authenticate: (slot: Slot) => Promise<AuthResult>
	): Promise<AccountResult<AccountSummary>> => {
		if (operation) {
			return failure('busy');
		}
		if (!config.multiAccount && memberIds.length > 0) {
			return failure('limit-reached');
		}
		const opened = openSlot(newSlotId());
		if (!opened.ok) {
			return opened;
		}
		const slot = opened.value;
		const attempt = {};
		pendingAttempt = attempt;
		operation = { kind: 'sign-in' };

		await slot.store.start();
		const result = await authenticate(slot);
		if (pendingAttempt !== attempt) {
			// Firebase の要求は中断できない。取りやめた後に成功しても、そのログインは残さない
			if (result.ok) {
				await slot.store.signOut();
			}
			disposeSlot(slot.id);
			return failure('cancelled');
		}
		pendingAttempt = null;
		const signedIn = slot.auth.currentUser;
		if (!result.ok || !signedIn) {
			disposeSlot(slot.id);
			operation = null;
			return result.ok
				? { ok: false, error: initializationError('サインインした利用者が無い') }
				: { ok: false, error: { kind: 'auth', cause: result.error } };
		}

		const existing = memberIds.find((id) => memberUids.get(id) === signedIn.uid);
		if (existing) {
			await slot.store.signOut();
			disposeSlot(slot.id);
		} else {
			memberUids.set(slot.id, signedIn.uid);
			memberIds = [...memberIds, slot.id];
			withStorage((storage) => storage.writeSlot({ version: 1, id: slot.id, uid: signedIn.uid }));
		}
		const id = existing ?? slot.id;
		const moved = await moveTo(id);
		operation = null;
		return confirmSelection(id, moved);
	};

	const cancelPendingSignIn = (): void => {
		if (pendingAttempt === null) {
			return;
		}
		pendingAttempt = null;
		operation = null;
	};

	const selectAccount = async (id: string): Promise<AccountResult<AccountSummary>> => {
		if (operation) {
			return failure('busy');
		}
		const slot = memberIds.includes(id) ? slots.get(id) : undefined;
		if (!slot) {
			return failure('not-found');
		}
		if (!slot.store.user) {
			return failure('not-signed-in');
		}
		operation = { kind: 'select', id };
		const moved = await moveTo(id);
		operation = null;
		return confirmSelection(id, moved);
	};

	/** 切り替えの結果を確かめて記録する。途中でログアウト・失効が届いていれば失敗とする */
	const confirmSelection = (
		id: string,
		moved: AccountResult<null>
	): AccountResult<AccountSummary> => {
		if (!moved.ok) {
			return moved;
		}
		const summary = target === id ? summaryOf(id) : null;
		if (!summary) {
			return failure('not-signed-in');
		}
		rememberSelection(id);
		return { ok: true, value: summary };
	};

	const signOut = (): Promise<AccountResult<{ readonly id: string }>> =>
		activeId === null ? Promise.resolve(failure('not-signed-in')) : signOutAccount(activeId);

	const signOutAccount = async (id: string): Promise<AccountResult<{ readonly id: string }>> => {
		if (operation) {
			return failure('busy');
		}
		if (!memberIds.includes(id)) {
			return failure('not-found');
		}
		operation = { kind: 'sign-out', id };
		const result = await signOutSlot(id);
		operation = null;
		return result;
	};

	const signOutAll = async (): Promise<SignOutAllResult> => {
		if (operation) {
			return { ok: false, reason: 'busy', signedOutIds: [] };
		}
		operation = { kind: 'sign-out' };
		isSigningOutAll = true;
		const signedOutIds: string[] = [];
		const failed: AccountFailure[] = [];
		for (const id of memberIds) {
			const result = await signOutSlot(id);
			if (result.ok) {
				signedOutIds.push(id);
			} else {
				failed.push({ id, error: result.error });
			}
		}
		isSigningOutAll = false;
		// 一部が失敗して1件だけ残れば、それを選ぶ
		await selectSoleAccount();
		operation = null;
		return failed.length === 0
			? { ok: true, signedOutIds }
			: { ok: false, reason: 'partial', signedOutIds, failed };
	};

	/** そのスロットの Auth に直接ログアウトし、失敗を握りつぶさない */
	const signOutSlot = async (id: string): Promise<AccountResult<{ readonly id: string }>> => {
		const slot = slots.get(id);
		if (!slot) {
			return failure('not-found');
		}
		const result = await slot.store.signOut();
		if (!result.ok) {
			return { ok: false, error: { kind: 'auth', cause: result.error } };
		}
		await forget(id);
		return { ok: true, value: { id } };
	};

	// ---------------------------------------------------------------------------
	// 選択中のアカウントへの操作
	// ---------------------------------------------------------------------------

	/** 呼び出した時点の選択中のスロットに固定する。土台の複製には行わない */
	const activeSlot = (): Slot | undefined => (activeId === null ? undefined : slots.get(activeId));

	const changePassword = async (
		currentPassword: string,
		nextPassword: string
	): Promise<AuthResult> => {
		const slot = activeSlot();
		if (!slot) {
			return notSelected('changePassword');
		}
		const result = await slot.store.changePassword(currentPassword, nextPassword);
		if (result.ok) {
			// 本番の Firebase は、パスワードの変更で他の場所のトークンを失効させる
			await recopy(slot.id);
		}
		return result;
	};

	const sendEmailVerification = async (): Promise<AuthResult> => {
		const slot = activeSlot();
		return slot ? slot.store.sendEmailVerification() : notSelected('sendEmailVerification');
	};

	const refreshVerification = async (): Promise<boolean> => {
		const slot = activeSlot();
		if (!slot) {
			return false;
		}
		const isVerified = await slot.store.refreshVerification();
		if (isVerified) {
			// 取り直したクレームを、土台の App から作ったデータアクセスへ届ける
			await recopy(slot.id);
		}
		return isVerified;
	};

	/** 操作を終えたスロットが、まだ目標であるときだけ複製し直す。切り替え先を上書きしない */
	const recopy = async (id: string): Promise<void> => {
		if (target === id) {
			await syncBase();
		}
	};

	// ---------------------------------------------------------------------------
	// アカウントに依らない操作
	// ---------------------------------------------------------------------------

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

	// ---------------------------------------------------------------------------
	// 補助
	// ---------------------------------------------------------------------------

	/**
	 * 生成した時刻を先頭に持たせ、ID の順が作った順になるようにする。別のタブと衝突しないよう乱数を添える。
	 * 乱数は getRandomValues で作る。randomUUID は https と localhost でしか使えない
	 */
	const newSlotId = (): string => {
		lastIssuedAt = Math.max(Date.now(), lastIssuedAt + 1);
		const random = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
		return `${lastIssuedAt.toString(36).padStart(9, '0')}-${random}`;
	};

	const summaryOf = (id: string): AccountSummary | null => {
		const slot = slots.get(id);
		const current = slot?.store.user;
		if (!slot || !current) {
			return null;
		}
		return {
			id,
			uid: current.uid,
			email: current.email ? normalizeEmail(current.email) : null,
			isEmailVerified: slot.store.isEmailVerified
		};
	};

	/** 保存領域を使えなければ保存不能として公開し、メモリだけで続ける */
	const withStorage = <T>(
		use: (storage: AccountPersistence) => StorageResult<T>
	): T | undefined => {
		if (!persistence) {
			return undefined;
		}
		const result = use(persistence);
		if (!result.ok) {
			storageStatus = 'unavailable';
			return undefined;
		}
		return result.value;
	};

	const activeAccount = (): AccountSummary | null =>
		activeId === null ? null : summaryOf(activeId);

	const stageOf = (): AuthStage => {
		if (!isResolved) {
			return 'unresolved';
		}
		if (memberIds.length === 0) {
			return 'signed-out';
		}
		const account = activeAccount();
		if (account === null) {
			// 残すアカウントへ複製し終えるまでの間（目標がある間）は、未選択に見せない。
			// 単一アカウント指定で選択が無いのは、その間だけである
			return target !== null || !config.multiAccount ? 'unresolved' : 'account-unselected';
		}
		if (config.emailVerification && !account.isEmailVerified) {
			return 'email-unverified';
		}
		return 'ready';
	};

	return {
		get accounts() {
			return memberIds.map(summaryOf).filter((summary) => summary !== null);
		},
		get activeId() {
			return activeId;
		},
		get activeAccount() {
			return activeAccount();
		},
		get user() {
			return user;
		},
		get isLoggedIn() {
			return user !== null;
		},
		get email() {
			return activeAccount()?.email ?? null;
		},
		get isEmailVerified() {
			return activeAccount()?.isEmailVerified ?? false;
		},
		get isResolved() {
			return isResolved;
		},
		get startError() {
			return startError;
		},
		get restoreFailures() {
			return restoreFailures;
		},
		get stage() {
			return stageOf();
		},
		get storageStatus() {
			return storageStatus;
		},
		get operation() {
			return operation;
		},
		get canSelfRegister() {
			return config.selfRegistration;
		},
		get requiresEmailVerification() {
			return config.emailVerification;
		},
		get routes() {
			return config.routes;
		},
		signIn,
		signUp,
		cancelPendingSignIn,
		selectAccount,
		signOut,
		signOutAccount,
		signOutAll,
		changePassword,
		sendEmailVerification,
		refreshVerification,
		sendPasswordReset,
		start,
		stop
	};
};

const failure = (
	kind: 'not-found' | 'not-signed-in' | 'busy' | 'cancelled' | 'limit-reached'
): { readonly ok: false; readonly error: AccountOperationError } => ({
	ok: false,
	error: { kind }
});

const initializationError = (error: unknown): AccountOperationError => ({
	kind: 'initialization',
	detail: error instanceof Error ? error.message : String(error)
});

const notSelected = (operation: string): AuthResult => ({
	ok: false,
	error: {
		kind: 'unknown',
		detail: `${operation}: アカウントが選択されていない`,
		unmetPasswordRequirements: []
	}
});
