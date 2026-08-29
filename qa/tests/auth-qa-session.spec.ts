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
  await expect(page.getByText('Panel de Control')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const names = await caches.keys();
    return names.filter((name) => ['googleapis-cache', 'firebase-cache'].includes(name));
  })).toEqual([]);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const names = await caches.keys();
    return names.filter((name) => ['googleapis-cache', 'firebase-cache'].includes(name));
  })).toEqual([]);
});

test('blocks a protected supplier deep link for the dedicated cashier account', async ({ page }) => {
  const cashierEmail = process.env.QA_CASHIER_EMAIL;
  const cashierPassword = process.env.QA_CASHIER_PASSWORD;
  test.skip(
    !cashierEmail || !cashierPassword,
    'BLOCKED: no dedicated cashier QA account was supplied',
  );

  await page.goto('/#/suppliers');
  await page.getByLabel('Correo electrónico').fill(cashierEmail!);
  await page.getByLabel('Contraseña').fill(cashierPassword!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page).toHaveURL(/#\/suppliers$/);
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Proveedores/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
