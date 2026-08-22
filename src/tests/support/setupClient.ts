import { afterEach } from 'vitest';
import { cleanup } from 'vitest-browser-svelte';

// 描画したものを次のテストへ持ち越さない。同じページで続けて描画されるため
afterEach(cleanup);
