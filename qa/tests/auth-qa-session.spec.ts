import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('logs in and out with the dedicated QA account when supplied', async ({ page }) => {
  const qaEmail = process.env.QA_TEST_EMAIL;
  const qaPassword = process.env.QA_TEST_PASSWORD;
  test.skip(
    !qaEmail || !qaPassword,
    'BLOCKED: no dedicated QA account was supplied through QA_TEST_EMAIL and QA_TEST_PASSWORD',
  );

  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(qaEmail!);
  await page.getByLabel('Contraseña').fill(qaPassword!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill('');
  await page.getByLabel('Contraseña').fill('');

  await expect(page.getByLabel('Correo electrónico')).toHaveValue('');
  await expect(page.getByLabel('Contraseña')).toHaveValue('');
  await expect(page.getByText('Panel de Control')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
