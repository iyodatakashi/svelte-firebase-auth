# Gap Analysis: auth-store-and-screens

要件（`requirements.md`）と既存コードの隔たりを整理し、設計フェーズへ渡す材料をまとめる。**決定ではなく情報**として書く。

**注意**: 本分析の時点で requirements は未承認（`approvals.requirements.approved: false`）。要件が変われば本書も変わる。

## 1. 現状の把握

### このリポジトリ

**`sv create --template library` の雛形そのままであり、認証に関する実装は1行も無い。** 実質グリーンフィールドである。

| 対象                                                 | 現状                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/lib/index.ts`                                   | `// Reexport your entry components here` のみ。公開面は空                         |
| `src/lib/`                                           | `vitest-examples/`（`greet.ts` / `Welcome.svelte` と各 spec）だけ。**雛形の残骸** |
| `src/routes/`                                        | 雛形の文言と `demo/playwright/`。ショーケースとして使える状態ではない             |
| `src/lib/screens` / `stores` / `models` / `messages` | **いずれも未作成**（`structure.md` が定める配置）                                 |
| `firebase.json`                                      | **無い**。エミュレータの設定も無い                                                |
| git                                                  | **未初期化**（`.git` が無い）                                                     |

### 依存関係の状態

**`firebase` と `@14ch/svelte-ui` は宣言も導入もされていない。** `package.json` の `peerDependencies` は `svelte: ^5.0.0` だけで、`node_modules` にも両者は無い。要件 10-5 が求める peer の宣言は未着手である。

### 既に整っているもの

- **配布の仕組み** — `prepack: svelte-kit sync && svelte-package && publint`、`files: ["dist"]`、`svelte` / `types` / `exports` の宣言
- **テストの2プロジェクト構成** — `vite.config.ts` に `client`（ブラウザ・Playwright provider・`*.svelte.{test,spec}.ts`）と `server`（node）が定義済み。`tech.md` の記述と一致する
- **書式と型** — Prettier（タブ・シングルクォート・`printWidth: 100`）、ESLint、`strict: true`
- **runes の強制** — `vite.config.ts` で `node_modules` 以外に `runes: true`

## 2. 参照できる資産（`markn`、別リポジトリ）

移植元になりうるコードは markn にある。**別リポジトリであり、コピーではなく作り直しになる部分が多い。**

