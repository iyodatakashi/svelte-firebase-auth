# Research & Design Decisions

## Summary

- **Feature**: `auth-store-and-screens`
- **Discovery Scope**: New Feature（グリーンフィールド。既存コードは `sv` の雛形のみ）
- **Key Findings**:
  - **メールアドレスの確認は、`reload()` だけでは組み込み側のアクセス制御に届かない。** ID トークンのクレーム `email_verified` は `getIdToken(true)` で強制的に取り直すまで古い値のまま残る。`onAuthStateChanged` も `onIdTokenChanged` も確認の完了では発火しない
  - **パスワードの強度の理由は、失敗のエラーコードからは得られない。** SDK が公開する `validatePassword` は `PasswordValidationStatus` として**項目別の充足状況**を返す。要件 4.4 / 6.3 の「理由を示す」はこれで実現できる
  - **再設定の要求で登録の有無を漏らさない責任は、ライブラリ側にある。** Firebase の `enableImprovedEmailPrivacy` は組み込み先のプロジェクト設定であり、ライブラリからは保証できない。`auth/user-not-found` を成功として畳む必要がある
  - **markn の8種の語彙では、設定の食い違いと通信断が `unknown` に落ちる。** `auth/admin-restricted-operation` と `auth/network-request-failed` は案内が分かれるため、語彙を10種へ広げる
  - `ActionCodeSettings.url`（継続 URL）は**組み込み側の Firebase コンソールで承認済みドメインに入っている必要がある**。ライブラリでは検証できず、README と設定の説明で担保する

## Research Log

### メールアドレスの確認が、いつクライアントと組み込み側のルールに届くか

- **Context**: 要件 2.8 / 5.5 / 5.7。確認待ち画面が「確認済みになったこと」をどう検知するか。組み込み側（markn）は `request.auth.token.email_verified` をアクセス制御で見る
- **Sources Consulted**: Firebase JS SDK v12.17.1 の型定義（`@firebase/auth/dist/auth-public.d.ts`）、Firebase 公式「Manage Users」「Security Rules and Firebase Authentication」、firebase-talk の議論
- **Findings**:
  - `reload(user)` は利用者の情報（`emailVerified` を含む）をサーバから取り直す。**ID トークンは更新されない**
  - ルールが参照する `email_verified` は ID トークンのクレームであり、`getIdToken(user, true)` で強制的に取り直すまで古い値が残る
  - 確認の完了は `onAuthStateChanged` / `onIdTokenChanged` のいずれも発火させない。**購読では検知できない**
- **Implications**: `refreshVerification` は `reload` → `getIdToken(true)` の順で両方を行う。片方だけでは、画面は進むのに組み込み側のデータ読み取りが `permission-denied` で落ちる、という切り分けの難しい壊れ方になる

### 確認の完了を、どう待つか

- **Context**: 要件 5.5 / 5.6。取り直しの周期と停止の契機（R1）
- **Findings**:
  - 購読で検知できない以上、**繰り返し問い合わせる以外に手段が無い**
  - 利用者は多くの場合、別のタブか別の端末でリンクを開く。**元のタブへ戻った瞬間**が最も反映を求められる時点である
- **Implications**: 一定間隔の繰り返しに加えて、**画面が再び前面に出たときの即時の取り直し**を併せる。間隔は 3 秒とし、公開面の設定にはしない（→ Design Decisions）

### パスワードの強度の理由を、どこから得るか

- **Context**: 要件 4.4 / 6.3（R4）。「その理由を利用者に示し」を満たせるか
- **Sources Consulted**: SDK の型定義（`validatePassword` / `PasswordValidationStatus` / `PasswordPolicy`）、firebase-js-sdk issue #8655
- **Findings**:
  - 失敗時のエラーコードは `auth/weak-password`（既定）または `auth/password-does-not-meet-requirements`（Identity Platform のポリシー有効時）。**いずれも項目別の理由を構造化して返さない**
  - `validatePassword(auth, password)` は `isValid` と、`meetsMinPasswordLength` / `containsLowercaseLetter` / `containsUppercaseLetter` / `containsNumericCharacter` / `containsNonAlphanumericCharacter` / `meetsMaxPasswordLength` を返す。**要求されていない項目は `undefined`** になる
  - `auth/password-does-not-meet-requirements` は SDK の定数一覧に無く、バックエンド由来の文字列として届く
- **Implications**: 強度の失敗を受けたら `validatePassword` で項目別の不足を組み立て、文言へ写す。ポリシーの取得に失敗した場合は既定の文言へ落とす

### 自由登録を Firebase 側で塞いだときに、何が返るか

