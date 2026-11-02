<script lang="ts">
	import { untrack } from 'svelte';
	import { parseStoredSlot } from '$lib/models/auth/slots';
	import type {
		AccountPersistence,
		AuthSessionProps,
		StorageResult,
		StoredSlot
	} from '$lib/models/auth/auth.types';

	let { store, namespace }: AuthSessionProps = $props();

	/**
	 * 保存の窓口。スロット記録と最後に開いたアカウントはブラウザ共通（`localStorage`）、
	 * 選択はタブ単位（`sessionStorage`）に置く。認証の真実は各スロットの Auth が持ち、
	 * ここに置くのはスロットへの索引だけである。パスワードもトークンも置かない
	 */
	const createPersistence = (prefix: string): AccountPersistence => {
		const slotPrefix = `${prefix}:slot:`;
		const lastOpenedKey = `${prefix}:last-opened`;
		const activeKey = `${prefix}:active`;

		return {
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
			readActiveId: () =>
				attempt(() => {
					const stored = sessionStorage.getItem(activeKey);
					// 記録なし（undefined）と、明示的な未選択（null）を区別する
					if (stored === null) {
						return undefined;
					}
					const value = parseJson(stored);
					return typeof value === 'string' ? value : null;
				}),
			writeActiveId: (id) => attempt(() => sessionStorage.setItem(activeKey, JSON.stringify(id))),
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
	// 開始し直すのはストアか名前空間が替わったときだけ。開始の中で読む状態を依存として拾わない
	$effect(() => {
		const target = store;
		const persistence = createPersistence(`svelte-firebase-auth:${namespace}`);
		untrack(() => void target.start(persistence));
		return () => untrack(() => target.stop());
	});
</script>
