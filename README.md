# @14ch/svelte-firebase-auth

A SvelteKit library for Firebase Authentication with email and password. It provides **an auth store, five screens, and route guarding**, and lets a user **stay signed in to several accounts and switch between them**. All that is left to the host app is **Firebase initialization, route configuration, and access control**.

- **Auth store** — Exposes the signed-in accounts, the account in use, its user, the normalized email address, and the verification state. Performs sign-in, sign-up, switching, sign-out, password change and reset, and sending verification emails
- **Multiple accounts** — Each account keeps its own sign-in state. Switching needs no password, and **Firestore and other services created from your Firebase app follow the account in use** without being recreated. A single-account mode uses the same parts
- **Five screens** — Sign-in, sign-up, email verification pending, password change, and password reset. **The library handles navigation between screens, and the screens carry no page elements such as headings**. Completion can be received through `onCompleted`
- **Route guarding** — Redirects according to the authentication stage. The host app only needs to place one guard in the root layout
- **Return path after sign-in** — After signing in, the user proceeds to the route they were trying to open
- **Error vocabulary** — Firebase error codes are folded into the granularity at which the guidance to the user differs. **Nothing is thrown; failures are returned as values**
- **Account parts** — Content-only components for adding an account and for choosing one. Where they appear (a page, a dialog, your own menu) is up to the host app
- **Message overrides** — Japanese and English are bundled, and the host app can override individual messages

## Installation

```bash
npm install @14ch/svelte-firebase-auth firebase svelte @14ch/svelte-ui
```

`firebase` / `svelte` / `@sveltejs/kit` / `@14ch/svelte-ui` are peer dependencies; the host app owns the actual packages.

**This library requires SvelteKit.** It uses `goto` from `$app/navigation` for navigation and `page` from `$app/state` for the current route.

### Vite configuration in the host app (required)

This package is **distributed as raw `.svelte` files**. If it is pre-bundled, two copies of `svelte` are loaded and rendering fails with `Cannot read properties of undefined (reading 'call')`.

```typescript
// vite.config.ts
export default defineConfig({
	optimizeDeps: {
		exclude: ['@14ch/svelte-firebase-auth', '@14ch/svelte-ui'],
		// CJS dependencies of excluded packages are left untransformed, so include them back individually
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

The `@14ch/svelte-ui` styles must also be loaded.

```typescript
import '@14ch/svelte-ui/styles';
```

### Firebase configuration

- **Add the domain of the return URL (`continueUrl`) to the authorized domains.** Otherwise sending verification and password reset emails fails with `auth/unauthorized-continue-uri`
- **Match self-registration on the Firebase side as well.** `AuthConfig.selfRegistration` controls **only the entry point in the screens**. The sign-up API itself can only be blocked in the Firebase console
- Links in verification and password reset emails are handled by **Firebase's default action handler**. This library does not provide those pages

## Usage

### Creating the store and its lifecycle

The host app initializes Firebase and passes in **the `Auth` of its Firebase app**. The library holds no global state.

```typescript
// firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Create data access from the same app, once. It follows the account in use
export const firestore = getFirestore(app);
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import '@14ch/svelte-ui/styles';
	import { setContext } from 'svelte';
	import { AuthSession, createAuthStore, type AuthConfig } from '@14ch/svelte-firebase-auth';
	import { auth } from './firebase';

	const config: AuthConfig = {
		selfRegistration: true,
		// Whether to require email verification. If false, no verification email is sent after sign-up
		emailVerification: true,
		continueUrl: 'https://example.com/',
		// Authentication routes. Screen navigation and route guarding read only these values
		routes: {
			signIn: '/signin',
			signUp: '/signup',
			verifyEmail: '/verify-email',
			passwordReset: '/password-reset',
			afterSignIn: '/'
		},
		// Whether to keep several accounts signed in. See "Single account"
		multiAccount: true
	};

	const store = createAuthStore(auth, config);
	setContext('authStore', store);
</script>

