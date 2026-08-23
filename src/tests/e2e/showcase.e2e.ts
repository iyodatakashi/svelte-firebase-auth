import { expect, test, type Page } from '@playwright/test';

const PROJECT_ID = 'demo-svelte-firebase-auth';
const EMULATOR_ORIGIN = 'http://127.0.0.1:9099';
const PASSWORD = 'showcase-secret';

/** エミュレータは実行中ずっと利用者を保持するため、経路ごとに別のアドレスを使う */
const uniqueEmail = (label: string) => `${label}-${Date.now()}@example.com`;

const signUp = async (page: Page, email: string) => {
	await page.goto('/signup');
	await page.getByLabel('メールアドレス').fill(email);
	await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: '登録する' }).click();
	await expect(page.getByRole('button', { name: '確認メールを再送する' })).toBeVisible();
};

const signIn = async (page: Page, email: string) => {
	await page.getByLabel('メールアドレス').fill(email);
	await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'サインイン', exact: true }).click();
};

/** 別のセッションで確認を済ませる。確認待ちの画面が取り直して段階が変わる */
const verifyInAnotherSession = async (page: Page, email: string) => {
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

/** 条件を満たした利用者を作る。既定の行き先まで到達したところで返る */
const signedInUser = async (page: Page, label: string) => {
	const email = uniqueEmail(label);
	await signUp(page, email);
	await verifyInAnotherSession(page, email);
	await expect(page.getByRole('heading', { name: 'サインイン済み' })).toBeVisible();
	return email;
};

test('未サインインで保護された経路を開くと、サインインへ送られる — 要件 4.2', async ({ page }) => {
	await page.goto('/password-change');

	await expect(page).toHaveURL('/signin');
	await expect(page.getByRole('button', { name: 'サインイン', exact: true })).toBeVisible();
	// 保護された経路の中身は出ない
	await expect(page.getByLabel('現在のパスワード')).not.toBeVisible();
});

test('サインインの後、開こうとしていた経路へ戻る — 要件 5.1, 5.2', async ({ page }) => {
	const email = await signedInUser(page, 'return-to');
	await page.getByRole('button', { name: 'サインアウト' }).click();
	await expect(page).toHaveURL('/signin');

	// 開こうとした経路が戻り先として保持される
	await page.goto('/password-change');
	await expect(page).toHaveURL('/signin');

	await signIn(page, email);

	await expect(page).toHaveURL('/password-change');
	await expect(page.getByLabel('現在のパスワード')).toBeVisible();
});

test('未確認のまま開き直しても、確認待ちを素通りしない — 要件 4.3, 4.6', async ({ page }) => {
	await signUp(page, uniqueEmail('reload'));

	// サインインしたまま開き直す。到達の判断を状態から導いていないと、ここで素通りする
	await page.reload();
	await expect(page).toHaveURL('/verify-email');

	// 確認の済んでいない利用者は、保護された経路にも到達しない
	await page.goto('/password-change');
	await expect(page).toHaveURL('/verify-email');
	await expect(page.getByRole('button', { name: '確認メールを再送する' })).toBeVisible();
});

test('判定が済むまで、保護された経路の中身が画面に出ない — 要件 4.8', async ({ page }) => {
	await signedInUser(page, 'pending');

	// 初回の判定が済むまでは一瞬である。描画されたものの順を記録し、後から確かめる
	await page.addInitScript(() => {
		const rendered: string[] = [];
		Object.assign(window, { renderedOrder: rendered });
		new MutationObserver(() => {
			const text = document.body?.textContent ?? '';
			const current = text.includes('現在のパスワード')
				? 'content'
				: text.includes('読み込み中')
					? 'pending'
					: null;
			if (current !== null && rendered.at(-1) !== current) {
				rendered.push(current);
			}
			// `documentElement` は初期化の時点でまだ無い。文書そのものを見る
		}).observe(document, { childList: true, subtree: true });
	});

	await page.goto('/password-change');
	await expect(page.getByLabel('現在のパスワード')).toBeVisible();

	// 待ちの表示が先に出る。中身が先に出ることは無い
	const rendered = await page.evaluate(
		() => (window as { renderedOrder?: string[] }).renderedOrder
	);
	expect(rendered).toEqual(['pending', 'content']);
});

test('振り替えの後に戻る操作をしても、振り替え前の経路に留まらない — 要件 4 の注', async ({
	page
}) => {
	await page.goto('/signin');
	await page.goto('/password-change');
	await expect(page).toHaveURL('/signin');

	await page.goBack();

	// 振り替えは履歴に残らない。戻っても保護された経路は開かない
	await expect(page).not.toHaveURL('/password-change');
	await expect(page.getByLabel('現在のパスワード')).not.toBeVisible();
});

test('サインイン済みの利用者がサインインの経路を開くと、既定の行き先へ送られる — 要件 4.4', async ({
	page
}) => {
	await signedInUser(page, 'already-signed-in');

	await page.goto('/signin');

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'サインイン済み' })).toBeVisible();
});

test('サインインの失敗と、入力を保ったままの再入力 — 要件 3.2, 3.3（auth-store-and-screens）', async ({
	page
}) => {
	const email = await signedInUser(page, 'signin-failure');
	await page.getByRole('button', { name: 'サインアウト' }).click();
	await expect(page).toHaveURL('/signin');

	await page.getByLabel('メールアドレス').fill(email);
	await page.getByLabel('パスワード', { exact: true }).fill('wrong-password');
	await page.getByRole('button', { name: 'サインイン', exact: true }).click();

	// どちらが誤っているかを示さない
	await expect(page.getByText('メールアドレスまたはパスワードが違います。')).toBeVisible();
	await expect(page.getByLabel('メールアドレス')).toHaveValue(email);
	await expect(page.getByLabel('パスワード', { exact: true })).toHaveValue('wrong-password');

	// 入力を保ったまま、正しいパスワードで入り直せる
	await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'サインイン', exact: true }).click();
	await expect(page).toHaveURL('/');
});

test('パスワードの再設定の要求 — 要件 3.6, 7.1（auth-store-and-screens）', async ({ page }) => {
	await page.goto('/signin');
	await page.getByRole('button', { name: 'パスワードをお忘れですか' }).click();

	await expect(page).toHaveURL('/password-reset');
	await expect(page.getByRole('button', { name: '再設定用のメールを送る' })).toBeVisible();

	// 登録されていないアドレスでも、登録の有無を示さない
	await page.getByLabel('メールアドレス').fill(uniqueEmail('nobody'));
	await page.getByRole('button', { name: '再設定用のメールを送る' }).click();

	await expect(
		page.getByText('入力されたメールアドレス宛に、再設定用のメールを送りました。')
	).toBeVisible();

	// 完了しても遷移しない
	await expect(page).toHaveURL('/password-reset');
});
