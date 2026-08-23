/**
 * サインインの後に戻る経路の保持。タブ単位で、再読み込みと経路の移動を跨いで保つ。
 * 保持するのは経路だけであり、認証の状態は持たない
 */

const RETURN_TO_KEY = 'svelte-firebase-auth:return-to';

/**
 * 根からの相対の経路だけを受け入れる。**外部を指し得ない形にする**ことで、
 * サインインの画面を踏み台にした誘導が成立しない。
 * `//evil.example` と `/\evil.example` は外部として解決されるため弾く
 */
export const isSafeReturnTo = (value: string): boolean =>
	value.startsWith('/') && !/^\/[/\\]/.test(value);

export const readReturnTo = (): string | null => {
	const value = withStorage((storage) => storage.getItem(RETURN_TO_KEY)) ?? null;
	return value !== null && isSafeReturnTo(value) ? value : null;
};

export const writeReturnTo = (path: string): void => {
	if (!isSafeReturnTo(path)) {
		return;
	}
	withStorage((storage) => storage.setItem(RETURN_TO_KEY, path));
};

export const clearReturnTo = (): void => {
	withStorage((storage) => storage.removeItem(RETURN_TO_KEY));
};

/** 保持先が使えない環境でも機能を止めない。戻り先を持たない状態として振る舞う */
const withStorage = <T>(use: (storage: Storage) => T): T | null => {
	try {
		return use(sessionStorage);
	} catch {
		return null;
	}
};
