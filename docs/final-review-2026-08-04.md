# Final Review Report

Fecha: 2026-08-05
Estado: revisión; sin commit ni despliegue.

## Findings Resolved

- Firestore rejects active users whose role is not `admin`, `manager`, or `cashier`, including document and collection reads.
- Frontend login/session mapping rejects invalid roles and clears the Firebase session.
- `POST /api/auth/sync-claims` now requires `Authorization: Bearer <Firebase ID token>` and body `{ uid }`; JSON tokens and extra body fields are rejected.
- WhatsApp UI copy uses Meta Graph API / WhatsApp Cloud API. Order confirmation is documented as manual/pending because the current confirmation action only updates Firestore status.
- `WhatsAppChat.tsx` emits generic console messages without raw caught errors.
- Production deploy documentation requires a public HTTPS `VITE_BACKEND_URL` and a separately deployed Express backend.
- Firebase Admin 14 compatibility is implemented through `firebase-admin/firestore` APIs; production CORS origins are configurable through `FRONTEND_ORIGINS`.
- Root and web dependency audits are clean after Playwright 1.55.1, Vite 6.4.3, and non-major transitive fixes.

## TDD Evidence

- RED: focused frontend run reported 5 failures / 25 passes, including invalid-role mapping, old WhatsApp copy, and raw error logging.
- RED: focused backend route run reported 3 failures / 2 passes because the handler still read `idToken` from JSON.
- RED: rules emulator rejected the new invalid-role assertion because the user could still read `products` with status 200.
- GREEN: the focused tests passed after the minimal fixes, then the full verification below passed.

## Verification

| Command | Result |
| --- | --- |
| `cd web; npm test` | 186 tests passed, 17 files |
| `cd backend; npm test` | 54 tests passed |
| `npm run test:rules` | Firestore/Auth emulator scenarios passed |
| `npm run test:sales` | Admin SDK Firestore transaction emulator passed |
| `cd web; npm run build` | Vite production build passed; PWA service worker generated |
| `npm run test:e2e` | Chromium: 2 passed, 1 skipped because QA credentials are not configured |
| `npm audit --audit-level=low` | 0 vulnerabilities |
| `cd web; npm audit --audit-level=low` | 0 vulnerabilities |
| `cd backend; npm audit --audit-level=low` | 6 moderate transitive findings in the Firebase Admin dependency chain |

## Residuals

- Chromium valid login/logout remains skipped without dedicated `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`.
- Backend audit remains partially non-clean; the remaining fixes require unsafe dependency overrides or downgrade paths, so none were forced.
- Direct browser smoke observed a `/favicon.ico` 404 and the expected Firebase invalid-login 400; the application displayed the generic Spanish error and did not expose provider details.
- The production build retains a non-blocking Vite warning about `firebase/config.ts` being both statically and dynamically imported.
