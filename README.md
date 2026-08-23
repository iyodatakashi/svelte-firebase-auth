# @14ch/svelte-firebase-auth

Firebase Authentication のメールアドレスとパスワードによる認証について、**認証ストア・5つの画面・到達の制御**を提供する SvelteKit のライブラリ。組み込み側に残るのは、**Firebase の初期化・経路の設定・アクセス制御**だけになる。

- **認証ストア** — サインイン状態・利用者・正規化済みのメールアドレス・確認状態を公開し、サインイン／登録／サインアウト／パスワードの変更・再設定／確認メールの送信を行う
- **5つの画面** — サインイン・登録・メールアドレスの確認待ち・パスワードの変更・パスワードの再設定。**画面どうしの行き来はライブラリが行い、題字などのページの要素は持たない**
- **到達の制御** — 認証の段階に応じて到達を振り替える。組み込み側は根の配置に1つ置くだけでよい
- **サインイン後の戻り先** — 開こうとしていた経路へ、サインインの後に進む
- **エラーの語彙** — Firebase のエラーコードを、利用者への案内が分かれる粒度へ畳んで返す。**例外を投げず、戻り値で返す**
- **文言の差し替え** — 既定の日本語を同梱し、組み込み側が項目単位で差し替えられる

## 導入

```bash
npm install @14ch/svelte-firebase-auth firebase svelte @14ch/svelte-ui
```

`firebase` / `svelte` / `@sveltejs/kit` / `@14ch/svelte-ui` は peer の依存であり、実体は組み込み側が持つ。

**このライブラリは SvelteKit を前提とする。** 遷移に `$app/navigation` の `goto`、現在の経路に `$app/state` の `page` を使う。

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
		continueUrl: 'https://example.com/',
		// 認証の経路。画面の遷移と到達の制御が、この値だけを見る
		routes: {
			signIn: '/signin',
			signUp: '/signup',
			verifyEmail: '/verify-email',
			passwordReset: '/password-reset',
			afterSignIn: '/'
		}
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

### 経路の用意

`AuthConfig.routes` に書いた経路を、組み込み側が用意する。**置くものは画面1つだけ**であり、遷移の配線は要らない。

| 設定            | 例                | そこへ置くもの                 |
| --------------- | ----------------- | ------------------------------ |
| `signIn`        | `/signin`         | `<SignIn {store} />`           |
| `signUp`        | `/signup`         | `<SignUp {store} />`           |
| `verifyEmail`   | `/verify-email`   | `<VerifyEmail {store} />`      |
| `passwordReset` | `/password-reset` | `<PasswordReset {store} />`    |
| `afterSignIn`   | `/`               | 認証を終えた利用者に見せるもの |

```svelte
<!-- src/routes/signin/+page.svelte -->
<script lang="ts">
	import { getContext } from 'svelte';
	import { SignIn, type AuthStore } from '@14ch/svelte-firebase-auth';

	const store = getContext<AuthStore>('authStore');
</script>

<SignIn {store} />
```

`PasswordChange` は**認証の経路ではない**。サインイン済みの利用者が使う画面であり、好きな経路へ置く（到達の制御は振り替えの対象にしない）。

- **経路は URL に現れるとおりの `pathname` を書く。** アプリが `base` を使うなら、それを含めた値を渡す。到達の制御は `page.url.pathname` とそのまま突き合わせる
- 一致の判定は**問い合わせ文字列を無視し、末尾の区切りを正規化した完全一致**である。`/signin` は `/signin/` と同じで、`/signin-help` とは別の経路になる

### 到達の制御を有効にする

**根の `+layout.svelte` で子を `AuthGate` で包む。** これ1箇所だけでよい。

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { AuthGate } from '@14ch/svelte-firebase-auth';

	let { children } = $props();
</script>

