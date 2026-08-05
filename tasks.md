# tasks.md - SurtiFácil Admin MVP v1.0

## Fecha: 2026-07-31
## Objetivo: MVP v1.0 - Alertas + Empleados + Reportes

---

## FASE 1: Alertas de Stock Bajo (5 días) ✅ COMPLETADA

### 1.1 Diseño de Datos (1 día) ✅
- [x] Definir esquema `stock_alerts` en Firestore
- [x] Crear interfaz `StockAlert` en `services/stockAlertService.ts`
- [x] Documentar estructura en `docs/`

### 1.2 Backend (2 días) ✅
- [x] Crear función `checkLowStock()` en `services/stockAlertService.ts`
- [x] Implementar umbral configurable por producto
- [x] Crear endpoint GET `/api/alerts` (si backend Express)
- [x] Agregar campo `minStock` a producto existente

### 1.3 Frontend (2 días) ✅
- [x] Crear componente `StockAlerts.tsx`
- [x] Agregar badge indicador en `Inventory.tsx`
- [x] Implementar notificación visual en Dashboard
- [x] Agregar configuración de umbrales en Settings

---

## FASE 2: Gestión de Empleados (7 días) ✅ COMPLETADA

### 2.1 Modelo de Datos (1 día) ✅
- [x] Definir esquema `users` en Firestore
- [x] Crear interfaz `User` con roles: `admin | cashier | manager`
- [x] Implementar validación de permisos por rol

### 2.2 Servicio de Auth (2 días) ✅
- [x] Configurar Firebase Authentication
- [x] Crear `authService.ts` con:
  - `register(email, password, role)`
  - `login(email, password)`
  - `logout()`
  - `getCurrentUser()`
  - `getUsers()`
  - `updateUserRole()`
  - `toggleUserActive()`
  - `deleteUser()`
  - `isAdmin()`
- [x] Implementar protección de rutas según rol

### 2.3 UI Empleados (2 días) ✅
- [x] Crear componente `UserManagement.tsx`
- [x] Implementar tabla de usuarios con roles
- [x] Crear modal `CreateUserModal.tsx`
- [x] Agregar opciones de editar/eliminar usuario

### 2.4 Integración (2 días) ✅
- [x] Agregar página 'Empleados' al nav en `App.tsx`
- [x] Implementar control de acceso por rol
- [x] Proteger rutas sensibles (solo admin)
- [x] Agregar logging de actividad por usuario

---

## FASE 3: Reportes Básicos (5 días) ✅ COMPLETADA

### 3.1 Datos y Servicios (2 días) ✅
- [x] Crear `reportService.ts` con:
  - `getDailySales(date)`
  - `getWeeklySales(startDate, endDate)`
  - `getTopProducts(limit)`
  - `getSalesByCategory()`
  - `getSalesSummary()`
  - `formatCurrency()`
  - `formatNumber()`
- [x] Optimizar queries Firestore (índices)

### 3.2 UI Reportes (2 días) ✅
- [x] Crear componente `Reports.tsx`
- [x] Implementar gráficas con recharts (BarChart, PieChart)
- [x] Crear selector de rango de fechas (7/14/30 días)
- [x] Mostrar: ventas diarias, semanales, top 5 productos
- [x] Exportar datos a CSV

### 3.3 Dashboard Integration (1 día) ✅
- [x] Agregar enlace a reportes en `Dashboard.tsx`
- [x] Crear acceso rápido a reportes desde nav
- [x] Evento de navegación personalizado (`navigate`)
- [x] Exportar datos a CSV (opcional)

---

## FASE 4: Testing y QA (3 días) ✅ COMPLETADA

### 4.1 Configuración (1 día) ✅
- [x] Instalar Vitest en `web/` (vitest, @testing-library/react, jsdom)
- [x] Configurar tests en `package.json` (test, test:watch, test:ui)
- [x] Crear estructura `src/test/` con setup.ts
- [x] Configurar vite.config.ts (jsdom, globals, css)

### 4.2 Tests Unitarios (2 días) ✅
- [x] Tests para `stockAlertService.ts` (14 tests)
- [x] Tests para `reportService.ts` (14 tests)
- [x] Tests para `authService.ts` (10 tests)
- [x] Tests de utils (formatCurrency, formatNumber)
- [x] **38 tests pasan, 0 fallan**

---

## FASE 5: Deploy (2 días) - PREPARACIÓN DOCUMENTADA, DEPLOY NO VERIFICADO

