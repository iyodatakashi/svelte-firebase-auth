# 調査と設計判断

## Summary

- **Feature**: `multi-account-auth`
- **Discovery Scope**: 既存認証ライブラリへの複雑な追加。認証状態の永続化、複数タブ、到達制御を含むため full discovery を実施。
- **Key Findings**:
  - Firebase JS SDK は `initializeApp(options, name)` と `getAuth(app)` を公開し、SDK の保存キーには API キーと App 名が含まれる。同じ Firebase プロジェクトでも名前付き App ごとに独立した Auth 状態を置ける。
  - Firestore などは同じ App の Auth のユーザーで認証し、別の App の Auth を指定する公開 API は無い。`updateCurrentUser(auth, user)` で別の App の Auth のユーザーを複製すれば、その App の Firestore は作り直さずに複製したユーザーで動く（エミュレータで検証済み）。
  - Firebase Auth のブラウザ既定の保存方法は `local` で、保存領域が利用できない場合は期待どおりに保持できない。アカウントの一覧と選択は SDK が提供しないため、ライブラリの管理が必要。
  - `sessionStorage` の選択は後から別タブの変更を受けないが、元のタブから開かれた新しいタブに初期コピーされることがある。依頼者は新しいタブで前回のアカウントを自動選択する方針を示した。初期コピーがない場合はブラウザ共通の最後に開いた ID を使い、明示的な未選択のコピーは維持する。
  - 土台の Auth をメモリのみの保存方法にすると、タブ間同期の対象から外れ、タブごとに独立する（ブラウザで検証済み）。
  - 依頼者の判断で従来方式のログイン状態は引き継がず、すべてのスロットを名前付き App として対等に扱う。

## Research Log

### Firebase App・Auth の独立性

