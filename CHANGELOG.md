# Changelog

All notable changes to this project are documented in this file.

## [0.0.3] - 2026-10-31

### Added

- `SignIn`, `SignUp`, and `PasswordReset` accept `onGoTo…` callbacks that replace their links, so they can be used in dialogs.
- `cancel()` on `SignIn` and `SignUp`; `actions`, `id`, and `bind:isSubmitting` on `SignUp`.

### Changed

- **Breaking:** `AddAccount` is removed. Use `SignIn` instead.
- `--auth-block-gap` and `--auth-inner-gap` are defined by the package (both `16px`).

### Fixed

- After verifying the email address elsewhere, a new tab no longer passes an unverified ID token to data access.

## [0.0.2] - 2026-10-28

### Added

- Multiple accounts: users can stay signed in to several accounts and switch between them without re-entering a password. The store exposes `accounts`, `activeId`, `activeAccount`, `operation`, `selectAccount()`, `signOutAccount()`, and `signOutAll()`.
- Firestore, Functions, and Storage created from your Firebase app follow the account in use after every switch, without being recreated.
- `AuthConfig.multiAccount` (required). With `false`, at most one account is kept and it is always the account in use.
- `AuthSession` component: starts and stops the store and keeps accounts and the selection in browser storage. Place one in the root layout.
- `AddAccount` component: content-only sign-in to another account, for a page or a dialog. It only signs in; offer sign-up and password reset with `SignUp` / `PasswordReset` or your own screen. Options `actions`, `id`, `bind:isSubmitting`, and a `cancel()` method let the submit and cancel buttons live in your dialog's footer.
- `PasswordReset` options `actions`, `id`, `bind:isSubmitting`, and `bind:isBlocked`, so it can sit in a dialog with the submit button in the footer. The default behavior is unchanged.
- `'account-unselected'` stage: when two or more accounts remain and none is in use, `AuthGate` hides protected content without navigating, so you can show your own chooser.
- Store state `startError`, `restoreFailures`, and `storageStatus`.
- `accountErrorMessageOf()` and the messages `accountLimitReached`, `operationBusy`, and `accountUnavailable` (Japanese and English).
- Exported types: `AccountSummary`, `AccountResult`, `AccountOperationError`, `AccountFailure`, `AccountOperation`, `SignOutAllResult`, `StorageStatus`, `AuthSessionProps`, `AddAccountProps`, and `PasswordResetProps`.

### Changed

- **Breaking:** the `Auth` passed to `createAuthStore` is now managed by the store. It is switched to in-memory persistence and holds a copy of the account in use. Do not sign in or out with it directly, and connect it to the emulator before passing it in.
- **Breaking:** replace your `store.start()` / `store.stop()` effect with `<AuthSession {store} namespace="…" />`.
- **Breaking:** `signIn`, `signUp`, and `signOut` return an `AccountResult`. A failed sign-out is now reported instead of being ignored.
- **Breaking:** sign-in states saved by 0.0.1 are not carried over; users sign in once again.
- Signing in or signing up always adds an account and selects it, keeping other accounts signed in. If exactly one account remains or is kept, it is selected automatically.
- The return path after sign-in belongs to the account that left it. Another account goes to `afterSignIn` instead of taking over that route.
- `SignIn` and `SignUp` show specific messages when another operation is in progress or the account limit is reached.
- `VerifyEmail` and `PasswordChange` discard their input and results when the account in use changes, and ignore operations that finish for the previous account. Signing out from `VerifyEmail` signs out only the account in use.
