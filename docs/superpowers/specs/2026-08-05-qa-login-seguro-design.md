# Diseño: Login QA Seguro

## Objetivo

Completar la verificación E2E de login/logout con una cuenta QA temporal sin
exponer su contraseña en trazas, videos, capturas, reportes o archivos del
repositorio.

## Alcance

- Crear una cuenta temporal en Firebase Authentication.
- Crear su documento correspondiente en `/users/{uid}` con `active: true` y
  rol `cashier`.
- Endurecer exclusivamente el caso E2E autenticado.
- Ejecutar login/logout y registrar el resultado sin secretos.
- Eliminar la cuenta QA cuando el operador lo confirme después de la prueba.

## Fuera de Alcance

- No se prueba CRUD ni módulos administrativos con esta cuenta.
- No se despliega a producción.
- No se escriben contraseñas en `.env.example`, archivos versionados ni logs.

## Flujo

1. La suite recibe `QA_TEST_EMAIL` y `QA_TEST_PASSWORD` solo desde variables
   de proceso.
2. Playwright envía el formulario de login y limpia ambos controles antes de
   verificar el resultado, para que un contexto de error no conserve valores.
3. El caso autenticado desactiva trace, video y captura de pantalla.
4. Firebase Authentication valida las credenciales y Firestore resuelve el
   documento activo con rol `cashier`.
5. La prueba confirma que aparece el dashboard, cierra sesión y confirma que
   vuelve el formulario de login.

## Seguridad y Errores

- Si faltan credenciales QA, el caso se omite con una razón sin secretos.
- Si falla el login, el reporte conserva solo el mensaje genérico de la UI.
- La cuenta usa el rol mínimo `cashier` y no accede a funciones de manager o
  administrador.
- La contraseña temporal se rota o invalida antes de reutilizar la cuenta.

## Verificación

- Prueba unitaria/estructural que compruebe la configuración segura del caso
  E2E antes de modificarlo.
- Ejecución `npm run test:e2e` con la cuenta QA temporal.
- El resultado esperado es tres casos aprobados, incluido login/logout.
