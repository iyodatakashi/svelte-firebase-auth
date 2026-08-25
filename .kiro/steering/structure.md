# Project Structure

## Organization Philosophy

**`src/lib/` が配布物、`src/routes/` はショーケース。** この2つを混ぜない。`routes` に書いたものは組み込み側に届かず、`lib` に書いたショーケース専用のコードは配布物を汚す。

`lib` の中は、画面（components）・状態と操作（stores）・ドメインの型と純関数（models）で責務を分ける。`markn` / `logotope` の構成方針に準拠する。同一の開発者が行き来するため、置き場所と書き方を推測できる状態を優先する。

`src/lib/server/` は使わない（ブラウザで動くライブラリのため）。

## Directory Patterns

### 公開面（`src/lib/index.ts`）

**Purpose**: 組み込み側が依存してよい面のすべて。**ここに export されていないものは内部実装**であり、いつ変えてもよい

```typescript
export { createAuthStore } from './stores/auth.svelte';
export { normalizeEmail } from './models/auth/auth';
export { default as AuthGate } from './components/AuthGate.svelte';
export { default as SignIn } from './components/SignIn.svelte';
export type {
	AuthStore,
	AuthConfig,
	AuthRoutes,
	AuthError,
	AuthErrorKind
} from './models/auth/auth.types';
```

- **深い import を組み込み側に強いない。** `@14ch/svelte-firebase-auth/dist/components/...` を書かせる形にしない
- **公開面を変えたら、組み込み側の再検証の契機になる。** 型・エラーの語彙・画面の props の変更は破壊的変更として扱う

### components（`src/lib/components/`）

**Purpose**: 画面の実体と、画面を包む制御。マークアップとコンポーネント固有のロジック。**`$app/*` に触ってよいのはここだけ**
**Example**: `src/lib/components/SignIn.svelte`、`src/lib/components/AuthGate.svelte`

- **判定を持たない。** 到達の判定は `models/` の純関数が持ち、`AuthGate` はその結果に従うだけ。ルーターの無い環境では `goto` が例外を投げるため、分けないと単体で試験できない
- **`AuthGate` は遷移と描画の抑止を対で持つ。** 遷移だけを止めても、判定が済むまで保護された経路の中身が画面に出る
- **段階を変えない導線の遷移を自ら行う。** 行き先は `store.routes` から読む。**コールバックの props を持たない**
- **完了時には遷移しない。** サインイン・登録・確認・サインアウトの完了は段階を変えるため、`AuthGate` が動かす。画面にも同じ判断を書くと、判定が2箇所に増える
- **状態は store から受け取る。** 画面が `Auth` を直接呼ばない

### stores（`src/lib/stores/`）

**Purpose**: 認証状態の保持と、Firebase Auth への操作。**購読（`onAuthStateChanged`）と寿命を持つもの**
**Example**: `src/lib/stores/auth.svelte.ts`（`createAuthStore` ファクトリ）

- **シングルトンにしない。** 組み込み側が `Auth` と設定を渡して生成する。ライブラリがグローバルな状態を持つと、テストと複数インスタンスで破綻する
- **`$app/*` を参照しない。**

### models（`src/lib/models/<domain>/`）

**Purpose**: ドメインの型・定数・純関数。**購読を持たない**

| ファイル                | 内容                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `<domain>.types.ts`     | 型と型ガードのみ（変換関数は置かない）                       |
| `<domain>.constants.ts` | ドメインの定数                                               |
| `<domain>.ts`           | ドメインの純関数（`normalizeEmail`、エラーコードの写像など） |

### messages（`src/lib/messages/`）

**Purpose**: 画面に出す既定の文言。組み込み側が項目単位で差し替えられる形で公開する
**Example**: `src/lib/messages/ja.ts`

- **文言をコンポーネントに直接書かない。** 差し替えの対象になるものは、必ずここを経由する

### routes（`src/routes/`）

**Purpose**: 開発中に画面を見るためのショーケースと、E2E の対象。**配布物ではない**

- ここに書いた設定値・Firebase の初期化・経路の置き方は、**組み込み側の書き方の実例**として機能する。README と食い違わせない
- **認証の画面は、それぞれ独立した経路として置く。** 自前の画面切り替えを持たない。持つと、ライブラリの遷移と到達の制御を通らない経路でしか確かめられない

