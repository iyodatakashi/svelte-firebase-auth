import { describe, expect, it } from 'vitest';
import {
	latestSignedIn,
	parseStoredSlot,
	reconcileSlots,
	representativeOf
} from '$lib/models/auth/slots';

describe('スロット記録の検証 — 要件 4.10（multi-account-auth）', () => {
	it('版・ID・UID の揃った記録を受け入れる', () => {
		expect(parseStoredSlot({ version: 1, id: 'a', uid: 'uid-a' })).toEqual({
			version: 1,
			id: 'a',
			uid: 'uid-a'
		});
	});

	it('記録の範囲を超える項目は持ち込まない。パスワードやトークンを保存の対象にしない', () => {
		expect(parseStoredSlot({ version: 1, id: 'a', uid: 'uid-a', token: 'secret' })).toEqual({
			version: 1,
			id: 'a',
			uid: 'uid-a'
		});
	});

	it('版や形の合わない記録を捨てる', () => {
		for (const value of [
			null,
			'a',
			{ version: 2, id: 'a', uid: 'uid-a' },
			{ version: 1, id: '', uid: 'uid-a' },
			{ version: 1, id: 'a' },
			{ version: 1, id: 'a', uid: 3 }
		]) {
			expect(parseStoredSlot(value)).toBeNull();
		}
	});
});

describe('一覧の照合 — 要件 1.3, 4.5, 4.9（multi-account-auth）', () => {
	it('ログイン状態が記録の UID と一致するスロットだけを一覧に入れる', () => {
		const result = reconcileSlots([
			{ id: 'a', expectedUid: 'uid-a', uid: 'uid-a' },
			{ id: 'b', expectedUid: 'uid-b', uid: null },
			{ id: 'c', expectedUid: 'uid-c', uid: 'uid-x' }
		]);

		expect(result.memberIds).toEqual(['a']);
		expect(result.droppedIds).toEqual(['b', 'c']);
	});

	it('一覧は ID の順に並べる', () => {
		const result = reconcileSlots([
			{ id: 'c', expectedUid: 'uid-c', uid: 'uid-c' },
			{ id: 'a', expectedUid: 'uid-a', uid: 'uid-a' }
		]);
		expect(result.memberIds).toEqual(['a', 'c']);
	});
});

describe('同じ UID のスロット — 要件 2.3（multi-account-auth）', () => {
	const result = reconcileSlots([
		{ id: 'b', expectedUid: 'uid-1', uid: 'uid-1' },
		{ id: 'a', expectedUid: 'uid-1', uid: 'uid-1' },
		{ id: 'c', expectedUid: 'uid-2', uid: 'uid-2' }
	]);

	it('ID の順序で代表を決め、一覧を重複させない', () => {
		expect(result.memberIds).toEqual(['a', 'c']);
		expect(result.duplicates).toEqual(new Map([['b', 'a']]));
	});

	it('選択が重複側を指していれば代表へ付け替える', () => {
		expect(representativeOf('b', result)).toBe('a');
		expect(representativeOf('c', result)).toBe('c');
	});

	it('一覧に無い選択は無効として扱う', () => {
		expect(representativeOf('z', result)).toBeNull();
		expect(representativeOf(null, result)).toBeNull();
	});
});

describe('単一アカウント指定で2件あるとき — 要件 7.20（multi-account-auth）', () => {
	it('後からサインインした方を残す対象として選ぶ', () => {
		expect(
			latestSignedIn([
				{ id: 'a', lastSignInTime: 'Thu, 01 Jan 2026 00:00:02 GMT' },
				{ id: 'b', lastSignInTime: 'Thu, 01 Jan 2026 00:00:01 GMT' }
			])
		).toBe('a');
	});

	it('時刻が分からないものより、分かるものを残す', () => {
		expect(
			latestSignedIn([
				{ id: 'a', lastSignInTime: undefined },
				{ id: 'b', lastSignInTime: 'Thu, 01 Jan 2026 00:00:01 GMT' }
			])
		).toBe('b');
	});

	it('時刻が並ぶときは、後から作ったスロット（ID の大きい方）を残す', () => {
		const time = 'Thu, 01 Jan 2026 00:00:01 GMT';
		expect(
			latestSignedIn([
				{ id: 'b', lastSignInTime: time },
				{ id: 'a', lastSignInTime: time }
			])
		).toBe('b');
	});
});
