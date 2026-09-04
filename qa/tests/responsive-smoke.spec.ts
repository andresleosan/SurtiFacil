import { expect, test, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const MIN_TAP_TARGET = 44;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, 'the page must not scroll horizontally').toBeLessThanOrEqual(overflow.innerWidth);
}

async function expectTapTarget(page: Page, selector: ReturnType<Page['getByRole']>) {
  const box = await selector.boundingBox();
  expect(box, 'element must be rendered').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
}

test.describe('responsive smoke', () => {
  test('login fits the viewport with touch-sized controls', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTapTarget(page, page.getByLabel('Correo electrónico'));
    await expectTapTarget(page, page.getByLabel('Contraseña'));
    await expectTapTarget(page, page.getByRole('button', { name: 'Iniciar sesión' }));

    const viewport = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content'));
    expect(viewport).toContain('viewport-fit=cover');
  });

  test('manifest allows any orientation and uses the brand color', async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.orientation).toBe('any');
    expect(manifest.theme_color).toBe('#1565C0');
    expect(manifest.display).toBe('standalone');
  });

  test('authenticated shell adapts to the viewport when QA credentials are supplied', async ({ page, isMobile }) => {
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
    await expectNoHorizontalOverflow(page);

    if (isMobile) {
      const tabBar = page.getByRole('navigation', { name: 'Navegación principal' });
      await expect(tabBar).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Menú principal' })).toHaveCount(0);
      await tabBar.getByRole('button', { name: 'Vender' }).click();
      await expect(page).toHaveURL(/#\/create-sale$/);
      await expectNoHorizontalOverflow(page);
      await tabBar.getByRole('button', { name: 'Más' }).click();
      await page.getByRole('dialog', { name: 'Más opciones' }).getByRole('button', { name: 'Cerrar sesión' }).click();
    } else {
      const sidebar = page.getByRole('complementary', { name: 'Menú principal' });
      await expect(sidebar).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
      await sidebar.getByRole('button', { name: 'Nueva Venta' }).click();
      await expect(page).toHaveURL(/#\/create-sale$/);
      await expectNoHorizontalOverflow(page);
      await sidebar.getByRole('button', { name: 'Cerrar sesión' }).click();
    }

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
