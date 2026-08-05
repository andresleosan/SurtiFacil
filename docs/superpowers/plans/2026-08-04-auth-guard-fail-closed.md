# Auth Guard and Fail-Closed Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Firebase authentication before rendering the application and prevent Firebase errors from being replaced by operational mock data.

**Architecture:** Add a small login boundary around the existing app shell. Firebase Auth becomes the source of session state, user documents are addressed by Firebase UID, and configured Firebase data services throw on errors instead of silently falling back to mocks. Firestore rules protect the user collection and preserve role-based access to operational data.

**Tech Stack:** React 18, TypeScript, Firebase Authentication, Firestore, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- The production app must render only the login screen without an authenticated Firebase session.
- Mock data is allowed only when Firebase configuration is intentionally absent; it is forbidden as a fallback after a configured Firebase request fails.
- The canonical user document path is `/users/{uid}`.
- No credentials, API keys, tokens, or `.env.local` contents may be committed or printed.
- Existing Spanish UI copy and Tailwind conventions must be preserved.
- `POST /api/auth/sync-claims` accepts only `{ uid }` in JSON and requires `Authorization: Bearer <Firebase ID token>`.
- Existing tests, PWA asset tests, TypeScript compilation, and production build must continue to pass.

---

### Task 1: Add Auth Session Boundary

**Files:**
- Create: `web/src/components/Login.tsx`
- Modify: `web/src/services/authService.ts`
- Modify: `web/src/App.tsx`
- Test: `web/src/test/authBoundary.test.tsx`

**Interfaces:**
- `authService.ts` produces `subscribeToAuthState(listener: (user: User | null) => void): () => void`.
- `Login.tsx` consumes `loginUser(email: string, password: string)` and emits no credentials outside the form.
- `App.tsx` consumes the auth subscription and renders either `Login`, a loading state, or the existing application shell.

- [ ] **Step 1: Write failing auth-boundary tests**

  Test that an unauthenticated state renders `Iniciar sesión`, that a failed login displays a generic Spanish error, and that an authenticated state renders `Panel de Control`.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run `npm test -- src/test/authBoundary.test.tsx` from `web/`.

  Expected result: failure because `Login` and the auth boundary do not exist yet.

- [ ] **Step 3: Implement the minimal auth subscription**

  Import `onAuthStateChanged` from `firebase/auth`. For configured Firebase, subscribe to Firebase Auth and map the authenticated Firebase user to the existing `User` shape. For explicit mock mode, notify with `currentUser`.

- [ ] **Step 4: Implement the login screen**

  Add controlled email and password fields, a submit button, loading state, and generic error text. Do not print Firebase error details or passwords. Call `loginUser` and let the App subscription update the shell.

- [ ] **Step 5: Add the App guard and logout**

  In `App.tsx`, initialize `authLoading` and `currentUser`, subscribe once in `useEffect`, render a loading message while resolving, render `Login` when there is no user, and render the existing shell only for an authenticated user. Add a `Cerrar sesión` button that calls `logoutUser`.

- [ ] **Step 6: Run focused tests and verify green**

  Run `npm test -- src/test/authBoundary.test.tsx` from `web/`.

  Expected result: all auth-boundary tests pass.

---

### Task 2: Align User Documents With Firebase UID

**Files:**
- Modify: `web/src/services/authService.ts`
- Modify: `web/src/test/authService.test.ts`

**Interfaces:**
- `registerUser` writes to `doc(db, 'users', firebaseUser.uid)` instead of `addDoc(collection(db, 'users'))`.
- `loginUser` reads the user document by the authenticated Firebase UID and verifies that it is active.

- [ ] **Step 1: Add failing tests for UID document behavior**

  Assert that registration uses the Firebase UID as the Firestore document ID and that login rejects an inactive user with a user-safe error.

- [ ] **Step 2: Run the focused auth service tests**

  Run `npm test -- src/test/authService.test.ts` from `web/`.

  Expected result: the new assertions fail against the current `addDoc` and email-query implementation.

- [ ] **Step 3: Implement UID-based reads and writes**

  Replace `addDoc` with `setDoc(doc(db, 'users', firebaseUser.uid), userData)`. Replace the email query during login with `getDoc(doc(db, 'users', firebaseUser.uid))`, reject missing records, and reject `active === false` before returning the user.

- [ ] **Step 4: Run auth service tests**

  Run `npm test -- src/test/authService.test.ts` from `web/`.

  Expected result: all auth service tests pass.

---

### Task 3: Fail Closed in Firebase Data Services

**Files:**
- Modify: `web/src/services/saleService.ts`
- Modify: `web/src/services/supplierService.ts`
- Create: `web/src/test/saleService.test.ts`

**Interfaces:**
- Configured Firebase operations return Firestore results or throw an error.
- Mock operations remain available only when `isFirebaseConfigured()` is false.

- [ ] **Step 1: Add failing tests for configured Firebase failures**

  Mock a configured Firebase environment and a rejected Firestore request. Assert that the service rejects instead of returning `mockProducts`, `mockSales`, `mockSuppliers`, or `mockOrders`.

