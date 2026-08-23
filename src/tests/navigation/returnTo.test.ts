import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearReturnTo,
	isSafeReturnTo,
	readReturnTo,
	writeReturnTo
} from '$lib/navigation/returnTo';

/** タブ単位の保持先。読み書きの内容だけを見る */
const fakeStorage = () => {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
		removeItem: (key: string) => void values.delete(key)
	};
};

beforeEach(() => {
	vi.stubGlobal('sessionStorage', fakeStorage());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('受け入れる戻り先 — 要件 5.4', () => {
	it('根からの相対の経路だけを受け入れる', () => {
		expect(isSafeReturnTo('/documents/42')).toBe(true);
		expect(isSafeReturnTo('/documents/42?tab=history')).toBe(true);
	});

	it('外部として解決される値を弾く', () => {
		expect(isSafeReturnTo('//evil.example/path')).toBe(false);
		expect(isSafeReturnTo('/\\evil.example/path')).toBe(false);
		expect(isSafeReturnTo('https://evil.example/path')).toBe(false);
	});

	it('経路として解釈できない値を弾く', () => {
		expect(isSafeReturnTo('')).toBe(false);
		expect(isSafeReturnTo('../documents/42')).toBe(false);
	});
});

describe('戻り先の保持 — 要件 5.1, 5.5', () => {
	it('保持した戻り先を取り出せる', () => {
		writeReturnTo('/documents/42?tab=history');
		expect(readReturnTo()).toBe('/documents/42?tab=history');
	});

	it('保持していなければ、戻り先を持たない', () => {
		expect(readReturnTo()).toBeNull();
	});

	it('破棄した戻り先は取り出せない', () => {
		writeReturnTo('/documents/42');
		clearReturnTo();
		expect(readReturnTo()).toBeNull();
	});

	it('受け入れられない値は保持しない', () => {
		writeReturnTo('//evil.example/path');
		expect(readReturnTo()).toBeNull();
	});

	it('保持先に入り込んだ受け入れられない値を、取り出さない', () => {
		sessionStorage.setItem('svelte-firebase-auth:return-to', '//evil.example/path');
		expect(readReturnTo()).toBeNull();
	});
});

describe('保持先が使えない環境 — 要件 5.4 の注', () => {
	const brokenStorage = {
		getItem: () => {
			throw new Error('storage is disabled');
		},
		setItem: () => {
			throw new Error('storage is disabled');
		},
		removeItem: () => {
			throw new Error('storage is disabled');
		}
	};

	it('例外を投げず、戻り先を持たない状態として振る舞う', () => {
		vi.stubGlobal('sessionStorage', brokenStorage);

		expect(() => writeReturnTo('/documents/42')).not.toThrow();
		expect(() => clearReturnTo()).not.toThrow();
		expect(readReturnTo()).toBeNull();
	});

	it('保持先そのものが無くても働く', () => {
		vi.stubGlobal('sessionStorage', undefined);

		expect(() => writeReturnTo('/documents/42')).not.toThrow();
		expect(readReturnTo()).toBeNull();
	});
});
