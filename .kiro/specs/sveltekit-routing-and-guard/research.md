# Research & Design Decisions

## Summary

- **Feature**: `sveltekit-routing-and-guard`
- **Discovery Scope**: Extension（既存の公開面の作り替え）。light discovery を実行し、`gap-analysis.md` の Research Needed 5件を解消した
- **Key Findings**:
  - **`goto` はルーター無しで例外を投げ、`page.url` は空になる**（実測）。判定と効果を分けない限り、ガードは単体で試験できない
  - **戻り先は常に「根からの相対パス」として保持すれば、外部への誘導が構造的に成立しない。** オリジンの照合よりも確実で、`//evil.example` のような**プロトコル相対の URL**を弾く検査が要点になる
  - **`+layout.ts` の `load` で `redirect()` を投げる案は採れない。** Firebase Authentication の状態はブラウザにあり、`load` はサーバでも走るため、段階の変化（要件 4-6）に追随できない
  - `AuthConfig` は既にストアが保持しており、**経路をストアから公開すれば画面へ新しい props を足さずに済む**
  - `goto(url, { replaceState })` を実物の型定義で確認。ガードの振り替えは履歴に残さない

## Research Log

### `$app/*` は何であり、配布物でどう振る舞うか

- **Context**: 要件 1-1 / 1-2。`.svelte` のまま配布するライブラリが SvelteKit の API を使えるか
- **Sources Consulted**: `node_modules/@sveltejs/kit`（2.70.3）の `package.json` の `exports`、`src/runtime/app/`、`svelte-package` の実行結果、実際に probe を作って計測
- **Findings**:
  - `$app/*` は kit の package exports に**存在しない**。SvelteKit の Vite プラグインが解決する仮想モジュールである
  - `svelte-package` は `$app/navigation` の import を `dist` へ**素通しで残す**。組み込み側の SvelteKit が解決する
  - `@sveltejs/kit` を `dependencies` / `peerDependencies` のいずれにも宣言していない場合、`svelte-package` が**警告を出す**
- **Implications**: 配布は成立する。要件 1-1（peer 依存の宣言）は道具立てが強制するため、宣言漏れは検出できる

### ルーターの無い環境で `goto` と `page` はどう振る舞うか

- **Context**: 要件 4 のガードと要件 3 の画面を、どこまで試験できるか
- **Sources Consulted**: `vitest` の `client` プロジェクト（Playwright ブラウザ）で probe を実行
- **Findings**:
  - `import { goto } from '$app/navigation'` は**解決し、関数として存在する**（モックなしで import できる）
  - `goto('/x')` を呼ぶと**例外**（`Cannot read properties of undefined`）。ルーターが初期化されていないため
  - `page.url` は**空**。ルーターが初期化されていないため URL を持たない
- **Implications**:
  - 遷移を伴うコンポーネントのテストは `$app/navigation` を差し替える必要がある（設定ファイルに1行）
  - **URL を内部で読む実装は、そのままでは試験できない。** ガードの判定を純関数へ分ける根拠になる（→ Design Decisions）

### 到達ガードをどこに置くか

- **Context**: 要件 4-6（段階の変化に追随する）と 4-7（ブラウザでのみ働く）
- **Findings**:
  - `+layout.ts` の `load` で `redirect()` を投げる方法は、**遷移の時にしか走らない**。サインアウトや確認の完了のように**遷移を伴わない段階の変化に追随できない**
  - `load` はサーバでも走る。Firebase Authentication の状態はブラウザにあり、サーバ側では常に「まだ分からない」状態になる
  - 根の `+layout.svelte` の `$effect` は、`store.stage` と `page.url` の双方を依存として拾い、**どちらが変わっても走る**
- **Implications**: 根の `+layout.svelte` の `$effect` に置く。要件 4-6 と 4-7 を同時に満たす唯一の位置である

### 戻り先をどこに保持するか

