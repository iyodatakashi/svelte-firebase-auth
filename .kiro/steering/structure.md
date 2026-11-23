# Project Structure

構成の共通ルールは `~/.claude/rules/sveltekit-structure.md`（全 SvelteKit プロジェクト共通）にある。**ここには、このプロジェクトのドメインと、共通ルールから外れる所（例外とその理由）だけを書く。** 共通ルールと同じ内容を写さない。

## Organization Philosophy

**`src/lib/` が配布物、`src/routes/` と `src/showcase/` はショーケース。** この2つを混ぜない。ショーケースに書いたものは組み込み側に届かず、`lib` に書いたショーケース専用のコードは配布物を汚す。

`src/lib/server/` は使わない（ブラウザで動くライブラリのため）。

## 公開面（`src/lib/index.ts`）

**Purpose**: 組み込み側が依存してよい面のすべて。**ここに export されていないものは内部実装**であり、いつ変えてもよい。`package.json` の `exports` は `.` だけで、`dist` の中の並びは公開面ではない

- **深い import を組み込み側に強いない。** `@14ch/svelte-firebase-auth/dist/features/...` を書かせる形にしない
- **公開面を変えたら、組み込み側の再検証の契機になる。** 型・エラーの語彙・画面の props の変更は破壊的変更として扱う
- **公開する型と内部の型を区別する。** 公開するものは `index.ts` から export する

## ドメイン

### features（`src/lib/features/<画面>/`）

認証の画面（`signIn` / `signUp` / `verifyEmail` / `passwordChange` / `passwordReset`）と、画面を包む制御（`authGate` / `authSession`）。どれも1つずつなので、画面ごとのディレクトリで終える

- **判定を持たない。** 到達の判定は `models/authGuard/` の純関数が持ち、`AuthGate` はその結果に従うだけ。ルーターの無い環境では `goto` が例外を投げるため、分けないと単体で試験できない
- **`AuthGate` は遷移と描画の抑止を対で持つ。** 遷移だけを止めても、判定が済むまで保護された経路の中身が画面に出る
- **段階を変えない導線の遷移を自ら行う。** 行き先は `store.routes` から読む。組み込み側に導線の配線を必須にしない
- **導線の動きは、組み込み側が省略可能なコールバック（`onGoToSignIn` など）で差し替えられる。** 渡されたらページを移らずにそれを呼び、渡されなければ経路へ移る。画面をダイアログに置く組み込み先が、ページを移る代わりに別のダイアログを開くため（2026-10-31、依頼者の判断）。もとは「コールバックの props を持たない」だった。その理由は組み込み先ごとに配線を書かせる負担であり、省略できる形ならその負担は生じない
- **完了時には遷移しない。** サインイン・登録・確認・サインアウトの完了は段階を変えるため、`AuthGate` が動かす。画面にも同じ判断を書くと、判定が2箇所に増える
- **状態は store から受け取る。** 画面が `Auth` を直接呼ばない
- **`$app/*` とブラウザの保存領域（`sessionStorage` など）に触るのは `features/` だけ。** `models/` と `stores/` は参照しない（→ `tech.md`「SvelteKit を前提とする」）
- **画面は `<svelte:head><title>` を持たない（共通ルールの例外）。** ライブラリの画面は組み込み側のページに置かれ、ダイアログにも置かれる。ページの名乗りは組み込み側が決める（→ 画面の props は題字・名乗りを持たない）

### stores（`src/lib/stores/`）

`auth.svelte.ts`（公開する `createAuthStore`）と `slot.svelte.ts`（スロット1件の Auth。内部）。Firebase Auth の呼び出しはここに集める

- **シングルトンにしない。** 組み込み側が `Auth` と設定を渡して生成する。ライブラリがグローバルな状態を持つと、テストと複数インスタンスで破綻する

### models（`src/lib/models/<domain>/`）

| ドメイン    | 中身                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `auth`      | エラーの語彙・設定・段階・アカウント・`AuthStore` の型、画面の props の型、Firebase のエラーコードの写像、`normalizeEmail` |
| `authGuard` | 到達の判定（`resolveAuthGuard`）と、戻り先の型                                                                             |
| `slot`      | スロット記録・ブラウザ保存の窓口・照合の型と純関数                                                                         |
| `messages`  | 画面に出す既定の文言（`jaMessages` / `enMessages`）と、差し替え・失敗から文言を引く純関数                                  |

- **文言をコンポーネントに直接書かない。** 差し替えの対象になるものは、必ず `models/messages/` を経由する

## ショーケース（`src/routes/` と `src/showcase/`）

**Purpose**: 開発中に画面を見るためのショーケースと、E2E の対象。**配布物ではない**