<!-- Starts the store on mount and stops it on unmount. Place exactly one in the root layout -->
<AuthSession {store} namespace="my-app" />
```

**Once passed to the store, the `Auth` belongs to the store.**

- Each account is signed in to **its own internal Firebase app**, created by the library from your app's options. The `Auth` you passed only holds **a copy of the account in use** (empty when none is selected)
- The store switches the passed `Auth` to in-memory persistence, so each tab holds its own account in use. **Do not sign in or out with that `Auth` directly**; use the store
- If you use the Auth emulator, **connect the `Auth` to it before passing it in**. The library connects its internal apps to the same emulator
- `namespace` prefixes the keys `AuthSession` writes to `localStorage` and `sessionStorage`. Use a value no other app on the same origin uses. Passwords and tokens are never written

### Setting up routes

The host app provides the routes listed in `AuthConfig.routes`. **Each route holds a single screen**; no navigation wiring is needed.

| Setting         | Example           | What to place there                 |
| --------------- | ----------------- | ----------------------------------- |
| `signIn`        | `/signin`         | `<SignIn {store} />`                |
| `signUp`        | `/signup`         | `<SignUp {store} />`                |
| `verifyEmail`   | `/verify-email`   | `<VerifyEmail {store} />`           |
| `passwordReset` | `/password-reset` | `<PasswordReset {store} />`         |
| `afterSignIn`   | `/`               | What authenticated users should see |

```svelte
<!-- src/routes/signin/+page.svelte -->
<script lang="ts">
	import { getContext } from 'svelte';
	import { SignIn, type AuthStore } from '@14ch/svelte-firebase-auth';

	const store = getContext<AuthStore>('authStore');
</script>

<SignIn {store} />
```

`PasswordChange` is **not an authentication route**. It is a screen for signed-in users; place it on any route you like (route guarding does not redirect away from it).

- **Write routes as the `pathname` exactly as it appears in the URL.** If the app uses `base`, pass values that include it. Route guarding compares them directly against `page.url.pathname`
- Matching is **an exact match that ignores the query string and normalizes a trailing slash**. `/signin` equals `/signin/`, and is a different route from `/signin-help`

### Enabling route guarding

**Wrap the children in `AuthGate` in the root `+layout.svelte`.** This one place is enough.

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { AuthGate } from '@14ch/svelte-firebase-auth';

	let { children } = $props();
</script>

{#snippet pending()}
	<p>Loading…</p>
{/snippet}

<AuthGate {store} {pending}>
	{@render children()}
</AuthGate>
```

`pending` is shown **until the initial authentication state has been determined**. If omitted, nothing is rendered.

| `stage`                | Meaning                                                   | What `AuthGate` does                                                                                                                                         |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'unresolved'`         | The initial check has not finished                        | **Does not navigate and does not render the children.** Shows `pending`                                                                                      |
| `'signed-out'`         | No account is signed in                                   | Stays on sign-in, sign-up, and password reset. Redirects everything else to sign-in                                                                          |
| `'account-unselected'` | Accounts are signed in, but none is in use (multi only)   | Stays on sign-in, sign-up, and password reset. Elsewhere **neither navigates nor renders the children or `pending`**, and keeps the route as the return path |
| `'email-unverified'`   | The account in use has not verified its email address yet | Stays on verification pending. Redirects everything else there                                                                                               |
| `'ready'`              | Allowed through                                           | From the four authentication routes, goes to the return path or `afterSignIn`. Otherwise does not interfere                                                  |

- **Navigation and render suppression are both necessary.** Stopping navigation alone still lets protected content appear until the check finishes. `AuthGate` handles both
- **Redirects are not added to history.** Otherwise the back button would return to the pre-redirect route and redirect again
- **It works only in the browser.** No navigation happens during server-side rendering

### Return path after sign-in

When a signed-out user opens a protected route, **that route is kept as the return path** and the user is redirected to sign-in. Once the conditions are met, the user proceeds to the kept return path and it is discarded.

- It is kept **per tab** and survives reloads and route changes. **It is not lost when passing through verification pending**
- **Only root-relative paths** are kept. Values pointing outside (including `//evil.example`) are not used, and the user goes to `afterSignIn` instead
- Authentication routes themselves are never used as the return path

The showcase in `src/routes/` is a working example of setting up routes and using `AuthGate` (**it is not part of the package**).

### Multiple accounts

Sign-in and sign-up **always add an account**: other signed-in accounts stay signed in, and the new account becomes the account in use. Signing in again to an account that is already signed in selects it without duplicating it. **The first sign-in and adding another account are the same operation**, whichever screen it comes from.