- **Context**: 要件 5-1 / 5-5。確認を終えるまで失わない
- **Findings**:
  - 登録 → 確認待ち → （別のタブでリンクを開く）→ 戻る、という経路で**再読み込みを跨ぐ**ことがある。モジュール内の状態では失われる
  - URL のクエリに載せる方法は、確認待ちの経路へ移った時点で持ち回りが必要になり、経路ごとに引き継ぐ処理が増える
  - `sessionStorage` はタブ単位で再読み込みに耐え、タブを閉じれば消える。ガードはブラウザでのみ働く（要件 4-7）ため、サーバ側での不在を考える必要が無い
- **Implications**: `sessionStorage` に保持する。`auth-store-and-screens` の「新しい永続データを持たない」から外れるため、**記録に残す**（保持するのは戻り先の経路1つだけで、認証の状態は持たない）

### 外部への誘導をどう防ぐか

- **Context**: 要件 5-4
- **Findings**:
  - 戻り先の出所は、利用者が到達しようとした自分のアプリの経路である。**根からの相対パスとして取り出せば、はじめから外部を指し得ない**
  - 危険なのは `//evil.example/path` のような**プロトコル相対の URL**である。`/` で始まるため素朴な検査を通過し、ブラウザは外部として解決する
  - `new URL(value, origin).origin !== origin` による照合でも弾けるが、**保持する値を経路に限ること**のほうが構造として強い
- **Implications**: 保持も復帰も**根からの相対パスに限る**。`/` で始まり、かつ `//` で始まらないものだけを受け入れる

### ガードの振り替えを履歴に残すか

- **Context**: 要件 4-2 / 4-3
- **Sources Consulted**: `@sveltejs/kit` 2.70.3 の型定義（`goto(url, opts?: { replaceState?: boolean; ... })`）
- **Findings**: 振り替えを履歴へ積むと、戻るボタンで振り替え前の経路へ戻り、ガードが再び振り替える。利用者から見ると「戻れない」
- **Implications**: **ガードによる振り替えは `replaceState: true`**。利用者の操作による遷移（画面の導線）は通常どおり履歴へ積む

## Architecture Pattern Evaluation

| Option                                             | Description                                                                                                         | Strengths                                                              | Risks / Limitations                                                                                                                | Notes                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **判定と効果を分ける（純関数 + 薄い包み）**        | 段階・現在の経路・設定・戻り先から「留まる／振り替える」を返す純関数と、`page` を読んで `goto` する薄い関数に分ける | **判定を node のテストで全網羅できる。** 効果側が薄いので E2E で足りる | ファイルが1つ増える                                                                                                                | **採用**（→ Design Decisions） |
| ガードが `page` を内部で読む単一の関数             | 1ファイルで完結する                                                                                                 | 素朴                                                                   | **`page.url` が空になるためテストできない。** 分岐が多いほど検証されない部分が増える                                               | 不採用                         |
| 遷移を専用モジュールへ集約（画面は意図だけを渡す） | 画面は `goto` を直接呼ばず、遷移の関数群へ意図を渡す                                                                | `$app/*` を触る箇所が減る                                              | **経路はストアから読めるため、間接を足す動機が「テストのモック1行を省く」だけになる。** 今回退けた「利用者の実在しない抽象」と同型 | 不採用（→ Design Decisions）   |

## Design Decisions

### Decision: ガードを「判定の純関数」と「効果を持つ薄い包み」に分ける

- **Context**: 要件 4-1〜4-6。`page.url` がテスト環境で空になり、`goto` が例外を投げる
- **Alternatives Considered**:
  1. 単一の関数が `page` を読んで `goto` する — 分岐が8通り以上あるのに、**どれも単体で試験できない**
  2. ガードに URL を引数で渡す形だけにする — 組み込み側が毎回 `page.url` を渡すことになり、要件 1-4（1箇所で有効にできる）を損なう
