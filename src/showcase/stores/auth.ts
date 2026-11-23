import { createAuthStore, type AuthConfig } from '#lib/index';
import { auth } from './firebase';

/**
 * ショーケースは、複数アカウント指定と単一アカウント指定の両方の組み込み例を兼ねる。
 * 指定はストアを作るときに決まるため、ビルド時の環境変数で選ぶ。既定は複数アカウント
 */
export const multiAccount = import.meta.env.VITE_MULTI_ACCOUNT !== 'false';

const config: AuthConfig = {
	// 自由登録の可否。Firebase 側の設定と揃えるのは組み込み側の運用
	selfRegistration: true,
	// メールアドレスの確認を求めるか。false なら登録のあとに確認メールを送らない
	emailVerification: true,
	// 確認と再設定の完了後に戻る URL。承認済みドメインに含まれている必要がある
	continueUrl: 'http://localhost:4173/',
	// 認証の経路。組み込み側の URL 構成をライブラリへ渡す
	routes: {
		signIn: '/signin',
		signUp: '/signup',
		verifyEmail: '/verify-email',
		passwordReset: '/password-reset',
		afterSignIn: '/'
	},
	// 複数のアカウントのログイン状態を保持するか。false なら最大1件で、選択の UI は要らない
	multiAccount
};

// 土台の App の Auth を渡す。選択中のアカウントは、この Auth へ複製される
export const authStore = createAuthStore(auth, config);
