# ADR-0002: Cloud Run para el backend Express

**Fecha:** 2026-08-28  
**Estado:** Aceptada el 2026-08-28, con objetivo de costo USD 0

## Contexto

Firebase Hosting publica solamente la SPA en `web/dist`. El repositorio contiene un backend Node
22/Express que atiende ventas transaccionales, provisionamiento de usuarios, WhatsApp y Anthropic,
pero no existe un destino de despliegue documentado para ese proceso. El frontend publicado depende
de `VITE_BACKEND_URL`; sin un backend HTTPS operativo, la release queda incompleta.

SurtiFacil ya usa Firebase Authentication, Firestore, Firebase Admin y un proyecto Google. Se busca
una ruta de staging segura, reversible y de baja operacion, sin dividir prematuramente el monolito.

## Decision

Adoptar Cloud Run como runtime del unico servicio Express, empaquetado en un contenedor portable,
primero en un proyecto Firebase/GCP de staging separado, con cero instancias minimas y una estrategia
free-tier-first cuyo objetivo operativo es pagar USD 0.

La aplicacion usara Application Default Credentials mediante una identidad de servicio con minimo
privilegio y un gestor de secretos. No se incluira una llave JSON de cuenta de servicio en la imagen.

Esta decision fue aprobada por el operador, pero no autoriza por si sola el despliegue ni la
facturacion. Esas acciones mantienen checkpoints explicitos separados.

## Alternativas consideradas

- **Cloud Run free tier (elegida):** conserva el proceso Express y `PORT`, usa el mismo ecosistema Google,
  ofrece revisiones y rollback, escala a cero y mantiene una salida portable mediante contenedor.
- **Render Free:** ejecuta Express sin reescritura y puede costar USD 0, pero duerme despues de 15
  minutos, tarda cerca de un minuto en reactivarse y su proveedor indica que no debe usarse para
  produccion. Tambien agrega otro sistema de identidad y secretos.
- **Cloudflare Workers Free:** ofrece 100.000 requests diarios, pero limita a 10 ms de CPU por
  invocacion y solo implementa un subconjunto de APIs Node. Exige adaptar y revalidar Express,
  Firebase Admin y las integraciones actuales.

No se adopta una arquitectura de microservicios: los modulos no necesitan hoy escalar, desplegarse
ni ser mantenidos por equipos independientes.

## Consecuencias

### Positivas

- El backend actual requiere cambios acotados en lugar de una reescritura.
- Las revisiones permiten probar sin trafico, promover gradualmente y volver a una revision previa.
- Firebase Admin puede usar credenciales predeterminadas sin distribuir llaves privadas.
- El contenedor permite migrar a otro runtime compatible si la decision resulta equivocada.
- Staging queda aislado de usuarios y datos financieros de produccion.

### Negativas

- Aunque el objetivo sea USD 0, Cloud Run requiere una cuenta de facturacion y puede generar cargos por computo, egreso, builds,
  registro de imagenes y logs.
- El arranque desde cero puede introducir latencia en el primer request.
- Hay que crear y mantener un contenedor, identidad IAM, secretos, alertas y proyecto de staging.
- La ubicacion debe coordinarse con Firestore; elegirla mal aumenta latencia y egreso.
- El backend actual exige un archivo JSON de cuenta de servicio, por lo que no esta listo para
  desplegarse hasta implementar y probar ADC.

## Controles de costo

- Staging inicia con `min-instances=0` y objetivo mensual USD 0.
- Aprobado: spend cap de Cloud Run en USD 10/mes y presupuesto global de GCP en USD 25/mes con
  alertas 50/80/100%.
- Anthropic y WhatsApp permanecen deshabilitados en staging hasta aprobar cuotas y presupuestos
  separados.
- Las alertas normales no se consideran un limite duro; cualquier cap puede tener latencia de
  aplicacion y debe monitorearse.

## Plan de adopcion

1. Completado el 2026-08-28: aprobar el ADR y `STACK.md` con estrategia free-tier-first.
2. Adaptar Firebase Admin a ADC con fallback local seguro y pruebas.
3. Crear y verificar el contenedor reproducible.
4. Crear el proyecto de staging, IAM, secretos y controles de costo con confirmacion del operador.
5. Desplegar una revision sin trafico y ejecutar pruebas de salud, autenticacion, CORS, reglas,
   ventas y webhook.
6. Promover el trafico de staging solo si todas las evidencias pasan.

## Rollback y salida

- Rollback operativo: reasignar 100% del trafico a la revision anterior verificada.
- Si Cloud Run deja de ser adecuado, publicar la misma imagen OCI en otro runtime Node compatible y
  cambiar `VITE_BACKEND_URL`; Firebase Auth/Firestore no dependen del runtime elegido.
- Ninguna migracion de datos forma parte de esta decision.