- **Context**: 要件 4.8 の注。設定の食い違い（画面の入口は無いが API は開いている／その逆）をどう扱うか
- **Findings**:
  - SDK の語彙に `auth/admin-restricted-operation` がある。Firebase 側で「ユーザーによる作成」を無効にした状態で `createUserWithEmailAndPassword` を呼ぶと返る
  - メール／パスワードのプロバイダ自体が無効なら `auth/operation-not-allowed`
  - markn の8種の語彙では、いずれも `unknown` に落ちる
- **Implications**: `registration-disabled` を語彙に加える。設定の食い違いは運用で必ず起きうるため、`unknown`（原因不明）として扱うと調べ方が分からない

### 継続 URL（`continueUrl`）の扱い

- **Context**: 要件 1.9（R3）
- **Sources Consulted**: Firebase 公式「Passing State in Email Actions」、SDK の `ActionCodeSettings` 型定義
- **Findings**:
  - `ActionCodeSettings.url` は必須の文字列。`handleCodeInApp` は既定 `false` で、**web では既定のアクションハンドラのページを経由してから継続 URL へ進む**
  - **継続 URL のドメインは、Firebase コンソールの承認済みドメインに含まれている必要がある**。含まれないと `auth/unauthorized-continue-uri`
  - markn design が記していた `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` は**メール本文のリンク先ドメイン**の話であり、`continueUrl` とは別の設定である
- **Implications**: `continueUrl` は `AuthConfig` の必須項目とし、`sendEmailVerification` と `sendPasswordResetEmail` の双方へ渡す。承認済みドメインの登録は組み込み側の作業として README に書く

### 再設定の要求で、登録の有無を漏らさない

- **Context**: 要件 7.2
- **Findings**:
  - `enableImprovedEmailPrivacy` が無効なプロジェクトでは、`sendPasswordResetEmail` が未登録のアドレスに対して `auth/user-not-found` を返す
  - この設定は**組み込み先のプロジェクトの設定**であり、ライブラリからは保証も検出もできない
- **Implications**: ライブラリ側で `auth/user-not-found` を**成功として畳む**。組み込み先の設定に依らず、応答が一定になる

### 頻度の超過を、どう検証するか

- **Context**: 要件 5.8 / 7.6（R7）
- **Findings**: `auth/too-many-requests` の発生条件（回数・時間窓）は公開されていない。Auth エミュレータが同じ制限を課すかも確認できなかった
- **Implications**: **エミュレータでの再現に依存しない。** 語彙への写像と画面の振る舞い（間隔を空けるよう示し、操作を一時的に受け付けない）を、モックによる単体テストで確かめる

### `@14ch/svelte-ui` の部品

- **Context**: 要件 9.7 / 9.9（R5）
- **Findings**:
  - `Input` は `type="password"` と `enablePasswordVisibilityToggle`（表示の切り替え）に対応済み。パスワード欄について不足は無い
  - `Button` / `Input` / `Snackbar` / `Dialog` / `LoadingSpinner` は揃っている
  - **入力欄のラベルとエラー文を1つにまとめる部品は無い。** 各画面でラベル要素とエラー文を自前で組む
- **Implications**: 部品の追加要求は発生しない。エラー文の表示は各画面に素直に書く（→ Design Decisions「共通の入力欄部品を作らない」）

### 既存コードの接続点

- **Context**: 何を移植し、何を新規に書くか（→ `gap-analysis.md`）
- **Findings**:
  - このリポジトリに認証の実装は無い。`src/lib/vitest-examples/` は雛形の残骸で、`svelte-package` の対象に入るため削除が要る
  - markn のストアは**モジュールスコープのシングルトン**で、要件 1.10 と `structure.md` に反する
  - markn のエミュレータ検証は Auth エミュレータの REST API `GET /emulator/v1/projects/{projectId}/oobCodes` で発行済みのワンタイムコードを取っている。**確認メールと再設定メールの検証にそのまま応用できる**
- **Implications**: `normalizeEmail`・結果の共用体の形・エラー写像の形・エミュレータの検証手法を移植し、ストアと画面は新規に書く

## Architecture Pattern Evaluation