### 5.1 Preparación (1 día) ✅
- [x] Configurar variables de entorno production
- [x] Optimizar build (`npm run build`) - manualChunks (react/firebase/charts)
- [x] Configurar Firebase Hosting (`firebase.json`)
- [x] Crear `.firebaserc`
- [x] Crear `firestore.rules` (reglas de seguridad)
- [x] Crear `firestore.indexes.json` (índices optimizados)
- [x] Cache headers configurados (JS/CSS 7 días, imágenes 1 año)
- [x] Agregar scripts de deploy al `package.json` raíz

### 5.2 Despliegue (1 día) ✅
- [x] Documentar proceso en `docs/DEPLOY.md`
- [x] Comandos documentados (deploy:hosting, deploy:rules, deploy:all)
- [x] Checklist pre-producción
- [x] Sección de troubleshooting
- [x] Guía de rollback
- [ ] Deploy a producción (requiere `firebase login` + project ID real)

---

## Resumen Estimación

### MVP v1.0 - FEATURES COMPLETADOS, DEPLOY NO VERIFICADO
| Fase | Días | Estado |
|------|------|--------|
| Alertas Stock | 5 | ✅ COMPLETADA |
| Empleados | 7 | ✅ COMPLETADA |
| Reportes | 5 | ✅ COMPLETADA |
| Testing | 3 | ✅ COMPLETADA |
| Deploy | 2 | PREPARACIÓN DOCUMENTADA |
| **Subtotal MVP v1.0** | **22 días** | **FEATURES COMPLETADOS** |

### v1.1 Gestión de Proveedores ✅ COMPLETADO
| Fase | Días | Estado |
|------|------|--------|
| Task 1: Modelos y Mock Data | 1 | ✅ COMPLETADA |
| Task 2: Servicio CRUD Proveedores | 1 | ✅ COMPLETADA |
| Task 3: UI Proveedores | 2 | ✅ COMPLETADA |
| Task 4: Servicio Órdenes | 1 | ✅ COMPLETADA |
| Task 5: UI Órdenes | 2 | ✅ COMPLETADA |
| Task 6: Recepción Atómica | 2 | ✅ COMPLETADA |
| Task 7: Reglas + Índices | 1 | ✅ COMPLETADA |
| **Subtotal v1.1** | **10 días** | **✅** |

### v1.2 Analytics de Margen ✅ COMPLETADO
| Fase | Días | Estado |
|------|------|--------|
| Tarea 1: Modelo + resolveCost | 1 | ✅ COMPLETADA |
| Tarea 2: Servicio resumen + diario | 2 | ✅ COMPLETADA |
| Tarea 3: Top productos + categorías | 1 | ✅ COMPLETADA |
| Tarea 4: Registro costo atómico | 1 | ✅ COMPLETADA |
| Tarea 5: UI KPIs + chart diario | 1 | ✅ COMPLETADA |
| Tarea 6: UI categorías + tablas + CSV | 1 | ✅ COMPLETADA |
| **Subtotal v1.2** | **7 días** | **✅** |

### v1.3 Reposición Predictiva ✅ COMPLETADO
| Fase | Días | Estado |
|------|------|--------|
| Task 1: Extender Supplier + restockService skeleton | 1 | ✅ COMPLETADA |
| Task 2: Algoritmo completo + 10 tests | 2 | ✅ COMPLETADA |
| Task 3: SupplierModal - input lead_time_days | 0.5 | ✅ COMPLETADA |
| Task 4: Tabla proveedores - columna lead time | 0.5 | ✅ COMPLETADA |
| Task 5: UI página Reposición (KPIs + tabla) | 1 | ✅ COMPLETADA |
| Task 6: PurchaseOrderModal - prop initialItems | 0.5 | ✅ COMPLETADA |
| Task 7: Cablear Restock → PurchaseOrderModal | 0.5 | ✅ COMPLETADA |
| Task 8: Nav + guard admin/manager | 0.5 | ✅ COMPLETADA |
| **Subtotal v1.3** | **6.5 días** | **✅** |

### v2.0 Barcode Scanner + PWA ✅ COMPLETADO
| Fase | Días | Estado |
|------|------|--------|
| Task 1: Data model + barcode field | 0.5 | ✅ COMPLETADA |
| Task 2: Instalar dependencias | 0.5 | ✅ COMPLETADA |
| Task 3: BarcodeScanner component | 1 | ✅ COMPLETADA |
| Task 4: useBarcode hook | 0.5 | ✅ COMPLETADA |
| Task 5: Integración Inventory | 1 | ✅ COMPLETADA |
| Task 6: Integración CreateSale | 1 | ✅ COMPLETADA |
| Task 7: Integración AddProductModal | 0.5 | ✅ COMPLETADA |
| Task 8: PWA Setup (manifest + plugin) | 1 | ✅ COMPLETADA |
| Task 9: Offline Strategy (Workbox) | 1 | ✅ COMPLETADA |
| Task 10: Unit Tests | 1 | ✅ COMPLETADA |
| Task 11: Final Verification (deploy no verificado) | 0.5 | PREPARACIÓN COMPLETADA |
| **Subtotal v2.0** | **8 días** | **✅** |

