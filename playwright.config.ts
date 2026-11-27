import { defineConfig } from '@playwright/test';

/**
 * ショーケースはビルド時の環境変数で、組み込みの指定が決まる（複数アカウントで選択はタブごと・
 * 単一アカウント・複数アカウントで選択を全タブでそろえる）。指定ごとにビルドし直し、その指定の E2E だけを走らせる
 */
const only = (file: string) => ({ testMatch: `**/${file}.e2e.{ts,js}` });

const tests = (() => {
	if (process.env.VITE_MULTI_ACCOUNT === 'false') return only('singleAccount');
	if (process.env.VITE_SYNC_ACCOUNT_ACROSS_TABS === 'true') return only('syncAccountAcrossTabs');

	return {
		testMatch: '**/*.e2e.{ts,js}',
		testIgnore: ['**/singleAccount.e2e.{ts,js}', '**/syncAccountAcrossTabs.e2e.{ts,js}']
	};
})();

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	...tests
});