| Option                                                       | Description                                                  | Strengths                                                | Risks / Limitations                                                                          | Notes                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **層の分離（models → messages → stores → screens）**         | `structure.md` が定める配置をそのまま採る                    | 置き場所を推測できる。依存が一方向で、逆流を検出しやすい | 層が薄い割にファイルが分かれる                                                               | **採用。** steering が既に定めている     |
| ports & adapters                                             | Firebase Auth をポートの背後へ隠し、実装を差し替え可能にする | テストで Firebase を完全に排除できる                     | 差し替える相手が実在しない。抽象化の層が1つ増える                                            | 不採用。「過剰な抽象化をしない」に反する |
| 画面ごとの自己完結（ストアを持たず各画面が Firebase を呼ぶ） | 画面が自分で `firebase/auth` を呼ぶ                          | 層が減る                                                 | 認証状態を共有できず、`structure.md`「Firebase Auth の呼び出しは stores に集約する」に反する | 不採用                                   |

## Design Decisions

### Decision: `refreshVerification` は `reload` と ID トークンの再取得の両方を行う

- **Context**: 要件 2.8。確認済みの反映が、画面と組み込み側のアクセス制御の双方に届く必要がある
- **Alternatives Considered**:
  1. `reload` だけを行う — 画面は進むが、ルールが見るクレームは古いまま
  2. `getIdToken(true)` だけを行う — クレームは新しくなるが、`user.emailVerified` は更新されない
- **Selected Approach**: `reload(user)` の後に `getIdToken(user, true)`。戻り値は `user.emailVerified`
- **Rationale**: 片方だけでは、画面は進むのに組み込み側のデータ読み取りが落ちる。原因の分からない壊れ方であり、組み込み側では直せない
- **Trade-offs**: 1回の取り直しで2往復する。取り直しは確認待ちの間だけであり、負担は限定的
- **Follow-up**: エミュレータで、別セッションでの確認が待機側へ反映されることを確かめる

### Decision: 確認の反映は、3秒間隔の取り直しと、画面が前面に戻ったときの即時の取り直しで行う

- **Context**: 要件 5.5 / 5.6（R1）
- **Alternatives Considered**:
  1. 一定間隔だけ — 別タブで確認して戻ったとき、最大で間隔ぶん待たされる
  2. 前面復帰だけ — 同じタブでメールアプリを見ずに待つ利用者に反映されない
  3. 間隔を公開面の設定にする — 組み込み側が決める理由が無く、公開面が増える
- **Selected Approach**: 3秒間隔の繰り返しに、`visibilitychange` による即時の取り直しを併せる。間隔は内部の定数
- **Rationale**: 別の端末・別のタブでの確認が主な経路であり、戻った瞬間の反映が体験を決める。間隔は補助として働けばよい
- **Trade-offs**: 待ち続ける利用者には3秒ごとの通信が発生する。確認待ちの画面に限られるため許容する
- **Follow-up**: 画面を離れたときに確実に停止することを、テストで確かめる

### Decision: パスワードの強度の理由は `validatePassword` から組み立てる

- **Context**: 要件 4.4 / 6.3。「その理由を利用者に示し」を満たす
- **Alternatives Considered**:
  1. 「パスワードが要件を満たしていません」の1文だけを出す — 理由を示していない
  2. ライブラリ側で強度の規則を持つ — Firebase 側の設定と二重管理になり、必ずずれる
- **Selected Approach**: 強度の失敗を受けたときに `validatePassword(auth, password)` を呼び、`PasswordValidationStatus` の各項目のうち**満たしていないもの**を列挙して返す。取得に失敗した場合は理由なしの既定の文言へ落とす
- **Rationale**: 要求される規則は Firebase 側の設定であり、SDK が唯一の正解を持っている
- **Trade-offs**: 失敗時に1往復増える。`undefined` の項目（要求されていない項目）を理由に含めない扱いが要る
- **Follow-up**: firebase-tools 15.22.3 の Auth エミュレータは `/v2/passwordPolicy` を API 定義に持つがハンドラの実装が見当たらない。**強度の理由の検証はモックで行う**とし、`PasswordValidationStatus` の形は SDK の型定義から `import type` して適合させる。退避の経路（取得に失敗したら既定の文言）は実際に通る経路として検証する

### Decision: 再設定の要求で `auth/user-not-found` を成功として畳む

- **Context**: 要件 7.2
- **Alternatives Considered**: 組み込み側の `enableImprovedEmailPrivacy` に委ねる — 設定を保証できず、片方の組み込み先だけ漏れる
- **Selected Approach**: `sendPasswordReset` は `auth/user-not-found` を受けても `{ ok: true }` を返す
- **Rationale**: 「登録の有無を示さない」はライブラリの契約である。組み込み先の設定に依存させない
- **Trade-offs**: 送っていないのに送ったと示す。要件が求める振る舞いそのものである

### Decision: エラーの語彙を10種にする（markn の8種から2種を追加）