- **Selected Approach**: 純関数 `resolveAuthGuard(段階・現在の経路・設定・保持している戻り先) → 判定` と、`page` を読み `goto` を呼ぶ `applyAuthGuard(store)` に分ける。組み込み側は後者を `$effect` の中で1行呼ぶ
- **Rationale**: **判定は状態の写像であり、副作用を持たない。** 分けることで、段階4種 × 経路の種類 × 戻り先の有無の組み合わせを node のテストで網羅できる。効果側に残るのは「読む・呼ぶ」だけになる
- **Trade-offs**: ファイルが2つになる。ただし責務が異なり、片方は購読も遷移も持たない純関数であるため `structure.md` の層の定義（models = 純関数）に素直に収まる
- **Follow-up**: 効果側は E2E で確かめる（再読み込み・戻るボタン・別タブでの確認）

### Decision: 経路はストアから公開し、画面へ新しい props を足さない

- **Context**: 要件 2-2（画面とガードが同じ経路を用いる）、要件 3
- **Alternatives Considered**:
  1. 画面が `routes` を props で受け取る — 5画面すべてに同じ props が増える。渡し忘れが起きうる
  2. 遷移を専用モジュールへ集約し、画面は意図だけを渡す — 間接が1段増える。**動機はテストのモックを1行省くことに帰着し、割に合わない**
- **Selected Approach**: `AuthConfig.routes` をストアが保持し、`AuthStore.routes` として公開する。画面は既に受け取っているストアから読む
- **Rationale**: **経路の出所が1つになる**（要件 2-2 が構造で保証される）。`canSelfRegister` / `requiresEmailVerification` と同じ形であり、新しい概念を持ち込まない
- **Trade-offs**: 画面が `$app/navigation` を直接 import する。コンポーネントのテストは差し替えが要るが、**設定ファイルに1行**で済むことを実測で確かめている

### Decision: 戻り先は根からの相対パスとして `sessionStorage` に保持する

- **Context**: 要件 5-1 / 5-4 / 5-5
- **Alternatives Considered**:
  1. モジュール内の状態 — **再読み込みで失われ、要件 5-5 を満たさない**
  2. URL のクエリ — 確認待ちの経路へ移る際に持ち回りが要り、経路ごとの引き継ぎが増える
  3. 絶対 URL を保持し、オリジンを照合する — 照合を1箇所でも忘れると外部への誘導が成立する
- **Selected Approach**: `sessionStorage` に、`/` で始まり `//` で始まらない経路だけを保持する
- **Rationale**: タブ単位で再読み込みに耐え、タブを閉じれば消える。**保持する値を経路に限ることで、外部を指し得ない**（照合の忘れが起こり得ない）
- **Trade-offs**: `auth-store-and-screens` の「新しい永続データを持たない」から外れる。保持するのは戻り先の経路1つだけであり、認証の状態は持たない

### Decision: ガードの振り替えは履歴に残さない

- **Context**: 要件 4-2 / 4-3
- **Selected Approach**: ガードによる `goto` は `replaceState: true`。画面の導線による遷移は通常どおり
- **Rationale**: 振り替えを履歴へ積むと、戻るボタンで振り替え前へ戻り、再び振り替えられる。利用者から見て「戻れない」状態になる

### Decision: ガードは根の `+layout.svelte` の `$effect` に置く

- **Context**: 要件 4-6 / 4-7
- **Alternatives Considered**: `+layout.ts` の `load` で `redirect()` を投げる — **遷移の時にしか走らず、段階の変化に追随しない**。加えて `load` はサーバでも走り、Firebase の状態がそこに無い
- **Selected Approach**: 組み込み側が根の `+layout.svelte` で `$effect(() => applyAuthGuard(store))` と書く
- **Rationale**: `store.stage` と `page.url` の双方を依存として拾うため、**どちらが変わっても走る**。要件 4-6 と 4-7 を同時に満たす

