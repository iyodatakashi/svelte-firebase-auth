import { afterEach, vi } from 'vitest';
import { cleanup } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';

// ルーターの無い環境では `goto` が例外を投げる。画面の遷移は行き先の記録だけを観測する
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => undefined) }));

// 描画したものを次のテストへ持ち越さない。同じページで続けて描画されるため
afterEach(() => {
	cleanup();
	// 差し替えた実装を次のテストへ持ち越さない
	vi.mocked(goto).mockReset();
});
