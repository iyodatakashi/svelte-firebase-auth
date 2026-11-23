import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { AuthResult } from '#lib/models/auth/auth.types';

/** スロット記録。メールアドレス・パスワード・トークンは持たない */
export interface StoredSlot {
	readonly version: 1;
	readonly id: string;
	/** このスロットにログインしているはずの UID */
	readonly uid: string;
}

/** 保存の成否。保存領域を使えないときは失敗として返し、例外を投げない */
export type StorageResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** ストアがブラウザの保存領域に触るための窓口。`AuthSession` が渡す */
export interface AccountPersistence {
	readSlots(): StorageResult<readonly StoredSlot[]>;
	writeSlot(slot: StoredSlot): StorageResult<void>;
	removeSlot(id: string): StorageResult<void>;
	/** タブの選択。`undefined` はタブ内の記録なし、`null` は明示的な未選択 */
	readActiveId(): StorageResult<string | null | undefined>;
	writeActiveId(id: string | null): StorageResult<void>;
	/** 同じブラウザで最後に開いたアカウント */
	readLastOpenedId(): StorageResult<string | null>;
	writeLastOpenedId(id: string | null): StorageResult<void>;
	/** 別のタブでのスロット記録の変更を受け取る。解除する関数を返す */
	onSlotsChanged(listener: () => void): () => void;
}

/** 照合のために観測した、1つのスロットの状態 */
export interface SlotObservation {
	readonly id: string;
	/** 記録の UID */
	readonly expectedUid: string;
	/** 実際にログインしている UID。ログインしていなければ `null` */
	readonly uid: string | null;
}

/** スロットの照合の結果 */
export interface SlotReconciliation {
	/** 一覧に入れるスロット。ID の順 */
	readonly memberIds: readonly string[];
	/** ログインしていない、または UID が記録と異なるスロット */
	readonly droppedIds: readonly string[];
	/** 同じ UID の重複。重複側の ID から代表の ID への対応 */
	readonly duplicates: ReadonlyMap<string, string>;
}

/**
 * 1つのスロットの Auth を扱う内部のストア。公開しない。
 * 画面と組み込み側は、これを束ねた `AuthStore` だけに触れる
 */
export interface SlotStore {
	readonly user: User | null;
	/** 初回の認証状態の判定が完了したか。1回の購読の中では false へ戻らない */
	readonly isResolved: boolean;
	readonly isEmailVerified: boolean;

	signIn(email: string, password: string): Promise<AuthResult>;
	/** 成功時はサインイン済みにし、確認を求める設定なら確認メールを送る */
	signUp(email: string, password: string): Promise<AuthResult>;
	signOut(): Promise<AuthResult>;
	/** 現在のパスワードによる再認証を伴う */
	changePassword(currentPassword: string, nextPassword: string): Promise<AuthResult>;
	sendEmailVerification(): Promise<AuthResult>;
	/** 利用者と ID トークンのクレームを取り直し、確認済みかどうかを返す */
	refreshVerification(): Promise<boolean>;
	/** 認証状態の購読を開始する。初回の判定が済んだ時点で解決する */
	start(): Promise<void>;
	/** 購読を解除し、公開している状態を初期化する */
	stop(): void;
}

/** スロット。アカウント1件のログイン状態を保持する、名前付き App・Auth と SlotStore の組 */
export interface Slot {
	readonly id: string;
	readonly app: FirebaseApp;
	readonly auth: Auth;
	readonly store: SlotStore;
}
