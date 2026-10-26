import { beforeEach, describe, expect, it } from 'vitest';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
	clearEmulatorUsers,
	createEmulatorAuth,
	createEmulatorFirestore,
	createEmulatorUser,
	fetchOobCodes
} from './emulator';

describe('エミュレータの土台', () => {
	beforeEach(clearEmulatorUsers);

	it('エミュレータに繋いだ Auth を作れる', async () => {
		const { auth, dispose } = createEmulatorAuth();
		expect(auth.currentUser).toBeNull();
		await dispose();
	});

	it('発行済みのワンタイムコードを取り出せる', async () => {
		// 利用者を消してもコードは残る。他のテストが先に発行していても成り立つ形で確かめる
		expect(Array.isArray(await fetchOobCodes())).toBe(true);
	});

	it('利用者を作り、その資格情報でサインインできる', async () => {
		const uid = await createEmulatorUser('support@example.com', 'secret-password');
		const { auth, dispose } = createEmulatorAuth();

		const credential = await signInWithEmailAndPassword(
			auth,
			'support@example.com',
			'secret-password'
		);
		expect(credential.user.uid).toBe(uid);
		await dispose();
	});

	it('同じ App の Firestore が、その App の Auth の利用者としてルールに扱われる', async () => {
		const uid = await createEmulatorUser('firestore@example.com', 'secret-password');
		const { app, auth, dispose } = createEmulatorAuth();
		const firestore = createEmulatorFirestore(app);

		await signInWithEmailAndPassword(auth, 'firestore@example.com', 'secret-password');
		await setDoc(doc(firestore, 'users', uid), { value: 1 });
		expect((await getDoc(doc(firestore, 'users', uid))).data()).toEqual({ value: 1 });
		// 他人の文書は読めない
		await expect(getDoc(doc(firestore, 'users', 'someone-else'))).rejects.toThrow();
		await dispose();
	});
});
