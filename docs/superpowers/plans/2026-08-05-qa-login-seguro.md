# Login QA Seguro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el login/logout E2E con una cuenta Firebase QA temporal sin conservar credenciales en artefactos de prueba.

**Architecture:** El caso autenticado seguirá recibiendo credenciales solo desde `QA_TEST_EMAIL` y `QA_TEST_PASSWORD`. Aislará sus artefactos de Playwright y vaciará los campos del formulario después del submit. La identidad Firebase tendrá un documento Firestore `users/{uid}` activo con rol `cashier`, que satisface el contrato de sesión de la aplicación con privilegio mínimo.

**Tech Stack:** Playwright, React, Firebase Authentication, Cloud Firestore.

## Global Constraints

- No registrar secretos en archivos, artefactos, logs, commits ni chat.
- Usar solo variables de proceso para `QA_TEST_EMAIL` y `QA_TEST_PASSWORD`.
- La cuenta QA debe usar `role: "cashier"` y `active: true`.
- No desplegar a producción ni modificar reglas Firestore.
- No borrar la cuenta QA sin confirmación explícita del operador.

---

### Task 1: Aislar credenciales del caso E2E autenticado

**Files:**
- Modify: `qa/tests/auth-boundary.spec.ts:101-120`
- Create: `qa/tests/auth-qa-session.spec.ts`
- Test: `qa/tests/auth-qa-session.spec.ts`

**Interfaces:**
- Consumes: `process.env.QA_TEST_EMAIL`, `process.env.QA_TEST_PASSWORD`.
- Produces: Caso `logs in and out with the dedicated QA account when supplied` sin artefactos Playwright ni valores conservados en campos al evaluar el resultado.

- [ ] **Step 1: Escribir el caso E2E que exige campos vacíos antes de verificar el dashboard**

```ts
await page.getByRole('button', { name: 'Iniciar sesión' }).click();
await page.getByLabel('Correo electrónico').fill('');
await page.getByLabel('Contraseña').fill('');
await expect(page.getByLabel('Correo electrónico')).toHaveValue('');
await expect(page.getByLabel('Contraseña')).toHaveValue('');
await expect(page.getByText('Panel de Control')).toBeVisible();
```

- [ ] **Step 2: Ejecutar el caso para verificar el fallo inicial**

Run: `npm run test:e2e -- --grep "logs in and out with the dedicated QA account when supplied"`

Expected: el caso falla antes de la modificación porque todavía no limpia ambos campos ni desactiva sus artefactos.

- [ ] **Step 3: Mover el caso autenticado a un archivo con opciones seguras de nivel superior**

```ts
// qa/tests/auth-qa-session.spec.ts
import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('logs in and out with the dedicated QA account when supplied', async ({ page }) => {
  // conservar el skip existente
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(qaEmail!);
  await page.getByLabel('Contraseña').fill(qaPassword!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill('');
  await page.getByLabel('Contraseña').fill('');
  await expect(page.getByText('Panel de Control')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
```

- [ ] **Step 4: Ejecutar el caso para verificarlo en verde**

Run: `npm run test:e2e -- --grep "logs in and out with the dedicated QA account when supplied"`

Expected: con una cuenta QA válida, aparece el dashboard, se cierra sesión y no se crean `trace.zip`, `video.webm` ni capturas para ese caso.

- [ ] **Step 5: Commit**

```powershell
git add qa/tests/auth-boundary.spec.ts qa/tests/auth-qa-session.spec.ts
git commit -m "test: proteger credenciales QA en E2E"
```

### Task 2: Crear la identidad QA con el contrato de sesión completo

**Files:**
- External state: Firebase Authentication y Cloud Firestore del proyecto `smartmarket-b37ce`.
- Test: `qa/tests/auth-boundary.spec.ts`

**Interfaces:**
- Consumes: una dirección QA temporal y una contraseña nueva que solo viven en variables de proceso.
- Produces: identidad Firebase con UID y documento `/users/{uid}`:

```json
{
  "email": "<qa-email>",
  "displayName": "QA E2E",
  "role": "cashier",
  "active": true,
  "createdAt": "Firestore server timestamp"
}
```

- [ ] **Step 1: Crear el usuario temporal desde Firebase Authentication**

En Firebase Console > Authentication > Usuarios, seleccionar **Agregar usuario**, ingresar correo QA temporal y contraseña nueva, y guardar el UID mostrado. No copiar la contraseña a ningún archivo.

- [ ] **Step 2: Crear el documento Firestore de sesión**

En Firebase Console > Firestore > colección `users`, crear el documento con el UID de Authentication. Agregar los campos `email` (string), `displayName` (string `QA E2E`), `role` (string `cashier`), `active` (boolean `true`) y `createdAt` (timestamp actual).

- [ ] **Step 3: Ejecutar la prueba autenticada con variables de proceso efímeras**

```powershell
$env:QA_TEST_EMAIL = '<qa-email>'
$env:QA_TEST_PASSWORD = '<qa-password>'
npm run test:e2e -- --grep "logs in and out with the dedicated QA account when supplied"
Remove-Item Env:QA_TEST_EMAIL
Remove-Item Env:QA_TEST_PASSWORD
```

Expected: el caso termina aprobado y la sesión vuelve al formulario de login.

- [ ] **Step 4: Ejecutar la suite E2E completa**

Run: `npm run test:e2e`

Expected: tres casos aprobados, sin casos omitidos.

### Task 3: Registrar evidencia y revisar la cuenta temporal

**Files:**
- Modify: `tasks.md`
- Test: `npm run test:e2e`

**Interfaces:**
- Consumes: resultado de la suite E2E completa y estado de la cuenta QA.
- Produces: evidencia exacta de la validación autenticada sin registrar correo, UID ni contraseña.

- [ ] **Step 1: Actualizar el backlog con la evidencia no sensible**

Agregar una entrada que indique: login/logout E2E aprobado con cuenta QA temporal `cashier`; no incluir identificadores ni secretos; cuenta pendiente de eliminación solo si el operador lo confirma.

- [ ] **Step 2: Verificar que no hay secretos listos para commit**

Run: `git diff --check; git status --short; git diff -- .env.example`

Expected: ningún secreto se agrega al índice; cambios locales de configuración se revisan antes de cualquier commit.

- [ ] **Step 3: Commit**

```powershell
git add tasks.md
git commit -m "docs: registrar QA autenticado"
```

## Self-Review

- Cobertura: Task 1 protege artefactos; Task 2 satisface Authentication y Firestore; Task 3 conserva evidencia y evita commits con secretos.
- Sin placeholders: todos los comandos, archivos, campos Firestore y resultados esperados están definidos.
- Consistencia: el caso E2E consume las variables del entorno, y el documento Firestore usa el rol `cashier` definido en la especificación.
