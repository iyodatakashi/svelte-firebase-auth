import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],
	// `.svelte` のまま配布されるパッケージ。事前バンドルすると svelte の実体が二重になり描画に失敗する。
	// 組み込み側にも同じ設定を求める（→ README）
	// 除外すると、そのパッケージが持つ CJS の依存は変換されないまま残るため、個別に事前バンドルへ戻す
	optimizeDeps: {
		exclude: ['@14ch/svelte-ui'],
		include: [
			'dayjs',
			'dayjs/plugin/isSameOrAfter',
			'dayjs/plugin/isSameOrBefore',
			'dayjs/plugin/localeData',
			'dayjs/locale/de',
			'dayjs/locale/en',
			'dayjs/locale/es',
			'dayjs/locale/fr',
			'dayjs/locale/ja',
			'dayjs/locale/zh-cn',
			'dompurify'
		]
	},
	resolve: { dedupe: ['svelte'] },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['./src/tests/support/setupClient.ts'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.emulator.test.{js,ts}']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'emulator',
					environment: 'node',
					include: ['src/**/*.emulator.test.{js,ts}'],
					// 各ファイルがエミュレータの利用者を消して始める。並行に走らせると互いの利用者を消し合う
					fileParallelism: false,
					// エミュレータの起動と、確認メールの往復ぶんの余裕を見る
					testTimeout: 30000,
					hookTimeout: 30000
				}
			}
		]
	}
});