#### Wiring your own user menu

The store exposes everything a menu needs, so the host app does not track accounts itself. Showing a menu or listing the accounts never switches anything.

| Value / operation    | Use                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `accounts`           | The signed-in accounts (`id`, `uid`, normalized `email`, `isEmailVerified`). Follows sign-ins, sign-outs, and expiry, also from other tabs |
| `activeId`           | The account in use, or `null`                                                                                                              |
| `selectAccount(id)`  | Switches directly. No password and no other screen. Check unsaved data **before** calling it                                               |
| `signOutAccount(id)` | Signs out of one account                                                                                                                   |
| `signOutAll()`       | Signs out of every account. Reports which ones failed                                                                                      |
| `operation`          | The add / switch / sign-out in progress (`{ kind, id? }`), or `null`. Disable menu items while set                                         |

```svelte
<script lang="ts">
	import { Dialog, PopupMenuButton } from '@14ch/svelte-ui';
	import { AddAccount } from '@14ch/svelte-firebase-auth';

	let addDialog: ReturnType<typeof Dialog> | undefined = $state();

	const menuItems = $derived([
		...store.accounts.map((account) => ({
			label: account.email ?? account.uid,
			callback: () => void store.selectAccount(account.id),
			disabled: store.operation !== null
		})),
		{ label: 'Sign in to another account', callback: () => addDialog?.open() },
		{ label: 'Sign out of all accounts', callback: () => void store.signOutAll() }
	]);
</script>

<PopupMenuButton {menuItems}>{store.activeAccount?.email}</PopupMenuButton>

<Dialog bind:this={addDialog} ariaLabel="Sign in to another account">
	<AddAccount {store} onCompleted={() => addDialog?.close()} onCancel={() => addDialog?.close()} />
</Dialog>
```

**`AddAccount` is content only.** It has the email and password fields, sign-up and password reset within the same area, and error messages, but no dialog frame, heading, or open/close. Put it in a dialog or on a page. `onCompleted(account)` receives the account that was added and selected; `onCancel()` is called when the user cancels, and an in-flight attempt is ignored even if it succeeds later.

#### After signing out of the account in use

**The remaining accounts are not selected automatically.** The stage becomes `'account-unselected'` and `AuthGate` hides the protected content without navigating. Show a dialog to choose an account, **outside `AuthGate`** (for example next to it in the root layout), so the guard does not hide it.

```svelte
<AuthGate {store} {pending}>
	{@render children()}
</AuthGate>

<!-- Open it while store.stage === 'account-unselected' -->
<Dialog bind:this={chooserDialog} ariaLabel="Choose an account" closeIfClickOutside={false}>
	<AccountChooser {store} onAddRequested={() => addDialog?.open()} />
</Dialog>
```

`AccountChooser` is an optional, content-only list: it switches on selection, signs out of one or all accounts, marks the account in use with text (not color alone), disables its controls while an operation runs, and names the account when an operation fails. You can build the same with the store instead. When no account remains, the stage becomes `'signed-out'` and `AuthGate` redirects to sign-in.

While unselected, the sign-in, sign-up, and password reset routes stay open: signing in there selects the new account and returns to the kept return path. If you show the chooser as a modal, do not show it on those routes.

#### Tabs and reloads

- Sign-in states are kept by the browser and **restored after reloads and restarts**
- **Each tab has its own account in use.** Switching or signing out in one tab does not change the account in use in another (a sign-out does remove that account everywhere)
- A new tab opens with the account of the tab it was opened from, or otherwise with the account last opened in this browser. A tab that had explicitly no account selected stays unselected
- If the browser storage is not available, `store.storageStatus` is `'unavailable'`: everything works in the current tab, but nothing may be restored after a reload. `AccountChooser` shows a notice

### Data access and switching accounts

**Create Firestore, Functions, and Storage from your Firebase app once, as usual.** The library copies the account in use into the `Auth` you passed, so the same instances run as the account in use after every switch. Your data layer does not need to know about multiple accounts.

What does **not** switch by itself is what the host app already holds for the previous account:

