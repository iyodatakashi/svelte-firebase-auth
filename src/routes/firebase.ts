// 組み込み側の書き方の実例。ライブラリは Firebase を初期化せず、土台の App の `Auth` を受け取る
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

/** ショーケースはエミュレータへ繋ぐ。本番のプロジェクトへは繋がない */
const AUTH_EMULATOR_ORIGIN = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR = { host: '127.0.0.1', port: 8080 };

const options = { apiKey: 'fake-api-key', projectId: 'demo-svelte-firebase-auth' };

/** 土台の App。Firestore などのデータアクセスはここから一度だけ作る */
const app = initializeApp(options);

/**
 * 土台の Auth。ストアに渡した後は、ストアが選択中のアカウントの複製を入れる。
 * ここで直接サインイン・サインアウトしない。エミュレータへは、渡す前に繋いでおく
 */
export const auth: Auth = getAuth(app);
connectAuthEmulator(auth, AUTH_EMULATOR_ORIGIN, { disableWarnings: true });

/** 選択中のアカウントの認証で動く。切り替えても作り直さない */
export const firestore: Firestore = getFirestore(app);
connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR.host, FIRESTORE_EMULATOR.port);
