# ADR-0001: Custom Claims como fuente de verdad para autorización en Firestore Rules

**Fecha:** 2026-07-31
**Estado:** Aceptada
**Contexto:** Self-critique-loop de v1.2 detectó que las reglas de Firestore eran permisivas (cualquier autenticado podía leer `products`, escribir `purchase_orders`, manipular `last_cost_cents`).

## Contexto

El codebase guarda el rol del usuario en Firestore (`users/{uid}.role`) pero las reglas de Firestore no pueden confiar en un documento mutable por el propio usuario sin generar una ventana TOCTOU. La única forma segura de tomar decisiones de autorización dentro de `firestore.rules` es mediante **Firebase Auth Custom Claims**, que son parte del JWT verificado criptográficamente por Firebase.

Sin custom claims, no se puede:
- Restringir reads de datos financieros (`products.last_cost_cents`, `sales.total`, `suppliers.totalSpentCents`).
- Impedir que un cajero manipule órdenes de compra.
- Auditar quién tiene qué permisos.

## Decisión

Adoptar **Firebase Auth Custom Claims** como la fuente de verdad para autorización en `firestore.rules`. El rol en Firestore (`users/{uid}.role`) se mantiene como dato de UI, pero las reglas consultan `request.auth.token.admin` y `request.auth.token.manager`.

## Alternativas consideradas

- **A — Custom Claims (elegida).** Seguro, performante (JWT sin latencia), patrón estándar de Firebase. Requiere backend con `firebase-admin` para setear claims. Migración: usuarios existentes deben re-loguear.
- **B — Leer rol de Firestore en rules (`get(/databases/.../users/$(uid)).data.role`).** Más simple, sin custom claims. Latencia adicional por cada request (`get` cuenta como 1 lectura facturable). Ventana TOCTOU mínima pero existente.
- **C — Dejar reglas permisivas y aceptar cliente-side only.** Sin valor real de seguridad.

## Consecuencias

**Positivas:**
- Autorización verificable criptográficamente, no manipulable por el cliente.
- Latencia cero en rules (claims están en el JWT).
- Patrón estándar de Firebase, bien documentado.

**Negativas:**
- Usuarios existentes deben re-loguear después del deploy para obtener sus claims.
- Necesita un endpoint backend (`POST /api/auth/sync-claims`) que lee el rol de Firestore y setea claims vía Admin SDK.
- `registerUser` debe invocar sync-claims después de crear el documento en Firestore.

## Migración

1. Deploy backend con nuevo endpoint.
2. Deploy frontend con cambios en `authService.loginUser` y `authService.registerUser`.
3. Deploy `firestore.rules` actualizado.
4. Operador avisa a usuarios: "cierren sesión y vuelvan a entrar".
5. Verificación: tras re-login, claims están en `firebaseUser.getIdTokenResult()`.

## Cambios concretos

- `backend/whatsapp-webhook.js`: nuevo endpoint `POST /api/auth/sync-claims` con body `{ uid }`.
- `web/src/services/authService.ts`: `loginUser` y `registerUser` llaman a `VITE_BACKEND_URL/api/auth/sync-claims` con el `uid`.
- `firestore.rules` + `docs/firestore.rules`: todas las colecciones restringidas por `request.auth.token.admin/manager`.
