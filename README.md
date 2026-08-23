# @14ch/svelte-firebase-auth

Firebase Authentication のメールアドレスとパスワードによる認証について、**認証ストアと5つの画面**を提供する Svelte 5 のライブラリ。組み込み側に残るのは**遷移と到達の判断**だけになる。

- **認証ストア** — サインイン状態・利用者・正規化済みのメールアドレス・確認状態を公開し、サインイン／登録／サインアウト／パスワードの変更・再設定／確認メールの送信を行う
- **5つの画面** — サインイン・登録・メールアドレスの確認待ち・パスワードの変更・パスワードの再設定
- **エラーの語彙** — Firebase のエラーコードを、利用者への案内が分かれる粒度へ畳んで返す。**例外を投げず、戻り値で返す**
- **文言の差し替え** — 既定の日本語を同梱し、組み込み側が項目単位で差し替えられる

## 導入

```bash
npm install @14ch/svelte-firebase-auth firebase svelte @14ch/svelte-ui
```

`firebase` / `svelte` / `@14ch/svelte-ui` は peer の依存であり、実体は組み込み側が持つ。

### 組み込み側の Vite の設定（必須）

このパッケージは **`.svelte` のまま配布される**。事前バンドルされると `svelte` の実体が二重になり、`Cannot read properties of undefined (reading 'call')` で描画に失敗する。

```typescript
// vite.config.ts
export default defineConfig({
	optimizeDeps: {
		exclude: ['@14ch/svelte-firebase-auth', '@14ch/svelte-ui'],
		// 除外したパッケージが持つ CJS の依存は変換されないまま残るため、個別に戻す
		include: [
			'dayjs',
			'dayjs/plugin/isSameOrAfter',
			'dayjs/plugin/isSameOrBefore',
			'dayjs/plugin/localeData',
			'dayjs/locale/ja',
			'dompurify'
		]
	},
	resolve: { dedupe: ['svelte'] }
});
```

`@14ch/svelte-ui` のスタイルの読み込みも要る。

```typescript
import '@14ch/svelte-ui/styles';
```

### Firebase 側の設定

- **戻り先（`continueUrl`）のドメインを、承認済みドメインに加える。** 加えていないと確認メールと再設定メールの送信が `auth/unauthorized-continue-uri` で失敗する
- **自由登録の可否を Firebase 側でも揃える。** `AuthConfig.selfRegistration` が制御するのは**画面の入口だけ**である。登録の API そのものは Firebase コンソールの設定でしか塞げない
- 確認メールと再設定メールのリンクを開いた先は、**Firebase の既定のアクションハンドラ**が処理する。このライブラリはその画面を持たない

## 使い方

### ストアの生成と寿命

Firebase の初期化は組み込み側が行い、`Auth` を渡す。ライブラリはグローバルな状態を持たない。

```svelte
<!-- +layout.svelte -->
<script lang="ts">
	import '@14ch/svelte-ui/styles';
	import { setContext } from 'svelte';
	import { createAuthStore, type AuthConfig } from '@14ch/svelte-firebase-auth';
	import { auth } from './firebase';

	const config: AuthConfig = {
		selfRegistration: true,
		// メールアドレスの確認を求めるか。false なら登録のあとに確認メールを送らない
		emailVerification: true,
		continueUrl: 'https://example.com/'
	};

	const store = createAuthStore(auth, config);
	setContext('authStore', store);

	// start と stop は対で持つ。start を呼ばないと isResolved が false のまま進まない
	$effect(() => {
		store.start();
		return () => store.stop();
	});
</script>
```

### 画面の配置

画面は遷移を行わず、完了と遷移の要求をコールバックで返す。

```svelte
<script lang="ts">
	import { SignIn } from '@14ch/svelte-firebase-auth';

	let screen = $state<'sign-in' | 'sign-up' | 'password-reset' | 'signed-in'>('sign-in');
</script>

{#if !store.isResolved}
	<p>読み込み中…</p>
{:else if screen === 'sign-in'}
	<SignIn
		{store}
		onSignedIn={() => (screen = 'signed-in')}
		onRequestPasswordReset={() => (screen = 'password-reset')}
		onRequestSignUp={() => (screen = 'sign-up')}
	/>
{/if}
```

`src/routes/` のショーケースが、5画面すべての切り替えとコールバックの受け方の実例になっている。

### 状態

| 値                          | 内容                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `user`                      | 現在の利用者（Firebase の `User`）                                 |
| `isResolved`                | 初回の認証状態の判定が完了したか。**一度 true になったら戻らない** |
| `isLoggedIn`                | サインインしているか                                               |
| `email`                     | **正規化済み**のメールアドレス                                     |
| `isEmailVerified`           | メールアドレスが確認済みか                                         |
| `canSelfRegister`           | 自由登録が許可されているか                                         |
| `requiresEmailVerification` | 組み込み先がメールアドレスの確認を求めるか                         |
| `stage`                     | 認証の段階。到達の判断に使う（→「到達の判断」）                    |

`isResolved` があるのは、判定が済むまで「サインインしていない」と「まだ分からない」を区別するためである。区別しないと、判定の完了前に未サインインとして扱う誤りが起きる。

### メールアドレスの確認

**確認を求めるかどうかは `emailVerification` で切り替える。** 確認を必須にしていないプロジェクトでも、そのまま組み込める。

