# Technology Stack

## Architecture

npm パッケージとして配布する Svelte のライブラリ。実行環境はブラウザ。

```
[組み込み側アプリ]
    ├── firebase の初期化 → getAuth() ─┐
    ├── 認証の経路の用意と設定         │
    └── Firestore / アクセス制御       │
                                       ↓
              [@14ch/svelte-firebase-auth]
                    ├── stores     → createAuthStore(auth, config)
                    ├── components → AuthGate（到達の制御）・5画面
                    └── models     → 型・到達の判定・エラーの写像・normalizeEmail
                                       ↓
                        [Firebase Authentication]
```

**依存の向きは一方向で、逆向きを作らない。** `models → stores → components`。`models` はいずれの層も参照しない。

## Core Technologies

- **Language**: TypeScript（strict mode）
- **UI**: Svelte 5.x（runes API）
- **Build / Packaging**: `@sveltejs/package`（`svelte-package`）+ Vite
- **SvelteKit**: **前提とする。** 遷移と到達の制御をライブラリが持つ（→「SvelteKit を前提とする」）
- **Runtime**: Node.js 24（開発時）
- **Package Manager**: npm

## Peer Dependencies

配布物が要求する依存は peer で宣言し、実体は組み込み側が持つ。二重に読み込まれることを避けるため。

- **`firebase`** — Authentication のみ。**Firestore に触らない**
- **`svelte`** — runes
- **`@sveltejs/kit`** — `$app/navigation` の `goto` と `$app/state` の `page`（→「SvelteKit を前提とする」）
- **`@14ch/svelte-ui`** — 画面の部品（→「UI は `@14ch/svelte-ui` で組む」）

## SvelteKit を前提とする

**`$app/*` を import してよい。** 遷移は `$app/navigation` の `goto`、現在の経路は `$app/state` の `page` で読む。

**この規則は、もとは逆だった**（「`$app/*` を import しない。特定のフレームワークのルーティングに依存すると、SvelteKit 以外のアプリで使えなくなる」）。**置き換えたのは、その理由の前提が失われたためである。** 依頼者の判断により組み込み先は SvelteKit に限られると決まり、「SvelteKit 以外のアプリ」という利用者は実在しなくなった。実在しない利用者のための抽象を維持する対価として、組み込み先ごとに 13 本のコールバックの配線と、段階から遷移への対応づけを書き直すことになっていた。

- **入口は1つに保つ。** SvelteKit 向けの第2の入口（`/sveltekit` など）を作らない。公開面・手引き・「中核か層か」の判断が二重になり、恒久的な負担になる
- **`$app/*` とブラウザの保存領域に触るのは `components/` だけ。** 到達の判定は純関数として `models/` に置く。戻り先を受け入れるかどうかの判定もそこにあり、保持そのものは `AuthGate` が行う。ルーターの無い環境では `goto` が例外を投げ、`page.url` が空になるため、判定と効果を分けないと**分岐のどれも単体で試験できない**
- **経路は組み込み側の設定として受け取る。** URL に現れるとおりの `pathname` を受け取り、ライブラリが経路を決めつけない
- **到達の制御は防御ではない。** ブラウザでのみ働き、組み込み側が包み忘れれば働かない。**防御は組み込み側のアクセス制御が担う**
- SvelteKit 以外の組み込み先が現れた時点で、中核を抜き出すことを検討する
- `src/routes/` はショーケース兼プレビュー用のアプリであり、**配布物に含めない**。`src/lib/` だけが配布される

## UI は `@14ch/svelte-ui` で組む

**画面の部品はこのライブラリのコンポーネントで作る。同じ役割の部品を自前で書いたり、ブラウザ標準の UI で代替したりしない。**

- 入力（`Input` 等）・操作（`Button` 等）・重ね表示（`Dialog` 等）・通知（`Snackbar`）が揃っている。まずライブラリにあるかを確認する
- **ブラウザ標準のダイアログ（`confirm` / `alert` / `prompt`）を使わない**
- **意匠の値はライブラリのトークン（`--svelte-ui-*`）を参照する**（→ `structure.md`「CSS / スタイル記法」）
- **足りないときはこちら側で回避せず、`@14ch/svelte-ui` 側の課題として扱う。** 別リポジトリ（`iyodatakashi/svelte-ui`）で開発している自前のライブラリであり、こちらに部品を作り足すと同じものが2箇所に増える

## パッケージの配布

