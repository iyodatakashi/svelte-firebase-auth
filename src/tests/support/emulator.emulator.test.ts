import { beforeEach, describe, expect, it } from 'vitest';
import { clearEmulatorUsers, createEmulatorAuth, fetchOobCodes } from './emulator';

describe('エミュレータの土台', () => {
	beforeEach(clearEmulatorUsers);

	it('エミュレータに繋いだ Auth を作れる', async () => {
		const { auth, dispose } = createEmulatorAuth();
		expect(auth.currentUser).toBeNull();
		await dispose();
	});

	it('発行済みのワンタイムコードを取り出せる', async () => {
		expect(await fetchOobCodes()).toEqual([]);
	});
});
