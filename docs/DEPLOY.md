# Guía de Despliegue - SurtiFácil Admin

## Requisitos Previos

1. **Firebase CLI** instalado:
   ```powershell
   npm install -g firebase-tools
   ```

2. **Cuenta de Firebase** con un proyecto creado en https://console.firebase.google.com

3. **Variables de entorno** configuradas:
   - Variables de build de producción para `web/` con `VITE_FIREBASE_*` completos y `VITE_BACKEND_URL` apuntando a la URL HTTPS pública del backend Express (no `localhost`)
   - Entorno separado del backend con identidad de servicio/ADC, `WHATSAPP_*`, `WEBHOOK_VERIFY_TOKEN`, `FRONTEND_ORIGINS` y Anthropic solo cuando correspondan

`FRONTEND_ORIGINS` es una lista separada por comas de orígenes permitidos por CORS. En producción debe contener únicamente orígenes HTTPS, por ejemplo `https://smartmarket-b37ce.web.app` y, si aplica, `https://app.example.com`. No configures `*`: el frontend usa autenticación cross-origin y el backend lo ignora de forma segura.

---

## Configuración Inicial (Una sola vez)

### 1. Login en Firebase
```powershell
firebase login
```

### 2. Asociar el proyecto
Edita `.firebaserc` y reemplaza `surtifacil-admin` con tu **Project ID real**:
```json
{
  "projects": {
    "default": "TU-PROJECT-ID"
  }
}
```

O usa el comando:
```powershell
firebase use --add TU-PROJECT-ID
```

### 3. Habilitar servicios en Firebase Console
- **Hosting**: Activa desde la consola
- **Firestore**: Crea la base de datos (modo production o test)
- **Authentication**: Habilita Email/Password

---

## Despliegue

### Opción A: Solo Hosting (Frontend)
```powershell
# Configurar VITE_BACKEND_URL en el entorno de build antes de ejecutar el comando.
# La URL se incorpora al bundle de Vite; debe ser la URL pública HTTPS del backend.
$env:VITE_BACKEND_URL = 'https://api.example.com'
npm run deploy:hosting
```
Este comando:
1. Ejecuta `npm run build` en `web/`
2. Despliega `web/dist/` a Firebase Hosting

### Opción B: Reglas de Firestore
```powershell
npm run test:rules
npm run deploy:rules
```
`firestore.rules` en la raíz es la única fuente canónica. No publiques copias desde `docs/`.

### Opción C: Índices de Firestore
```powershell
npm run deploy:indexes
```

### Opción D: Todo (Hosting + Firestore + Rules)
```powershell
npm run deploy:all
```

Este comando no despliega `backend/whatsapp-webhook.js`. Firebase Hosting solo
publica `web/dist/`; el servidor Express requiere un despliegue separado.
El frontend en producción solo funcionará contra el backend configurado en
`VITE_BACKEND_URL`; no se debe publicar un bundle de producción con una URL local.

### Opción E: Backend Express (prerrequisito separado)

Antes de declarar la release operativa:

1. Construir el contenedor reproducible desde la raíz con `npm run build:backend-container`.
2. Desplegarlo en Cloud Run con `min-instances=0`, primero como revisión de staging sin tráfico.
3. Asignar una identidad de servicio con mínimo privilegio. Firebase Admin usa Application Default Credentials; no copies `serviceAccountKey.json` dentro de la imagen.
4. Configurar los secretos backend en el gestor de secretos; nunca copiarlos al bundle frontend.
5. Mantener `ANTHROPIC_ENABLED=false` y `WHATSAPP_ENABLED=false` hasta aprobar modelos, presupuestos y credenciales. Si Anthropic se habilita, `ANTHROPIC_MODEL` y `ANTHROPIC_API_KEY` son obligatorios.
6. Configurar `VITE_BACKEND_URL` en el entorno de build del frontend con la URL pública HTTPS de ese servicio. El build de producción falla si falta, usa HTTP o apunta a localhost.
7. Verificar `GET /api/health`, autenticación, CORS y webhook HMAC desde el objetivo desplegado.
8. Conservar la revisión anterior y probar su procedimiento de rollback.

Para desarrollo local puede configurarse explícitamente `FIREBASE_SERVICE_ACCOUNT_PATH` con una
ruta a un JSON ignorado y almacenado fuera del repositorio. Si no se configura, el backend usa ADC.
No existe fallback automático a `./serviceAccountKey.json`.