- **Re-subscribe and discard displayed data when the account changes.** Listeners started for the previous account keep returning its data
- **Key subscriptions by `activeId` or `uid`, not by `store.user`.** `store.user` is a copy and **can be replaced while the account stays the same** (after a password change or a verification refresh). Reading `user` in an `$effect` re-subscribes needlessly
- **Firestore keeps unsent writes tied to the user who made them.** After a switch they are sent only once you switch back. If you save automatically, include `waitForPendingWrites` in your unsaved-data check before switching, with a time limit (it does not finish offline) and a message to the user

```svelte
<script lang="ts">
	import { doc, onSnapshot } from 'firebase/firestore';

	const uid = $derived(store.activeAccount?.uid ?? null);
	let note = $state<string | null>(null);

	$effect(() => {
		const current = uid;
		note = null; // Do not keep showing the previous account's data
		if (current === null) {
			return;
		}
		return onSnapshot(doc(firestore, 'users', current), (snapshot) => {
			note = snapshot.get('note') ?? null;
		});
	});
</script>
```

#### Right after startup

Until `store.isResolved` becomes true, accounts are being restored and **the `Auth` you passed is empty**. Inside `AuthGate` nothing renders before that, so no care is needed there. Code outside the guard (such as the root layout) that reads data at startup should wait for `store.isResolved`.

If startup fails in a way it cannot continue from, `store.startError` is set, `isResolved` stays false, and `AuthGate` keeps showing `pending`. Show a message asking the user to reload, for example from `pending`. Accounts that could not be restored while others could are listed in `store.restoreFailures`.

### Single account

With `multiAccount: false`, **at most one account is kept, and while it is kept it is always the account in use.** The stage `'account-unselected'` never appears, so you do not need any account list or chooser: the store, the screens, and `AuthGate` work as they are. Place `AuthSession` all the same.

Signing in or signing up while an account is kept fails with `limit-reached` (route guarding already keeps signed-in users away from those screens). If two tabs sign in at the same time, the account signed in last is kept and the other is signed out.

### Receiving completion

Each screen calls `onCompleted` when it has done its job. **It is optional.**

```svelte
<PasswordChange {store} onCompleted={() => goto(resolve('/settings'))} />
```

| Screen           | When it is called                                | If not provided                                                           |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `SignIn`         | When sign-in succeeds (the account is selected)  | The stage changes and route guarding redirects                            |
| `SignUp`         | When sign-up succeeds                            | Same as above                                                             |
| `VerifyEmail`    | When verification is found to be complete (once) | Same as above                                                             |
| `PasswordChange` | When the password has been changed               | **Shows a completion message and a link back to the default destination** |
| `PasswordReset`  | When the reset email has been sent               | Shows that it was sent and a link back to sign-in                         |

**`onCompleted` does not navigate.** Whether to navigate, and where, is up to the receiver.

The first three screens **change the authentication stage** on completion, so route guarding moves the user even without it. Use it for logging or notifications.

The last two screens **do not change the stage**. Route guarding does not move the user, so only the host app can decide where to go after the change. Defaults are provided when it is omitted, so the user is never left at a dead end.

### State

| Value                        | Description                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `accounts`                   | The signed-in accounts                                                                                                       |
| `activeId` / `activeAccount` | The account in use, or `null`                                                                                                |
| `user`                       | The user of the account in use (a Firebase `User` copied into your `Auth`). Can be replaced while the account stays the same |
| `isLoggedIn`                 | Whether an account is in use                                                                                                 |
| `email`                      | The **normalized** email address of the account in use                                                                       |
| `isEmailVerified`            | Whether the account in use has verified its email address                                                                    |
| `isResolved`                 | Whether startup has finished. **Once true, it stays true** until the store stops                                             |
| `startError`                 | A startup failure the store cannot continue from, or `null`                                                                  |
| `restoreFailures`            | Accounts that could not be restored at startup                                                                               |
| `storageStatus`              | `'available'` or `'unavailable'` (nothing may be restored after a reload)                                                    |
| `operation`                  | The add / switch / sign-out in progress, or `null`                                                                           |
| `canSelfRegister`            | Whether self-registration is allowed                                                                                         |
| `requiresEmailVerification`  | Whether the host app requires email verification                                                                             |
| `stage`                      | The authentication stage. Read by `AuthGate` (see "Enabling route guarding")                                                 |
| `routes`                     | The configured authentication routes. The single source read by screens and `AuthGate`                                       |

