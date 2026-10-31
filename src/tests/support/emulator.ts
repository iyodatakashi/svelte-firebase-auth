import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

const PROJECT_ID = 'demo-svelte-firebase-auth';

/** `firebase emulators:exec` が設定する。単独で vitest を起動したときのために既定値を持つ */
const emulatorHost = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

const emulatorOrigin = () => `http://${emulatorHost()}`;

const firestoreHost = () => process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

let appCount = 0;

/**
 * エミュレータに繋いだ Auth を、テストごとに独立した Firebase アプリとして作る。
 * 同じアプリを共有すると、あるテストのサインイン状態が次のテストへ漏れる
 */
export const createEmulatorAuth = (): {
	app: FirebaseApp;
	auth: Auth;
	dispose: () => Promise<void>;
} => {
	const app: FirebaseApp = initializeApp(
		{ apiKey: 'fake-api-key', projectId: PROJECT_ID },
		`test-${appCount++}`
	);
	const auth = getAuth(app);
	connectAuthEmulator(auth, emulatorOrigin(), { disableWarnings: true });
	return { app, auth, dispose: () => deleteApp(app) };
};

/** 同じ App から Firestore を取り、エミュレータへ繋ぐ。その App の Auth の利用者として読み書きする */
export const createEmulatorFirestore = (app: FirebaseApp): Firestore => {
	const firestore = getFirestore(app);
	const [host, port] = firestoreHost().split(':');
	connectFirestoreEmulator(firestore, host, Number(port));
	return firestore;
};

/** 利用者を作り、その UID を返す。作った側の Auth はサインインしたままにしない */
export const createEmulatorUser = async (email: string, password: string): Promise<string> => {
	const response = await fetch(
		`${emulatorOrigin()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password, returnSecureToken: false })
		}
	);
	if (!response.ok) {
		throw new Error(`利用者の作成に失敗した: ${response.status}`);
	}
	const body: { localId: string } = await response.json();
	return body.localId;
};

/** エミュレータの利用者をすべて消す。テスト間で登録済みのメールアドレスを持ち越さないため */
export const clearEmulatorUsers = async (): Promise<void> => {
	const response = await fetch(`${emulatorOrigin()}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
		method: 'DELETE',
		headers: { Authorization: 'Bearer owner' }
	});
	if (!response.ok) {
		throw new Error(`利用者の削除に失敗した: ${response.status}`);
	}
};

export interface OobCode {
	readonly email: string;
	readonly requestType: string;
	readonly oobCode: string;
	readonly oobLink: string;
}

/** エミュレータが発行したワンタイムコードを取り出す。確認メールと再設定メールの検証に使う */
export const fetchOobCodes = async (): Promise<readonly OobCode[]> => {
	const response = await fetch(`${emulatorOrigin()}/emulator/v1/projects/${PROJECT_ID}/oobCodes`, {
		headers: { Authorization: 'Bearer owner' }
	});
	if (!response.ok) {
		throw new Error(`ワンタイムコードの取得に失敗した: ${response.status}`);
	}
	const body: { oobCodes?: OobCode[] } = await response.json();
	return body.oobCodes ?? [];
};

/** 別のセッションで確認を済ませたことにする。クライアントには知らせない */
export const markEmulatorUserVerified = async (uid: string): Promise<void> => {
	const response = await fetch(
		`${emulatorOrigin()}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
			body: JSON.stringify({ localId: uid, emailVerified: true })
		}
	);
	if (!response.ok) {
		throw new Error(`確認済みにできなかった: ${response.status}`);
	}
};