- **Context**: 要件 8.2 / 8.4。markn design の `AuthErrorKind` は出発点であり制約ではない
- **Selected Approach**: 8種に `registration-disabled`（`auth/admin-restricted-operation` / `auth/operation-not-allowed`）と `network-error`（`auth/network-request-failed`）を加える
- **Rationale**: いずれも案内が明確に分かれる。設定の食い違いと通信断を `unknown` に落とすと、組み込み側でも利用者でも原因に辿り着けない
- **Trade-offs**: **markn 側の文言の網羅に影響する**（→ design.md の Revalidation Triggers）

### Decision: 送信経路の差し替えのために、公開面へ設定を置かない

- **Context**: 要件 1.8。実装は本 spec に含めない
- **Alternatives Considered**:
  1. `AuthConfig.mailDelivery?: { kind: 'firebase' }` を今から置く — 判別可能な共用体にしておけば、後から `custom` を足しても壊れない
  2. 送信の関数を丸ごと受け取る口（`mailer`）を今から切る — 実装の無い抽象が公開面に増える
- **Selected Approach**: **設定を置かない。** 送信の呼び出しを `signUp` / `sendEmailVerification` / `sendPasswordReset` の内部の1箇所に閉じるにとどめる
- **Rationale**: **省略可能な設定を `AuthConfig` へ後から足すことは破壊的変更ではない。** 既存の組み込み側は何も変えずに動く。つまり値が1つしかない共用体を今置くことで避けられる破壊的変更は存在せず、`structure.md`「迷ったら公開しない」に反するだけである。余地を実際に担保しているのは設定の型ではなく、送信の呼び出しが画面へ散らばっていないことのほうである
- **Trade-offs**: 差し替えが必要になった時点で、`AuthConfig` に項目を足す作業が発生する（非破壊）
- **Follow-up**: 差し替えを実装するときの形は、組み込み側の関数を受け取る `{ kind: 'custom'; sendEmailVerification; sendPasswordReset }` になる見込み。クライアント SDK ではアクションリンクを生成できず（`generateEmailVerificationLink` は Admin SDK のみ）、生成と送信の双方が組み込み側へ移るため

### Decision: 共通の入力欄部品を作らず、各画面に素直に書く

- **Context**: 5画面がいずれもメールアドレスとパスワードの入力欄を持つ
- **Selected Approach**: `@14ch/svelte-ui` の `Input` / `Button` を各画面が直接使う。ラベルとエラー文も各画面に書く
- **Rationale**: `structure.md`「過度な共通化をしない」。判断基準は「この共通物を変えると、意図しない他画面に影響するか」であり、認証の画面は将来それぞれ分岐しうる（登録だけ規約への同意が要る、など）
- **Trade-offs**: マークアップの重複が生まれる。各画面が独立して調整できることを優先する

### Decision: 購読の寿命は `start()` / `stop()` の対で持つ

- **Context**: 要件 1.10 / 2.11。複数生成できることと、購読の寿命
- **Alternatives Considered**:
  1. markn の `authStore` と同じく、生成時に購読を張って解除しない — シングルトンでは成立するが、複数生成できるライブラリでは漏れが構造的に起きる
  2. 生成時に購読を張り、`stop()` だけを公開する — 呼び忘れで壊れる経路が無い一方、`start` の無い `stop` になり、停止後の再開ができない
- **Selected Approach**: `start()` で購読を開始し、`stop()` で解除して状態を初期化する。`start()` は先頭で `stop()` を呼んで冪等にする
- **Rationale**: **markn の `onSnapshot` を持つストア（`documentsStore` / `userFoldersStore` / `document`）が既に採っている形であり、命名も振る舞いもそのまま揃う。** 組み込み側は `+layout.svelte` の `$effect` に寿命を束ねられる。`dispose` はこのコードベースに無い語彙である
- **Trade-offs**: `start()` の呼び忘れで `isResolved` が永久に `false` のままになる。`documentsStore` と同じ危うさであり、README とショーケースで書き方を示して補う

### Decision: 文言は1段の平坦な表にし、浅い併合で差し替える

- **Context**: 要件 9.4 / 9.5
- **Alternatives Considered**: 画面ごとの入れ子（`{ signIn: {...}, signUp: {...} }`）— 項目単位の差し替えに深い併合が要り、差し替えの単位が曖昧になる
- **Selected Approach**: `AuthMessages` は平坦な型。値を差し込む文言（送信先のアドレスなど）は関数の項目にする。**例外は `errors` の1つだけ**で、`Readonly<Record<AuthErrorKind, string>>` とし、差し替えは `Partial<Record<AuthErrorKind, string>>` で語彙単位に行う
- **Rationale**: 「項目単位で差し替えられる」（要件 9.5）を、併合の規則を説明せずに成立させられる。`errors` だけを表にするのは**網羅を型に守らせるため**である。平坦なキー（`errorInvalidCredential` など）にすると、語彙を増やしたときに対応する文言が無いまま型が通り、その語彙だけ案内が出ない画面ができる
- **Trade-offs**: 項目名が長くなる（`verifyEmailResendButton` など）。併合の規則が1つだけ例外を持つ