`user`, `activeId`, and `activeAccount` always change together and never point to different accounts. `isResolved` exists to distinguish "not signed in" from "not known yet" until startup finishes. Without it, a user could be treated as signed out before the check completes.

### Email verification

**Whether to require verification is switched with `emailVerification`.** Projects that do not require verification can use the library as is.

| Setting                    | Verification email after sign-up | Redirect to verification pending  |
| -------------------------- | -------------------------------- | --------------------------------- |
| `emailVerification: true`  | Sent                             | Yes                               |
| `emailVerification: false` | **Not sent**                     | **No** (this stage never appears) |

Even with `emailVerification: false`, `store.sendEmailVerification()` can be called. Use it to prompt verification later.

Verification, resending, and password changes apply to **the account in use when they start**. If the account in use changes while `VerifyEmail` or `PasswordChange` is shown, the screen discards its input and results and shows the new account, and an operation started for the previous account neither updates the screen nor calls `onCompleted`.

**Completing verification is not delivered through the auth state subscription.** The verification pending screen re-fetches the verification state only while it is displayed. Once verified, the stage changes and `AuthGate` redirects. The re-fetch updates **both the user information and the ID token claims**. Updating only one would let the screen proceed while the host app's access control keeps using the stale value.

It can also be requested outside the verification pending screen with `store.refreshVerification()`.

### Email normalization

Use `normalizeEmail` to get the same value as matching against shared entries or `.lower()` in access control rules. Normalizing on your own in the host app causes mismatches.

```typescript
import { normalizeEmail } from '@14ch/svelte-firebase-auth';
```

### Handling failures

Operations do not throw; they return a result.

Account operations (`signIn`, `signUp`, `selectAccount`, `signOut`, `signOutAccount`) return an `AccountResult`. On success `value` identifies the account; on failure `error.kind` is one of:

| `error.kind`                      | Meaning                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `'auth'`                          | Firebase refused it. `error.cause` is an `AuthError` (below) |
| `'busy'`                          | Another add / switch / sign-out is in progress               |
| `'cancelled'`                     | The user cancelled the sign-in                               |
| `'limit-reached'`                 | Single account mode, and an account is already kept          |
| `'not-found'` / `'not-signed-in'` | The account does not exist or is no longer signed in         |
| `'initialization'`                | Internal setup failed. `error.detail` is for logging         |

```typescript
const result = await store.signIn(email, password);
if (!result.ok && result.error.kind === 'auth') {
	// result.error.cause.kind is one of the 10 AuthErrorKind values
	// result.error.cause.detail is for logging. Do not show it to users as is
}
```

`signOutAll()` returns `{ ok: true, signedOutIds }`, or `{ ok: false, reason: 'partial', signedOutIds, failed }` with each failed account and why. The accounts that were signed out stay signed out. The remaining operations (`changePassword`, `sendEmailVerification`, `sendPasswordReset`) return an `AuthResult`.

`AuthErrorKind`: `invalid-credential` / `invalid-email` / `email-already-in-use` / `weak-password` / `requires-recent-login` / `user-disabled` / `too-many-requests` / `registration-disabled` / `network-error` / `unknown`

- **`registration-disabled`, and failures caused by the return URL's domain, are signs of a configuration mismatch.** If they appear, check the Firebase settings
- When showing your own screens or menu, `authErrorMessageOf(error, messages, context)` and `accountErrorMessageOf(error, messages, context)` give you the same messages

### Overriding messages

Only the specified messages are replaced; unspecified ones use the default Japanese.

```svelte
<SignIn
	{store}
	messages={{
		signInSubmit: 'Log in',
		errors: { 'network-error': 'Cannot connect' }
	}}
/>
```

Japanese and English are bundled. To use English, pass `enMessages` as is.

```svelte
<script lang="ts">
	import { SignIn, enMessages } from '@14ch/svelte-firebase-auth';
</script>

<SignIn {store} messages={enMessages} />
```

To start from English and change only some messages, pass the base as the second argument of `resolveMessages`. **Specifying only some messages keeps Japanese as the base.**

```typescript
import { resolveMessages, enMessages } from '@14ch/svelte-firebase-auth';

const messages = resolveMessages({ signInSubmit: 'Log in' }, enMessages);
```