Para pruebas locales sin llaves JSON puede usarse el modo emulador explícito con
`FIREBASE_EMULATOR_MODE=true`, `FIREBASE_PROJECT_ID`, `FIRESTORE_EMULATOR_HOST` y
`FIREBASE_AUTH_EMULATOR_HOST`. Este modo exige ambos emuladores configurados y solo se acepta con
`NODE_ENV=development` o `test`; Cloud Run debe usar ADC y nunca el modo emulador.

---

## Verificación Post-Deploy

1. **Abrir URL**: Firebase mostrará la URL (ej: `https://surtifacil-admin.web.app`)
2. **Verificar en consola del navegador**:
   - Sin errores 404
   - Firebase conecta correctamente
   - Datos cargan sin problemas

3. **Probar en mobile**: La app es responsiva

---

## Rollback

### Firebase Hosting

Si falla una release del frontend, abre Firebase Console > Hosting > historial de releases, selecciona la release anterior y usa la opción de rollback disponible allí.

Como alternativa, vuelve a desplegar un artefacto de frontend previamente preservado: restaura ese artefacto en `web/dist/` y ejecuta:
```powershell
firebase deploy --only hosting
```

### Backend Express

El rollback del backend depende del servicio Node/Express elegido. Usa el mecanismo de releases/versiones de ese proveedor y conserva siempre el artefacto o la imagen anterior antes de desplegar una nueva versión. Firebase Hosting no revierte el servidor Express.

---

## Estructura de Archivos de Deploy

```
surtifacil/
├── firebase.json              # Config de Hosting + Firestore
├── .firebaserc                # Project ID
├── firestore.rules            # Reglas de seguridad
├── firestore.indexes.json    # Índices de Firestore
├── web/
│   └── dist/                  # Build output (carpeta public)
└── package.json               # Scripts de deploy
```

---

## Cache y Headers Configurados

| Tipo de archivo | Cache-Control |
|-----------------|---------------|
| JS, CSS | 604800 (7 días) |
| Imágenes | 31536000 (1 año) |
| index.html | No cache (siempre fresco) |

---

## Troubleshooting

### Error: "No project found"
```powershell
firebase use --add
```

### Error: "Build failed"
```powershell
cd web && npm run build
```
Verifica que no hay errores de TypeScript.

### Error: "Permission denied" en Firestore
Revisa la regla concreta en `firestore.rules` y ejecuta `npm run test:rules`.
Las operaciones requieren un usuario activo en `/users/{uid}` y el rol vigente del documento.

La política POS vigente permite a cajeros actualizar únicamente `stock` en
productos existentes, sin aumentar el valor ni editar otros campos. Las ventas
requieren `date`, `total`, `payment_method`, `items` y `createdAt`; el total y
los importes son no negativos, el método es `cash|card|other` y cada línea
validada requiere producto, cantidad positiva, precio y subtotal no negativos.
Las reglas validan hasta 20 líneas por venta porque Firestore Rules no dispone
de iteración de listas; los carritos mayores se rechazan.

---

## Comandos Rápidos

| Acción | Comando |
|--------|---------|
| Build local | `npm run build:web` |
| Tests | `npm run test` |
| Deploy hosting | `npm run deploy:hosting` |
| Deploy reglas | `npm run deploy:rules` |
| Deploy todo | `npm run deploy:all` |
| LogsFirebase | `firebase functions:log` |

---

## Checklist Pre-Producción

- [ ] `.firebaserc` configurado con project ID real
- [ ] Variables de build de `web/` con credenciales Firebase de producción y `VITE_BACKEND_URL` HTTPS público (sin `localhost`)
- [ ] Reglas verificadas: `npm run test:rules`
- [ ] Tests pasan: `npm run test`
- [ ] Build exitoso: `npm run build:web`
- [ ] Variables de entorno verdes en frontend y backend, con despliegues separados verificados
- [ ] Dominio personalizado (opcional)

---

*Última actualización: 2026-07-31*


---

## Despliegue alternativo del frontend en Vercel

El repositorio es un monorepo: la SPA vive en `web/`. Sin configuración, Vercel construye la raíz,
no encuentra salida y responde `404: NOT_FOUND`. El archivo `vercel.json` de la raíz corrige eso
(instala y construye dentro de `web/`, sirve `web/dist` y reescribe rutas a `index.html`).

