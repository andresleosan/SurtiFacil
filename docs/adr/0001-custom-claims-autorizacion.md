# ADR-0001: Documento de usuario como autoridad de autorización en Firestore Rules

**Fecha:** 2026-07-31
**Estado:** Aceptada
**Contexto:** Self-critique-loop de v1.2 detectó que las reglas de Firestore eran permisivas (cualquier autenticado podía leer `products`, escribir `purchase_orders`, manipular `last_cost_cents`).

## Contexto

El codebase guarda el estado activo y el rol del usuario en el documento protegido `users/{uid}`. Las reglas leen ese documento mediante helpers server-side; el usuario solo puede leer su propio documento y no puede cambiar su propio rol. Los custom claims se mantienen como datos derivados/cache para el backend, pero nunca son suficientes para autorizar una operación Firestore.

Sin validar el documento protegido en rules, los claims pueden quedar obsoletos después de un cambio de rol o estado activo.

## Decisión

Adoptar el documento activo `/users/{uid}` como autoridad de autorización en `firestore.rules`. `isActiveUser()`, `isAdminUser()` e `isManagerUser()` leen el documento protegido y aplican el estado y rol vigente en cada operación. Custom claims siguen derivándose para optimización del backend, pero no pueden conceder privilegios que contradigan el documento.

## Alternativas consideradas

- **A — Documento protegido (elegida).** El cambio de rol o estado activo tiene efecto inmediato y las reglas validan la misma fuente que la UI. Requiere lecturas `get()` en rules y proteger estrictamente la colección `users`.
- **B — Custom Claims como autoridad.** Menor latencia por request, pero puede quedar obsoleto hasta refrescar el token y permitir privilegios stale después de una mutación de rol.
- **C — Dejar reglas permisivas y aceptar cliente-side only.** Sin valor real de seguridad.

## Consecuencias

**Positivas:**
- Cambios de rol y desactivación efectivos inmediatamente en rules y frontend.
- El cliente no puede modificar el documento de otro usuario ni elevar su propio rol.
- Claims derivados siguen disponibles para integraciones que los necesiten, sin convertirse en un bypass.

**Negativas:**
- Cada operación protegida incurre en las lecturas de rules necesarias para validar el documento de usuario.
- El endpoint `POST /api/auth/sync-claims` es una sincronización derivada y debe rechazar usuarios inactivos o con rol inválido.
- `registerUser` debe invocar sync-claims después de crear el documento en Firestore.

## Migración

1. Deploy backend con nuevo endpoint.
2. Deploy frontend con cambios en `authService.loginUser` y `authService.registerUser`.
3. Deploy `firestore.rules` actualizado.
4. Ejecutar `npm run test:rules` contra los emuladores Auth/Firestore.
5. Verificación: cambiar rol y estado activo en el emulador y confirmar el efecto inmediato en rules y UI.

## Cambios concretos

- `backend/whatsapp-webhook.js`: endpoint `POST /api/auth/sync-claims` con header `Authorization: Bearer <Firebase ID token>` y body `{ uid }` que genera claims derivados.
- `web/src/services/authService.ts`: login y registro sincronizan claims derivados y observan el documento protegido para resolver rol/estado vigente.
- `firestore.rules`: fuente canonica de reglas; cualquier copia documental debe mantenerse sincronizada y no se publica directamente.
