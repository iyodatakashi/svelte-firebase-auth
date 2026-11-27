import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, createVerifiedUser, main, submitSignIn, uniqueEmail } from './support';

/**
 * 選択中のアカウントを全タブでそろえる指定（`syncAccountAcrossTabs`）。
 * ショーケースを `VITE_SYNC_ACCOUNT_ACROSS_TABS=true` でビルドして走らせる
 */

const chooseFromMenu = async (page: Page, item: string) => {
	await page.getByRole('button', { name: 'アカウントのメニュー' }).click();
	await page.getByRole('menuitem', { name: item, exact: true }).click();
};

const addFromMenu = async (page: Page, email: string) => {
	await chooseFromMenu(page, '別のアカウントにログイン');
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('メールアドレス').fill(email);
	await dialog.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
	await dialog.getByRole('button', { name: 'サインイン', exact: true }).click();
	await expect(dialog).toBeHidden();
};

const signedInAs = (page: Page, email: string) =>
	expect(main(page).getByText(email, { exact: true })).toBeVisible();

/** A でサインインし、メニューから B を追加する。B が選ばれた状態で返る */
const holdTwoAccounts = async (page: Page, label: string) => {
	const a = await createVerifiedUser(page.request, uniqueEmail(`${label}-a`));
	const b = await createVerifiedUser(page.request, uniqueEmail(`${label}-b`));
	await page.goto('/signin');
	await submitSignIn(page, a);
	await signedInAs(page, a);
	await addFromMenu(page, b);
	await signedInAs(page, b);
	return { a, b };
};

test('一方のタブでの切り替えに他方のタブも従い、再読み込みしたタブと新しいタブも同じアカウントで開く — 要件 4.16, 4.17', async ({
	page,
	context
}) => {
	const { a, b } = await holdTwoAccounts(page, 'shared');
	const other = await context.newPage();
	await other.goto('/');
	await signedInAs(other, b);

	await chooseFromMenu(other, a);
	await signedInAs(other, a);
	await signedInAs(page, a);

	await chooseFromMenu(page, b);
	await signedInAs(page, b);
	await signedInAs(other, b);

	await other.reload();
	await signedInAs(other, b);
	const third = await context.newPage();
	await third.goto('/');
	await signedInAs(third, b);
});

test('一方のタブで追加したアカウントと、ログアウトで1件だけ残ったアカウントに、他方のタブも従う — 要件 4.17', async ({
	page,
	context
}) => {
	const a = await createVerifiedUser(page.request, uniqueEmail('shared-add-a'));
	const b = await createVerifiedUser(page.request, uniqueEmail('shared-add-b'));
	await page.goto('/signin');
	await submitSignIn(page, a);
	await signedInAs(page, a);
	const other = await context.newPage();
	await other.goto('/');
	await signedInAs(other, a);

	await addFromMenu(other, b);
	await signedInAs(other, b);
	await signedInAs(page, b);

	await chooseFromMenu(page, `${b} からサインアウト`);
	await signedInAs(page, a);
	await signedInAs(other, a);
});

test('全タブで共有するキャッシュの Firestore が、従ったタブでも選択中のアカウントとして読み書きする — 要件 4.17, 4.19', async ({
	page,
	context
}) => {
	const { a, b } = await holdTwoAccounts(page, 'shared-data');
	await main(page).getByLabel('メモ').fill('B のメモ');
	await main(page).getByRole('button', { name: 'メモを保存する' }).click();
	await expect(main(page).getByText('保存したメモ: B のメモ')).toBeVisible();

	const other = await context.newPage();
	await other.goto('/');
	await expect(main(other).getByText('保存したメモ: B のメモ')).toBeVisible();

	await chooseFromMenu(page, a);
	await signedInAs(other, a);
	await main(other).getByLabel('メモ').fill('A のメモ');
	await main(other).getByRole('button', { name: 'メモを保存する' }).click();
	await expect(main(other).getByText('保存したメモ: A のメモ')).toBeVisible();
	await expect(main(page).getByText('保存したメモ: A のメモ')).toBeVisible();

	await chooseFromMenu(other, b);
	await expect(main(page).getByText('保存したメモ: B のメモ')).toBeVisible();
	await expect(main(page).getByRole('alert')).toBeHidden();
});