Message keys follow these rules.

| Kind            | Form               | Example                                    |
| --------------- | ------------------ | ------------------------------------------ |
| Input field     | Field name         | `email` / `currentPassword`                |
| Submit          | `<screen>Submit`   | `signInSubmit` / `passwordResetSubmit`     |
| Navigation      | `goTo<screen>`     | `goToSignUp` / `goToPasswordReset`         |
| Back navigation | `backTo<screen>`   | `backToSignIn`                             |
| Other actions   | Verb               | `signOut` / `cancel` / `back`              |
| Notice          | `<screen>` + state | `passwordChangeDone` / `passwordResetSent` |

**Navigation keys are named only after the destination screen, never the screen they start from.** A link to the same destination overrides the same key regardless of which screen it appears in.

### Headings and branding

**The screens have no headings.** Page elements are decided by whoever places the screen.

```svelte
<!-- src/routes/signin/+page.svelte -->
<h1>App name</h1>
<SignIn {store} />
```

The screens contain only input fields, actions, and notices. Heading levels, branding, and layout belong to the host app's page, and the library makes no assumptions about them.

## Not handled by this library

The following are **the host app's responsibility**.

- **Firebase initialization** — The `Auth` instance is passed in
- **The route pages themselves** — The library only receives route values; the host app provides the `+page.svelte` files
- **Your user menu and the dialogs around `AddAccount` / `AccountChooser`** — placement, opening, and closing
- **Switching your data on account changes** — re-subscribing, discarding displayed data, and handling unsaved or unsent data
- **Firestore and access control**
- **Server-side session verification** — Requires the Admin SDK
- **Operating the email delivery path and deliverability** (SPF / DKIM / DMARC, templates)

> **Do not loosen access control because screens are hidden.** `AuthGate` is **a mechanism for user experience, not a defense**. It works only in the browser, and does nothing if you forget to wrap with it. **Defense is the job of the host app's access control. Do not loosen security rules because route guarding exists.**

## Not supported

Email link sign-in, changing the email address, two-factor authentication, and account deletion. Managing accounts across different Firebase projects and syncing the account list across devices. External authentication providers (Google / Apple, etc.) are simply not requested yet and may be added later.

## Migrating from the single-account store

Changes for host apps that used an earlier version:

- **Add `multiAccount` to `AuthConfig`** (required). `true` keeps several accounts; `false` keeps one
- **Replace the `store.start()` / `store.stop()` effect with `<AuthSession {store} namespace="…" />`** in the root layout
- **Stop signing in or out with the `Auth` you pass in.** The store manages it and switches it to in-memory persistence. Connect it to the emulator before passing it in
- **Sign-in states saved by the earlier version are not carried over.** Users sign in once again
- **`signIn`, `signUp`, and `signOut` return an `AccountResult`** instead of `AuthResult` / `void`. A failed `signOut` is now reported
- **`AuthStage` has a new value, `'account-unselected'`** (multi only). Place the account chooser outside `AuthGate`
- **Key subscriptions by `activeId` or `uid`, not by `store.user`**, and re-subscribe when the account changes
- Code outside `AuthGate` that reads data at startup waits for `store.isResolved`; handle `store.startError`

## Development

```bash
npm run dev            # Showcase in src/routes (connects to the Auth and Firestore emulators)
npm run check          # Type check
npm run lint           # Formatting and static analysis
npm run test:unit      # Unit and component tests
npm run test:emulator  # Tests against the Auth and Firestore emulators
npm run test:e2e       # End-to-end tests against the showcase
npm run prepack        # src/lib -> dist
```

The showcase and `test:emulator` / `test:e2e` use the Auth and Firestore emulators (Firestore is used only for development and tests; it is not a dependency of the package). The Firebase CLI is required.

```bash
firebase emulators:start --only auth,firestore --project demo-svelte-firebase-auth
```

The showcase uses multiple accounts by default, with a user menu, an add-account dialog, a chooser dialog, and Firestore reads and writes for the account in use. Set `VITE_MULTI_ACCOUNT=false` to build it in single account mode, without any account list or chooser. `npm run test:e2e` runs the end-to-end tests in both modes.

```bash
VITE_MULTI_ACCOUNT=false npm run dev
```

## License

MIT