- **`.svelte` のまま配布する。** `svelte-package` が `src/lib` を `dist` へ出す。コンパイル済みの JS にはしない
- **組み込み側に必要な設定がある。** `.svelte` のまま配布されるパッケージは、事前バンドルされると svelte の実体が二重になり `Cannot read properties of undefined (reading 'call')` で描画に失敗する。組み込み側の `vite.config.ts` で `optimizeDeps.exclude` に加え、`resolve.dedupe: ['svelte']` を設定する必要がある。**この要求は README に書く**
- **公開面は `src/lib/index.ts` に集約する**（→ `structure.md`「公開面」）

## Development Standards

### Type Safety

- TypeScript strict mode。`any` を使わない。判明しない型は `unknown` にしてナローイングする
- コンポーネントの props は明示的に型定義する
- 型の置き場所と命名は `structure.md`「型定義の規約」に従う
- **公開する型は `index.ts` から export する。** 組み込み側が型を書けない状態にしない

### Code Quality

- ESLint + Prettier（設定はリポジトリのものに従う。タブインデント・シングルクォート・`printWidth: 100`）
- 関数は理由がない限りアロー関数で書く（`const foo = () => {}`）
- 変数名・引数名を省略しない（`e` → `error`、`u` → `user`）
- ファイル内の関数はトップダウン順に並べる。呼び出し側を上、ヘルパーを下に置く

### Testing

- **Unit / Component**: Vitest。`client`（ブラウザ・Playwright provider、`*.svelte.{test,spec}.ts`）と `server`（node 環境、それ以外の `*.{test,spec}.ts`）の2プロジェクト構成
- **E2E**: Playwright（`*.e2e.ts`）。`src/routes/` のショーケースを対象にする
- **検証の手段は、その時点で使えるもので選ぶ。** エミュレータ・実プロジェクト・ショーケースでの実地の確認・モックを、対象に応じて使い分ける
- **モックで確かめられるのは「呼んだこと」だけである。** Firebase が実際にどう振る舞うかに依存する箇所（確認済みがクレームへ届くか、再認証の失敗が何を返すか）を、モックで検証済みとしない
- **実プロジェクトに当てたときに起きること**: 利用者が Auth の一覧に残る、確認メールと再設定メールが実際に送られる、その分の割り当てを使う。markn の Firebase プロジェクトは `markn-14` の1つで、開発用の別プロジェクトは無い

## Development Environment

### Required Tools

- Node.js 24+
- Firebase CLI（Auth エミュレータ）

### Common Commands

```bash
# Dev:        npm run dev        # src/routes のショーケース
# Package:    npm run prepack    # src/lib -> dist
# Type check: npm run check
# Lint:       npm run lint
# Format:     npm run format
# Test:       npm run test
# Unit only:  npm run test:unit
```

### 組み込み側とのローカル連携

npm 公開までは `npm link` で連携する（`md-editor` / `@14ch/svelte-ui` と同じ運用）。

```bash
# こちら側（変更のたびに必要）
npm run prepack

# 組み込み側（リンクが外れたとき）
npm link @14ch/svelte-firebase-auth
```

- **`dist` を参照するため、`src/lib` を変更しただけでは反映されない。** `prepack` の実行が必要
- **組み込み側で `npm install` を実行するとリンクが外れることがある。** その場合は `npm link` を再実行する

## Key Technical Decisions

- **Firebase を初期化しない。** `Auth` インスタンスを外から受け取る。ライブラリが初期化すると、既に Firebase を使っているアプリでインスタンスが二重になる
- **エラーは例外で投げず、判別可能な共用体で返す。** 呼び出し側が `try / catch` の網羅を強いられる形にしない。Firebase のエラーコードは**利用者への案内が分かれる粒度**だけに畳む。コードをそのまま透過させると、組み込み側が Firebase の語彙に依存する
- **文言はライブラリが既定（日本語）を持ち、組み込み側が項目単位で差し替えられる。** 文言を全部外に出すと、組み込み側が最初から全項目を書く羽目になる
- **メールアドレスの正規化はライブラリが持つ。** 共有先の照合やセキュリティルールの `.lower()` と同じ値を組み込み側が使えるよう、`normalizeEmail` を公開する。組み込み側が自前で正規化すると、判定がずれる
- **メールの送信の呼び出しを1箇所に閉じる。** 現時点では Firebase の既定の経路を使う。差し替えのための設定は今は置かない。省略可能な設定を後から足すのは破壊的変更ではなく、余地は呼び出しが散らばっていないことで担保する

---

_Document standards and patterns, not every dependency_
