<script lang="ts">
	import { untrack } from 'svelte';
	import { parseStoredSlot } from '#lib/models/slot/slot';
	import type { AuthSessionProps } from '#lib/models/auth/auth.types';
	import type { AccountPersistence, StorageResult, StoredSlot } from '#lib/models/slot/slot.types';

	let { store, namespace, syncAccountAcrossTabs = false }: AuthSessionProps = $props();

	/** 選択を共有する他のタブの土台がそろうのを待つ上限。応答しないタブに、切り替えを止めさせない */
	const HOLD_TIMEOUT_MS = 2000;

	type SelectionPersistence = Pick<
		AccountPersistence,
		'readActiveId' | 'writeActiveId' | 'onSelectionChanged' | 'holdSelection'
	>;

	/** 選択の記録を、記録なし（undefined）と明示的な未選択（null）を区別して読み書きする */
	const selectionRecord = (storage: () => Storage, key: string) => ({
		readActiveId: () =>
			attempt(() => {
				const stored = storage().getItem(key);
				if (stored === null) {
					return undefined;
				}
				const value = parseJson(stored);
				return typeof value === 'string' ? value : null;
			}),
		writeActiveId: (id: string | null | undefined) =>
			attempt(() =>
				id === undefined ? storage().removeItem(key) : storage().setItem(key, JSON.stringify(id))
			)
	});

	/** 選択をタブごとに持つ（`sessionStorage`）。他のタブの記録は見えず、そろえる相手も無い */
	const tabSelection = (prefix: string): SelectionPersistence => ({
		...selectionRecord(() => sessionStorage, `${prefix}:active`),
		onSelectionChanged: () => () => {},
		holdSelection: async () => {}
	});

	/**
	 * 選択をブラウザで1つ持つ（`localStorage`）。各タブは、土台の Auth に入れたアカウントの名前の
	 * ロックを共有で持つ。別の名前のロックが残っている間は、土台のそろっていないタブがある
	 */
	const syncedSelection = (
		prefix: string
	): { readonly persistence: SelectionPersistence; readonly release: () => void } => {
		const activeKey = `${prefix}:active`;
		const lockPrefix = `${prefix}:base:`;
		let held: { readonly name: string; readonly release: () => void } | null = null;
		let isReleased = false;

		const acquire = (name: string): Promise<() => void> =>
			new Promise((acquired) => {
				void navigator.locks.request(
					name,
					{ mode: 'shared' },
					() => new Promise<void>((release) => acquired(release))
				);
			});

		/** そのロックを持つタブが手放すまで待つ */
		const waitForRelease = async (name: string): Promise<void> => {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), HOLD_TIMEOUT_MS);
			try {
				await navigator.locks.request(name, { signal: controller.signal }, () => {});
			} catch {
				// 時間内に手放されなかった。待つのをやめて進む
			} finally {
				clearTimeout(timer);
			}
		};

		const holdSelection = async (id: string | null): Promise<void> => {
			// https でも localhost でもないページには、ロックが無い。待たずに進む
			if (!('locks' in navigator)) {
				return;
			}
			const name = `${lockPrefix}${id ?? ''}`;
			if (held?.name !== name) {
				const release = await acquire(name);
				// 取得を待つ間に停止していれば、持たない
				if (isReleased) {
					release();
					return;
				}
				held?.release();
				held = { name, release };
			}
			const { held: locks = [] } = await navigator.locks.query();
			const others = new Set(
				locks.flatMap(({ name: each }) =>
					each !== undefined && each.startsWith(lockPrefix) && each !== name ? [each] : []
				)
			);
			await Promise.all([...others].map(waitForRelease));
		};

		return {
			persistence: {
				...selectionRecord(() => localStorage, activeKey),
				onSelectionChanged: (listener) => {
					const onStorage = (event: StorageEvent) => {
						if (
							event.storageArea === localStorage &&
							(event.key === null || event.key === activeKey)
						) {
							listener();
						}
					};
					window.addEventListener('storage', onStorage);
					return () => window.removeEventListener('storage', onStorage);
				},
				holdSelection
			},
			release: () => {
				isReleased = true;
				held?.release();
				held = null;
			}
		};
	};

	/**
	 * 保存の窓口。スロット記録と最後に開いたアカウントはブラウザ共通（`localStorage`）に置く。
	 * 選択の置き場所は `syncAccountAcrossTabs` が決める。認証の真実は各スロットの Auth が持ち、
	 * ここに置くのはスロットへの索引だけである。パスワードもトークンも置かない
	 */
	const createPersistence = (
		prefix: string,
		selectionPersistence: SelectionPersistence
	): AccountPersistence => {
		const slotPrefix = `${prefix}:slot:`;
		const lastOpenedKey = `${prefix}:last-opened`;

		return {
			...selectionPersistence,
			readSlots: () =>
				attempt(() => {
					const slots: StoredSlot[] = [];
					for (let index = 0; index < localStorage.length; index++) {
						const key = localStorage.key(index);
						if (key?.startsWith(slotPrefix)) {
							const slot = parseStoredSlot(parseJson(localStorage.getItem(key)));
							if (slot) {
								slots.push(slot);
							}
						}
					}
					return slots;
				}),
			// スロットごとのキーに書く。別のタブとの書き込みが競合しない
			writeSlot: (slot) =>
				attempt(() => localStorage.setItem(`${slotPrefix}${slot.id}`, JSON.stringify(slot))),
			removeSlot: (id) => attempt(() => localStorage.removeItem(`${slotPrefix}${id}`)),
			readLastOpenedId: () => attempt(() => localStorage.getItem(lastOpenedKey)),
			writeLastOpenedId: (id) =>
				attempt(() =>
					id === null
						? localStorage.removeItem(lastOpenedKey)
						: localStorage.setItem(lastOpenedKey, id)
				),
			// `storage` は別のタブでの変更だけを届ける。最後に開いたアカウントの変更では選択を変えない
			onSlotsChanged: (listener) => {
				const onStorage = (event: StorageEvent) => {
					if (event.key === null || event.key.startsWith(slotPrefix)) {
						listener();
					}
				};
				window.addEventListener('storage', onStorage);
				return () => window.removeEventListener('storage', onStorage);
			}
		};
	};

	/** 保存領域が使えない環境でも例外を投げない。失敗として返し、ストアはメモリで続ける */
	const attempt = <T,>(use: () => T): StorageResult<T> => {
		try {
			return { ok: true, value: use() };
		} catch {
			return { ok: false };
		}
	};

	const parseJson = (value: string | null): unknown => {
		if (value === null) {
			return null;
		}
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	};

	// 効果はブラウザでのみ走る。画面が閉じただけでは、ログイン状態を失わせない。
	// 開始し直すのはストア・名前空間・選択をそろえるかどうかが替わったときだけ。開始の中で読む状態を依存として拾わない
	const start = (prefix: string, selectionPersistence: SelectionPersistence): void => {
		const persistence = createPersistence(prefix, selectionPersistence);
		untrack(() => void store.start(persistence));
	};

	$effect(() => {
		const target = store;
		const prefix = `svelte-firebase-auth:${namespace}`;

		if (syncAccountAcrossTabs) {
			const shared = syncedSelection(prefix);
			start(prefix, shared.persistence);
			return () => {
				untrack(() => target.stop());
				shared.release();
			};
		}

		start(prefix, tabSelection(prefix));
		return () => untrack(() => target.stop());
	});
</script>
