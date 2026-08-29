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
