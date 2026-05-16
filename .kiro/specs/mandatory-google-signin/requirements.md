# Requirements Document

## Introduction

This feature makes Google Sign-In a hard prerequisite before any part of the personal finance app is accessible. Currently users can bypass authentication entirely by choosing a local setup path on the onboarding screen. After this change, the app always requires a successful Google OAuth token before rendering any content — including the onboarding setup cards. A new `GoogleSignInWall` full-screen component gates the entire app, the `App.tsx` bootstrap is extended with an `authRequired` state, the `useAppUI` store gains an `authRequired` boolean, and the existing sign-in callout inside `Onboarding.tsx` is removed.

## Glossary

- **App**: The personal finance React application served at the root URL.
- **Bootstrap**: The async initialization sequence that runs once per page load inside `useBootstrap` in `App.tsx`.
- **GoogleSignInWall**: The new full-screen component rendered when `authRequired === true` and bootstrapping is complete.
- **AuthGate**: The internal `App.tsx` component that decides whether to render `GoogleSignInWall` or the normal route tree.
- **SignInWall**: Synonym for `GoogleSignInWall` used in acceptance criteria for brevity.
- **Silent_Sign_In**: The `signInSilent()` call that uses `prompt:'none'` to restore an existing Google session without showing a UI prompt.
- **Interactive_Sign_In**: The `signIn()` call that uses `prompt:'select_account'` and shows the Google OAuth popup.
- **Drive_Load**: The `loadFromDrive()` call that fetches and imports the user's `finance-app-data.json` from Google Drive.
- **Onboarding**: The setup wizard screen (`Onboarding.tsx`) shown after authentication when the user's Drive is empty or new.
- **AppUIState**: The Zustand store managed by `useAppUI` that holds all UI-level state including `authRequired`.
- **DriveUser**: The object `{ email, name, pictureUrl }` returned by a successful sign-in.
- **isConfigured**: The `isConfigured()` function from `driveSync.ts` that returns `true` when `VITE_GOOGLE_OAUTH_CLIENT_ID` is set.

---

## Requirements

### Requirement 1: Mandatory Authentication Gate

**User Story:** As a user, I want the app to require Google Sign-In before showing any content, so that my financial data is never accessible to an unauthenticated browser session.

#### Acceptance Criteria

1. WHEN the Bootstrap completes and `authRequired` is `true`, THE App SHALL render only the `GoogleSignInWall` and no route components (Dashboard, Onboarding, Accounts, etc.).
2. WHEN the Bootstrap completes and `authRequired` is `false`, THE App SHALL render the normal route tree.
3. WHILE `authRequired` is `true`, THE App SHALL prevent navigation to any route including `/onboarding`, `/`, `/payday`, `/accounts`, `/manage`, `/trends`, and `/settings`.
4. THE App SHALL set `authRequired` to `false` only after `driveStatus` has been confirmed as `signed_in`.

---

### Requirement 2: Bootstrap Silent Sign-In Attempt

**User Story:** As a returning user, I want the app to restore my Google session automatically on load, so that I am not prompted to sign in every time I open the app.

#### Acceptance Criteria

1. WHEN the Bootstrap starts and `isConfigured()` returns `true`, THE Bootstrap SHALL attempt `Silent_Sign_In` before rendering any app content.
2. WHEN `Silent_Sign_In` returns a `DriveUser`, THE Bootstrap SHALL set `driveStatus` to `signed_in`, call `Drive_Load`, and set `authRequired` to `false`.
3. WHEN `Silent_Sign_In` returns `null` or times out, THE Bootstrap SHALL set `authRequired` to `true` and complete bootstrapping.
4. THE Bootstrap SHALL resolve the `Silent_Sign_In` attempt within 5 seconds by racing `signInSilent()` against a 5-second timeout that resolves to `null`.
5. WHEN the Bootstrap throws an unexpected error, THE Bootstrap SHALL set `authRequired` to `true` as a fail-safe before completing.
6. THE Bootstrap SHALL set `isBootstrapping` to `false` exactly once, in a `finally` block, regardless of the sign-in outcome.

---

### Requirement 3: Bootstrap Missing Configuration

**User Story:** As a developer, I want the app to surface a clear error when the OAuth client ID is not configured, so that misconfigured deployments fail visibly rather than silently.

#### Acceptance Criteria

1. WHEN `isConfigured()` returns `false`, THE App SHALL render a configuration error screen instead of the `GoogleSignInWall`.
2. WHEN `isConfigured()` returns `false`, THE App SHALL NOT attempt `Silent_Sign_In` or `Interactive_Sign_In`.

