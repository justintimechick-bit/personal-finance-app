# Implementation Plan: Mandatory Google Sign-In

## Overview

Extend the existing bootstrap flow and store to make Google Sign-In a hard prerequisite before any app content is accessible. The work touches four files: `useAppStore.ts` (new state field), `App.tsx` (revised bootstrap + auth gate), `GoogleSignInWall.tsx` (new component), and `Onboarding.tsx` (remove sign-in callout). No new dependencies or OAuth scopes are required.

## Tasks

- [x] 1. Extend `useAppUI` store with `authRequired` state
  - [x] 1.1 Add `authRequired: boolean` field (initialized to `false`) and `setAuthRequired(v: boolean)` action to `AppUIState` interface and `useAppUI` store in `src/store/useAppStore.ts`
    - Follow the existing pattern for `needsOnboarding` / `setNeedsOnboarding`
    - _Requirements: 7.1, 7.2_

  - [ ]* 1.2 Write property test for `authRequired` state transitions
    - **Property 4: Non-success bootstrap always sets authRequired true**
    - **Property 5: Bootstrap always completes**
    - **Validates: Requirements 7.3, 7.4**

- [x] 2. Create `GoogleSignInWall` component
  - [x] 2.1 Create `src/components/GoogleSignInWall.tsx` with app branding, "Continue with Google" button, loading state, inline error display, and cancellation handling
    - Import `signIn` from `../sync/driveSync` and `useAppUI` from `../store/useAppStore`
    - Accept an `onSuccess: (user: DriveUser) => void` prop (called after `setDriveStatus`)
    - Show loading spinner / disable button while sign-in is in flight
    - Clear error on each new attempt; swallow errors matching `/cancelled/i`; display all other errors inline
    - Never render financial data, navigation links, or route content
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 2.2 Write property test for cancellation error swallowing
    - **Property 8: Cancellation errors are silently swallowed**
    - **Validates: Requirements 4.5**

  - [ ]* 2.3 Write property test for non-cancellation error display
    - **Property 9: Non-cancellation errors are displayed**
    - **Validates: Requirements 4.6**

  - [ ]* 2.4 Write unit tests for `GoogleSignInWall`
    - Test: button renders and is enabled initially
    - Test: button is disabled while sign-in is in flight
    - Test: error message appears for non-cancellation errors
    - Test: no error message shown for cancellation errors
    - Test: `onSuccess` is called with the returned `DriveUser` on success
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 4.7_

- [x] 3. Checkpoint — store and wall component complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Revise `App.tsx` bootstrap and routing
  - [x] 4.1 Update `useBootstrap` in `src/App.tsx` to implement the revised bootstrap sequence
    - Add `setAuthRequired` to the destructured store actions
    - When `isConfigured()` returns `false`, set a `configError` flag and skip sign-in entirely
    - When `signInSilent` returns `null` or times out (5 s race), call `setAuthRequired(true)` instead of leaving `needsOnboarding` unset
    - When `signInSilent` returns a `DriveUser`, call `setDriveStatus('signed_in', user)`, `loadFromDrive`, `markSynced` (if ok), `isFirstLaunch` → `setNeedsOnboarding`, then `setAuthRequired(false)`
    - On any unexpected `catch`, call `setAuthRequired(true)` as a fail-safe
    - Keep DB write hook registration unchanged; register hooks after the auth branch resolves
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 8.1, 8.2, 8.3_

  - [x] 4.2 Add `handleSignInSuccess` function and `AuthGate` component to `src/App.tsx`
    - `handleSignInSuccess(user)`: calls `setDriveStatus('signed_in', user)`, `setAuthRequired(false)`, `loadFromDrive`, then sets `needsOnboarding` and shows appropriate toast per requirements 5.2–5.4
    - `AuthGate`: reads `authRequired` from store; returns `<GoogleSignInWall onSuccess={handleSignInSuccess} />` when `true`, `null` otherwise
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.3 Update `App` render function in `src/App.tsx` to add config-error screen and `AuthGate`
    - After the `isBootstrapping` loading screen, add a `configError` branch that renders a configuration error message (no sign-in wall)
    - Replace the existing route tree with `<AuthGate />` followed by the existing `<OnboardingGate />` + `<Routes>` block (routes only render when `authRequired === false`)
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2_

  - [ ]* 4.4 Write property test for bootstrap auth state
    - **Property 1: Auth wall exclusivity**
    - **Property 2: authRequired false implies signed in**
    - **Property 3: Silent sign-in success produces correct state**
    - **Property 4: Non-success bootstrap always sets authRequired true**
    - **Property 5: Bootstrap always completes**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 2.5, 2.6, 5.5**

  - [ ]* 4.5 Write property test for post-sign-in continuation
    - **Property 7: Interactive sign-in success triggers state update**
    - **Property 10: Drive load outcome determines needsOnboarding**
    - **Validates: Requirements 4.4, 5.2, 5.3, 5.4**

  - [ ]* 4.6 Write unit tests for `useBootstrap` and `AuthGate`
    - Mock `driveSync` module; use `renderHook` for `useBootstrap`
    - Test: `isBootstrapping` is `false` after hook settles (all paths)
    - Test: `authRequired === true` when `signInSilent` returns `null`
    - Test: `authRequired === false` and `driveStatus === 'signed_in'` when `signInSilent` returns a user
    - Test: `authRequired === true` when bootstrap throws
    - Test: `AuthGate` renders `GoogleSignInWall` when `authRequired === true`
    - Test: `AuthGate` renders `null` when `authRequired === false`
    - _Requirements: 1.1, 1.2, 2.2, 2.3, 2.5, 2.6_

- [x] 5. Checkpoint — bootstrap and routing complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Remove sign-in callout from `Onboarding.tsx`
  - [x] 6.1 Delete the Google sign-in callout block and signed-in confirmation banner from `src/screens/Onboarding.tsx`
    - Remove the `{!preview && oauthConfigured && !isSignedIn && ( ... )}` callout card
    - Remove the `{!preview && isSignedIn && driveUser && ( ... )}` confirmation banner
    - Remove the `handleGoogleSignIn` function and its associated state (`signingIn`)
    - Remove unused imports: `signIn`, `loadFromDrive`, `isConfigured` (verify each is no longer used before removing)
    - Keep `saveToDrive`, `pushToDrive`, `handleSeed`, `handleFromScratch`, `handleFile`, `handleConfirm`, and the three setup-path cards unchanged
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 6.2 Write unit tests for modified `Onboarding`
    - Test: sign-in callout card is not rendered
    - Test: signed-in confirmation banner is not rendered
    - Test: all three setup-path cards (sample template, Excel import, start from scratch) are rendered
    - _Requirements: 6.1, 6.2, 6.4_

- [ ] 7. Write property test for sign-in wall data isolation
  - [ ]* 7.1 Write property test for `GoogleSignInWall` data isolation
    - **Property 6: Sign-in wall never exposes financial data**
    - **Validates: Requirements 4.2**

- [ ] 8. Write property test for DB write hooks
  - [ ]* 8.1 Write property test for DB write hook auto-save
    - **Property 11: DB write hooks trigger auto-save**
    - **Validates: Requirements 8.2**

- [x] 9. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** as specified in the design's testing strategy
- The `bootstrapStarted` module-level guard in `App.tsx` is preserved — do not remove it
- `handleSignInSuccess` in `App.tsx` mirrors the logic previously in `Onboarding.handleGoogleSignIn`; the Onboarding version is removed in task 6.1

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.4"] },
    { "id": 4, "tasks": ["4.3", "4.5", "4.6"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2", "7.1", "8.1"] }
  ]
}
```