---

## Checklist Pre-Entrega - Estado Actual

- [x] Features implementados y verificados en el workspace
- [x] Tests frontend verificados - 181/181 pass
- [x] Build local verificado
- [x] Reglas y smoke QA locales verificados
- [x] Documentación técnica y estado de despliegue actualizados
- [ ] Deploy a producción (no ejecutado ni verificado en el estado actual)
- [ ] Login/logout válido en Chromium (requiere `QA_TEST_EMAIL` y `QA_TEST_PASSWORD`)

---

## Commits Recientes (v2.0)

- `4b0dd06` test(v2.0): agregar tests para useBarcode hook
- `323ef2c` feat(v2.0): configurar Workbox offline caching
- `8cd8add` feat(v2.0): configurar PWA manifest y plugin
- `fe3fc79` feat(v2.0): integrar escaner en AddProductModal
- `f756371` feat(v2.0): integrar escaner en CreateSale
- `4c4e44d` feat(v2.0): integrar escaner en Inventory
- `7f367fc` feat(v2.0): crear hook useBarcode
- `ac1c7d8` feat(v2.0): crear componente BarcodeScanner
- `8edc418` feat(v2.0): instalar html5-qrcode y vite-plugin-pwa
- `cf6bfce` feat(v2.0): agregar campo barcode a Product

---

*Generado por Cronos - v2.0 Barcode Scanner + PWA Completada*

---

## Auth Guard and Fail-Closed Verification (2026-08-04)

### Task 5: Full Verification and Browser QA
- [x] Unit tests: 163/163 passed
- [x] Production build completed successfully
- [x] Chromium smoke suite: 2 passed, 1 skipped (sin credenciales QA dedicadas)
- [x] PWA icons in `web/dist/icons/` are non-empty
- [x] HTML report generated at `qa/reports/index.html`
- [ ] Valid login/logout en Chromium: pendiente de `QA_TEST_EMAIL` y `QA_TEST_PASSWORD`
- [ ] Dependency audit residuals: root `2 high` Playwright; web `4` findings (`1 low`, `1 moderate`, `2 high`); backend `8 moderate` `uuid` chain; no critical-severity finding reported; audits are not clean

Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-5-report.md`

### Task 7: Explicit Mock Mode and Secure Employee Provisioning
- [x] Mock mode requires `VITE_USE_MOCK_DATA === 'true'`
- [x] Incomplete Firebase configuration fails closed for auth and operational data
- [x] Configured employee provisioning uses authenticated backend Auth/Firestore flow and is covered by service/contract tests, not Playwright E2E
- [x] Admin authorization, input validation, derived claims, rollback, and rate limiting tested
- [x] Frontend tests: 166/166 passed
- [x] Backend tests: 10/10 passed
- [x] Production build and Firestore/Auth emulator verification passed
- [x] Chromium smoke suite: 2 passed, 1 skipped
- [ ] Valid login/logout in Chromium: pending `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`
- [ ] Dependency audit residuals: root `2 high` Playwright; web `4` findings (`1 low`, `1 moderate`, `2 high`); backend `8 moderate` `uuid` chain; no critical-severity finding reported; audits are not clean

Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-7-report.md`

### Task 8: Final Auth and API Error Hardening
- [x] Auth state contract distinguishes unauthenticated, infrastructure, and logout errors
- [x] Stale successful login callbacks cannot overwrite newer session state
- [x] Firestore infrastructure failures are visible as safe Spanish errors
- [x] Logout failures are visible without exposing provider details
- [x] Webhook endpoint errors use static logs and generic responses with preserved status codes/success paths
- [x] Frontend tests: 174/174 passed
- [x] Backend tests: 17/17 passed
- [x] Production build and Firestore/Auth emulator verification passed
- [x] Chromium smoke suite: 2 passed, 1 skipped
- [ ] Valid login/logout in Chromium: pending `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`
- [ ] Dependency audits are not clean: root 2 high, web 4 findings including 2 high, backend 8 moderate; no critical-severity runtime dependency finding reported
- [x] Deployment status corrected: preparation documented, no deployment claimed

Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-8-report.md`

### Task 9: WhatsApp Webhook Authenticity
- [x] GET verification requires a non-empty configured `WEBHOOK_VERIFY_TOKEN` and preserves valid challenge responses
- [x] POST webhook requires `WHATSAPP_APP_SECRET` and valid `X-Hub-Signature-256` over the exact raw body
- [x] Invalid or missing HMAC is rejected before JSON parsing, including malformed JSON bodies
- [x] Signature comparison uses HMAC-SHA256 with timing-safe comparison and fails closed
- [x] Public webhook rate limiter is finite, bounded, and expires entries
- [x] Executable backend route tests: 24/24 passed, including 7 Task 9 cases
- [x] Frontend tests: 174/174 passed
- [x] Production build, rules emulator, and Chromium QA completed
- [ ] Chromium valid login/logout remains skipped without dedicated QA credentials
- [ ] Dependency audits remain non-clean: root 2 high, web 4 findings, backend 8 moderate
- [ ] Deployment remains unexecuted and unverified

Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-9-report.md`