---

### Requirement 4: GoogleSignInWall Component

**User Story:** As an unauthenticated user, I want a clear full-screen sign-in prompt, so that I know I need to sign in with Google to access my data.

#### Acceptance Criteria

1. THE `GoogleSignInWall` SHALL display app branding and a single "Continue with Google" button.
2. THE `GoogleSignInWall` SHALL NOT display any financial data, navigation links, or route content.
3. WHEN the user clicks "Continue with Google", THE `GoogleSignInWall` SHALL call `Interactive_Sign_In` and show a loading indicator while the sign-in is in flight.
4. WHEN `Interactive_Sign_In` succeeds, THE `GoogleSignInWall` SHALL call `setDriveStatus('signed_in', user)` and trigger the post-sign-in continuation sequence.
5. WHEN `Interactive_Sign_In` throws an error whose message matches `/cancelled/i`, THE `GoogleSignInWall` SHALL remain visible without displaying an error message.
6. WHEN `Interactive_Sign_In` throws a non-cancellation error, THE `GoogleSignInWall` SHALL display the error message inline and remain visible.
7. WHEN a sign-in attempt is in flight, THE `GoogleSignInWall` SHALL disable the "Continue with Google" button.
8. WHEN a new sign-in attempt begins, THE `GoogleSignInWall` SHALL clear any previously displayed error message.

---

### Requirement 5: Post-Sign-In Continuation

**User Story:** As a newly authenticated user, I want the app to load my Drive data and route me appropriately, so that I land in the right place after signing in.

#### Acceptance Criteria

1. WHEN `Interactive_Sign_In` succeeds, THE App SHALL call `Drive_Load` before evaluating `needsOnboarding`.
2. WHEN `Drive_Load` returns `{ ok: true, emptyRemote: false }`, THE App SHALL set `needsOnboarding` to `false` and show a welcome-back toast with the user's name.
3. WHEN `Drive_Load` returns `{ ok: true, emptyRemote: true }`, THE App SHALL set `needsOnboarding` to `true` and show an info toast prompting the user to choose a setup path.
4. WHEN `Drive_Load` returns `{ ok: false }`, THE App SHALL set `needsOnboarding` to `true` and route the user to the Onboarding setup cards.
5. THE App SHALL set `authRequired` to `false` before evaluating `needsOnboarding` or rendering any route.

---

### Requirement 6: Onboarding Screen Modification

**User Story:** As an authenticated user on the Onboarding screen, I want to see only the data setup options, so that the screen is not cluttered with a sign-in prompt I have already completed.

#### Acceptance Criteria

1. THE `Onboarding` component SHALL NOT render the Google sign-in callout block (the "Sign in with Google — recommended" card).
2. THE `Onboarding` component SHALL NOT render the signed-in confirmation banner that was previously shown after signing in from the Onboarding screen.
3. WHEN the `Onboarding` screen renders, THE `Onboarding` component SHALL assume `driveStatus === 'signed_in'` is always true.
4. THE `Onboarding` component SHALL present the three setup paths: sample template, Excel import, and start from scratch.

---

### Requirement 7: AppUIState Extension

**User Story:** As a developer, I want the `useAppUI` store to track the `authRequired` flag, so that any component can reactively respond to authentication state changes.

#### Acceptance Criteria

1. THE `AppUIState` SHALL include an `authRequired` boolean field, initialized to `false`.
2. THE `AppUIState` SHALL include a `setAuthRequired(v: boolean)` action that updates the `authRequired` field.
3. WHILE `isBootstrapping` is `true`, THE `AppUIState` SHALL treat `authRequired` as indeterminate (not yet meaningful).
4. WHEN `isBootstrapping` transitions to `false`, THE `AppUIState` SHALL have `authRequired` set to either `true` (wall shown) or `false` (app accessible) with no other possible value.

---

### Requirement 8: DB Write Hook Registration

**User Story:** As a user, I want my data changes to be auto-saved to Drive, so that edits are not lost between sessions.

#### Acceptance Criteria

1. WHEN the Bootstrap completes successfully, THE Bootstrap SHALL register write hooks on all database tables (`accounts`, `liabilities`, `incomeSources`, `fixedExpenses`, `tiers`, `paycheckEvents`, `netWorthSnapshots`, `settings`).
2. WHEN a database write hook fires, THE App SHALL call `markEdited()` and `scheduleAutoSave()`.
3. THE Bootstrap SHALL register database write hooks exactly once per page load.
