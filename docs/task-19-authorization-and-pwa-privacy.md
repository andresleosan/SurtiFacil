# Task 19 - Autorizacion coherente, usuarios y privacidad PWA

**Fecha:** 2026-08-29
**Estado:** Aprobada

## Matriz de acceso

El documento activo `users/{uid}` sigue siendo la autoridad. La UI usa el rol ya resuelto por la
suscripcion de sesion para no montar componentes prohibidos; Firestore Rules y los endpoints vuelven
a validar el documento en servidor. Ocultar un enlace nunca se considera una autorizacion real.

| Modulo | Cashier | Manager | Admin | Autoridad de datos |
|---|---:|---:|---:|---|
| Dashboard | Si | Si | Si | `products` y `sales`: usuario activo |
| Inventario (lectura) | Si | Si | Si | `products`: usuario activo |
| Ventas / nueva venta | Si | Si | Si | lectura activa; alta por backend autenticado |
| Empleados | No | No | Si | `users`: listado/mutacion admin; baja por backend |
| Proveedores | No | Si | Si | `suppliers`: manager/admin |
| Ordenes de compra | No | Si | Si | `purchase_orders`: manager/admin |
| Reportes de ventas | Si | Si | Si | `sales`: usuario activo |
| Margenes | No | Si | Si | guard de UI manager/admin; datos de ventas protegidos |
| Reposicion | No | Si | Si | `suppliers` y ordenes requieren manager/admin |
| WhatsApp | No | Si | Si | reglas y endpoints manager/admin |

Cada modulo tiene una ruta hash estable (`#/employees`, `#/suppliers`, etc.). Un deep link valido
pero prohibido muestra acceso restringido sin montar el componente ni iniciar lecturas. Una ruta
desconocida se normaliza a `#/dashboard`.

## Contrato de baja de usuarios

La eliminacion fisica no es reversible porque Firebase Auth no permite recuperar la contrasena
original. Se adopta una **baja logica reversible**:

- Endpoint: `DELETE /api/auth/users/:uid`.
- Autenticacion: Firebase ID token.
- Autorizacion: documento vigente del actor con `active == true` y `role == admin`.
- Restricciones: UID valido, objetivo existente y prohibicion de autoeliminacion.
- Efecto Auth: `disabled: true`; no se borra la identidad ni la contrasena.
- Efecto Firestore en transaccion: `active: false`, `deletedAt`, `deletedByUid` y evento en
  `user_audit/{eventId}`.
- Respuesta: `204` sin datos personales.
- Abuso: limite por UID del administrador y respuestas genericas.

El cliente deja de ejecutar `deleteDoc(users/{uid})`. Las reglas niegan el borrado directo de
documentos de usuario y toda escritura cliente sobre `user_audit`.

### Esquema aditivo

Campos opcionales de `users/{uid}`:

- `deletedAt`: timestamp server-side.
- `deletedByUid`: UID del administrador responsable.

Documento `user_audit/{eventId}`:

- `action: "user.deactivated"`.
- `actor_uid`, `target_uid`.
- `previous_active`, `previous_auth_disabled` y `target_role`.
- `createdAt`: timestamp server-side.

No se copian correo ni nombre al audit log para reducir duplicacion de datos personales. No se
requiere indice nuevo ni backfill; documentos existentes continúan siendo validos.

### Consistencia y rollback

1. Se obtiene el estado anterior de Auth y Firestore.
2. Se deshabilita Auth.
3. Se actualiza el usuario y se crea la auditoria en una sola transaccion Firestore.
4. Si Firestore falla, el backend restaura `disabled` al valor anterior antes de responder error.
5. Si ese rollback automatico tambien falla, se registra solo un mensaje operacional generico y la
   cuenta queda deshabilitada de forma segura para reparacion manual.

Rollback manual: restaurar `disabled` al valor auditado, restaurar `active`, retirar
`deletedAt`/`deletedByUid` con Admin SDK y agregar un evento de restauracion. No se ejecutara ninguna
migracion ni cambio remoto dentro de esta tarea.

## Privacidad PWA

- Las solicitudes a `*.googleapis.com` y `*.firebaseio.com` usan `NetworkOnly` en Workbox.
- Se eliminan los caches runtime historicos `googleapis-cache` y `firebase-cache` al iniciar la app
  y al cerrar sesion, para no dejar datos autenticados en un POS compartido.
- El precache conserva unicamente artefactos estaticos locales (`js`, `css`, `html`, iconos).

## Verificacion prevista

