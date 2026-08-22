import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

const PROJECT_ID = 'demo-svelte-firebase-auth';

/** `firebase emulators:exec` が設定する。単独で vitest を起動したときのために既定値を持つ */
const emulatorHost = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

const emulatorOrigin = () => `http://${emulatorHost()}`;

let appCount = 0;

/**
 * エミュレータに繋いだ Auth を、テストごとに独立した Firebase アプリとして作る。
 * 同じアプリを共有すると、あるテストのサインイン状態が次のテストへ漏れる
 */
export const createEmulatorAuth = (): { auth: Auth; dispose: () => Promise<void> } => {
	const app: FirebaseApp = initializeApp(
		{ apiKey: 'fake-api-key', projectId: PROJECT_ID },
		`test-${appCount++}`
	);
	const auth = getAuth(app);
	connectAuthEmulator(auth, emulatorOrigin(), { disableWarnings: true });
	return { auth, dispose: () => deleteApp(app) };
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
