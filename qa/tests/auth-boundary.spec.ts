import { expect, test, type Page } from '@playwright/test';

const genericLoginError = 'No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.';

type RuntimeIssue = {
  source: 'console' | 'pageerror' | 'request' | 'response';
  text: string;
};

function collectRuntimeIssues(page: Page) {
  const issues: RuntimeIssue[] = [];
  const pendingResponseChecks = new Set<Promise<void>>();

  page.on('pageerror', (error) => issues.push({ source: 'pageerror', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push({ source: 'console', text: message.text() });
    }
  });
  page.on('requestfailed', (request) => {
    issues.push({
      source: 'request',
      text: `${request.url()} ${request.failure()?.errorText ?? 'unknown failure'}`,
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;

    const check = response.text().then((body) => {
      const knownErrorCode = body.match(/auth\/[a-z-]+|INVALID_[A-Z_]+/i)?.[0] ?? 'unknown-error';
      issues.push({
        source: 'response',
        text: `HTTP ${response.status()} ${response.url()} ${knownErrorCode}`,
      });
    }).catch(() => {
      issues.push({
        source: 'response',
        text: `HTTP ${response.status()} ${response.url()} unreadable-response`,
      });
    });

    pendingResponseChecks.add(check);
    void check.finally(() => pendingResponseChecks.delete(check));
  });

  return {
    issues,
    flush: async () => {
      await Promise.all([...pendingResponseChecks]);
    },
  };
}

async function expectNoUnexpectedRuntimeIssues(
  runtime: ReturnType<typeof collectRuntimeIssues>,
  allowedPatterns: RegExp[] = [],
) {
  await runtime.flush();
  const unexpected = runtime.issues.filter(
    ({ source, text }) => source === 'pageerror' || !allowedPatterns.some((pattern) => pattern.test(`${source}: ${text}`)),
  );

  expect(unexpected, `Unexpected runtime issues: ${JSON.stringify(unexpected)}`).toEqual([]);
}

test.describe('auth boundary', () => {
  test('blocks unauthenticated navigation and exposes the Spanish login form', async ({ page }) => {
    const runtime = collectRuntimeIssues(page);

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByText('Panel de Control')).toHaveCount(0);

    await expectNoUnexpectedRuntimeIssues(runtime);
  });

  test('shows a generic error for invalid credentials without Firebase details', async ({ page }) => {
    const runtime = collectRuntimeIssues(page);

    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill('smoke-invalid@example.invalid');
    await page.getByLabel('Contraseña').fill('invalid-password-for-smoke');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('alert')).toHaveText(genericLoginError);
    await expect(page.getByText(/Firebase|auth\//i)).toHaveCount(0);
    await expect(page.getByText('Panel de Control')).toHaveCount(0);

    await expectNoUnexpectedRuntimeIssues(runtime, [
      /^console: Error logging in\.$/,
      /^console: Failed to load resource: the server responded with a status of 400 \(\)$/,
      /auth\/invalid-credential/i,
      /INVALID_LOGIN_CREDENTIALS/i,
      /^request: .*identitytoolkit\.googleapis\.com/i,
    ]);
  });

});
