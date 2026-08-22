import { expect, test, type Page } from '@playwright/test';

/** エミュレータは実行中ずっと利用者を保持するため、経路ごとに別のアドレスを使う */
const uniqueEmail = (label: string) => `${label}-${Date.now()}@example.com`;

const signUp = async (page: Page, email: string, password = 'showcase-secret') => {
	await page.getByRole('button', { name: 'アカウントを作成する' }).click();
	await page.getByLabel('メールアドレス').fill(email);
	await page.getByLabel('パスワード', { exact: true }).fill(password);
	await page.getByRole('button', { name: '登録する' }).click();
};

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'サインイン' })).toBeVisible();
});

test('登録から確認待ちの表示まで — 要件 4.1, 5.2', async ({ page }) => {
	const email = uniqueEmail('signup');
	await signUp(page, email);

	await expect(page.getByRole('heading', { name: 'メールアドレスの確認' })).toBeVisible();
	// 送信先のメールアドレスを示す
	await expect(page.getByText(email, { exact: false })).toBeVisible();
	await expect(page.getByText('迷惑メールフォルダ', { exact: false })).toBeVisible();
});

test('サインインの失敗と、入力を保ったままの再入力 — 要件 3.2, 3.3', async ({ page }) => {
	const email = uniqueEmail('signin');
	await signUp(page, email);

	// いったんサインアウトし、サインインの経路へ戻る
	await page.getByRole('button', { name: 'サインアウト' }).click();
	await expect(page.getByRole('heading', { name: 'サインイン' })).toBeVisible();

	await page.getByLabel('メールアドレス').fill(email);
	await page.getByLabel('パスワード', { exact: true }).fill('wrong-password');
	await page.getByRole('button', { name: 'サインイン', exact: true }).click();

	// どちらが誤っているかを示さない
	await expect(page.getByText('メールアドレスまたはパスワードが違います。')).toBeVisible();
	await expect(page.getByLabel('メールアドレス')).toHaveValue(email);
	await expect(page.getByLabel('パスワード', { exact: true })).toHaveValue('wrong-password');

	// 入力を保ったまま、正しいパスワードで入り直せる
	await page.getByLabel('パスワード', { exact: true }).fill('showcase-secret');
	await page.getByRole('button', { name: 'サインイン', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'メールアドレスの確認' })).toBeVisible();
});

test('パスワードの再設定の要求 — 要件 7.1', async ({ page }) => {
	await page.getByRole('button', { name: 'パスワードをお忘れですか' }).click();
	await expect(page.getByRole('heading', { name: 'パスワードの再設定' })).toBeVisible();

	// 登録されていないアドレスでも、登録の有無を示さない
	await page.getByLabel('メールアドレス').fill(uniqueEmail('nobody'));
	await page.getByRole('button', { name: '再設定用のメールを送る' }).click();

	await expect(
		page.getByText('入力されたメールアドレス宛に、再設定用のメールを送りました。')
	).toBeVisible();
	await expect(page.getByText('迷惑メールフォルダ', { exact: false })).toBeVisible();
});
