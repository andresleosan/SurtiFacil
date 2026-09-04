# Graph Report - Dev  (2026-09-04)

## Corpus Check
- 205 files · ~222,960 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1666 nodes · 2611 edges · 139 communities (112 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c0d49e4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- supplierService.ts
- marginService.ts
- authService.ts
- salesRoutes.js
- dependencies
- devDependencies
- scripts
- Inventory.tsx
- whatsapp-webhook.js
- compilerOptions
- apiRoutes.js
- React Frontend
- WhatsAppChat.tsx
- backend/package.json
- whatsappWebhook.test.js
- whatsappAdminRoutes.js
- firestore-rules.cjs
- whatsappAdminRoutes.test.js
- App.tsx
- createRateLimiter
- manifest.json
- anthropicService.ts
- anthropicRoutes.test.js
- whatsappProvider.test.js
- corsConfig.test.js
- anthropicAuthBinding.test.js
- WhatsApp Integration Delivery Summary
- whatsapp-init.js
- webhookErrorContract.test.js
- auth-boundary.spec.ts
- firestoreRules.test.ts
- SurtiFacil Admin
- whatsapp_conversations Collection
- seedProducts.js
- playwright.config.ts
- Payment Integration (Future)
- WhatsApp TypeScript Types
- Run Instructions
- Vite Entry HTML
- creditService.ts
- buildEnvironment.ts
- Spec: v1.3 Reposición Predictiva
- Spec: v1.2 Analytics de Margen
- Spec: v1.1 Gestión de Proveedores
- bash
- Guía de Despliegue - SurtiFácil Admin
- saleService.ts
- v2.0 Barcode Scanner + PWA Design Spec
- PurchaseOrders.tsx
- reportService.ts
- STACK - SurtiFacil
- Global Constraints
- productService.ts
- userLifecycle.test.js
- 🕐 Cronos — Agente primario de desarrollo full-stack
- Restock.tsx
- useIsMobile
- db.ts
- salesRoutes.test.js
- Global Constraints
- Plan de estabilizacion y release - 2026-08-28
- firebaseAdmin.test.js
- BRIEF.md - SurtiFácil Admin
- MODELOS.md — Cómo Cronos descubre y recomienda qué modelo usar en cada fase
- Auth Guard and Fail-Closed Verification (2026-08-04)
- Global Constraints
- Task 17 - Backend portable para staging
- Task 19 - Autorizacion coherente, usuarios y privacidad PWA
- tasks.md - SurtiFácil Admin MVP v1.0
- LOOPS.md — Ejecución continua: qué son /loop y /goal, y cómo se usan en la agencia
- ADR-0002: Cloud Run para el backend Express
- Auth Guard and Fail-Closed Data Design
- Task 18 - Integridad financiera historica de ventas
- compilerOptions
- vercel.json
- mockData.ts
- restockService.test.ts
- Capability Gap Analysis
- Frontend Craft
- Cambios
- Restricciones Globales
- Global Constraints
- web/package.json
- PurchaseOrderModal.tsx
- containerContract.test.js
- MASTER PROMPT — Despertar a Cronos
- SKILLS.md — Catálogo de skills de Cronos
- Browser QA E2E
- Pragmatic Path Selection
- Security Baseline
- Self-Critique Loop
- ADR-0001: Documento de usuario como autoridad de autorización en Firestore Rules
- Diseño: Login QA Seguro
- ConfirmDialog.tsx
- Cost Intelligence
- Database Design
- Design Benchmark
- Global Constraints
- scripts
- Advanced Architecture
- Advanced QA Strategy
- Backend Patterns
- Deploy Checklist
- External Integrations
- MVP & Roadmap Planning
- Performance Baseline
- Product Strategy
- Scalability Patterns
- Technical Governance
- ADR-0003: Backend Express en Vercel Functions mientras GCP no tenga facturación
- Final Review Report
- provisionAdmin.js
- Resumen Estimación
- Q: cronos valida este proyecto, que podemos mejorar y que tareas faltan.
- Q: ir paso a paso con lo recomendado
- Q: Trace sales creation persistence historical cost and margin reporting for Task 18
- Q: commit, push y seguir con task 19
- FASE 2: Gestión de Empleados (7 días) ✅ COMPLETADA
- FASE 1: Alertas de Stock Bajo (5 días) ✅ COMPLETADA
- FASE 3: Reportes Básicos (5 días) ✅ COMPLETADA
- seedRoles.js
- gaps-detectados.md
- copilot-instructions.md
- jsdom
- README.md
- @testing-library/jest-dom
- @types/react
- @types/react-dom
- @vitest/ui
- tailwindcss

## God Nodes (most connected - your core abstractions)
1. `useIsMobile()` - 29 edges
2. `scripts` - 21 edges
3. `getSales()` - 20 edges
4. `Product` - 19 edges
5. `getSafeApiError()` - 17 edges
6. `compilerOptions` - 17 edges
7. `createRateLimiter()` - 16 edges
8. `Global Constraints` - 16 edges
9. `PurchaseOrders()` - 15 edges
10. `Icon()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `SurtiFacil Admin` --semantically_similar_to--> `SmartMarket Admin Product Overview`  [INFERRED] [semantically similar]
  README.md → docs/product-overview.md
- `SaaS Multi-tenant Evolution` --conceptually_related_to--> `React Frontend`  [INFERRED]
  README.md → AGENTS.md
- `Cloud Functions` --conceptually_related_to--> `Express Backend Server`  [INFERRED]
  docs/WHATSAPP_BEST_PRACTICES.md → AGENTS.md
- `WhatsApp Integration Delivery Summary` --references--> `WhatsApp Integration Strategy`  [EXTRACTED]
  WHATSAPP_DELIVERY.md → docs/WHATSAPP_INTEGRATION.md
- `WhatsApp Integration Delivery Summary` --references--> `WhatsApp Executive Summary`  [EXTRACTED]
  WHATSAPP_DELIVERY.md → docs/WHATSAPP_README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **WhatsApp Full Stack Integration** — concept_whatsapp_integration, concept_whatsapp_business_api, concept_firebase_firestore, concept_express_backend, concept_react_frontend [EXTRACTED 0.95]
- **WhatsApp Data Layer** — concept_whatsapp_conversations_col, concept_whatsapp_messages_col, concept_whatsapp_orders_col [EXTRACTED 0.95]
- **Admin Application Modules** — concept_inventory_management, concept_sales_pos, concept_dashboard, concept_employee_management, concept_supplier_management [EXTRACTED 0.90]

## Communities (139 total, 18 thin omitted)

### Community 0 - "supplierService.ts"
Cohesion: 0.29
Nodes (17): formatCents(), leadTimeLabel(), Suppliers(), OrderStatus, addSupplier(), ALLOWED_TRANSITIONS, cancelOrder(), createOrder() (+9 more)

### Community 1 - "marginService.ts"
Cohesion: 0.15
Nodes (19): MarginReports(), PIE_COLORS, CategoryMargin, escapeCsvCell(), finalizeBucket(), getMarginByCategory(), getMarginDaily(), getMarginSummary() (+11 more)

### Community 2 - "authService.ts"
Cohesion: 0.10
Nodes (46): Login(), getRoleBadgeStyle(), UserManagement(), auth, AuthStateError, AuthStateErrorCode, clearFirebaseSession(), completeFirebaseLogin() (+38 more)

### Community 3 - "salesRoutes.js"
Cohesion: 0.11
Nodes (20): ACTIVE_ROLES, COST_SOURCES, {
  createAuthenticatedRateLimitMiddleware,
  createFirebaseActiveRoleMiddleware,
}, { createRateLimiter }, createSalesHandler(), express, { FieldValue }, { getSafeApiError, getSafeApiLogMessage } (+12 more)

### Community 4 - "dependencies"
Cohesion: 0.13
Nodes (15): firebase, html5-qrcode, react, react-dom, recharts, vite-plugin-pwa, dependencies, firebase (+7 more)

### Community 5 - "devDependencies"
Cohesion: 0.11
Nodes (19): autoprefixer, postcss, @testing-library/react, @testing-library/user-event, @types/node, typescript, vite, @vitejs/plugin-react (+11 more)

### Community 6 - "scripts"
Cohesion: 0.06
Nodes (31): concurrently, devDependencies, concurrently, @playwright/test, engines, node, name, private (+23 more)

### Community 7 - "Inventory.tsx"
Cohesion: 0.10
Nodes (32): AddProductModal(), AddProductModalProps, CATEGORIES, EMPTY_FORM, InputMode, MODES, BarcodeScanner(), BarcodeScannerProps (+24 more)

### Community 8 - "whatsapp-webhook.js"
Cohesion: 0.07
Nodes (27): admin, ALLOWED_ORIGINS, app, cors, { createAnthropicRouter }, { createDeactivateUserHandler }, { createFirebaseAdminFacade, initializeFirebaseAdmin }, {
  createFirebaseAdminRoleMiddleware,
  createWhatsAppRateLimitMiddlewares,
  createWhatsAppSendHandler,
} (+19 more)

### Community 9 - "compilerOptions"
Cohesion: 0.08
Nodes (25): DOM, DOM.Iterable, ES2020, src, vite/client, compilerOptions, allowJs, allowSyntheticDefaultImports (+17 more)

### Community 10 - "apiRoutes.js"
Cohesion: 0.12
Nodes (18): createSyncClaimsHandler(), createWhatsAppTestHandler(), { getSafeApiError, getSafeApiLogMessage }, logApiError(), { resolveClaimsForUser: defaultResolveClaimsForUser }, sendApiError(), resolveClaimsForUser(), VALID_ROLES (+10 more)

### Community 11 - "React Frontend"
Cohesion: 0.12
Nodes (22): Address Extraction, AI Order Processing (Future), Cloud Functions, Conversation Archiving, Dashboard Control Panel, Employee Management, Express Backend Server, Firebase Firestore (+14 more)

### Community 12 - "WhatsAppChat.tsx"
Cohesion: 0.14
Nodes (20): TabType, WhatsAppChat(), archiveConversation(), auth, createWhatsAppOrder(), getConversations(), getMessages(), getWhatsAppOrders() (+12 more)

### Community 13 - "backend/package.json"
Cohesion: 0.09
Nodes (22): dependencies, cors, dotenv, express, firebase-admin, node-fetch, engines, node (+14 more)

### Community 14 - "whatsappWebhook.test.js"
Cohesion: 0.15
Nodes (21): assert, {
  createWebhookRateLimiter,
  createWhatsAppWebhookHandler,
  registerWhatsAppWebhookRoutes,
}, crypto, express, http, requestRoute(), requestVerification(), test (+13 more)

### Community 15 - "whatsappAdminRoutes.js"
Cohesion: 0.14
Nodes (22): createAnthropicHandler(), createAnthropicRateLimiter(), createAnthropicRouter(), {
  createAuthenticatedRateLimitMiddleware,
  createFirebaseAdminRoleMiddleware,
}, { createRateLimiter }, express, { getSafeApiError, getSafeApiLogMessage }, sendApiError() (+14 more)

### Community 16 - "firestore-rules.cjs"
Cohesion: 0.26
Nodes (12): assert, authHeaders(), call(), create(), createUser(), read(), readCollection(), remove() (+4 more)

### Community 17 - "whatsappAdminRoutes.test.js"
Cohesion: 0.21
Nodes (11): assert, authorizedMiddleware(), {
  createFirebaseAdminRoleMiddleware,
  createWhatsAppRateLimitMiddlewares,
  createWhatsAppRateLimitMiddleware,
  createWhatsAppSendHandler,
}, { createRateLimiter }, { createWhatsAppTestHandler }, express, fakeAdmin(), fakeDb() (+3 more)

### Community 18 - "App.tsx"
Cohesion: 0.05
Nodes (46): App(), PAGE_COMPONENTS, ALL_ROLES, canAccessPage(), hashForPage(), isPage(), MANAGER_ROLES, Page (+38 more)

### Community 19 - "createRateLimiter"
Cohesion: 0.14
Nodes (11): createSalesRateLimiter(), assert, {
  createProvisionUserHandler,
  createRateLimiter,
}, test, validRequest, createProvisionUserHandler(), createRateLimiter(), { FieldValue } (+3 more)

### Community 20 - "manifest.json"
Cohesion: 0.12
Nodes (15): business, productivity, background_color, categories, description, display, icons, id (+7 more)

### Community 21 - "anthropicService.ts"
Cohesion: 0.18
Nodes (13): AudioUploadAI(), AudioUploadAIProps, RecognitionErrorEvent, RecognitionEvent, ImageUploadAI(), ImageUploadAIProps, analyzeProductAudio(), analyzeProductImage() (+5 more)

### Community 22 - "anthropicRoutes.test.js"
Cohesion: 0.29
Nodes (6): assert, { createAnthropicRouter }, express, http, requestRoute(), test

### Community 23 - "whatsappProvider.test.js"
Cohesion: 0.24
Nodes (9): assert, { createWhatsAppMessageSender, DEFAULT_FETCH }, fs, path, serverSource, test, createWhatsAppMessageSender(), DEFAULT_FETCH (+1 more)

### Community 24 - "corsConfig.test.js"
Cohesion: 0.33
Nodes (5): DEFAULT_FRONTEND_ORIGINS, parseFrontendOrigins(), assert, { parseFrontendOrigins }, test

### Community 25 - "anthropicAuthBinding.test.js"
Cohesion: 0.29
Nodes (6): assert, fs, path, routeSource, test, webhookSource

### Community 26 - "WhatsApp Integration Delivery Summary"
Cohesion: 0.57
Nodes (7): WhatsApp Architecture Diagrams, WhatsApp Best Practices, WhatsApp Implementation Guide, WhatsApp Integration Strategy, WhatsApp Quick Start Guide, WhatsApp Executive Summary, WhatsApp Integration Delivery Summary

### Community 27 - "whatsapp-init.js"
Cohesion: 0.43
Nodes (6): checkPath(), colors, fs, log(), main(), path

### Community 28 - "webhookErrorContract.test.js"
Cohesion: 0.33
Nodes (5): assert, fs, path, test, webhookSource

### Community 31 - "SurtiFacil Admin"
Cohesion: 0.67
Nodes (3): Project Architecture, SmartMarket Admin Product Overview, SurtiFacil Admin

### Community 32 - "whatsapp_conversations Collection"
Cohesion: 1.00
Nodes (3): whatsapp_conversations Collection, whatsapp_messages Collection, whatsapp_orders Collection

### Community 41 - "creditService.ts"
Cohesion: 0.07
Nodes (49): CurrentUserContext, CurrentUserProvider, useCurrentUser(), useHasRole(), Credits(), CustomerDetail(), CustomerDetailProps, CustomerForm (+41 more)

### Community 42 - "buildEnvironment.ts"
Cohesion: 0.38
Nodes (3): assertProductionBackendUrl(), LOCAL_HOSTNAMES, VENDOR_CHUNKS

### Community 43 - "Spec: v1.3 Reposición Predictiva"
Cohesion: 0.06
Nodes (33): Algoritmo por producto, Archivos nuevos y editados, Arquitectura, Cambios en código existente, Carga y performance, Comandos de verificación, Contexto y motivo, Convención de unidades (+25 more)

### Community 44 - "Spec: v1.2 Analytics de Margen"
Cohesion: 0.06
Nodes (31): Archivos nuevos y editados, Arquitectura, Cambios en código existente, Comandos de verificación, Contexto y motivo, Convención de unidades, Criterios de aceptación, Decisiones de diseño (tomadas en brainstorming) (+23 more)

### Community 45 - "Spec: v1.1 Gestión de Proveedores"
Cohesion: 0.06
Nodes (30): 1. Alta de proveedor, 2. Crear orden de compra (`draft` → `ordered`), 3. Recepción parcial, 4. Transacción de recepción (atómica), 5. Cancelación, Archivos nuevos y editados, Arquitectura, Badges de estado (+22 more)

### Community 46 - "bash"
Cohesion: 0.07
Nodes (28): agent, cronos, cat *credential*, cat *.env*, cat *secret*, env, git push --force*, history (+20 more)

### Community 47 - "Guía de Despliegue - SurtiFácil Admin"
Cohesion: 0.07
Nodes (27): 1. Login en Firebase, 2. Asociar el proyecto, 3. Habilitar servicios en Firebase Console, Backend en Vercel Functions (ADR-0003), Backend Express, Cache y Headers Configurados, Checklist Pre-Producción, Comandos Rápidos (+19 more)

### Community 48 - "saleService.ts"
Cohesion: 0.19
Nodes (20): Dashboard(), DashboardMetrics, EMPTY_METRICS, saleDate(), addLocalSale(), getLocalSales(), mockProducts, refreshProducts() (+12 more)

### Community 49 - "v2.0 Barcode Scanner + PWA Design Spec"
Cohesion: 0.10
Nodes (19): AddProductModal Flow, Architecture, CreateSale Flow, Data Model Changes, Dependencies, Error Handling, Goal, Integration Flows (+11 more)

### Community 50 - "PurchaseOrders.tsx"
Cohesion: 0.16
Nodes (16): formatCents(), formatDate(), getStatusBadgeStyle(), getStatusLabel(), itemCount(), PurchaseOrders(), shortId(), formatCents() (+8 more)

### Community 51 - "reportService.ts"
Cohesion: 0.23
Nodes (15): COLORS, Reports(), DailySales, formatCurrency(), formatNumber(), getDailySales(), getSalesByCategory(), getSalesSummary() (+7 more)

### Community 52 - "STACK - SurtiFacil"
Cohesion: 0.11
Nodes (18): 1. Mantener un monolito modular, 2. Separar los artefactos web y backend, 3. Usar Cloud Run para el backend con estrategia free-tier-first, 4. Mantener la autoridad de acceso en el documento de usuario, Arquitectura actual, Calidad y pruebas, Checkpoint aprobado, Clasificacion (+10 more)

### Community 53 - "Global Constraints"
Cohesion: 0.11
Nodes (17): Auth Guard and Fail-Closed Data Implementation Plan, Global Constraints, Task 10: Release Documentation and Auth Error State, Task 11: WhatsApp Admin Authorization and Outbound Contract, Task 12: WhatsApp Abuse and Provider Resilience, Task 13: POS Authorization and Proxy Contracts, Task 14: Server-Side POS Transaction, Task 15: Final Review Findings (+9 more)

### Community 54 - "productService.ts"
Cohesion: 0.20
Nodes (15): app, db, firebaseConfig, addProduct(), deleteProduct(), emitMock(), isMockMode(), mockListeners (+7 more)

### Community 55 - "userLifecycle.test.js"
Cohesion: 0.15
Nodes (12): assert, { createDeactivateUserHandler, isValidUid }, { createRateLimiter }, fs, path, test, createDeactivateUserHandler(), { createRateLimiter } (+4 more)

### Community 56 - "🕐 Cronos — Agente primario de desarrollo full-stack"
Cohesion: 0.12
Nodes (15): Clasificación de proyectos, Componentes globales de la agencia, 🕐 Cronos — Agente primario de desarrollo full-stack, De 10 Titanes a un único agente — por qué, Delegación controlada, El agente, El ciclo de autocrítica (núcleo de la calidad), Estados de tarea (+7 more)

### Community 57 - "Restock.tsx"
Cohesion: 0.21
Nodes (14): ALL_URGENCIES, formatDays(), Restock(), URGENCY_BADGE, URGENCY_LABELS, calculateCategoryAverage(), calculateVelocity(), classifyUrgency() (+6 more)

### Community 58 - "useIsMobile"
Cohesion: 0.24
Nodes (12): formatDate(), formatPrice(), getPaymentMethodLabel(), PAYMENT_LABELS, SaleDetails(), Sales(), canMatch(), DESKTOP_WIDE_QUERY (+4 more)

### Community 59 - "db.ts"
Cohesion: 0.27
Nodes (9): StockAlerts(), Product, ProductsState, checkLowStock(), getCriticalAlertCount(), getStockAlertCount(), StockAlert, reportMock (+1 more)

### Community 60 - "salesRoutes.test.js"
Cohesion: 0.16
Nodes (10): createSalesRouter(), assert, { createRateLimiter }, { createSalesRouter }, express, http, requestRoute(), routerFor() (+2 more)

### Community 61 - "Global Constraints"
Cohesion: 0.13
Nodes (14): Final Checklist, Global Constraints, Task 10: Unit Tests, Task 11: Final Verification + Deploy, Task 1: Data Model + Barcode Field, Task 2: Install Dependencies, Task 3: BarcodeScanner Component, Task 4: useBarcode Hook (+6 more)

### Community 62 - "Plan de estabilizacion y release - 2026-08-28"
Cohesion: 0.13
Nodes (15): Fuera de alcance hasta post-release, Plan de estabilizacion y release - 2026-08-28, Task 16: Arquitectura y costo free-tier-first, Task 17: Backend portable para staging sin llaves JSON, Task 18: Integridad financiera historica de ventas, Task 19: Autorizacion coherente, usuarios y privacidad PWA, Task 20: Idempotencia y resiliencia de WhatsApp, Task 21: Rendimiento y costo de Firestore (+7 more)

### Community 63 - "firebaseAdmin.test.js"
Cohesion: 0.21
Nodes (12): createFirebaseAdminFacade(), createFirebaseAppOptions(), createFirebaseCredential(), fs, initializeFirebaseAdmin(), path, assert, {
  createFirebaseAdminFacade,
  createFirebaseAppOptions,
  createFirebaseCredential,
  initializeFirebaseAdmin,
} (+4 more)

### Community 64 - "BRIEF.md - SurtiFácil Admin"
Cohesion: 0.14
Nodes (13): Análisis de Features Pendientes, Backlog de estabilizacion priorizado, Backlog Priorizado (RICE Simplificado), BRIEF.md - SurtiFácil Admin, Definición MVP v1.0, Estado Actual, Features Incluidos, Features NO Incluidos (v1.0) (+5 more)

### Community 65 - "MODELOS.md — Cómo Cronos descubre y recomienda qué modelo usar en cada fase"
Cohesion: 0.14
Nodes (13): Codex CLI, Cómo se usa, Ejemplo ilustrativo (NO es una recomendación — es solo para entender el tipo de resultado esperado), Modelos locales (opcional), MODELOS.md — Cómo Cronos descubre y recomienda qué modelo usar en cada fase, OpenCode, Paso 1 — Descubrir qué hay realmente disponible en esta máquina, Paso 2 — Qué conviene en cada fase (aplica esto a lo que exista HOY) (+5 more)

### Community 66 - "Auth Guard and Fail-Closed Verification (2026-08-04)"
Cohesion: 0.14
Nodes (14): Auth Guard and Fail-Closed Verification (2026-08-04), Integración de cambios de seguridad (2026-08-05), Seguimiento QA autenticado (2026-08-05), Task 10: Release Documentation and Auth Error State, Task 11: WhatsApp Admin Authorization and Outbound Contract, Task 12: WhatsApp Abuse and Provider Resilience, Task 13: POS Authorization and Proxy Contracts, Task 14: Server-Side POS Transaction (+6 more)

### Community 67 - "Global Constraints"
Cohesion: 0.17
Nodes (11): Final Verification, Global Constraints, Task 1: Extend Supplier Type and Restock Service Skeleton, Task 2: Implement Full Algorithm and Tests, Task 3: Supplier Form - Add lead_time_days Input, Task 4: Suppliers Table - Show Lead Time Column, Task 5: Restock UI - Page Component, Task 6: PurchaseOrderModal - Accept initialItems Prop (+3 more)

### Community 68 - "Task 17 - Backend portable para staging"
Cohesion: 0.17
Nodes (11): Autocritica de seguridad, Cloud Run, Credenciales, Degradacion de integraciones, Evidencia obtenida, Local, Pruebas avanzadas, Resultado (+3 more)

### Community 69 - "Task 19 - Autorizacion coherente, usuarios y privacidad PWA"
Cohesion: 0.17
Nodes (11): Autocritica de seguridad, Consistencia y rollback, Contrato de baja de usuarios, Esquema aditivo, Evidencia de verificacion, Implementacion completada, Matriz de acceso, Privacidad PWA (+3 more)

### Community 70 - "tasks.md - SurtiFácil Admin MVP v1.0"
Cohesion: 0.17
Nodes (11): 4.1 Configuración (1 día) ✅, 4.2 Tests Unitarios (2 días) ✅, 5.1 Preparación (1 día) ✅, 5.2 Despliegue (1 día) ✅, Checklist Pre-Entrega - Estado Actual, Commits Recientes (v2.0), FASE 4: Testing y QA (3 días) ✅ COMPLETADA, FASE 5: Deploy (2 días) - PREPARACIÓN DOCUMENTADA, DEPLOY NO VERIFICADO (+3 more)

### Community 71 - "LOOPS.md — Ejecución continua: qué son /loop y /goal, y cómo se usan en la agencia"
Cohesion: 0.18
Nodes (10): Capa 1 — Comandos nativos (sin dependencias, disponible siempre), Capa 2 — Plugin de continuación automática (opcional, Nivel 2/3, con la misma disciplina que Superpowers), Cómo se usa, Dos capas, no una, LOOPS.md — Ejecución continua: qué son /loop y /goal, y cómo se usan en la agencia, Nota de alcance: Codex CLI y VS Code (v4.0.0), Paso 1 — Descubrir el estado actual (esta tabla va a quedar vieja; no la copies sin revisar), Paso 2 — Antes de confiar en cualquiera de estos, en producción (+2 more)

### Community 72 - "ADR-0002: Cloud Run para el backend Express"
Cohesion: 0.18
Nodes (10): ADR-0002: Cloud Run para el backend Express, Alternativas consideradas, Consecuencias, Contexto, Controles de costo, Decision, Negativas, Plan de adopcion (+2 more)

### Community 73 - "Auth Guard and Fail-Closed Data Design"
Cohesion: 0.18
Nodes (10): Approved Approach, Architecture, Auth Guard and Fail-Closed Data Design, Context, Data Contract, Goal, Out of Scope, Security Rules (+2 more)

### Community 74 - "Task 18 - Integridad financiera historica de ventas"
Cohesion: 0.18
Nodes (10): Autocritica de seguridad y QA, Compatibilidad y migracion, Contrato de datos v2, Datos no recuperables, Evidencia de verificacion, Implementacion completada, Problema, Rollback (+2 more)

### Community 75 - "compilerOptions"
Cohesion: 0.18
Nodes (10): vite.config.ts, compilerOptions, allowJs, allowSyntheticDefaultImports, composite, module, moduleResolution, types (+2 more)

### Community 76 - "vercel.json"
Cohesion: 0.18
Nodes (10): maxDuration, buildCommand, framework, functions, api/index.js, headers, installCommand, outputDirectory (+2 more)

### Community 77 - "mockData.ts"
Cohesion: 0.18
Nodes (10): CartPanelProps, PaymentMethod, SaleItem, baseProducts, localCreditEntries, localSales, mockOrders, mockSales (+2 more)

### Community 78 - "restockService.test.ts"
Cohesion: 0.20
Nodes (8): Sale, SalesPage, daysAgo(), makeSale(), mockGetProducts, mockGetSales, mockGetSuppliers, NOW

### Community 79 - "Capability Gap Analysis"
Cohesion: 0.20
Nodes (9): Capability Gap Analysis, Cuándo se activa, Entregable, Las preguntas del análisis, Por qué esto no es lo mismo que `RIESGOS.md` o `ROADMAP.md`, Promoción a skill global, Qué NO hacer, Registro en `LECCIONES.md` (siempre, haya o no propuesta de skill) (+1 more)

### Community 80 - "Frontend Craft"
Cohesion: 0.20
Nodes (9): Cuándo bajar el rigor, Cuándo se activa, Frontend Craft, La pregunta antes de cualquier decisión visual, Piso de calidad — no negociable, independiente de cuánto riesgo se tome arriba, Proceso — dos pasadas, no una, Salida esperada, Sobre Mobbin como referencia (+1 more)

### Community 81 - "Cambios"
Cohesion: 0.20
Nodes (9): Cambios, Componentes compartidos (`web/src/components/ui/`), Datos y rendimiento, Diagnóstico previo, Optimización mobile y tablet - 2026-09-04, Pantallas, Pendiente / fuera de alcance, Shell responsivo (`web/src/components/layout/`) (+1 more)

### Community 82 - "Restricciones Globales"
Cohesion: 0.20
Nodes (9): Restricciones Globales, Task 1: Modelos de Datos y Mock Data, Task 2: Servicio de Proveedores (CRUD), Task 3: UI de Proveedores, Task 4: Servicio de Órdenes de Compra, Task 5: UI de Órdenes de Compra (Lista y Modal), Task 6: Recepción de Órdenes (Transacción Atómica), Task 7: Reglas Firestore, Índices y Verificación Final (+1 more)

### Community 83 - "Global Constraints"
Cohesion: 0.20
Nodes (9): Final Verification, Global Constraints, Task 1: Extend Product Type and Resolve Cost Utility, Task 2: Margin Service - Summary and Daily Aggregation, Task 3: Margin Service - Top Products and Categories, Task 4: Atomic Cost Recording in Reception, Task 5: Margin Reports UI - KPIs and Daily Chart, Task 6: Margin Reports UI - Categories and Top Tables (+1 more)

### Community 84 - "web/package.json"
Cohesion: 0.20
Nodes (9): name, overrides, @grpc/grpc-js, protobufjs, @protobufjs/utf8, websocket-driver, private, type (+1 more)

### Community 85 - "PurchaseOrderModal.tsx"
Cohesion: 0.31
Nodes (8): newRow(), PurchaseOrderModal(), PurchaseOrderModalProps, RowItem, SupplierModal(), SupplierModalProps, OrderItem, Supplier

### Community 86 - "containerContract.test.js"
Cohesion: 0.25
Nodes (7): assert, dockerfile, dockerignore, fs, path, root, test

### Community 87 - "MASTER PROMPT — Despertar a Cronos"
Cohesion: 0.25
Nodes (7): Delegación controlada, Flujo A — Proyecto nuevo, Flujo B — Proyecto existente o externo, MASTER PROMPT — Despertar a Cronos, Paso 0 — Detecta la plataforma y la situación, Paso 7 — Construcción en ciclo (ambos flujos), Reglas que nunca rompes

### Community 88 - "SKILLS.md — Catálogo de skills de Cronos"
Cohesion: 0.25
Nodes (7): Componentes externos que complementan a estas skills, Cómo funcionan (mecanismo, no listado a mano), Qué NO hacer con las skills, Skills avanzadas — se activan según el nivel del proyecto (mayormente 2 y 3), Skills base — se aplican en cualquier nivel de proyecto (1, 2 o 3), SKILLS.md — Catálogo de skills de Cronos, Skills promovidas, pendientes de revisión curada

### Community 89 - "Browser QA E2E"
Cohesion: 0.25
Nodes (7): Browser QA E2E, Cuándo se activa, Cómo se ejecuta, Disciplina no negociable, Entregable, Qué cubre (Fase 1, alcance completo), Qué NO cubre (ver `advanced-qa-strategy` y roadmap)

### Community 90 - "Pragmatic Path Selection"
Cohesion: 0.25
Nodes (7): Datos externos y secretos, Formato de salida, Gates obligatorios, Pragmatic Path Selection, Principio, Receta de decision, Red flags

### Community 91 - "Security Baseline"
Cohesion: 0.25
Nodes (7): Checklist mínimo, Cuándo se activa, Entregables según el contexto, Lo que esta skill NO cubre, Protecciones que ya da la plataforma (verifícalas, no las asumas — varían por plataforma), Regla de oro, Security Baseline

### Community 92 - "Self-Critique Loop"
Cohesion: 0.25
Nodes (7): Criterio de corte (cuándo dejar de iterar), Cuándo se activa, El loop, paso a paso, Entregable, Mitigación de la falta de una segunda mirada independiente, Por qué esto no es "autoaprobarse", Self-Critique Loop

### Community 93 - "ADR-0001: Documento de usuario como autoridad de autorización en Firestore Rules"
Cohesion: 0.25
Nodes (7): ADR-0001: Documento de usuario como autoridad de autorización en Firestore Rules, Alternativas consideradas, Cambios concretos, Consecuencias, Contexto, Decisión, Migración

### Community 94 - "Diseño: Login QA Seguro"
Cohesion: 0.25
Nodes (7): Alcance, Diseño: Login QA Seguro, Flujo, Fuera de Alcance, Objetivo, Seguridad y Errores, Verificación

### Community 95 - "ConfirmDialog.tsx"
Cohesion: 0.39
Nodes (5): ConfirmDialogProps, ConfirmOptions, PendingConfirm, useConfirm(), ConfirmHarness()

### Community 96 - "Cost Intelligence"
Cohesion: 0.29
Nodes (6): Cost Intelligence, Cuándo se activa, Entregable, Qué cubre, Qué NO hacer, Severidad de un hallazgo de costo

### Community 97 - "Database Design"
Cohesion: 0.29
Nodes (6): Cuándo se activa, Database Design, Disciplina no negociable, Entregable, Lo que esta skill NO decide, Preguntas antes de aplicar una migración

### Community 98 - "Design Benchmark"
Cohesion: 0.29
Nodes (6): Cuándo se activa, Design Benchmark, Entregable, Proceso, Qué NO hacer, Relación con `frontend-craft`

### Community 99 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Global Constraints, Login QA Seguro Implementation Plan, Self-Review, Task 1: Aislar credenciales del caso E2E autenticado, Task 2: Crear la identidad QA con el contrato de sesión completo, Task 3: Registrar evidencia y revisar la cuenta temporal

### Community 100 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, preview, test, test:ui, test:watch

### Community 101 - "Advanced Architecture"
Cohesion: 0.33
Nodes (5): Advanced Architecture, Cuándo se activa, Patrones a considerar (solo si aplican), Preguntas antes de separar en servicios, Salida esperada

### Community 102 - "Advanced QA Strategy"
Cohesion: 0.33
Nodes (5): Advanced QA Strategy, Capas de prueba a considerar (más allá de E2E funcional), Cuándo NO aplica, Cuándo se activa, Salida esperada

### Community 103 - "Backend Patterns"
Cohesion: 0.33
Nodes (5): Backend Patterns, Cuándo se activa, Disciplina no negociable, Entregable, Preguntas antes de dar un endpoint por terminado

### Community 104 - "Deploy Checklist"
Cohesion: 0.33
Nodes (5): Condición de despliegue (innegociable), Cuándo se activa, Deploy Checklist, Entregable, Responsabilidades

### Community 105 - "External Integrations"
Cohesion: 0.33
Nodes (5): Cuándo se activa, Disciplina no negociable, Entregable, External Integrations, Preguntas antes de dar una integración por terminada

### Community 106 - "MVP & Roadmap Planning"
Cohesion: 0.33
Nodes (5): Criterio para definir el MVP, Cuándo se activa, Estructura del roadmap, MVP & Roadmap Planning, Salida esperada

### Community 107 - "Performance Baseline"
Cohesion: 0.33
Nodes (5): Cuándo se activa, Disciplina no negociable, Entregable, Orden de las soluciones (de menor a mayor complejidad), Performance Baseline

### Community 108 - "Product Strategy"
Cohesion: 0.33
Nodes (5): Cuándo se activa, Marco de priorización (RICE simplificado), Preguntas obligatorias antes de priorizar, Product Strategy, Salida esperada

### Community 109 - "Scalability Patterns"
Cohesion: 0.33
Nodes (5): Cuándo se activa, Orden de las soluciones (de menor a mayor complejidad - no saltarse pasos), Salida esperada, Scalability Patterns, Señal de alarma

### Community 110 - "Technical Governance"
Cohesion: 0.33
Nodes (5): Checklist antes de adoptar una tecnología nueva, Cuándo se activa, Formato de un ADR (Architecture Decision Record), Salida esperada, Technical Governance

### Community 111 - "ADR-0003: Backend Express en Vercel Functions mientras GCP no tenga facturación"
Cohesion: 0.33
Nodes (5): ADR-0003: Backend Express en Vercel Functions mientras GCP no tenga facturación, Consecuencias, Contexto, Decisión, Notas de implementación

### Community 112 - "Final Review Report"
Cohesion: 0.33
Nodes (5): Final Review Report, Findings Resolved, Residuals, TDD Evidence, Verification

### Community 113 - "provisionAdmin.js"
Cohesion: 0.47
Nodes (5): loadFirebaseAdmin(), main(), parseArgs(), path, VALID_ROLES

### Community 114 - "Resumen Estimación"
Cohesion: 0.33
Nodes (6): MVP v1.0 - FEATURES COMPLETADOS, DEPLOY NO VERIFICADO, Resumen Estimación, v1.1 Gestión de Proveedores ✅ COMPLETADO, v1.2 Analytics de Margen ✅ COMPLETADO, v1.3 Reposición Predictiva ✅ COMPLETADO, v2.0 Barcode Scanner + PWA ✅ COMPLETADO

### Community 115 - "Q: cronos valida este proyecto, que podemos mejorar y que tareas faltan."
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: cronos valida este proyecto, que podemos mejorar y que tareas faltan., Source Nodes

### Community 116 - "Q: ir paso a paso con lo recomendado"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: ir paso a paso con lo recomendado, Source Nodes

### Community 117 - "Q: Trace sales creation persistence historical cost and margin reporting for Task 18"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Trace sales creation persistence historical cost and margin reporting for Task 18, Source Nodes

### Community 118 - "Q: commit, push y seguir con task 19"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: commit, push y seguir con task 19, Source Nodes

### Community 119 - "FASE 2: Gestión de Empleados (7 días) ✅ COMPLETADA"
Cohesion: 0.40
Nodes (5): 2.1 Modelo de Datos (1 día) ✅, 2.2 Servicio de Auth (2 días) ✅, 2.3 UI Empleados (2 días) ✅, 2.4 Integración (2 días) ✅, FASE 2: Gestión de Empleados (7 días) ✅ COMPLETADA

### Community 120 - "FASE 1: Alertas de Stock Bajo (5 días) ✅ COMPLETADA"
Cohesion: 0.50
Nodes (4): 1.1 Diseño de Datos (1 día) ✅, 1.2 Backend (2 días) ✅, 1.3 Frontend (2 días) ✅, FASE 1: Alertas de Stock Bajo (5 días) ✅ COMPLETADA

### Community 121 - "FASE 3: Reportes Básicos (5 días) ✅ COMPLETADA"
Cohesion: 0.50
Nodes (4): 3.1 Datos y Servicios (2 días) ✅, 3.2 UI Reportes (2 días) ✅, 3.3 Dashboard Integration (1 día) ✅, FASE 3: Reportes Básicos (5 días) ✅ COMPLETADA

## Knowledge Gaps
- **897 isolated node(s):** `express`, `{ getSafeApiError, getSafeApiLogMessage }`, `{ createRateLimiter }`, `{
  createAuthenticatedRateLimitMiddleware,
  createFirebaseAdminRoleMiddleware,
}`, `SAFE_API_ERRORS` (+892 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1014 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useIsMobile()` connect `useIsMobile` to `supplierService.ts`, `marginService.ts`, `authService.ts`, `Inventory.tsx`, `creditService.ts`, `WhatsAppChat.tsx`, `App.tsx`, `PurchaseOrders.tsx`, `reportService.ts`, `Restock.tsx`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `createRateLimiter()` connect `createRateLimiter` to `salesRoutes.js`, `whatsapp-webhook.js`, `whatsappAdminRoutes.js`, `whatsappAdminRoutes.test.js`, `userLifecycle.test.js`, `salesRoutes.test.js`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `Product` connect `db.ts` to `supplierService.ts`, `marginService.ts`, `Inventory.tsx`, `creditService.ts`, `mockData.ts`, `restockService.test.ts`, `saleService.ts`, `App.tsx`, `PurchaseOrderModal.tsx`, `productService.ts`, `Restock.tsx`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getSales()` (e.g. with `marginService.test.ts` and `reportService.test.ts`) actually correct?**
  _`getSales()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `express`, `{ getSafeApiError, getSafeApiLogMessage }`, `{ createRateLimiter }` to the rest of the system?**
  _897 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09502262443438914 - nodes in this community are weakly interconnected._
- **Should `salesRoutes.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1067193675889328 - nodes in this community are weakly interconnected._