{#snippet pending()}
	<p>読み込み中…</p>
{/snippet}

<AuthGate {store} {pending}>
	{@render children()}
</AuthGate>
```

`pending` は、**初回の認証状態の判定が済むまで**に見せるもの。省略すると何も描画しない。

| `stage`              | 意味                                 | `AuthGate` がすること                                                    |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `'unresolved'`       | 初回の判定が済んでいない             | **遷移せず、子も描画しない。** `pending` を出す                          |
| `'signed-out'`       | サインインしていない                 | サインイン・登録・再設定には留まる。それ以外はサインインへ振り替える     |
| `'email-unverified'` | サインイン済みだが確認が済んでいない | 確認待ちには留まる。それ以外は確認待ちへ振り替える                       |
| `'ready'`            | 通過                                 | 認証の4経路からは戻り先または `afterSignIn` へ。それ以外の到達は妨げない |

- **遷移と描画の抑止は対で必要である。** 遷移だけを止めても、判定が済むまで保護された経路の中身が画面に出る。`AuthGate` はその両方を持つ
- **振り替えは履歴に残さない。** 残すと戻る操作で振り替え前へ戻り、ふたたび振り替えられる
- **ブラウザでのみ働く。** サーバ側の描画では遷移しない

### サインイン後の戻り先

未サインインの利用者が保護された経路を開くと、**その経路を戻り先として保持**してサインインへ振り替える。条件を満たした時点で、保持した戻り先へ進んで破棄する。

- 保持は**タブ単位**で、再読み込みと経路の移動を跨ぐ。**確認待ちを経由しても失われない**
- 保持するのは**根からの相対の経路だけ**である。外部を指す値（`//evil.example` を含む）は用いず、`afterSignIn` へ進む
- 認証の経路そのものは戻り先にしない

`src/routes/` のショーケースが、経路の置き方と `AuthGate` の使い方の実例になっている（**配布物には含まれない**）。

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
| `stage`                     | 認証の段階。`AuthGate` が読む（→「到達の制御を有効にする」）       |
| `routes`                    | 設定した認証の経路。画面と `AuthGate` が読む唯一の出所             |

`isResolved` があるのは、判定が済むまで「サインインしていない」と「まだ分からない」を区別するためである。区別しないと、判定の完了前に未サインインとして扱う誤りが起きる。

### メールアドレスの確認

**確認を求めるかどうかは `emailVerification` で切り替える。** 確認を必須にしていないプロジェクトでも、そのまま組み込める。

| 設定                       | 登録のあとの確認メール | 確認待ちへの振り替え               |
| -------------------------- | ---------------------- | ---------------------------------- |
| `emailVerification: true`  | 送る                   | 行う                               |
| `emailVerification: false` | **送らない**           | **行わない**（この段階が現れない） |

`emailVerification: false` でも `store.sendEmailVerification()` は呼べる。あとから確認を促したい場合に使う。

**確認の完了は認証状態の購読では届かない。** 確認待ち画面は、表示されている間だけ確認状態を取り直す。済めば段階が変わり、`AuthGate` が振り替える。取り直しは利用者の情報と **ID トークンのクレームの両方**を更新する。片方だけでは、画面は進むのに組み込み側のアクセス制御が古い値のまま残る。

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
/>
```

### 題字と名乗り

**各画面は題字（見出し）を持たない。** ページの要素は、画面を置く側が決める。

```svelte
<!-- src/routes/signin/+page.svelte -->
<h1>アプリ名</h1>
<SignIn {store} />
```

画面が持つのは、入力欄・操作・提示だけである。見出しの階層・名乗り・レイアウトは組み込み側のページに属し、ライブラリが決めつけない。

## 担当しないこと

以下は**組み込み側の担当**である。

- **Firebase の初期化** — `Auth` を外から受け取る
- **経路の実体** — 経路の値を受け取るだけで、`+page.svelte` は組み込み側が置く
- **Firestore とアクセス制御**
- **サーバ側のセッション検証** — Admin SDK を要する
- **メールの送信経路と到達性の運用**（SPF / DKIM / DMARC・テンプレート）

> **画面の出し分けを理由に、アクセス制御を緩めない。** `AuthGate` は**体験のための仕組みであって防御ではない**。ブラウザでのみ働き、包み忘れれば働かない。**防御は組み込み側のアクセス制御が担う。到達の制御があることを理由にセキュリティルールを緩めない。**

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
