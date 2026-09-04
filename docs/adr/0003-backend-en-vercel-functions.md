# ADR-0003: Backend Express en Vercel Functions mientras GCP no tenga facturación

**Fecha:** 2026-09-04
**Estado:** Aceptado como staging/operación inicial. ADR-0002 (Cloud Run) sigue siendo el destino
cuando el operador habilite facturación en el proyecto GCP.

## Contexto

El frontend ya se publica en Vercel (`surtifacil.vercel.app`) y el proyecto GCP `smartmarket-b37ce`
no tiene cuenta de facturación vinculada (`billingEnabled: false`). Cloud Run, Cloud Build y
Artifact Registry exigen facturación aunque el consumo quede en el free tier, y habilitarla es una
decisión financiera explícita del operador (STACK.md, checkpoint del 2026-08-28).

Sin backend público el frontend desplegado no puede registrar ventas ni administrar empleados.

## Decisión

Ejecutar el mismo monolito Express (`backend/whatsapp-webhook.js`) como función serverless de Vercel
(`api/index.js`) en el mismo proyecto que el frontend:

- Sin cambios de rutas: `vercel.json` reescribe `/api/*` a la función y Express recibe la URL
  original. Frontend y backend comparten origen, así que CORS deja de ser un requisito operativo.
- El servidor solo hace `app.listen` cuando el archivo es el punto de entrada
  (`require.main === module`); el contenedor de Cloud Run sigue funcionando igual.
- Credenciales: Vercel no ofrece identidad de servicio de Google, así que Firebase Admin acepta
  `FIREBASE_SERVICE_ACCOUNT_JSON` (secreto cifrado de Vercel) con una cuenta de servicio dedicada
  de mínimo privilegio (`roles/datastore.user` + `roles/firebaseauth.admin`). La llave no se guarda
  en el repositorio ni en la imagen. Debe rotarse al pasar a Cloud Run (ADC) y revocarse entonces.
- Anthropic y WhatsApp permanecen deshabilitados por defecto.

## Consecuencias

- Costo USD 0 en el plan Hobby de Vercel; sin facturación GCP.
- Los rate limiters siguen siendo process-local; en serverless cada instancia tiene su propio
  contador, por lo que el límite efectivo es más laxo. Ya está registrado en Task 20.
- Arranque en frío de 1 a 3 s por la inicialización de Firebase Admin; aceptable para un POS.
- Un webhook de WhatsApp en Vercel requiere el cuerpo crudo para el HMAC; verificar antes de
  activar WhatsApp real (Task 20).
- Reversible: al aprobar facturación se despliega el mismo contenedor en Cloud Run y se cambia
  `VITE_BACKEND_URL`.

## Notas de implementación

- Verificado el 2026-09-04 desde fuera: `GET /api/health` 200 y `POST /api/sales/create` 401 sin
  token (Firebase Admin inicializa con el secreto). Las rutas autenticadas se validaron con el
  servidor local (ADC) y con tests; la primera venta real desde la app desplegada queda como
  comprobación del operador.
- Compatibilidad: `overrides.jwks-rsa = 3.1.0` (jose CommonJS) y `engines.node = 22.x`; ver
  `docs/DEPLOY.md`.