### Decision: `isEmailVerified` を `user` から導かず、独立した状態として持つ

- **Context**: 要件 2.5 / 2.8。確認済みが画面に反映される必要がある
- **Findings**: Svelte 5 の `$state` がプロキシするのは prototype が `Object.prototype` / `Array.prototype` のものだけである（`svelte/src/internal/client/proxy.js`）。**Firebase の `User` はクラスのインスタンスであり、プロキシされない**
- **Selected Approach**: `isEmailVerified` を独立した `$state` として持ち、`refreshVerification` と `onAuthStateChanged` の双方で明示的に設定する
- **Rationale**: `reload(user)` は同じインスタンスの `emailVerified` を書き換えるだけで、`user` を参照する派生値は追随しない。**`refreshVerification` の戻り値だけを見ている確認待ち画面では動くが、`store.isEmailVerified` を到達ガードで読む組み込み側では画面が更新されない**という、切り分けの難しい壊れ方になる
- **Trade-offs**: 同じ事実を2箇所（`User` と自前の状態）で持つ。設定する箇所を購読と取り直しの2つに限ることで抑える

### Decision: 確認メールの送信の失敗を、登録の失敗として返さない

- **Context**: 要件 4.1 / 4.2 / 4.7。`signUp` はアカウントの作成と確認メールの送信の2つを行う
- **Alternatives Considered**: 送信の失敗を `{ ok: false }` で返す — 実際にはアカウントができてサインインしている状態で「登録に失敗しました」と示すことになる。利用者は登録し直して `email-already-in-use` に当たる
- **Selected Approach**: アカウントの作成が成功していれば `{ ok: true }` を返す
- **Rationale**: 要件 4.7 の「登録が失敗したとき」はアカウントが作られなかった場合を指す。回復の手段は確認待ち画面の再送（要件 5.4）が既に持っている

## Risks & Mitigations

- **確認済みの反映が組み込み側のルールに届かない** — `reload` と ID トークンの再取得を両方行い、エミュレータで別セッションの確認が反映されることを検証する
- **公開する画面の粒度が組み込み側に合わない** — 最初の組み込み（markn）で確かめる。合わない場合に備え、ストアと画面の間に隠れた結合を作らない（画面は props で受け取るだけ）
- **`validatePassword` がエミュレータで動かない** — 理由なしの既定の文言へ落ちる経路を必ず持つ。検証はモックで行い、SDK の型定義に適合させる
- **頻度の超過をエミュレータで再現できない** — モックによる単体テストで、語彙の写像と画面の振る舞いを確かめる
- **検証の手段を目的にしない** — エミュレータは手段であって要件ではない。対応しない機能に当たったら、その項目はショーケースでの実地の確認へ移す
- **継続 URL のドメインが承認済みでない** — `auth/unauthorized-continue-uri` を `unknown` ではなく検出できるようにし、README に組み込み側の設定として明記する
- **語彙の追加が markn の文言の網羅に波及する** — Revalidation Triggers に記し、承認後に markn 側へ返す

## References

- [Manage Users in Firebase](https://firebase.google.com/docs/auth/web/manage-users) — `reload` と `emailVerified` の取り扱い
- [Security Rules and Firebase Authentication](https://firebase.google.com/docs/rules/rules-and-auth) — `auth.token.email_verified` がクレームであること
- [Passing State in Email Actions](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions) — `ActionCodeSettings.url` と承認済みドメインの要求
- [auth.token.email_verified is not true after verification（firebase-talk）](https://groups.google.com/g/firebase-talk/c/aobbsqv_F2Y) — 確認の完了で ID トークンが自動更新されないこと
- [firebase-js-sdk #8655](https://github.com/firebase/firebase-js-sdk/issues/8655) — 強度の失敗のメッセージがポリシーを反映しないこと
- [Enable, disable, and use password policies（Identity Platform）](https://docs.cloud.google.com/identity-platform/docs/password-policy) — `PASSWORD_DOES_NOT_MEET_REQUIREMENTS` の由来
- Firebase JS SDK v12.17.1 の型定義（`@firebase/auth/dist/auth-public.d.ts`）— 本書の API の記述はこれを一次情報とする