- Matriz unitaria para cada pagina y rol, incluyendo deep links y rutas desconocidas.
- Componente prohibido no montado ni consultado por un rol sin acceso.
- Usuario inactivo expulsado por la suscripcion vigente y logout limpia caches privados.
- Endpoint: sin token, actor inactivo/no admin, autoeliminacion, UID invalido y rate limit.
- Exito: Auth deshabilitado, tombstone y auditoria atomicos.
- Fallo Firestore: restauracion del estado Auth anterior.
- Reglas en emulador: borrado directo de usuario y escritura de auditoria denegados.
- Contrato del service worker: datos Firebase/Google nunca usan estrategias con cache.

## Implementacion completada

- `accessControl.ts` concentra paginas, roles, parsing de hashes y decisiones de acceso. `App.tsx`
  usa el rol vigente del documento de usuario, oculta enlaces prohibidos y no monta componentes
  protegidos al recibir un deep link no autorizado.
- `DELETE /api/auth/users/:uid` reemplaza el borrado Firestore directo. El backend verifica token,
  actor admin activo, UID, autoeliminacion y limite de uso; deshabilita Auth, escribe tombstone y
  auditoria atomica, y restaura Auth si falla Firestore.
- Firestore Rules niega todo delete cliente de `users` y toda escritura cliente en `user_audit`.
- Workbox genera rutas `NetworkOnly` para Google APIs y Firebase Realtime Database. La aplicacion
  elimina `googleapis-cache` y `firebase-cache` al iniciar y al cerrar sesion.
- Playwright permite un `QA_PORT` local para evitar interferir con previews de otros proyectos.

## Evidencia de verificacion

| Verificacion | Resultado |
|---|---|
| Backend completo (`npm test`) | 75/75 pruebas pasan |
| Frontend completo (`npm test`) | 216/216 pruebas pasan |
| Build produccion (`VITE_USE_MOCK_DATA=false npm run build`) | Pasa; 693 modulos y PWA de 11 entradas |
| Service worker generado | Dos rutas `NetworkOnly`; sin `googleapis-cache` ni `firebase-cache` |
| Firestore/Auth Emulator | Reglas pasan, incluido delete de usuario y escritura de auditoria denegados |
| Emulador transaccional de ventas | Pasa sin regresiones |
| Playwright Chromium local | 4/4: login, logout, error seguro, deep link cajero y caches privados ausentes |
| Imagen Docker | Build pasa; manifest list `sha256:4c1f18526d3c80eaba4d0f9af4b97ddc3ab31ad4bea5f6478803c1aa2b7de16f` |
| Smoke del contenedor | `/api/health` responde 200 y el contenedor temporal se elimina al terminar |
| Higiene del diff | `git diff --check` pasa; solo advertencias informativas LF/CRLF |

El E2E autenticado se ejecuto con `VITE_USE_MOCK_DATA=true` y cuentas locales conocidas, sin
credenciales reales. Despues se reconstruyo el artefacto final con `VITE_USE_MOCK_DATA=false`.

## Pruebas avanzadas

- Contrato: el frontend y el backend comparten `DELETE /api/auth/users/:uid`; existe prueba del
  binding y de la cabecera Bearer.
- Seguridad limite: token ausente, actor inactivo/no admin, autoeliminacion, UID invalido, rate
  limit y cambio concurrente de rol quedan rechazados.
- Fallos parciales: una transaccion Firestore fallida restaura el estado `disabled` anterior de
  Auth y no escribe tombstone ni auditoria parcial.
- Carga: el endpoint es administrativo y de baja frecuencia; se probo el limite por actor. La carga
  global del sistema permanece en Task 22 y no es condicion de esta tarea sin release.

## Autocritica de seguridad

- La autoridad sigue siendo el documento activo de usuario; custom claims no conceden bypass.
- La autorizacion del actor se repite dentro de la transaccion para cerrar una carrera de cambio de
  rol/estado entre la primera lectura y la escritura.
- No se registran UIDs, correos, nombres, tokens ni errores de proveedor en logs de fallo.
- No hay secretos nuevos ni dependencias nuevas.
- `npm audit` conserva 6 hallazgos moderados transitivos en backend y 1 alto de `nanoid` a traves de
  PostCSS/tooling en frontend. Ya estan asignados a Task 23; no se aplico `--force` ni un downgrade
  rompiente de Firebase Admin.
- Resultado: sin hallazgos criticos abiertos. No se ejecuto despliegue, migracion remota, borrado
  fisico de usuarios ni operacion con costo.
