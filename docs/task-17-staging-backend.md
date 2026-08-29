# Task 17 - Backend portable para staging

**Fecha:** 2026-08-28  
**Estado:** Aprobada; verificacion tecnica completa y cierre confirmado por el operador

## Resultado

- Firebase Admin usa Application Default Credentials cuando no se configura una ruta local.
- `FIREBASE_SERVICE_ACCOUNT_PATH` queda como override local explicito; ya no existe fallback a
  `./serviceAccountKey.json`.
- Anthropic esta deshabilitado por defecto. Solo llama al proveedor cuando
  `ANTHROPIC_ENABLED=true`, hay una clave y `ANTHROPIC_MODEL` no esta vacio.
- WhatsApp esta deshabilitado por defecto con `WHATSAPP_ENABLED=false`; ni mensajes salientes ni
  respuestas automaticas llaman al proveedor hasta habilitarlo explicitamente.
- La ausencia o desactivacion de Anthropic devuelve `503` generico en esas rutas y no impide el
  arranque ni afecta ventas, Auth o WhatsApp.
- El build web de produccion exige `VITE_BACKEND_URL` HTTPS y rechaza valores vacios, HTTP o locales.
- El contenedor fija Node 22.23.2 por digest, instala solo dependencias de produccion, usa el usuario
  `node`, escucha `PORT=8080` y define health check local.
- El modo emulador local requiere una activacion explicita, proyecto y hosts de Auth/Firestore. Solo
  se acepta con `NODE_ENV=development` o `test`; produccion sigue usando ADC y falla cerrada.

## Credenciales

### Cloud Run

No configurar `FIREBASE_SERVICE_ACCOUNT_PATH`. Asignar una identidad de servicio con minimo
privilegio y permitir que Firebase Admin resuelva ADC. Los secretos de WhatsApp y Anthropic se
inyectaran desde el gestor de secretos solo despues de sus checkpoints.

### Local

Usar ADC del entorno o configurar temporalmente `FIREBASE_SERVICE_ACCOUNT_PATH` con una ruta a un
archivo ignorado y almacenado fuera del repositorio. Nunca copiar la llave al contenedor ni al Git.
Para pruebas sin llave puede usarse `FIREBASE_EMULATOR_MODE=true` con ambos hosts de emulador y un
proyecto `demo-*`; este modo no se acepta en produccion.

## Degradacion de integraciones

| Integracion | Configuracion ausente | Comportamiento esperado |
|---|---|---|
| Firebase Admin | ADC y override local ausentes/invalidos | El backend falla cerrado al arrancar con log generico |
| Anthropic | Deshabilitado, sin modelo o sin clave | Solo rutas Anthropic responden `503` generico; no hay llamada ni gasto |
| WhatsApp | Deshabilitado o tokens ausentes | El backend arranca; no hay llamada externa y los endpoints fallan de forma generica |

No se agregaron reintentos automaticos a proveedores en esta tarea.

## Verificacion

Comandos previstos:

```powershell
cd backend
npm.cmd test

cd ../web
npm.cmd test
$env:VITE_BACKEND_URL = 'http://localhost:3000'
npm.cmd run build # debe fallar
$env:VITE_BACKEND_URL = 'https://api.example.com'
npm.cmd run build # debe pasar

cd ..
npm.cmd run build:backend-container
```

La imagen se construyo y verifico localmente con Docker Desktop. El contenedor temporal se elimino
al terminar y se conservo la imagen validada `surtifacil-backend:local`.

### Evidencia obtenida

| Verificacion | Resultado |
|---|---|
| Backend `npm.cmd test` | 65/65 pasan |
| Frontend `npm.cmd test` | 196/196 pasan |
| Build con `http://localhost:3000` | Falla como se exige, antes de generar artefacto |
| Build con `https://api.example.com` | Pasa; bundle contiene la URL publica y 0 archivos con el fallback local |
| Reglas Auth/Firestore con Java 21 | Pasa |
| Transaccion de venta con emulador Firestore | Pasa |
| Contrato estatico de contenedor | Pasa: digest, dependencias production-only, usuario `node`, health check y allowlist de contexto |
| Build real de imagen | Pasa con Docker Desktop 4.87.0 / Engine 29.7.2 |
| Imagen final | `surtifacil-backend:local`, `sha256:3de7431124983b4e8b9b9c4cd9901aa24d18d6d98af9eec58b7d8216f22d3996` |
| Contenedor local | `healthy`; `/api/health` responde HTTP 200 |
| Usuario efectivo | `uid=1000(node)`, sin privilegios de root |
| Contexto empacado | Solo backend JS, manifiestos y dependencias; sin `.env`, llaves, tests, frontend ni `.git` |
| Modo emulador en produccion | Rechazado con exit 1 y log generico, como se exige |

Advertencias no nuevas del build: chunk `react-vendor` vacio, import estatico/dinamico de Firebase y
bundles grandes. Se atienden en Task 21.

## Pruebas avanzadas

- **Contrato:** el servidor enlaza el inicializador portable; el modelo enviado al proveedor sale de
  configuracion; el contenedor no copia el repositorio completo ni artefactos sensibles.
- **Casos limite de seguridad:** ADC sin ruta, override local explicito, modo emulador completo o
  incompleto, rechazo del emulador fuera de desarrollo/test, Anthropic deshabilitado, modelo
  ausente, URL vacia/malformada/HTTP/localhost y URL HTTPS valida.
- **Carga:** no aplica a Task 17 porque no se modifico el camino de negocio ni la concurrencia. La
  carga de ventas, dashboard y webhook vive en Task 22.

## Autocritica de seguridad

No se encontraron hallazgos criticos en el codigo modificado: no hay endpoints nuevos, las rutas de
Anthropic conservan autenticacion/rol/rate limit, no se agregaron dependencias y el contenedor usa
usuario no privilegiado y contexto allowlist.

La primera ejecucion real del contenedor detecto que el health check no podia probarse sin ADC. Se
agrego un modo emulador explicito para desarrollo/test, cubierto por pruebas y rechazado fuera de
esos entornos. La segunda vuelta paso con contenedor `healthy`; produccion conserva el fallo cerrado.

**Hallazgo operacional alto cerrado:** Firebase CLI heredo una variable `DEBUG` y mostro el entorno
del proceso, incluido un token temporal de la extension del navegador. Los logs locales generados
fueron eliminados, las corridas posteriores quitaron `DEBUG` y el token del entorno hijo, y el
operador confirmo el cierre de la tarea tras la rotacion operativa. No se registrara ni repetira el
valor.

Los hallazgos de dependencias preexistentes no cambiaron: el nuevo codigo no agrega paquetes. Su
tratamiento permanece en Task 23 y no se aplico ningun `--force`.

## Rollback

1. Revertir el cambio de inicializacion y variables solo en codigo; no hay migracion de datos.
2. Volver a la imagen/revision anterior si el cambio ya llego a staging.
3. Restaurar el bundle web anterior si el guard de build impide una configuracion previamente valida.
4. No borrar ni rotar credenciales como parte de un rollback de codigo; cualquier credencial real
   sigue su procedimiento operativo independiente.