Pasos en el dashboard de Vercel (Settings del proyecto):

1. **General → Root Directory**: dejar vacío (raíz del repo) para que aplique `vercel.json`.
2. **Environment Variables** (Production y Preview):
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
     `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
   - `VITE_BACKEND_URL` con la URL HTTPS pública del backend Express. El build de producción falla
     a propósito si falta o apunta a `localhost` (`web/src/config/buildEnvironment.ts`).
   - `VITE_USE_MOCK_DATA=false`
3. **Firebase Authentication → Settings → Authorized domains**: agregar `surtifacil.vercel.app`
   (y el dominio de previews si se usan), o el login fallará con un error genérico.
4. Backend: incluir `https://surtifacil.vercel.app` en `FRONTEND_ORIGINS`.
5. Redeploy. Verificar `/`, `/manifest.json` y un deep link como `/#/inventory`.

Firebase Hosting sigue siendo el destino documentado para producción; Vercel es válido como
staging del frontend mientras el backend público no exista.

## Inicio de sesión con Google y cuenta administradora

- El proveedor Google está habilitado en Firebase Authentication. El botón "Continuar con Google"
  usa ventana emergente y cae a redirección cuando el navegador la bloquea (PWA instalada).
- Google solo autentica; la autorización sigue en `/users/{uid}` (ADR-0001). Una cuenta de Google
  sin documento activo se rechaza y se cierra su sesión.
- Para dar de alta la primera cuenta administradora (o reparar una existente):

  ```powershell
  cd backend; npm ci; cd ..
  $env:GOOGLE_APPLICATION_CREDENTIALS = "C:
uta\serviceAccountKey.json"   # o gcloud auth application-default login
  npm run provision:admin -- --email andres@example.com --name "Andrés"
  ```

  El script crea la cuenta en Auth con el correo verificado (así Google se vincula a ella al primer
  acceso), fija los claims derivados y escribe el documento con `role: admin` y `active: true`.
- Los claims personalizados son cache derivada: si `/api/auth/sync-claims` no responde, el login
  continúa y se registra una advertencia. Reglas y backend leen siempre el documento del usuario.

## Backend en Vercel Functions (ADR-0003)

Mientras el proyecto GCP no tenga facturación, el backend Express corre como función serverless en
el mismo proyecto de Vercel (`api/index.js` → `backend/whatsapp-webhook.js`). `vercel.json`
reescribe `/api/*` a la función; frontend y backend comparten el origen `https://surtifacil.vercel.app`.

Variables de entorno del backend en Vercel (Production y Preview):

- `FIREBASE_SERVICE_ACCOUNT_JSON` (Secret): JSON de la cuenta de servicio dedicada
  `surtifacil-backend@smartmarket-b37ce.iam.gserviceaccount.com` (roles `datastore.user` y
  `firebaseauth.admin`). Rotar con `gcloud iam service-accounts keys create` y revocar la anterior.
- `FRONTEND_ORIGINS`: `https://surtifacil.vercel.app` y el dominio de previews.
- `VITE_BACKEND_URL`: `https://surtifacil.vercel.app` (mismo origen).
- `WHATSAPP_ENABLED` y `ANTHROPIC_ENABLED` ausentes o `false` hasta aprobar presupuestos.

Verificación tras cada deploy: `GET /api/health` → 200; `POST /api/sales/create` sin token → 401.
Al aprobar facturación GCP, desplegar el contenedor en Cloud Run (ADR-0002) y cambiar
`VITE_BACKEND_URL`.

Notas de compatibilidad del runtime de Vercel (2026-09-04):

- El loader de funciones de Vercel no resuelve `require()` de módulos ESM. `firebase-admin` depende
  de `jwks-rsa` 4 (que exige `jose` 6, solo ESM), por eso `backend/package.json` fija
  `overrides.jwks-rsa = 3.1.0` (`jose` 4 con build CommonJS). Revisar al actualizar `firebase-admin`.
- `package.json` raíz fija `engines.node = 22.x` para la función.
- `firebase-admin` 14 solo exporta la API modular; `backend/firebaseAdmin.js` expone una fachada
  (`createFirebaseAdminFacade`) con `credential`, `auth()` y `apps` para las rutas existentes.
