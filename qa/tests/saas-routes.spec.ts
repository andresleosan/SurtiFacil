import { test, expect } from '@playwright/test';

test.describe('SaaS Public Routes', () => {
  test('landing page loads properly at #/landing with plans and sample cart', async ({ page }) => {
    await page.goto('/#/landing');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Moderniza tu mostrador de abastos, fiados y ventas en Medellín'
    );
    await expect(page.getByText('Plan Prueba (3 días)')).toBeVisible();
    await expect(page.getByText('Plan Semanal (7 días)')).toBeVisible();
    await expect(page.getByText('Plan Quincenal (15 días)')).toBeVisible();
    await expect(page.getByText('Plan Mensual (30 días)')).toBeVisible();
    await expect(page.getByText('Canasta en Mostrador')).toBeVisible();
  });

  test('register store page loads properly at #/registro-negocio', async ({ page }) => {
    await page.goto('/#/registro-negocio');

    await expect(
      page.getByRole('heading', { name: 'Registra tu Tienda de Barrio o Abastos' })
    ).toBeVisible();
    await expect(page.getByLabel(/Nombre de la Tienda o Minimercado/i)).toBeVisible();
    await expect(page.getByLabel(/Barrio o Comuna en Medellín/i)).toBeVisible();
    await expect(page.getByLabel(/Teléfono WhatsApp/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Comenzar mi Tienda en SurtiFácil/i })).toBeVisible();
  });
});

