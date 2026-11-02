import type { SlotObservation, SlotReconciliation, StoredSlot } from './auth.types';

/** 保存されたスロット記録の形を検証する。版や形の合わないものは `null` として捨てる */
export const parseStoredSlot = (value: unknown): StoredSlot | null => {
	if (typeof value !== 'object' || value === null) {
		return null;
	}
	const { version, id, uid } = value as Record<string, unknown>;
	if (version !== 1 || !isNonEmptyString(id) || !isNonEmptyString(uid)) {
		return null;
	}
	// 記録の範囲を超える項目は持ち込まない
	return { version, id, uid };
};

/**
 * スロットの実際のログイン状態を記録と照合し、一覧に入れるものを決める。
 * 同じ UID のスロットは、ID の順で先のものを代表にする。どのタブで照合しても同じ代表になる
 */
export const reconcileSlots = (observations: readonly SlotObservation[]): SlotReconciliation => {
	const memberIds: string[] = [];
	const droppedIds: string[] = [];
	const duplicates = new Map<string, string>();
	const representativeByUid = new Map<string, string>();

	for (const { id, expectedUid, uid } of [...observations].sort((a, b) => compareIds(a.id, b.id))) {
		if (uid === null || uid !== expectedUid) {
			droppedIds.push(id);
			continue;
		}
		const representative = representativeByUid.get(uid);
		if (representative !== undefined) {
			duplicates.set(id, representative);
			continue;
		}
		representativeByUid.set(uid, id);
		memberIds.push(id);
	}
	return { memberIds, droppedIds, duplicates };
};

/** 選択を照合の結果へ対応づける。重複側は代表へ付け替え、一覧に無ければ `null` */
export const representativeOf = (
	id: string | null,
	reconciliation: SlotReconciliation
): string | null => {
	if (id === null) {
		return null;
	}
	const target = reconciliation.duplicates.get(id) ?? id;
	return reconciliation.memberIds.includes(target) ? target : null;
};

/**
 * 後からサインインした方を選ぶ。単一アカウント指定で、別のタブとの競合により2件になったときに用いる。
 * 時刻が並ぶときは、後から作ったスロットを選ぶ
 */
export const latestSignedIn = (
	candidates: readonly { readonly id: string; readonly lastSignInTime: string | undefined }[]
): string | null => {
	let latest: { readonly id: string; readonly time: number } | null = null;
	for (const { id, lastSignInTime } of candidates) {
		const parsed = lastSignInTime === undefined ? Number.NaN : Date.parse(lastSignInTime);
		const time = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
		if (
			latest === null ||
			time > latest.time ||
			(time === latest.time && compareIds(id, latest.id) > 0)
		) {
			latest = { id, time };
		}
	}
	return latest?.id ?? null;
};

/** ID の順序。ID は生成した時刻を先頭に持つため、作った順に並ぶ */
export const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.length > 0;