### Task 7 Review Follow-Up
- [x] Rate-limit entries expire and the in-memory map is bounded
- [x] Active non-admin rejection has explicit backend coverage
- [x] `429` and `Retry-After` have provisioning contract coverage
- [x] Configured service/contract coverage proves the browser Auth creation API is unused; provisioning is not claimed as Playwright E2E
- [x] Valid-login Chromium coverage remains explicitly skipped without persistent QA credentials
- [x] Rate limiter is documented as bounded and process-local; multi-replica deployment requires shared storage

Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-7-report.md`

### Task 10: Release Documentation and Auth Error State
- [x] Snapshot infrastructure errors survive subsequent null auth events
- [x] Missing/inactive user behavior remains unauthenticated
- [x] WhatsApp docs align with HMAC, active/role Firestore rules, backend-only credentials, and Express deployment
- [x] Unsupported application-level encryption claims removed
- [x] Firebase Hosting and Express backend deployment prerequisites documented separately
- [x] Frontend tests: 175/175 passed
- [x] Backend tests: 24/24 passed
- [x] Production build, rules emulator, and Chromium QA completed
- [ ] Chromium valid login/logout remains skipped without dedicated QA credentials
- [ ] Dependency audits remain non-clean: root 2 high, web 4 findings, backend 8 moderate
- [x] SDD ledger and Task 10 report updated

Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-10-report.md`

### Task 11: WhatsApp Admin Authorization and Outbound Contract
- [x] WhatsApp send/test routes require Firebase ID-token Bearer verification and active admin/manager roles
- [x] Frontend outbound messages use the backend contract and never write provider delivery records directly
- [x] WhatsApp backend/provider errors are generic and outbound request fields are validated
- [x] Cashiers cannot see or mount the WhatsApp module
- [x] WhatsApp Firestore writes require active admin/manager users; destructive actions remain admin-only
- [x] Legacy WhatsApp docs/examples updated for Express, HMAC, Firebase Bearer authorization, and backend-only secrets
- [x] Frontend tests: 179/179 passed
- [x] Backend tests: 28/28 passed
- [x] Production build and Firestore/Auth emulator verification passed
- [x] Chromium smoke suite: 2 passed, 1 skipped
- [ ] Chromium valid login/logout remains skipped without dedicated QA credentials
- [ ] Dependency audits remain non-clean: root 2 high, web 4 findings including 2 high, backend 8 moderate; no critical finding reported
- [x] No deployment or commit performed

Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-11-report.md`

### Task 12: WhatsApp Abuse and Provider Resilience
- [x] Authenticated `/api/whatsapp/send` and `/api/whatsapp/test` routes have bounded, expiring per-user/per-route limits with generic `429` and `Retry-After`
- [x] Both routes use one shared bounded process-local limiter with route/user keys
- [x] Firebase Bearer authorization and active admin/manager checks remain in the route chain before rate limiting
- [x] WhatsApp provider requests use a finite `AbortController` timeout; provider failures use static logs and generic responses
- [x] Executable backend coverage includes send/test limits, route/user isolation, `Retry-After`, timeout, provider failure, and success contracts
- [x] `.env.example` and WhatsApp architecture documentation state frontend Firebase Bearer auth and backend-only provider secrets
- [x] Backend tests: 35/35 passed
- [x] Frontend tests: 179/179 passed
- [x] Production build, Firestore/Auth rules emulator, and Chromium QA completed
- [ ] Chromium valid login/logout remains skipped without dedicated `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`
- [ ] Dependency audits remain non-clean: root 2 high, web 4 findings, backend 8 moderate; breaking upgrades are required for automatic fixes
- [x] No deployment or commit performed

Status: revisión. Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-12-report.md`