- [ ] **Step 2: Run the focused service tests**

  Run the relevant Vitest file from `web/` and confirm the new assertions fail because current catch blocks return mock data.

- [ ] **Step 3: Remove configured-mode mock fallbacks**

  Keep the explicit `!isFirebaseConfigured()` branches. In configured mode, log a non-sensitive error and rethrow a generic operational error. Do not include tokens, API keys, or user credentials in logs.

- [ ] **Step 4: Run focused service tests**

  Verify the new fail-closed assertions pass and existing mock-mode tests remain green.

---

### Task 4: Protect Users in Firestore Rules

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json` only if the final query requires an index

**Interfaces:**
- `/users/{userId}` is readable only by an authenticated user whose UID matches `userId`, or by an admin claim.
- User creation, role changes, and status changes require an admin claim; a user may update only its own `lastLogin` field.
- Client data cannot elevate its own role through rules.

- [ ] **Step 1: Add the users rule block**

  Add a `/users/{userId}` match before the catch-all scope with `allow read: if request.auth != null && (request.auth.uid == userId || request.auth.token.admin == true)`, `allow create, delete: if request.auth != null && request.auth.token.admin == true`, and `allow update: if request.auth != null && (request.auth.token.admin == true || (request.auth.uid == userId && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastLogin'])))`. Deny unauthenticated access.

- [ ] **Step 2: Review rule compatibility with the login flow**

  Confirm the authenticated user can read only its own UID document and that admin claims are the only way to manage another user's document.

- [ ] **Step 3: Run the available rules/deploy validation**

  If the Firebase emulator is available, run the Firestore rules tests against it. Otherwise run `firebase deploy --only firestore:rules --dry-run` if supported by the installed CLI and report the exact result without applying a production deploy.

---

### Task 5: Full Verification and Browser QA

**Files:**
- Modify: `tasks.md` only with verified evidence after all tests pass.
- Create: `qa/tests/auth-boundary.spec.ts` if the project adopts a persistent Playwright suite during this task.

- [ ] **Step 1: Run the complete unit test suite**

  Run `npm run test` from `web/` and record the exact passing count.

- [ ] **Step 2: Run the production build**

  Run `npm run build` from `web/` and verify TypeScript and Vite both exit successfully.

- [ ] **Step 3: Run Chromium checks**

  With a dedicated QA account, verify unauthenticated users see only login, invalid credentials stay on login, valid credentials see the shell, and logout returns to login. Capture console errors and a screenshot on failure.

- [ ] **Step 4: Verify fail-closed behavior**

  Confirm a configured Firestore permission error shows an error state and does not render mock products or sales.

- [ ] **Step 5: Run security checks**

  Run `npm audit --audit-level=low`, review the four known dependency findings, and ensure no new critical findings or exposed secrets are introduced.

- [ ] **Step 6: Rebuild and prepare deployment**

  Confirm `web/.env.local` exists without printing its contents, confirm PWA assets are non-empty in `web/dist/icons/`, and only then prepare the separately authorized production deploy with rollback notes.

---

### Task 6: Post-Review Authorization Hardening

**Files:**
- Modify: `firestore.rules`
- Modify: `backend/whatsapp-webhook.js`
- Modify: `web/src/services/authService.ts`
- Modify: `web/src/components/Dashboard.tsx`
- Modify: `web/src/components/StockAlerts.tsx`
- Modify: `web/src/components/Reports.tsx`
- Modify: `web/src/components/UserManagement.tsx`
- Add focused tests for active-user rules, sanitized auth logs, and visible data-load errors.

- [ ] Add an `isActiveUser()` Firestore helper and require it on operational collection reads/writes while preserving admin/manager role checks.
- [ ] Reject inactive users in the backend claims synchronizer and prevent post-authentication failures from leaving a live session.
- [ ] Replace raw auth error logging with static non-sensitive messages.
- [ ] Render explicit Spanish error states in dashboard, stock alerts, reports, and user management instead of zero/empty/success states after load failures.
- [ ] Run the focused tests, full suite, build, Firestore emulator scenarios, and Chromium QA again.

---

### Task 7: Explicit Mock Mode and Secure Employee Provisioning

**Files:**
- Modify: `web/src/services/authService.ts` and configured-mode tests.
- Modify: `web/src/components/CreateUserModal.tsx` only for safe API errors.
- Create or modify: backend provisioning helper/route and backend tests.
- Modify: `backend/package.json` and lockfile for rate limiting only if needed.
- Modify: `.gitignore` to ignore local Playwright MCP artifacts.

- [ ] Enable mock behavior only through an explicit development/test flag; missing Firebase configuration must fail closed rather than permit mock admin login.
- [ ] Provision employees through an authenticated admin backend endpoint that validates the caller, input, role, and active state, creates Auth and `/users/{uid}` atomically enough to clean up partial Auth creation, and rate-limits the endpoint.
- [ ] Ensure the frontend does not replace the admin session with the newly created employee session.
- [ ] Sanitize provisioning errors and keep credentials out of logs.
- [ ] Add backend contract/helper tests and frontend tests for explicit mock mode and employee creation behavior.

---

### Task 8: Final Auth and API Error Hardening

**Files:**
- Modify: `web/src/services/authService.ts` and `web/src/App.tsx`.
- Modify: `backend/whatsapp-webhook.js` and backend contract tests.
- Modify: `tasks.md` to remove contradictory deployment claims.

- [ ] Prevent a stale successful login callback from overwriting a newer Firebase session.
- [ ] Distinguish missing/inactive user records from Firestore availability/permission failures and show a visible infrastructure error instead of silently returning to login.
- [ ] Surface logout failures without exposing provider details.
- [ ] Sanitize remaining backend endpoint logs and error responses; never return raw provider error messages or payloads.
- [ ] Run targeted race/error tests, full frontend/backend tests, build, rules emulator, audit, and Chromium QA.

---

### Task 9: WhatsApp Webhook Authenticity

**Files:**
- Modify: `backend/whatsapp-webhook.js`.
- Modify: backend tests and WhatsApp integration documentation.
- Modify: `tasks.md` with the verified test count only.

- [ ] Capture the raw request body before JSON parsing and validate `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET` using timing-safe comparison.
- [ ] Fail closed when the app secret or signature is absent/invalid; retain GET verification behavior.
- [ ] Add bounded finite rate limiting to the public webhook route.
- [ ] Add executable tests for valid signature, invalid/missing signature, missing secret, rate limit, and existing valid payload behavior.
- [ ] Update WhatsApp security checklist to distinguish implemented controls from remaining deployment configuration.

---

### Task 10: Release Documentation and Auth Error State

- [ ] Preserve infrastructure auth errors when Firebase user snapshots fail; do not replace them with a plain unauthenticated state.
- [ ] Align all WhatsApp documentation examples with the canonical HMAC/rules/backend deployment model.
- [ ] Correct current test counts and update the SDD ledger through Task 10.
- [ ] Record that Firebase Hosting does not deploy the Express webhook and that backend deployment requires a separate target.

---

### Task 11: WhatsApp Admin Authorization and Outbound Contract

- [ ] Protect admin WhatsApp endpoints with verified Firebase Bearer tokens and active admin/manager document roles; keep backend-only API-key support only for explicitly internal callers.
- [ ] Make `whatsappService.sendMessage` call the protected backend endpoint instead of pretending Firestore persistence is provider delivery.
- [ ] Restrict WhatsApp Firestore reads/writes and navigation to active admin/manager users.
- [ ] Add executable backend/frontend contract tests and update legacy WhatsApp docs/examples to the canonical contract.

---

### Task 12: WhatsApp Abuse and Provider Resilience

- [x] Apply bounded rate limits to authenticated WhatsApp send/test routes, with expiry and `Retry-After` responses.
- [x] Add a finite provider request timeout and generic timeout/failure handling for WhatsApp API calls.
- [x] Add executable tests for route abuse limits and provider timeout/failure behavior.
- [x] Remove remaining documentation claims that `ADMIN_API_KEY` or generic API Key/JWT is the frontend authentication contract.

---

### Task 13: POS Authorization and Proxy Contracts

- [x] Allow active cashiers to decrement product stock only through the sale transaction; managers/admins retain full product writes.
- [x] Add Firestore sale schema validation for required fields, non-negative totals, valid payment method, and non-empty item lists.
- [x] Send Firebase Bearer tokens from Anthropic proxy clients and preserve backend-only provider keys.
- [x] Update current task ledger/counts and remaining WhatsApp documentation status claims.

---

### Task 14: Server-Side POS Transaction

- [x] Add an authenticated backend sales endpoint that validates the payment method/cart, reads authoritative product prices and stock, calculates totals server-side, writes the sale, and decrements stock in one Firestore transaction.
- [x] Make configured frontend `createSale` call the backend endpoint with Firebase Bearer; retain local mock mode only under the explicit mock flag.
- [x] Remove direct cashier product-write permission from Firestore rules; managers/admins retain product management.
- [x] Add rate limits and executable route tests to Anthropic proxy endpoints.
- [x] Add backend/frontend/rules tests for forged totals, stock races, cashier direct writes, and valid POS transactions.

### Task 15: Final Review Findings

- [x] Require `isActiveUser()` to validate both `active == true` and role `admin|manager|cashier`; cover invalid-role document and collection reads in the emulator.
- [x] Reject invalid roles during frontend login and session mapping.
- [x] Require `Authorization: Bearer <Firebase ID token>` for `/api/auth/sync-claims` and accept only `{ uid }` in JSON.
- [x] Align WhatsApp UI/provider copy with Meta Graph API / WhatsApp Cloud API and document order confirmation as manual/pending until a send-backed flow exists.
- [x] Remove raw caught errors from `WhatsAppChat.tsx` console logging.
- [x] Require production `VITE_BACKEND_URL` and separately deploy the Express backend in release documentation.
- [x] Record final verification and residuals in `docs/final-review-2026-08-04.md` without claiming deployment.