## Naming Conventions

- **Svelte コンポーネント**: PascalCase（`SignIn.svelte`）
- **TypeScript ファイル**: kebab-case。ただし store と models 配下は camelCase + 用途サフィックス（`auth.svelte.ts` / `auth.types.ts`）
- **型**: PascalCase（`AuthStore`, `AuthErrorKind`）
- **コンポーネント名に `Screen` のような種別のサフィックスを付けない。** 画面として出すものは名前で言い直しても情報が増えない。出自は import 文が示す（組み込み側は自分の画面を `*Page` などで名付けている）
- **画面の props の型は `AuthBaseProps` に一本化する。** 画面ごとの差分が無いため、`<コンポーネント名>Props` を作らない。画面以外のコンポーネントの props は `<コンポーネント名>Props`（`AuthGateProps`）

## 型定義の規約（重要）

**型やコードを書く前に、まずこの規約を照合する。**

- **置き場所**: `src/lib/models/<domain>/<domain>.types.ts` に書く。`src/lib/types/` のような汎用の場所に新しい型を置かない
- **`.types.ts` に集約する**: 各所にローカル型をインライン定義しない。共用できる型は共用し、重複定義しない
- **`.types.ts` は型と型ガードのみ**: 変換関数を `.types.ts` に置かない。変換は利用側に書く
- **公開する型と内部の型を区別する**: 公開するものは `index.ts` から export し、変更を破壊的変更として扱う
- **型を移動したら import を直す**: 旧ファイルに `export type { X }` の re-export を残さない

## Import Organization

```typescript
// 外部ライブラリ
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@14ch/svelte-ui';

// パスエイリアス（$lib = src/lib/）
import type { AuthStore } from '$lib/models/auth/auth.types';

// 相対インポート（同一ディレクトリ内）
import AuthField from './AuthField.svelte';
```

**Path Aliases**: `$lib/` → `src/lib/`（SvelteKit 標準）

- **`src/lib` から `src/routes` を import しない。** 逆向きの依存であり、配布物がショーケースに依存する
- **`$app/*` を import してよいのは `components/` だけ。** `models/` と `stores/` は参照しない（→ `tech.md`「SvelteKit を前提とする」）
- **ブラウザの保存領域（`sessionStorage` など）に触るのも `components/` だけ。** 効果を持つものを、判定と状態の層へ入れない

## CSS / スタイル記法

- **BEM 記法で書く**（Block・Element `__`・Modifier `--`）
- **Block 名はコンポーネントの PascalCase 名を kebab-case に変換する**（`SignIn.svelte` → `.sign-in`）
- **見た目のための修飾タグ（`<strong>` / `<b>` / `<em>` / `<small>` など）を使わない。** 強調・装飾はクラスと CSS で表現する
- **スタイルはそのコンポーネントの `<style>` に書く。** 見た目はそのファイル内で完結させる
- **意匠の値は `@14ch/svelte-ui` のトークン（`--svelte-ui-*`）を参照する。** 色・フォントサイズ・意匠としての余白や寸法を `#333` `14px` のような生値で書かない。**ライブラリ独自のパレットを持たない** — 組み込み側のテーマに従うため。必要なトークンが無ければ `@14ch/svelte-ui` 側に足す（→ `tech.md`）
- **画面の外形（幅・配置）を決めつけない。** 組み込み側のレイアウトに置かれるため、`position: fixed` や画面全体を占める前提を持たない

## Code Organization Principles

- **Firebase Auth の呼び出しは `src/lib/stores/` に集約する。** 画面から `firebase/auth` を直接呼ばない
- **組み込み側の判断を内部に抱えない。** 特定のアプリだけに必要な分岐が現れたら、設定・コールバック・文言として外へ出す（→ `product.md`）
- **例外を投げない。** 失敗は戻り値で表す（→ `tech.md`「エラーは例外で投げず、判別可能な共用体で返す」）
- **過度な共通化をしない。** 画面ごとに将来分岐しうる UI は、共通コンポーネント化せず各画面に素直に書く。判断基準は「この共通物を変えると、意図しない他画面に影響するか？」

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_
