import { defineConfig } from '@playwright/test';

/**
 * ショーケースはビルド時の環境変数で、複数アカウント指定と単一アカウント指定のどちらかになる。
 * 指定ごとにビルドし直し、その指定の E2E だけを走らせる
 */
const isSingleAccount = process.env.VITE_MULTI_ACCOUNT === 'false';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: isSingleAccount ? '**/singleAccount.e2e.{ts,js}' : '**/*.e2e.{ts,js}',
	testIgnore: isSingleAccount ? [] : ['**/singleAccount.e2e.{ts,js}']
});
