import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const PROJECT_ID = 'demo-svelte-firebase-auth';
export const EMULATOR_ORIGIN = 'http://127.0.0.1:9099';
export const PASSWORD = 'showcase-secret';

/** エミュレータは実行中ずっと利用者を保持するため、経路ごとに別のアドレスを使う */
export const uniqueEmail = (label: string) =>
	`${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;

/** 画面の本体。閉じたダイアログの中身も文書には残るため、操作の対象を本体に絞る */
export const main = (page: Page): Locator => page.getByRole('main');

/** 確認済みの利用者を、画面を通さずに作る */
export const createVerifiedUser = async (request: APIRequestContext, email: string) => {
	const created = await request.post(
		`${EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
		{ data: { email, password: PASSWORD } }
	);
	const { localId }: { localId: string } = await created.json();
	await request.post(
		`${EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
		{ headers: { Authorization: 'Bearer owner' }, data: { localId, emailVerified: true } }
	);
	return email;
};

/** 別のセッションで確認を済ませる。確認待ちの画面が取り直して段階が変わる */
export const verifyInAnotherSession = async (page: Page, email: string) => {
	const response = await page.request.get(
		`${EMULATOR_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
		{ headers: { Authorization: 'Bearer owner' } }
	);
	const body: { oobCodes?: { email: string; requestType: string; oobLink: string }[] } =
		await response.json();
	const code = body.oobCodes?.find(
		(each) => each.email === email && each.requestType === 'VERIFY_EMAIL'
	);
	if (!code) {
		throw new Error(`${email} 宛の確認メールが発行されていない`);
	}
	await page.request.get(code.oobLink, { maxRedirects: 0 });
};

/** 本体のサインインの画面で入力して送る */
export const submitSignIn = async (page: Page, email: string, password = PASSWORD) => {
	await main(page).getByLabel('メールアドレス').fill(email);
	await main(page).getByLabel('パスワード', { exact: true }).fill(password);
	await main(page).getByRole('button', { name: 'サインイン', exact: true }).click();
};

/** 本体の登録の画面で登録し、確認待ちに着いたところで返る */
export const signUp = async (page: Page, email: string) => {
	await page.goto('/signup');
	await main(page).getByLabel('メールアドレス').fill(email);
	await main(page).getByLabel('パスワード', { exact: true }).fill(PASSWORD);
	await main(page).getByRole('button', { name: '登録する' }).click();
	await expect(main(page).getByRole('button', { name: '確認メールを再送する' })).toBeVisible();
};
