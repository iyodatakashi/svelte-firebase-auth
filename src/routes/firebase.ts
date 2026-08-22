// 組み込み側の書き方の実例。ライブラリは Firebase を初期化せず、`Auth` を受け取る
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

/** ショーケースは Auth エミュレータへ繋ぐ。本番のプロジェクトへは繋がない */
const EMULATOR_ORIGIN = 'http://127.0.0.1:9099';

const app = initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-svelte-firebase-auth' });

export const auth: Auth = getAuth(app);

connectAuthEmulator(auth, EMULATOR_ORIGIN, { disableWarnings: true });
