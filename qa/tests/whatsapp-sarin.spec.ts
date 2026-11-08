import { test, expect } from '@playwright/test';
import { mockPublicStoreApi } from './e2eStoreMocks';

test.describe('Bot Sarin Vecino e Integración WhatsApp', () => {
  test('la landing comercial promociona el Copiloto Sarin con IA para WhatsApp', async ({ page }) => {
    await page.goto('/#/landing');

    // Verificar mención de Copiloto Sarin con IA
    await expect(page.getByText(/Copiloto Sarin con IA/i)).toBeVisible();
    await expect(page.getByText(/Impulsado por DeepSeek/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('el catálogo vecinal (#/tienda/:slug) enlaza al canal de WhatsApp del tendero', async ({ page }) => {
    await mockPublicStoreApi(page);
    await page.goto('/#/tienda/surtifacil');

    // Verificar enlace directo a WhatsApp en la cabecera
    const whatsappLink = page.getByRole('link', { name: 'WhatsApp' });
    await expect(whatsappLink).toBeVisible();
    const href = await whatsappLink.getAttribute('href');
    expect(href).toContain('wa.me/573001234567');
  });

  test('al completar un pedido vecinal, la vista de rastreo ofrece contacto directo a WhatsApp', async ({ page }) => {
    await mockPublicStoreApi(page);
    await page.goto('/#/tienda/surtifacil');

    // 1. Agregar producto a la canasta
    const addButtons = page.getByRole('button', { name: /AGREGAR/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    // 2. Abrir drawer de checkout
    const openCartBtn = page.getByRole('button', { name: /Abrir canasta y confirmar pedido/i });
    await expect(openCartBtn).toBeVisible();
    await openCartBtn.click();

    // 3. Completar nombre y confirmar
    await page.getByLabel(/Tu Nombre y Apellido \*/i).fill('Doña Gloria Sarin Test');
    const addressInput = page.getByLabel(/Dirección de Entrega \*/i);
    if (await addressInput.isVisible()) {
      await addressInput.fill('Calle 45 # 32-10, Belén');
    }

    const confirmBtn = page.getByRole('button', { name: /Confirmar Pedido Vecinal/i });
    await confirmBtn.click();

    // 4. En la pantalla de rastreo, verificar botón de WhatsApp
    await expect(page).toHaveURL(/#\/pedido\//);
    const whatsappBtn = page.getByRole('link', { name: /Hablar por WhatsApp con la Tienda/i });
    await expect(whatsappBtn).toBeVisible();
    const href = await whatsappBtn.getAttribute('href');
    expect(href).toContain('wa.me/573001234567');
  });
});
