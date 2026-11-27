import type { AccountPersistence, StorageResult, StoredSlot } from '#lib/models/slot/slot.types';

/**
 * ブラウザ保存の差し替え。ブラウザ共通の領域（スロット記録・最後に開いたアカウント）を共有する。
 * 選択は、`openTab` で開いたタブはタブごとに、`openSharingTab` で開いたタブはブラウザで1つ持つ
 */
export const memoryBrowser = () => {
	const slots = new Map<string, StoredSlot>();
	let lastOpenedId: string | null = null;
	let isAvailable = true;
	const listeners = new Set<() => void>();
	/** ブラウザで1つ持つ選択 */
	let sharedActiveId: string | null | undefined;
	const selectionListeners = new Set<() => void>();
	/** 選択を共有する他のタブの土台がそろうのを待つ */
	let othersAligned: Promise<void> = Promise.resolve();

	const ok = <T>(value: T): StorageResult<T> => (isAvailable ? { ok: true, value } : { ok: false });

	const browserWide = (): Pick<
		AccountPersistence,
		| 'readSlots'
		| 'writeSlot'
		| 'removeSlot'
		| 'readLastOpenedId'
		| 'writeLastOpenedId'
		| 'onSlotsChanged'
	> => ({
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
	});

	/** タブを開く。`activeId` は元のタブから引き継いだ選択（`undefined` は記録なし） */
	const openTab = (initialActiveId?: string | null) => {
		let activeId: string | null | undefined = initialActiveId;

		const persistence: AccountPersistence = {
			...browserWide(),
			readActiveId: () => ok(activeId),
			writeActiveId: (id) => {
				if (isAvailable) {
					activeId = id;
				}
				return ok(undefined);
			},
			onSelectionChanged: () => () => {},
			holdSelection: async () => {}
		};

		return {
			persistence,
			get activeId() {
				return activeId;
			}
		};
	};

	/**
	 * 選択をブラウザで1つ持つタブを開く。他のタブは `selectElsewhere` と `keepOthersBehind` で模す
	 */
	const openSharingTab = () => {
		let heldId: string | null | undefined;

		const persistence: AccountPersistence = {
			...browserWide(),
			readActiveId: () => ok(sharedActiveId),
			writeActiveId: (id) => {
				if (isAvailable) {
					sharedActiveId = id;
				}
				return ok(undefined);
			},
			onSelectionChanged: (listener) => {
				selectionListeners.add(listener);
				return () => selectionListeners.delete(listener);
			},
			holdSelection: async (id) => {
				heldId = id;
				await othersAligned;
			}
		};

		return {
			persistence,
			/** このタブが、土台に入れたと他のタブへ示しているアカウント */
			get heldId() {
				return heldId;
			}
		};
	};

	return {
		openTab,
		openSharingTab,
		slots,
		get sharedActiveId() {
			return sharedActiveId;
		},
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
		/** 別のタブで選択が変わった状況を作る。記録を書き、変更を知らせる */
		selectElsewhere: (id: string | null) => {
			sharedActiveId = id;
			for (const listener of selectionListeners) {
				listener();
			}
		},
		/** 別のタブで選択が変わり、その通知がまだ届いていない状況を作る */
		selectElsewhereSilently: (id: string | null) => {
			sharedActiveId = id;
		},
		/** 他のタブの土台がそろっていない状況を作る。返す関数を呼ぶとそろう */
		keepOthersBehind: (): (() => void) => {
			let align = () => {};
			othersAligned = new Promise((resolve) => {
				align = resolve;
			});
			return align;
		},
		setAvailable: (available: boolean) => {
			isAvailable = available;
		}
	};
};