### Decision: 遷移と描画を1つの包み（`AuthGate`）が持つ

- **Context**: design レビューの指摘（2026-08-23）。**ガードが遷移だけを止めても、判定が済むまで保護された経路の中身が画面に出る**
- **Findings**: 要件 4-1 により `unresolved` の間は振り替えない。その間、組み込み側が自前で描画を止めなければ、未サインインの利用者にアプリの中身が見える
- **Alternatives Considered**:
  1. 組み込み側が `{#if store.stage !== 'unresolved'}` を書く — **ガードの呼び出しと描画の抑止という、必ず対で必要なものが2箇所に分かれる**。片方の書き忘れが起きる
  2. 要件を変えず、README の注意書きだけで補う — 「呼び忘れ」と同じ種類の穴を1つ増やすだけ
- **Selected Approach**: 子を包むコンポーネント `AuthGate` が、判定に従って遷移と描画の双方を制御する。`applyAuthGuard` は公開せず内部実装にする
- **Rationale**: **遷移と描画は同じ判定から導かれる**。分けて公開すると、対で必要なものを利用者が組み立てることになる。1つの包みなら書き忘れが起こり得ない
- **Trade-offs**: 組み込み側の根の `+layout.svelte` の形を軽く規定する。公開面から `applyAuthGuard` と `resolveAuthGuard` が消える（**入口を2つにしない**という方針とも整合する）

### Decision: 経路の一致は pathname の完全一致で判定する

- **Context**: design レビューの指摘。一致の規則が未定義だと実装者ごとに解釈が割れる（要件 2-5）
- **Selected Approach**: `pathname` のみで比較し、末尾のスラッシュを正規化した完全一致とする。前方一致にしない
- **Rationale**: 問い合わせ文字列で一致が崩れると、`/signin?returnTo=x` が「サインインの経路ではない」と判定され、**振り替え先がふたたび振り替えの対象になって遷移が止まらない**。前方一致にすると `/signin-help` が巻き込まれる
- **Follow-up**: 紛らわしい経路（`/signin-help`・末尾スラッシュ・問い合わせ文字列付き）を単体テストに含める

### Decision: 実行中の振り替え先を保持し、重複した遷移を抑える

- **Context**: design レビューの指摘。`goto` は非同期であり、遷移の完了前に段階が変わると効果が再び走る
- **Findings**: 再実行の時点で `page.url` はまだ古いため、**同じ判定から2度目の `goto` が出る**
- **Selected Approach**: `AuthGate` が実行中の振り替え先を持ち、同じ行き先への `goto` を重ねて出さない。`page.url` が振り替え先へ変わった時点で解除する
- **Trade-offs**: `AuthGate` が状態を1つ持つ。判定そのものは純関数のままで、状態は効果側に閉じる

## Risks & Mitigations

- **画面のテスト601行が同時に落ちる** — ストアとガードを先に作り、ガードだけを E2E で確かめられる状態にしてから画面へ着手する
- **`applyAuthGuard` の呼び忘れ** — ガードが働かず、未サインインの利用者がアプリの画面に留まる。**画面の出し分けは体験のためであり、防御は組み込み側のアクセス制御が担う**ことを README に改めて記す
- **振り替えが止まらない** — 振り替え先が振り替えの対象になると無限に遷移する。純関数のテストで、**すべての段階について振り替え先が「留まる」と判定されること**を確かめる
- **`sessionStorage` が使えない環境** — 例外を握りつぶし、戻り先を保持しない（既定の行き先へ進む）ことで機能を止めない

## References

- `@sveltejs/kit` 2.70.3 の型定義（`goto` / `$app/state` の `page`）— 本書の API の記述はこれを一次情報とする
- 本リポジトリでの実測（probe による `goto` / `page.url` の振る舞い、`svelte-package` の出力）
- `gap-analysis.md` — 影響範囲の量と Research Needed の一覧
