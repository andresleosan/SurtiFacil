# Auth Guard and Fail-Closed Data Design

## Goal

Prevent the production application from rendering operational modules without an authenticated Firebase user or silently replacing Firestore failures with mock data.

## Context

`web/src/App.tsx` currently renders the dashboard and navigation immediately. Firebase services can fail with permission or configuration errors and then return mock data. The deployed application therefore appears usable without a valid session. The role synchronization endpoint reads `users/{uid}`, while client registration currently creates user documents with automatic IDs.

## Approved Approach

Implement a client-side authentication boundary, preserve mock data only for explicit non-Firebase test mode, and align user documents with Firebase Auth UIDs.

## Architecture

1. `App.tsx` owns the initial authentication state: loading, unauthenticated, and authenticated.
2. `Login.tsx` handles email/password sign-in and displays user-safe errors without exposing Firebase internals.
3. `authService.ts` exposes an auth-state subscription, login, logout, and current-user lookup. Firebase user documents use `/users/{uid}`.
4. Data services fail closed when Firebase is configured. They may use mock data only when Firebase configuration is intentionally absent in tests/development.
5. Firestore rules allow authenticated users to read their user record and restrict user writes by role claims. Operational collections remain protected by their existing role checks.

## User Flow

1. The app starts in a loading state while Firebase Auth resolves the current session.
2. If there is no session, only the login screen is rendered.
3. A valid login loads the user record and role state, then renders the application shell.
4. An invalid login keeps the user on the login screen and shows a generic Spanish error.
5. Logout clears the session and returns to the login screen.
6. A Firestore permission or availability error shows an error state; it never displays mock operational data in Firebase mode.

## Data Contract

The canonical user document is `/users/{uid}` with:

- `email: string`
- `displayName: string`
- `role: "admin" | "manager" | "cashier"`
- `active: boolean`
- `createdAt: timestamp`

The existing backend claim synchronizer can then read the same document by UID.

## Security Rules

- Unauthenticated clients cannot read or write `users` or operational collections.
- Authenticated users can read their own user record.
- Admin claims can manage user records.
- Client-provided role escalation is not accepted by Firestore rules.

## Testing Requirements

- Login screen appears when no Firebase session exists.
- Invalid credentials remain on the login screen.
- Authenticated users see the application shell.
- Logout returns to the login screen.
- Firebase permission failures produce an error state rather than mock data.
- Existing unit tests, TypeScript build, and PWA asset tests continue to pass.

## Out of Scope

- Password reset UI.
- Social login providers.
- Multi-tenant authorization.
- Replacing Firebase Auth with a backend session system.
