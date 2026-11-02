import { expect, test, type Page } from '@playwright/test';
import {
	createVerifiedUser,
	main,
	signUp,
	submitSignIn,
	uniqueEmail,
	verifyInAnotherSession
} from './support';

const HOME_HEADING = 'サインイン済み';

// ショーケースを VITE_MULTI_ACCOUNT=false でビルドしたときに走らせる（→ playwright.config.ts）

const signedInAs = async (page: Page, email: string) => {
	await expect(main(page).getByRole('heading', { name: HOME_HEADING })).toBeVisible();
	await expect(main(page).getByText(email, { exact: true })).toBeVisible();
};

const signIn = async (page: Page, email: string) => {
	await page.goto('/signin');
	await submitSignIn(page, email);
	await signedInAs(page, email);
};

test('選択の UI を置かない構成で、サインイン・ログアウトが通る — 要件 7.1', async ({ page }) => {
	const email = await createVerifiedUser(page.request, uniqueEmail('single'));
	await signIn(page, email);

	// アカウントの一覧・選択の UI は無い
	await expect(page.getByRole('button', { name: 'アカウントのメニュー' })).toHaveCount(0);

	await main(page).getByRole('button', { name: 'サインアウト' }).click();
	await expect(page).toHaveURL('/signin');
});

test('登録・確認・確認待ちからのログアウトが通る — 要件 7.1', async ({ page }) => {
	const email = uniqueEmail('single-signup');
	await signUp(page, email);
	await expect(page).toHaveURL('/verify-email');

	await verifyInAnotherSession(page, email);
	await signedInAs(page, email);

	// 確認待ちの画面からのログアウトでも、未選択にならず、サインインへ案内される
	const another = uniqueEmail('single-leave');
	await main(page).getByRole('button', { name: 'サインアウト' }).click();
	await expect(page).toHaveURL('/signin');
	await signUp(page, another);
	await main(page).getByRole('button', { name: 'サインアウト' }).click();
	await expect(page).toHaveURL('/signin');
});

test('新しいタブ・再読み込みを経ても、保護された内容が隠れたまま行き詰まらない — 要件 7.1', async ({
	page,
	context
}) => {
	const email = await createVerifiedUser(page.request, uniqueEmail('single-tabs'));
	await signIn(page, email);

	await page.reload();
	await signedInAs(page, email);

	// 元のタブから開いた新しいタブも、独立して開いた新しいタブも、保持したアカウントで開く
	const [opened] = await Promise.all([
		page.waitForEvent('popup'),
		page.evaluate(() => window.open('/'))
	]);
	await signedInAs(opened, email);
	const independent = await context.newPage();
	await independent.goto('/');
	await signedInAs(independent, email);

	// サインイン済みのまま、もう1件をサインインさせない
	await independent.goto('/signin');
	await expect(independent).toHaveURL('/');
});

test('別のタブでのログアウトを経ても、未選択の段階が現れずサインインへ案内される — 要件 7.1', async ({
	page,
	context
}) => {
	const email = await createVerifiedUser(page.request, uniqueEmail('single-elsewhere'));
	await signIn(page, email);

	const other = await context.newPage();
	await other.goto('/');
	await signedInAs(other, email);
	await main(other).getByRole('button', { name: 'サインアウト' }).click();
	await expect(other).toHaveURL('/signin');

	// 元のタブもログアウトを観測し、サインインへ案内される
	await expect(page).toHaveURL('/signin');
	await expect(main(page).getByRole('button', { name: 'サインイン', exact: true })).toBeVisible();

	// サインインし直せる
	await submitSignIn(page, email);
	await signedInAs(page, email);
});