| 資産                                                     | 行数 | 使えるか                                                                                                                        |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/stores/auth.svelte.ts`                          | 146  | **構造は使えない**（後述 C1）。`ERROR_KIND_BY_CODE` と `toAuthError` の形はそのまま使える                                       |
| `src/lib/models/auth/auth.types.ts`                      | 22   | `AuthError` / 結果の共用体の形は使える。**語彙は半分入れ替わる**（メールリンク由来の3種が消え、登録・再認証・停止・頻度が入る） |
| `normalizeEmail`（`models/document/documentSharing.ts`） | 1行  | `email.trim().toLowerCase()`。**そのまま移せる**（要件 1-7）                                                                    |
| `src/lib/features/auth/LoginPage.svelte`                 | 160  | **そのままは移せない**（後述 C3）。`@14ch/svelte-ui` の使い方と入力欄の組み方は参考になる                                       |
| `src/tests/stores/auth.emulator.test.ts`                 | 160  | **最も再利用価値が高い**（後述）                                                                                                |
| `src/tests/stores/auth.test.ts`                          | 310  | モックによるストアのテストの書き方                                                                                              |
| `firebase.json` の `emulators` と `test:emulator`        | —    | エミュレータの起動と vitest プロジェクトの分離の形                                                                              |

**エミュレータの検証手法**が最大の資産である。markn は Auth エミュレータの REST API `GET /emulator/v1/projects/{projectId}/oobCodes` から発行済みのワンタイムコードを取り、リンクを組み立てて検証している。**同じ手法で、確認メールの送出（要件 4-2、5-1）と再設定メールの送出（要件 7-1）、および確認の完了が待機側へ反映されること（要件 5-5、5-7）を実地で確かめられる。**

## 3. 要件 → 資産の対応

`Missing` = 実装が無い / `Constraint` = 既存の形が要件と衝突する / `Unknown` = 調査が要る

| 要件                            | 対応する資産                                            | 状態                                                                           |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1-1〜1-5（公開面）              | `src/lib/index.ts`（空）                                | **Missing**。公開面の設計そのものが未着手                                      |
| 1-6（メールリンクを備えない）   | markn の送信・復帰の実装                                | **Constraint**。移植時に落とす対象を明確にする必要がある                       |
| 1-7（`normalizeEmail`）         | markn の1行の実装                                       | 移植可                                                                         |
| 1-8（送信経路の差し替えの余地） | —                                                       | **Missing / Unknown**（R2）。設定の形だけを決める                              |
| 1-9（`continueUrl`）            | —                                                       | **Unknown**（R3）                                                              |
| 1-10（複数生成）                | markn はモジュール単位のシングルトン                    | **Constraint C1**                                                              |
| 2-1〜2-7（状態）                | markn の `user` / `isResolved` / `isLoggedIn` / `email` | 形は流用可。`isEmailVerified` / `canSelfRegister` は **Missing**               |
| 2-8〜2-10（確認状態の取り直し） | —                                                       | **Missing / Unknown**（R6）。markn にも実装が無い                              |
| 3（サインイン・サインアウト）   | markn の `login` / `logout` と `LoginPage`              | 処理は流用可。画面は作り直し                                                   |
| 4（登録）                       | —                                                       | **Missing**。markn は招待制で登録の実装が無い                                  |
| 5（確認と確認待ち画面）         | —                                                       | **Missing**。本 spec の中心。**Unknown**（R1、R6）                             |
| 6（パスワードの変更）           | —                                                       | **Missing**。再認証の実装が無い                                                |
| 7（パスワードの再設定）         | —                                                       | **Missing**                                                                    |
| 8（エラーの語彙）               | `ERROR_KIND_BY_CODE` / `toAuthError`                    | 形は流用可。**Unknown**（R4：強度の理由）                                      |
| 9（画面の契約・文言）           | `LoginPage` の入力欄の組み方                            | **Missing**。`messages` の仕組みは markn に無い。**Unknown**（R5：部品の不足） |
| 10（配布・ショーケース）        | `prepack` / `files` / `exports`                         | 仕組みは整備済み。README とショーケースは **Missing**                          |

## 4. 既存の形と要件の衝突（Constraints）

### C1: シングルトンからファクトリへ

markn のストアは**モジュールのトップレベルで `$state` を持ち、import の時点で `onAuthStateChanged` を実行する**。要件 1-10（複数生成できる）と `structure.md`「シングルトンにしない」に反する。

- **影響**: ストアは丸ごと書き直しになる。ただし `$state` を関数内に持ち getter で公開する書き方自体は、markn のオブジェクトリテラルの形をそのまま関数の中へ移せる
- **派生する論点**: 購読の解除の手段を公開面に出すか。markn は「タブが生きている限り解除しない」としているが、ライブラリでは複数生成とテストのために解除が要る場面が出うる

### C2: `$app/*` への依存

`LoginPage.svelte` は `goto` / `resolve` / `page` に直接依存し、戻り先の解決を画面の中で行っている。要件 1-2 / 9-3 により、**遷移と戻り先の解決はすべてコールバックの外側へ出る**。

- **副次的な利点**: `window.location.origin` と `localStorage` への依存も同時に消える（`continueUrl` を設定で受け取り、メールリンクの控えが不要になるため）。markn のエミュレータテストが必要としていた `window` / `localStorage` のグローバル差し込みが要らなくなる

### C3: エラーの語彙の入れ替え

markn の語彙はメールリンク前提（`expired-link` / `invalid-link` / `email-required`）で、本 spec ではこの3種が消え、`email-already-in-use` / `weak-password` / `requires-recent-login` / `user-disabled` / `too-many-requests` が入る。**写像の表は作り直しに近い。**

### C4: peer 依存と開発時の導入

`firebase` / `@14ch/svelte-ui` は peer で宣言する（要件 10-5）が、**peer は自動で導入されない**。ショーケースの動作と `svelte-package` の型解決のために devDependencies にも同じものを入れる必要がある。

### C5: 雛形の残骸

`src/lib/vitest-examples/` は配布物に含まれてしまう（`files: ["dist"]` かつ `svelte-package` は `src/lib` 全体を出す）。**公開面に出さなくても `dist` には入る。** 着手時に削除する。

## 5. 調査が要る項目（Research Needed）

| ID  | 内容                                                                                                                                                                                               | 設計への影響                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| R1  | 確認状態の取り直しの周期（要件 5-5）。確認の直後に長く待たせず、常時の通信が負担にならない値                                                                                                       | 確認待ち画面の実装と、エミュレータでの検証        |
| R2  | 送信経路の差し替えの余地（要件 1-8）を、設定のどの形で残すか。実装は含めないため、**設定の受け口だけ**を決める                                                                                     | `AuthConfig` の形                                 |
| R3  | `continueUrl` を `ActionCodeSettings` にどう渡すか。`handleCodeInApp` は false でよいか。markn design の `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` は**リンク先ドメイン**の話であり `continueUrl` とは別 | 要件 1-9 の実現方法                               |
| R4  | パスワードの強度エラーの粒度。`auth/weak-password` が理由を返すか、Identity Platform のポリシー有効時に `auth/password-does-not-meet-requirements` が返るか                                        | 要件 4-4 / 6-3 の「理由を示す」の実現度、語彙の数 |
| R5  | `@14ch/svelte-ui` に**入力欄のラベルとエラー表示をまとめる部品が無い**（`Input` と `Button` のみ）。各画面に素直に書くか、svelte-ui 側へ足すか                                                     | 5画面の実装量と、`@14ch/svelte-ui` への課題の有無 |
| R6  | `refreshVerification` の実装。`user.reload()` だけで足りるか、`getIdToken(true)` によるクレームの再取得まで要るか（組み込み側のアクセス制御は ID トークンの `email_verified` を見る）              | 要件 2-8 と、組み込み側の到達ガードの成立         |
| R7  | 確認メールの再送に対する `too-many-requests` の閾値と、エミュレータで再現できるか                                                                                                                  | 要件 5-8 / 7-6 のテストの書き方                   |
| R8  | エミュレータ用の vitest プロジェクトの追加と `firebase.json` の新規作成（このリポジトリには無い）                                                                                                  | テスト基盤の構成                                  |

**`@14ch/svelte-ui` は npm から導入できる**（markn が `^0.0.60` を導入済み）。`Input` は `type="password"` と表示切り替え（`enablePasswordVisibilityToggle`）に対応しており、パスワード欄について部品の不足は無い。

## 6. 実装アプローチの選択肢

グリーンフィールドのため「既存を拡張する」は成立しない。**markn の実装をどこまで持ち込むか**が実質の選択になる。

### Option A: markn の実装を移植して改造する

`stores/auth.svelte.ts` と `LoginPage.svelte` を持ち込み、ファクトリ化・メールリンクの除去・画面の分割を行う。

- ✅ エラーの写像と入力欄の組み方を書き直さずに済む
- ✅ markn での実績のある挙動を引き継げる
- ❌ **メールリンク前提の構造が随所に残る。** 落とし残しが公開面に紛れ込む
- ❌ シングルトン前提のコードをファクトリへ直す作業は、書き直しと大差ない
- ❌ markn 固有の判断（戻り先のクエリ名、`$app/*`）を持ち込む経路になる

### Option B: 要件から新規に書き、markn は参照だけにする

- ✅ 公開面が要件と1対1で対応し、落とし残しが生まれない
- ✅ 「組み込み側の判断をライブラリへ持ち込まない」（`conventions.md`）を構造として守れる
- ❌ エラーの写像とエミュレータの検証手法を書き直すのは無駄

### Option C: 部分移植（推奨）

**純粋なもの・検証の手法は移植し、状態と画面は新規に書く。**

| 移植する                                                        | 新規に書く                                  |
| --------------------------------------------------------------- | ------------------------------------------- |
| `normalizeEmail`                                                | `createAuthStore`（ファクトリ・購読・寿命） |
| `ERROR_KIND_BY_CODE` / `toAuthError` の**形**（語彙は入れ替え） | 5画面すべて                                 |
| エミュレータの検証手法（`oobCodes` の REST API）                | `messages` の仕組みと既定の日本語           |
| 結果の共用体の形（`{ ok: true }                                 | { ok: false, error }`）                     | 公開面（`index.ts`）・README・ショーケース |

- ✅ 書き直しの無駄を避けつつ、メールリンク前提の構造を持ち込まない
- ✅ 移植するものはいずれも**購読も遷移も持たない**ため、そのまま `models/` に収まる
- ❌ 何を移植し何を書き直すかの線引きを、着手前に決めておく必要がある

## 7. 規模と危険度

| 対象                                          | 規模  | 危険度     | 理由                                                                         |
| --------------------------------------------- | ----- | ---------- | ---------------------------------------------------------------------------- |
| `models/`（型・語彙の写像・`normalizeEmail`） | S     | Low        | 純関数と型のみ。markn に前例がある                                           |
| `stores/`（`createAuthStore`）                | M     | Medium     | ファクトリ化・取り直しの並行性（要件 2-9）・購読の寿命。前例が無い部分が中心 |
| 5画面                                         | M〜L  | Medium     | 画面数が多い。`@14ch/svelte-ui` の部品の不足（R5）次第で増える               |
| `messages/` と公開面                          | S     | Low        | 形が決まれば機械的                                                           |
| テスト基盤（エミュレータ）                    | M     | Medium     | `firebase.json` とプロジェクト構成が新規。手法は markn にある                |
| README とショーケース                         | S     | Low        | 要件 10-1 の設定は `tech.md` に明記済み                                      |
| **全体**                                      | **L** | **Medium** | 1〜2週間。未知は限定的だが、画面数とテスト基盤の新設で量がある               |

**危険度を上げている要因**は次の3つに絞られる。

1. **確認済みの反映（R6）** — ここを誤ると、組み込み側の到達ガードが成立しない。エミュレータで別セッションの確認が反映されることを確かめるまで、正しさが分からない
2. **公開面の粒度（要件 9-1、筆者の仮定 1）** — 誤ると組み込み側が使えず、各アプリが自前の画面を書き始める。最初の組み込み（markn）で確かめるまで確証が無い
3. **`@14ch/svelte-ui` の部品の不足（R5）** — 足りない場合、別リポジトリへの課題となり、こちらの完了が外部に依存する

## 8. 設計フェーズへの申し送り

- **推奨アプローチ**: Option C（部分移植）。線引きは 6 節の表のとおり
- **先に決めるべきこと**:
  - ストアの購読の寿命と、解除の手段を公開面に出すか（C1）
  - `AuthConfig` の形（`selfRegistration` / `continueUrl` / 送信経路の差し替えの受け口 R2）
  - `messages` の型の粒度（画面ごとに分けるか、単一の平坦な表にするか）
  - 5画面の props の確定（markn design の形を出発点にする）
  - エミュレータ用のテスト構成（R8）
- **持ち越す調査項目**: R1〜R8
- **着手時の片付け**: `src/lib/vitest-examples/` の削除、`src/routes/` の雛形の置き換え、`firebase` / `@14ch/svelte-ui` の peer 宣言と導入、git の初期化（`conventions.md`「ブランチの運用」）