- **Context**: 同じアプリ・同じ認証先で複数ログイン状態を保持する方法。
- **Sources Consulted**: [Firebase App API](https://firebase.google.com/docs/reference/js/app)、[Auth API](https://firebase.google.com/docs/reference/js/auth)、[Auth の保存キーを作る SDK 実装](https://github.com/firebase/firebase-js-sdk/blob/main/packages/auth/src/core/persistence/persistence_user_manager.ts)。
- **Findings**: App は名前付きで生成でき、`getAuth(app)` はその App に結びつく Auth を返す。SDK の保存キーは `firebase:<kind>:<apiKey>:<appName>` の形で生成される。これは現行 SDK 実装の内部詳細であり、ライブラリがそのキーを直接読んではならない。
- **Implications**: 名前付き App に対応する安定したスロット ID をライブラリが管理する。App 名をスロット ID から一意に決めれば、作り直した App で再読み込み後に復元できる。セッション復元は Auth の公開 API だけから判定する。

### 永続化とタブ間の状態

- **Context**: 要件 4 の再読み込み・別タブ・保存失敗時の振る舞い。
- **Sources Consulted**: [Firebase Authentication State Persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence)、[Auth API](https://firebase.google.com/docs/reference/js/auth.auth)、[MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)、[MDN storage event](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)。
- **Findings**: Firebase のブラウザ既定は保存が利用可能なら `local`。`onAuthStateChanged` はサインイン状態の変化を通知し、`authStateReady()` は初回判定の完了を待てる。`localStorage` の変更は別タブへ `storage` イベントで届くが、`sessionStorage` の変更は別タブへ届かない。新規タブには `sessionStorage` の初期コピーが起きる場合がある。
- **Implications**: 認証状態は Firebase SDK に任せ、ライブラリはスロットの識別情報と最後に開いた ID をブラウザ共通領域、現在の選択をタブ単位の領域に保持する。新規タブに選択記録がなければ最後に開いた ID を初期候補にし、明示的な未選択がコピーされた場合はその状態を保つ。選択は別タブからの後続変更に追随させない。保存が使えない場合は現在のタブのメモリ状態を保ち、復元できないことを公開する。

### markn のデータアクセス

- **Context**: メニューから切り替えた利用者と、データアクセス権限を一致させる必要がある。
- **Sources Consulted**: [Auth.app](https://firebase.google.com/docs/reference/js/auth.auth)、[Firestore API](https://firebase.google.com/docs/reference/js/firestore)、[Functions API](https://firebase.google.com/docs/reference/js/functions)、[Storage API](https://firebase.google.com/docs/reference/js/storage)、[Firebase App API](https://firebase.google.com/docs/reference/js/app)。
- **Findings**: Firestore は `getFirestore(app)`、Functions は `getFunctions(app, region)`、Storage は `getStorage(app, bucket?)` で App ごとに取得し、同じ App の Auth のユーザーで認証する。別の App の Auth を指定する公開 API は無い。`deleteApp(app)` は App と関連サービスを使えなくする。
- **Implications**: アカウントごとの App でデータも扱うと、切り替えのたびにサービスのインスタンスが変わり、組み込み側が作り直す必要がある。土台の App の Auth へ選択中のユーザーを複製すれば、土台から作ったサービスを一度作るだけで済む（次節の検証）。ライブラリに Firestore・Functions・Storage の依存は加えない。

### 土台の App への複製（検証）

- **Context**: 土台の App の Auth に選択中アカウントを複製する構成が成り立つか。確かめたのは、Firestore の追随、タブ間の独立、複製したユーザーどうしのずれの3点。
- **Method**: Firebase JS SDK 12.19.0。Node から Auth / Firestore エミュレータに当てた検証と、Chromium の2タブで Auth エミュレータに当てた検証を、リポジトリ外の試作で行った。Firestore のルールは `users/{userId}` を `request.auth.uid == userId` に限った。
- **Findings**:
  - `updateCurrentUser(土台の Auth, スロットのユーザー)` で、土台の `currentUser` はスロットのユーザーの別オブジェクトの複製になり、`onAuthStateChanged` も発火する。
  - A を複製した土台の Firestore で `users/A` に書け、`users/B` は拒否された。同じインスタンスのまま B へ複製し直すと `users/B` に書け、`users/A` は拒否された。
  - 土台の Auth をサインアウトしても、スロットはログインしたままでトークンも取り直せる。
  - 土台の Auth を `inMemoryPersistence` にすると、タブ2で別のアカウントへ複製し直しても、サインアウトしても、タブ1の土台は変わらなかった。スロットはタブ間で共有・同期され、新しいタブと再読み込み後に復元された。土台は空から始まり、スロットから複製し直せた。
  - 既定の保存方法で土台にログインが残っていると、メモリへ切り替えた直後にそのユーザーが `currentUser` に現れる（メモリへ移される）。
  - 切り替えで IndexedDB の旧いログインは消える。サインアウトせずに再読み込みしても、切り替え後の `currentUser` は空だった。SDK の `setPersistence` は、ユーザーを新しい保存先へ移す前に旧い保存先から削除している（`PersistenceUserManager.setPersistence` が `removeCurrentUser` を呼ぶ）。使われない更新トークンが端末に残り続けることはない。
  - `updateCurrentUser` は複製した新しい `User` を入れるため、同じアカウントを複製し直しても `currentUser` は別のオブジェクトになる。
  - 土台の複製でパスワードを変更しても、エミュレータではスロット側のトークンは失効しなかった。本番の Firebase はパスワード変更でリフレッシュトークンを失効させる仕様であり、本番での挙動は未確認。複製し直す処理自体は動いた。
  - API キーの異なる App へは複製できない（`auth/invalid-user-token`）。
- **Implications**: 土台の Auth はメモリのみにし、開始時にサインアウトする。複製はスロット → 土台の一方向とし、選択中アカウントへの操作はスロットのユーザーに対して行い、完了後に土台へ複製し直す。こうすれば本番でトークンが失効してもしなくても正しく動く。

### 現行コードとテストの適合

- **Context**: 単一アカウントの公開契約を保ちつつ複数アカウントを追加する。
- **Sources Consulted**: `src/lib/stores/auth.svelte.ts`、`src/lib/components/SignIn.svelte`、`src/lib/components/AuthGate.svelte`、`src/lib/models/auth/authGuard.ts`、`src/tests/support/emulator.ts`、`src/tests/e2e/showcase.e2e.ts`。
- **Findings**: `createAuthStore` は既に外部 `Auth` ごとに独立して生成できる。現行 `SignIn`・`SignUp` は渡された `AuthStore` の `signIn`・`signUp` を呼び、`VerifyEmail` は `signOut` を呼ぶ。現行 `AuthStore.signOut` は失敗を握りつぶすため、対象指定ログアウトの結果には使えない。現行 `SignIn` はページ遷移を持ち、追加ログインの中身としてそのまま再利用できない。`AuthGate` は1つのストアと4種類の段階を前提とする。
- **Implications**: 現行ストアの処理は1スロット分の処理として内部の `SlotStore` へ移し、公開する `AuthStore` をスロットを束ねるものに置き換える。サインインはすべて公開ストアを通るため、同じタブでの選択意図は呼び出しそのものが示し、Firebase の購読と別の通知を突き合わせる必要が無い。ログアウトは経路によらず Auth の実状態で確定する。追加ログイン用の中身は、ページ遷移を持つ `SignIn` とは別に用意する。

## Architecture Pattern Evaluation

| Option                                 | Description                                                                                           | Strengths                                                      | Risks / Limitations                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 既存 `AuthStore` を拡張                | 単一ストアに一覧・選択・保存を加える                                                                  | ファイル数は少ない                                             | 単一アカウント利用者の型と寿命を複雑にし、現行 API へ大きく影響する                          |
| 新しい管理機能を完全に分離             | 新ストアと新ガードを一組増やす                                                                        | 既存機能への影響を小さくできる                                 | 到達判定と認証画面の契約が二重になる                                                         |
| 新しい管理ストア＋既存機能への最小接続 | 独立した一覧・選択を持ち、既存ストアとガードを利用する                                                | markn のメニューと既存の単一利用を両立しやすい                 | 既存 Auth が「スロット」と「従来画面のサインイン先」を兼ね、操作通知・空きスロット前提が要る |
| 内部のスロットストア＋唯一の公開ストア | 現行ストアをスロット単位の内部実装にし、公開ストアを一本化する。データは選択中スロットの App から取る | 画面・ガード・組み込み側の入口が1つ。すべてのスロットが対等    | 組み込み側が名前付き App の生成関数を書き、切り替えのたびにサービスを作り直す                |
| 上記＋土台の App への複製（採用）      | スロットはライブラリが作り、選択中の1件を土台の Auth へ複製する                                       | 組み込み側の API と データアクセスは単一アカウントのときと同じ | 複製の整合をライブラリが保つ。`updateCurrentUser` の挙動に依存する                           |

## Design Decisions

### Decision: 選択中アカウントを土台の App の Auth へ複製する

- **Context**: アカウントごとに Auth が要るが、Firestore などは同じ App の Auth でしか認証しない。一本化した設計の初稿では、組み込み側がスロット用の App を作る関数（`createAuth`）を渡し、データアクセスも選択中スロットの App から取っていた。この形では単一アカウントでもサインインのたびに App が変わり、組み込み側がサービスを作り直す必要があった。
- **Alternatives Considered**: (a) 選択中スロットの App からサービスを取り、切り替えのたびに作り直す（初稿）。(b) 組み込み側がスロットごとにサービスも作ってストアに預け、ストアが選択中の分を返す（`createSlot` と `services`）。空いたスロットを使い直して、単一アカウントでは同じ App になるようにする。(c) 土台の App の Auth へ選択中のユーザーを複製する。
- **Selected Approach**: (c)。組み込み側は従来どおり土台の Auth を `createAuthStore(auth, config)` に渡す。スロットの App はライブラリが土台の App の設定から作る。土台の Auth はメモリのみにし、選択中スロットのユーザーの複製だけを持たせる。
- **Rationale**: 組み込み側の API とデータアクセスが単一アカウントのときと同じになり、データ層が複数アカウントを意識しない。(a)(b) で組み込み側に残る App の生成・サービスの作り直し・預け渡しが不要になる。スロットの App はデータアクセスに使われないため、不要になった時点ですぐ破棄できる。
- **Trade-offs**: 複製の整合（選択・操作の完了ごとの複製、開始時の土台のサインアウト）をライブラリが保つ。組み込み側は土台の Auth で直接サインイン・サインアウトしない。`updateCurrentUser` と Firestore の追随という SDK の挙動に依存するため、SDK 更新時に再検証する。
- **Follow-up**: パスワード変更によるトークン失効が本番でどう起きるかは未確認。設計はどちらでも成り立つが、必要になれば実プロジェクトで確かめる。

### Decision: ライブラリはアカウント操作、markn はメニューとダイアログ

- **Context**: markn には既存のユーザーメニューがあり、追加ログインと選択をそこから行いたい。
- **Alternatives Considered**: ライブラリ必須のアカウント画面、markn 側が認証操作を再実装する案。
- **Selected Approach**: 公開ストアに一覧・選択・対象指定ログアウトを置く。ライブラリは任意利用の一覧内容と追加ログイン内容だけを提供し、markn がメニューとダイアログの外枠を持つ。
- **Rationale**: markn では既存の導線を使え、他の組み込み先は同じ操作を別の UI に配置できる。
- **Trade-offs**: 選択ダイアログは保護された子画面の外に置く必要がある。実装例に配置を示す。
- **Follow-up**: markn 側の実際のレイアウト・未保存データの確認箇所を組み込み時に照合する。

### Decision: 認証状態と選択を別に保持する

- **Context**: 認証は再読み込み後も保持し、選択変更は他のタブに伝えない。
- **Alternatives Considered**: 1つの Auth でログインし直す案、全タブ共通の選択、資格情報を独自保存する案。
- **Selected Approach**: Firebase の各 Auth に認証状態を持たせ、ライブラリはスロット一覧と最後に開いた ID をブラウザ共通領域、現在の選択をタブ単位の領域に保存する。新しいタブはコピーされた有効な選択を優先し、コピーされた明示的な未選択は維持する。タブ内記録がなければ最後に開いた ID を使う。資格情報は保存しない。
- **Rationale**: SDK の永続化と既存の App ごとの認証機構を使い、独自のトークン保存を避ける。
- **Trade-offs**: アカウント一覧と Firebase 保存状態の不一致を起動時に調停する必要がある。ブラウザの選択保存が使えない場合、再読み込み後の選択は復元できない。
- **Follow-up**: 複数タブでの追加・ログアウト・再読み込みと、元タブから開いた場合・独立して開いた場合の新規タブ初期選択を実ブラウザで確認する。

### Decision: 認証ストアを一本化し、引き継ぎを行わない

- **Context**: 当初の設計は、単一アカウント用の `createAuthStore(auth, config)` を残し、組み込み側の既存 Auth を最初のスロットとして取り込んでいた。従来画面は既存 Auth に直接サインインするため、操作成功の通知（`subscribeLocalOperations`）、Firebase の購読との順序の調整、「既存 Auth に別アカウントが残っている間は従来画面から再サインインしない」という前提が必要になっていた。
- **Alternatives Considered**: 既存 Auth を残して従来画面を使い続ける案（上記）。既存 Auth を普通のスロットとして残し、初回だけ既存ログインを引き継ぐ案。単一アカウント用の方式と複数アカウント用の方式を並べる案。
- **Selected Approach**: 公開する認証ストアは1つにし、単一アカウントの利用は保持アカウントが1件の場合として扱う。すべてのスロットを名前付き App として対等に扱い、従来方式のログイン状態は引き継がない。どの画面からのサインインも新しいスロットに入る。
- **Rationale**: 既存 Auth を残す理由は「従来画面の `store` prop を変えずに済む」「既存ログインを引き継ぐ」という互換性だけだった。利用者は依頼者のみであり、互換性は仕様の選択理由にならないと依頼者が判断した。一本化により、画面・ガード・組み込み側の入口が1つになり、上記の通知・前提がすべて不要になる。
- **Trade-offs**: 単一アカウントの組み込み先も `AuthSession` を置く。markn の利用者は切り替え後に一度サインインし直す。
- **Follow-up**: 単一アカウントの構成（選択 UI なし）を E2E で確認する。

### Decision: 複数アカウント対応の有無を設定で指定する

- **Context**: 一本化した初稿では、単一アカウントの組み込み先も複数アカウントと同じ規則で動いていた。選択記録が無効な新しいタブでは未選択になり、そこでサインイン画面から別のアカウントに入れるため、保持アカウントが2件になり得た。その後に選択中アカウントからログアウトすると、選択の UI を持たない組み込み先では保護された内容が隠れたまま抜け出せない。
- **Alternatives Considered**: (a) 未選択のとき `AuthGate` が既定の選択画面を出す。(b) 単一アカウント指定のときは土台の Auth を直接ブラウザ保存で使い、スロットを使わない。(c) 単一アカウント指定のときは保持の上限を1件にする。
- **Selected Approach**: (c)。`AuthConfig.multiAccount` を必須で加え、`false` では保持アカウントを最大1件とし、あれば常に選択中とする。仕組みは複数アカウントと共通にする。
- **Rationale**: (a) は単一アカウントのアプリに2件目のアカウントと選択画面を見せることになり、組み込み側の意図に反する。(b) は起動直後の空の時間とトークン更新の重複もなくせるが、内部の実装が2系統になる。どちらの利点も実害が小さく、2系統を保守する対価に見合わない。(c) なら未選択が原理的に起きず、実装の差は上限と選択の決め方だけで済む。
- **Trade-offs**: 両方の指定で到達判定と復元を試験する必要がある。別タブで同時にサインインした場合は、後からサインインした方を残して他方をログアウトする。

## Risks & Mitigations

- **保存情報の不一致** — スロットの記録と Firebase Auth の初回状態を照合し、認証状態のないスロットはログイン済み一覧から外す。SDK の内部保存キーは操作しない。
- **同時操作・別タブの競合** — 管理ストアは状態変更操作を直列化し、別タブの保存変更を再読込して調停する。複数タブから同じアカウントを追加した場合の重複解消を実ブラウザで試す。
- **選択切り替え時の画面の途中状態** — `VerifyEmail`・`PasswordChange` は選択中アカウントに適用するため、表示中に選択が変わると切り替え元の結果が残りうる。画面の内容を `activeId` で作り直し、組み込み側に対処を求めない。
- **誤った利用者のデータ表示** — 土台の Firestore は複製したユーザーへ自動で追随するが、切り替え元のアカウントで張った購読と表示データは残る。markn は `activeId` の変化を見て購読を張り直し、表示を破棄する。アクセス制御は markn 側に残す。
- **土台とスロットの食い違い** — 複製はスロット → 土台の一方向に限り、`activeId` は複製が済んでから更新する。選択中アカウントへの操作はスロットのユーザーに行い、完了後に複製し直す。組み込み側が土台の Auth を直接操作しないことを手引きに明記する。
- **SDK の挙動への依存** — `updateCurrentUser` による複製と Firestore の追随を、エミュレータの統合テストとして常設し、SDK 更新時に検出できるようにする。
- **ログアウト失敗の不可視化** — ストアは対象 Auth の `signOut` の結果を返し、成功したスロットだけ一覧から除く。内部の `SlotStore.signOut` も失敗を握りつぶさない。
- **保存領域の拒否** — メモリ上の利用を続け、永続化できない状態を公開する。パスワードやトークンを独自に保存しない。

## References

- [Firebase App API](https://firebase.google.com/docs/reference/js/app)
- [Firebase Auth API](https://firebase.google.com/docs/reference/js/auth)
- [Firebase Auth instance API](https://firebase.google.com/docs/reference/js/auth.auth)
- [updateCurrentUser](https://firebase.google.com/docs/reference/js/auth.md#updatecurrentuser)
- [inMemoryPersistence](https://firebase.google.com/docs/reference/js/auth.md#inmemorypersistence)
- [Manage User Sessions（リフレッシュトークンの失効条件）](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [Firebase Authentication State Persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- [Firebase SDK の Auth 保存キー実装](https://github.com/firebase/firebase-js-sdk/blob/main/packages/auth/src/core/persistence/persistence_user_manager.ts)
- [Firestore getFirestore(app)](https://firebase.google.com/docs/reference/js/firestore)
- [Functions getFunctions(app, region)](https://firebase.google.com/docs/reference/js/functions)
- [Storage getStorage(app, bucket)](https://firebase.google.com/docs/reference/js/storage)
- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
- [MDN storage event](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)
