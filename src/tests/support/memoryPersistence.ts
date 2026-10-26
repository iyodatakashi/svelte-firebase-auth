import type { AccountPersistence, StorageResult, StoredSlot } from '$lib/models/auth/auth.types';

/**
 * ブラウザ保存の差し替え。ブラウザ共通の領域（スロット記録・最後に開いたアカウント）を共有し、
 * タブ単位の領域（選択）をタブごとに持つ
 */
export const memoryBrowser = () => {
	const slots = new Map<string, StoredSlot>();
	let lastOpenedId: string | null = null;
	let isAvailable = true;
	const listeners = new Set<() => void>();

	const ok = <T>(value: T): StorageResult<T> => (isAvailable ? { ok: true, value } : { ok: false });

	/** タブを開く。`activeId` は元のタブから引き継いだ選択（`undefined` は記録なし） */
	const openTab = (initialActiveId?: string | null) => {
		let activeId: string | null | undefined = initialActiveId;

		const persistence: AccountPersistence = {
			readSlots: () => ok([...slots.values()]),
			writeSlot: (slot) => {
				if (isAvailable) {
					slots.set(slot.id, slot);
				}
				return ok(undefined);
			},
			removeSlot: (id) => {
				if (isAvailable) {
					slots.delete(id);
				}
				return ok(undefined);
			},
			readActiveId: () => ok(activeId),
			writeActiveId: (id) => {
				if (isAvailable) {
					activeId = id;
				}
				return ok(undefined);
			},
			readLastOpenedId: () => ok(lastOpenedId),
			writeLastOpenedId: (id) => {
				if (isAvailable) {
					lastOpenedId = id;
				}
				return ok(undefined);
			},
			onSlotsChanged: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};

		return {
			persistence,
			get activeId() {
				return activeId;
			}
		};
	};

	return {
		openTab,
		slots,
		get lastOpenedId() {
			return lastOpenedId;
		},
		/** 別のタブで最後に開いたアカウントが変わった状況を作る */
		setLastOpenedId: (id: string | null) => {
			lastOpenedId = id;
		},
		/** 別のタブでスロット記録が書かれた状況を作る。記録を書き、変更を知らせる */
		writeSlotElsewhere: (slot: StoredSlot) => {
			slots.set(slot.id, slot);
			for (const listener of listeners) {
				listener();
			}
		},
		setAvailable: (available: boolean) => {
			isAvailable = available;
		}
	};
};