| 設定                       | 登録のあとの確認メール | `VerifyEmail` の表示 | 到達ガード |
| -------------------------- | ---------------------- | -------------------- | ---------- |
| `emailVerification: true`  | 送る                   | 組み込み側が出す     | 組み込み側 |
| `emailVerification: false` | **送らない**           | 出さなくてよい       | 組み込み側 |

`emailVerification: false` でも `store.sendEmailVerification()` は呼べる。あとから確認を促したい場合に使う。

### 到達の判断

**「いまどの段階か」の判定はライブラリが持つ。** どの組み込み先でも同じ判定になるため、各アプリで書き直さずに済む。`store.stage` を見る。

| `stage`              | 意味                                 | 組み込み側がすること                                         |
| -------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `'unresolved'`       | 初回の判定が済んでいない             | 読み込み中を出す。**未サインインとして扱わない**             |
| `'signed-out'`       | サインインしていない                 | サインインへ送る                                             |
| `'email-unverified'` | サインイン済みだが確認が済んでいない | 確認待ちへ送る（`emailVerification: true` のときだけ現れる） |
| `'ready'`            | 通過                                 | アプリを見せる                                               |

**遷移そのものは組み込み側が行う。** ライブラリはルーティングに依存しない。

```typescript
$effect(() => {
	switch (store.stage) {
		case 'unresolved':
			break;
		case 'signed-out':
			goto('/signin');
			break;
		case 'email-unverified':
			goto('/verify-email');
			break;
		case 'ready':
			break;
	}
});
```

**到達の判断は状態から導く。** サインインのコールバックで一度だけ切り替える形にすると、**既にサインイン済みで開き直した利用者が素通りし**、ガードとして働かない。`src/routes/+page.svelte` のショーケースがこの形になっている。

> 画面の出し分けは体験のためであり、**防御は組み込み側のアクセス制御が担う**。`stage` を理由にセキュリティルールを緩めない。

**確認の完了は認証状態の購読では届かない。** 確認待ち画面は表示されている間だけ確認状態を取り直し、済んだ時点で `onVerified` を呼ぶ。取り直しは利用者の情報と **ID トークンのクレームの両方**を更新する。片方だけでは、画面は進むのに組み込み側のアクセス制御が古い値のまま残る。

確認待ち画面の外からも `store.refreshVerification()` で要求できる。

### メールアドレスの正規化

共有先の照合やアクセス制御の `.lower()` と同じ値を得るため、`normalizeEmail` を使う。組み込み側が自前で正規化すると判定がずれる。

```typescript
import { normalizeEmail } from '@14ch/svelte-firebase-auth';
```

### 失敗の扱い

操作は例外を投げず、`AuthResult` で返す。

```typescript
const result = await store.signIn(email, password);
if (!result.ok) {
	// result.error.kind は AuthErrorKind の10種のいずれか
	// result.error.detail は記録用。利用者へそのまま出さない
}
```

`AuthErrorKind`: `invalid-credential` / `invalid-email` / `email-already-in-use` / `weak-password` / `requires-recent-login` / `user-disabled` / `too-many-requests` / `registration-disabled` / `network-error` / `unknown`

- **`registration-disabled` と、戻り先のドメインに由来する失敗は、設定の食い違いの兆候である。** 出たら Firebase 側の設定を確かめる
- 自前の画面を出す場合も、`authErrorMessageOf(error, messages, context)` で同じ文言を引ける

### 文言の差し替え

指定した項目だけが差し替わり、指定のない項目は既定の日本語を使う。

```svelte
<SignIn
	{store}
	messages={{
		signInSubmit: 'ログイン',
		errors: { 'network-error': '通信できません' }
	}}
	...
/>
```

### 名乗りの差し込み

各画面は上部に `header` を受け取る。

```svelte
{#snippet header()}
	<h1>アプリ名</h1>
{/snippet}

<SignIn {store} {header} ... />
```

## 担当しないこと

以下は**組み込み側の担当**である。

- **Firebase の初期化** — `Auth` を外から受け取る
- **遷移とルーティング** — `$app/*` に依存しない。完了と遷移の要求はコールバックで返す
- **到達ガード** — 未サインイン／未確認の利用者をどこへ送るか
- **Firestore とアクセス制御**
- **メールの送信経路と到達性の運用**（SPF / DKIM / DMARC・テンプレート）

> **画面の出し分けを理由に、アクセス制御を緩めない。** 「確認済みでなければ使わせない」をライブラリは強制できない。画面での出し分けは体験のためであり、**防御は組み込み側のアクセス制御が担う**。

## 備えないもの

メールリンクによるサインイン、メールアドレスの変更、二要素認証、アカウントの削除。外部の認証プロバイダ（Google / Apple など）は現時点で要求が無いだけで、後続で加えうる。

## 開発

```bash
npm run dev            # src/routes のショーケース（Auth エミュレータへ繋ぐ）
npm run check          # 型検査
npm run lint           # 書式と静的検査
npm run test:unit      # 単体・コンポーネント
npm run test:emulator  # Auth エミュレータに当てる検証
npm run test:e2e       # ショーケースに対する通しの操作
npm run prepack        # src/lib -> dist
```

ショーケースと `test:emulator` / `test:e2e` は Auth エミュレータを使う。Firebase CLI が要る。

```bash
firebase emulators:start --only auth --project demo-svelte-firebase-auth
```

## License

MIT