### Task 13: POS Authorization and Proxy Contracts
- [x] Active cashiers can update only existing product stock to a non-negative value less than or equal to the previous stock
- [x] Admin/manager full product writes remain available
- [x] Sale creation requires the required timestamp, total, payment method, and item schema fields
- [x] Sale totals and item prices/subtotals are non-negative; payment method and positive item quantities are constrained
- [x] Anthropic image/audio requests send only the current Firebase ID-token Bearer header plus JSON content type
- [x] Anthropic backend proxy routes require active Firebase admin/manager authorization with generic errors
- [x] Persistent emulator scenarios cover cashier stock decrement/increase/edit and invalid sale schemas
- [x] Frontend tests: 181/181 passed
- [x] Backend tests: 36/36 passed
- [x] Production build passed
- [x] No stale deployable `docs/firestore.rules` copy; canonical rules remain at the repository root
- [x] Rules emulator passed with persistent cashier stock and sale-schema scenarios
- [x] Audits completed; known dependency findings remain documented
- [x] Chromium QA completed: 2 passed, 1 skipped
- [ ] Chromium valid login/logout remains skipped without dedicated `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`
- [ ] Production deployment remains unexecuted and unverified
- [x] No deployment or commit performed

Status: revisión. Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-13-report.md`

### Task 14: Server-Side POS Transaction
- [x] Added `POST /api/sales/create` with Firebase Bearer verification, active `/users/{uid}` role authorization for admin/manager/cashier, request validation, bounded per-user rate limiting, and generic errors.
- [x] Moved configured sale creation to an Admin SDK Firestore transaction that uses stored product names/prices/stock, calculates subtotals and totals server-side, writes the sale, and decrements stock atomically.
- [x] Configured frontend `createSale` now sends only product IDs, quantities, payment method, and the current Firebase ID token; explicit mock mode remains local.
- [x] Removed direct cashier product updates and direct client sale creation from Firestore rules; admin/manager product management remains available.
- [x] Extracted Anthropic routes with bounded authenticated rate limits, finite image/audio input limits, AbortController timeouts, and request-level 401/403/429/timeout/provider-error tests.
- [x] Added coverage for forged totals, malformed carts, missing/insufficient stock, safe-integer overflow, concurrent last-stock sales, cashier direct-write denial, and real-limiter `Retry-After` exhaustion.
- [x] Added an explicit configured-mode frontend create-sale regression test and an Admin SDK Firestore emulator transaction contract.
- [x] Backend tests: 54/54 passed.
- [x] Frontend tests: 186/186 passed.
- [x] Production build, Firestore/Auth rules, and Admin SDK transaction emulator verification passed.
- [x] Chromium QA: 2 passed, 1 skipped without dedicated `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`.
- [ ] Dependency audits remain partially non-clean: root 0, web 0, backend 6 moderate transitive findings in the Firebase Admin dependency chain; no critical finding reported.
- [x] No deployment or commit performed.

Status: revisión. Evidence: `.superpowers/sdd/2026-08-04-auth-guard-fail-closed/task-14-report.md`

### Task 15: Final Review Findings
- [x] Firestore `isActiveUser()` requires `active == true` and role `admin|manager|cashier`; emulator coverage denies invalid-role document and collection reads.
- [x] Frontend login and session mapping reject active users with invalid roles and clear the Firebase session.
- [x] `/api/auth/sync-claims` requires `Authorization: Bearer <Firebase ID token>` and accepts only `{ uid }` in JSON; body tokens are rejected.
- [x] WhatsApp UI configuration copy names Meta Graph API/WhatsApp Cloud API; order confirmation is documented as manual/pending because status update runtime does not send a confirmation.
- [x] WhatsApp UI logs no raw caught error objects and retains generic user-facing error text.
- [x] Production deploy docs require a public HTTPS `VITE_BACKEND_URL` and separate Express backend deployment; no deployment was executed.
- [x] Frontend tests: 186/186 passed after Vite 6.4.3 and transitive audit fixes.
- [x] Backend tests: 54/54 passed after Firebase Admin 14.2.0 and CORS configuration changes.
- [x] Production build, Firestore/Auth emulator rules, sales transaction emulator, audits, and Chromium QA completed.
- [x] Root and web audits report 0 vulnerabilities; backend retains 6 moderate transitive Firebase Admin findings without a safe compatible fix.
- [ ] Chromium valid login/logout remains skipped without dedicated `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`.
- [ ] Backend dependency audit retains 6 moderate transitive findings in `uuid/gaxios/teeny-request`; root and web audits are clean. No forced override was applied.
- [x] No deployment or commit performed.

Status: revisión. Report: `docs/final-review-2026-08-04.md`