- ここに書いた設定値・Firebase の初期化・経路の置き方は、**組み込み側の書き方の実例**として機能する。README と食い違わせない
- **認証の画面は、それぞれ独立した経路として置く。** 自前の画面切り替えを持たない。持つと、ライブラリの遷移と到達の制御を通らない経路でしか確かめられない
- **画面の実体は `src/showcase/` に、`src/lib` と同じ並び（`features/` / `stores/`）で置く（共通ルールの例外）。** 共通ルールは画面の実体を `src/lib/features/` に置くが、このリポジトリでは `src/lib` が配布物であり、置くとショーケースの画面と Firestore の読み書きが配布物に入る。routes は共通ルールどおり最小ラッパーにし、`#showcase/` で参照する
- `src/showcase/stores/auth.ts` がショーケースの認証ストアを1つ作る（ショーケースは SSR を使わない）

## Naming Conventions

- **ライブラリの画面は `XxxPage` と名付けない（共通ルールの例外）。** 共通ルールの `XxxPage` は routes から差し込む画面の名であり、ライブラリの画面は組み込み側のページやダイアログに置かれる部品である。ファイル名は公開する名（`SignIn`）と揃える。`Screen` のような種別のサフィックスも付けない。出自は import 文が示す。ショーケースの画面は共通ルールどおり `SignInPage` と名付ける
- **画面の props の型は `AuthBaseProps` を共通にする。** 画面ごとの差分が無い画面は `AuthBaseProps` をそのまま使い、`<コンポーネント名>Props` を作らない。差分が出た画面だけ、`AuthBaseProps` を拡げた `<コンポーネント名>Props` を持つ（`PasswordResetProps`）。画面以外のコンポーネントの props は `<コンポーネント名>Props`（`AuthGateProps`）

## Import

- `#lib/` に加え、`#showcase/`（`src/showcase/`）と `#tests/`（`src/tests/`）を `package.json` の `imports` に置く。`svelte-package` が `dist` では相対パスに直す
- **`src/lib` から `src/showcase` を import しない。** 逆向きの依存であり、配布物がショーケースに依存する

## テスト

- テストの補助（Firebase の差し替え・偽のストア・エミュレータへの接続）は `src/tests/support/` に置く。`src/lib` と同じ並びの外にある
- `*.emulator.test.ts` はエミュレータに当てるテスト（→ `tech.md`）

## CSS / スタイル記法

- **BEM 記法で書く**（Block・Element `__`・Modifier `--`）
- **Block 名はコンポーネントの PascalCase 名を kebab-case に変換する**（`SignIn.svelte` → `.sign-in`）
- **見た目のための修飾タグ（`<strong>` / `<b>` / `<em>` / `<small>` など）を使わない。** 強調・装飾はクラスと CSS で表現する
- **スタイルはそのコンポーネントの `<style>` に書く。** 見た目はそのファイル内で完結させる
- **意匠の値は `@14ch/svelte-ui` のトークン（`--svelte-ui-*`）を参照する。** 色・フォントサイズ・意匠としての余白や寸法を `#333` `14px` のような生値で書かない。**ライブラリ独自のパレットを持たない** — 組み込み側のテーマに従うため。必要なトークンが無ければ `@14ch/svelte-ui` 側に足す（→ `tech.md`）
- **画面が共有する余白は `src/lib/assets/styles/variables.css` の `:root` で定義し、各画面はフォールバックを書かずに参照する**（`var(--auth-block-gap)`）。フォールバックを各所に書くと、変数が定義されていないことに気づけないまま値が散らばり、食い違っていく。値を変えるときは variables.css だけを直す。組み込み側は `:root` か画面を包む要素で上書きする
- **`font-size` は、下げる理由を言えるときだけ書く。** 既定は何も指定しないことである。ブラウザの標準は 16px で、`--svelte-ui-font-size` の 1rem もそれに合わせてある。**小さくするのが丁寧なのではない。** 読ませたいものを読みにくくしているだけなら、それは設計ではなく癖である
- **画面に出す文に `--svelte-ui-font-size-sm` を当てない。** 説明・通知・エラー・案内は、利用者が詰まる場面で読ませたい**本文**である。**本文の標準は `--svelte-ui-font-size` の 1rem（16px）で、何も指定しなければそれが効く。** `--svelte-ui-font-size-sm` は 0.875rem（14px）であり、**標準ではなく一段小さい値**である。14px を標準と取り違えて当てない。**色も `--svelte-ui-text-subtle-color` で薄くしない**（→ コミット `498b10e`）
- **操作の並びは「取りやめが左、実行が右」。** 描画の順もそのとおりに書く。見た目だけを CSS で入れ替えると、読み上げと Tab の順が見た目と食い違う
- **画面の外形（幅・配置）を決めつけない。** 組み込み側のレイアウトに置かれるため、`position: fixed` や画面全体を占める前提を持たない

## Code Organization Principles

- **組み込み側の判断を内部に抱えない。** 特定のアプリだけに必要な分岐が現れたら、設定・コールバック・文言として外へ出す（→ `product.md`）
- **例外を投げない。** 失敗は戻り値で表す（→ `tech.md`「エラーは例外で投げず、判別可能な共用体で返す」）

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_
