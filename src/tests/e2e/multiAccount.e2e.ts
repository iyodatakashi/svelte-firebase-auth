import { expect, test, type Page } from '@playwright/test';
import {
	PASSWORD,
	createUnverifiedUser,
	createVerifiedUser,
	main,
	submitSignIn,
	uniqueEmail
} from './support';

/** 組み込み側のユーザーメニューを模した入口を開き、項目を選ぶ */
const chooseFromMenu = async (page: Page, item: string) => {
	await page.getByRole('button', { name: 'アカウントのメニュー' }).click();
	await page.getByRole('menuitem', { name: item, exact: true }).click();
};

/** メニューから、別のアカウントにログインする。既存のログイン状態は保つ */
const addFromMenu = async (page: Page, email: string) => {
	await chooseFromMenu(page, '別のアカウントにログイン');
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('メールアドレス').fill(email);
	await dialog.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
	await dialog.getByRole('button', { name: 'サインイン', exact: true }).click();
	await expect(dialog).toBeHidden();
};

/** 確認の済んでいないアカウントを、メニューから追加する。確認待ちへ案内されたところで返る */
const addUnverifiedFromMenu = async (page: Page, email: string) => {
	await createUnverifiedUser(page.request, email);
	await addFromMenu(page, email);
	await expect(page).toHaveURL('/verify-email');
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

/** さらに C を追加する。C が選ばれた状態で返る */
const holdThreeAccounts = async (page: Page, label: string) => {
	const { a, b } = await holdTwoAccounts(page, label);
	const c = await createVerifiedUser(page.request, uniqueEmail(`${label}-c`));
	await addFromMenu(page, c);
	await signedInAs(page, c);
	return { a, b, c };
};

test('メニューから追加・直接切り替え・使用中のログアウト・残りの選択・全件ログアウト・再読み込み — 要件 1.4, 2.1, 2.2, 3.1, 5.4, 5.8, 6.3, 6.9, 7.8', async ({
	page
}) => {
	const { a, b } = await holdThreeAccounts(page, 'menu');

	// 項目を選ぶだけで直接切り替える
	await chooseFromMenu(page, a);
	await signedInAs(page, a);

	// 使用中の A からログアウトすると、2件残った B・C を自動で選ばず、選択ダイアログが出る
	await chooseFromMenu(page, `${a} からサインアウト`);
	const chooser = page.getByRole('dialog', { name: '使うアカウントを選んでください' });
	await expect(chooser).toBeVisible();
	await expect(main(page).getByRole('heading', { name: 'サインイン済み' })).toBeHidden();
	await expect(chooser.getByRole('button', { name: new RegExp(`^${a}`) })).toHaveCount(0);
	// 選ぶだけの場であり、サインアウトや追加の操作は出さない
	await expect(chooser.getByRole('button', { name: /サインアウト/ })).toHaveCount(0);

	// 残った B を選ぶと、保護された内容が B のものとして出る
	await chooser.getByRole('button', { name: b, exact: true }).click();
	await expect(chooser).toBeHidden();
	await signedInAs(page, b);

	// 再読み込みしても B を使い続ける
	await page.reload();
	await signedInAs(page, b);

	// 全件のログアウトでサインインへ案内される
	await chooseFromMenu(page, 'すべてのアカウントからサインアウト');
	await expect(page).toHaveURL('/signin');
	await page.reload();
	await expect(page).toHaveURL('/signin');
});

test('使用中のアカウントからログアウトして1件だけ残れば、それを選ぶ — 要件 5.4', async ({
	page
}) => {
	const { a, b } = await holdTwoAccounts(page, 'sole');

	await chooseFromMenu(page, `${b} からサインアウト`);

	await expect(page.getByRole('dialog', { name: '使うアカウントを選んでください' })).toBeHidden();
	await signedInAs(page, a);
	await page.reload();
	await signedInAs(page, a);
});

test('土台の App の Firestore が、選択中のアカウントとして読み書きする — 要件 3.2, 7.7', async ({
	page
}) => {
	const { a, b } = await holdTwoAccounts(page, 'firestore');

	await main(page).getByLabel('メモ').fill('B のメモ');
	await main(page).getByRole('button', { name: 'メモを保存する' }).click();
	await expect(main(page).getByText('保存したメモ: B のメモ')).toBeVisible();

	// 切り替えると、同じ Firestore のまま A の文書を読む。B の表示は残らない
	await chooseFromMenu(page, a);
	await signedInAs(page, a);
	await expect(main(page).getByText('保存したメモ: （なし）')).toBeVisible();
	await main(page).getByLabel('メモ').fill('A のメモ');
	await main(page).getByRole('button', { name: 'メモを保存する' }).click();
	await expect(main(page).getByText('保存したメモ: A のメモ')).toBeVisible();

	await chooseFromMenu(page, b);
	await expect(main(page).getByText('保存したメモ: B のメモ')).toBeVisible();
	await expect(main(page).getByRole('alert')).toBeHidden();
});

test('2つのタブの選択は独立し、一方の切り替え・ログアウトが他方の選択を変えない — 要件 4.8, 5.3', async ({
	page,
	context
}) => {
	const { a, b } = await holdTwoAccounts(page, 'tabs');
	await chooseFromMenu(page, a);
	await signedInAs(page, a);

	// 独立して開いた新しいタブは、最後に開いた A で開く
	const other = await context.newPage();
	await other.goto('/');
	await signedInAs(other, a);

	// 新しいタブで B へ切り替えても、元のタブは A のまま
	await chooseFromMenu(other, b);
	await signedInAs(other, b);
	await page.reload();
	await signedInAs(page, a);

	// 新しいタブで、元のタブでは選んでいない B からログアウトしても、元のタブは A のまま。
	// 新しいタブは、1件だけ残った A を選ぶ
	await chooseFromMenu(other, `${b} からサインアウト`);
	await signedInAs(other, a);
	await signedInAs(page, a);
	await page.getByRole('button', { name: 'アカウントのメニュー' }).click();
	await expect(page.getByRole('menuitem', { name: b, exact: true })).toHaveCount(0);
});

test('新しいタブは、元のタブから開けばその選択を、独立して開けば最後に開いたアカウントを選ぶ — 要件 4.11', async ({
	page,
	context
}) => {
	const { a, b } = await holdTwoAccounts(page, 'new-tab');
	await chooseFromMenu(page, a);
	await signedInAs(page, a);

	// 別のタブで B を開き、最後に開いたアカウントを B にする
	const other = await context.newPage();
	await other.goto('/');
	await chooseFromMenu(other, b);
	await signedInAs(other, b);

	// 独立して開いた新しいタブは、最後に開いた B を選ぶ
	const independent = await context.newPage();
	await independent.goto('/');
	await signedInAs(independent, b);

	// 元のタブ（A）から開いた新しいタブは、最後に開いたアカウントではなく元のタブの選択を引き継ぐ
	const [opened] = await Promise.all([
		page.waitForEvent('popup'),
		page.evaluate(() => window.open('/'))
	]);
	await signedInAs(opened, a);
});

test('未選択のままサインインの経路でサインインすると、選ばれて戻り先へ進む — 要件 6.1, 6.7', async ({
	page
}) => {
	const { c } = await holdThreeAccounts(page, 'unselected-sign-in');
	await chooseFromMenu(page, `${c} からサインアウト`);
	await expect(page.getByRole('dialog', { name: '使うアカウントを選んでください' })).toBeVisible();

	// 保護された経路を開いても、内容は出ずに選択を待つ
	await page.goto('/password-change');
	await expect(page.getByRole('dialog', { name: '使うアカウントを選んでください' })).toBeVisible();
	await expect(page).toHaveURL('/password-change');
	await expect(main(page).getByLabel('現在のパスワード')).toBeHidden();

	// サインインの経路からは、他のアカウントがあっても追い出されずにサインインできる
	await page.goto('/signin');
	await expect(page.getByRole('dialog')).toBeHidden();
	const d = await createVerifiedUser(page.request, uniqueEmail('unselected-sign-in-d'));
	await submitSignIn(page, d);

	await expect(page).toHaveURL('/password-change');
	await expect(main(page).getByLabel('現在のパスワード')).toBeVisible();
});

test('確認待ちのアカウントから、別のアカウントへ切り替えられる — 要件 6.5, 6.8', async ({
	page
}) => {
	const verified = await createVerifiedUser(page.request, uniqueEmail('verified'));
	await page.goto('/signin');
	await submitSignIn(page, verified);
	await signedInAs(page, verified);

	// 確認の済んでいないアカウントを追加すると、確認待ちへ案内される
	await addUnverifiedFromMenu(page, uniqueEmail('unverified'));

	// 他のアカウントが確認済みでも、保護された経路へは進めない
	await page.goto('/password-change');
	await expect(page).toHaveURL('/verify-email');

	// 確認待ちのまま、メニューから確認済みのアカウントへ切り替えられる
	await chooseFromMenu(page, verified);
	await expect(page).toHaveURL('/');
	await signedInAs(page, verified);
});

test('確認待ちの画面のサインアウトは、選択中のアカウントだけをログアウトする — 要件 5.9', async ({
	page
}) => {
	const verified = await createVerifiedUser(page.request, uniqueEmail('keep'));
	await page.goto('/signin');
	await submitSignIn(page, verified);
	await signedInAs(page, verified);

	await addUnverifiedFromMenu(page, uniqueEmail('leave'));
	await main(page).getByRole('button', { name: 'サインアウト' }).click();

	// ログアウトしたのは確認待ちのアカウントだけ。1件だけ残ったアカウントが選ばれる
	await expect(page).toHaveURL('/');
	await signedInAs(page, verified);
});

test('A が開いていた経路を、離れた後に B へ引き継がせない — 要件 6.10', async ({ page }) => {
	const { a, b } = await holdTwoAccounts(page, 'owned-return');
	await chooseFromMenu(page, a);
	await signedInAs(page, a);
	await main(page).getByRole('button', { name: 'パスワードを変更する' }).click();
	await expect(main(page).getByLabel('現在のパスワード')).toBeVisible();

	// A の画面を開いたまま A からログアウトすると、1件だけ残った B が選ばれ、既定の行き先へ進む
	await chooseFromMenu(page, `${a} からサインアウト`);
	await expect(page).toHaveURL('/');
	await signedInAs(page, b);
});

test('A が開いていた経路へは、サインインし直した A だけが戻る — 要件 6.10', async ({ page }) => {
	const { a, b } = await holdTwoAccounts(page, 'owned-sign-in');
	await chooseFromMenu(page, a);
	await main(page).getByRole('button', { name: 'パスワードを変更する' }).click();
	await expect(main(page).getByLabel('現在のパスワード')).toBeVisible();

	// 全件ログアウトでサインインへ。A でサインインし直すと、A が開いていた経路へ戻る
	await chooseFromMenu(page, 'すべてのアカウントからサインアウト');
	await expect(page).toHaveURL('/signin');
	await submitSignIn(page, a);
	await expect(page).toHaveURL('/password-change');

	// もう一度 A がその経路から離れ、今度は B でサインインすると、既定の行き先へ進む
	await chooseFromMenu(page, 'すべてのアカウントからサインアウト');
	await expect(page).toHaveURL('/signin');
	await submitSignIn(page, b);
	await expect(page).toHaveURL('/');
	await signedInAs(page, b);
});
