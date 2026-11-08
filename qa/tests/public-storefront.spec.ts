import { test, expect } from '@playwright/test';
import { mockPublicStoreApi } from './e2eStoreMocks';

test.describe('Catálogo Web Vecinal (#/tienda/:slug) y Rastreo de Pedido (#/pedido/:token)', () => {
  test('navega por la tienda vecinal, agrega a la canasta, hace pedido y rastrea en vivo', async ({ page }) => {
    await mockPublicStoreApi(page);

    // 1. Acceder a la tienda pública vecinal
    await page.goto('/#/tienda/surtifacil');

    // 2. Verificar cabecera pública del local
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SurtiFácil Abastos Central');
    await expect(page.getByText(/Domicilios en el barrio:/i)).toBeVisible();

    // 3. Verificar pasillos de abastos
    await expect(page.getByRole('button', { name: /Fruver/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Despensa/i })).toBeVisible();

    // 4. Agregar el primer producto disponible a la canasta
    const addButtons = page.getByRole('button', { name: /AGREGAR/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    // 5. Debe aparecer la barra flotante de canasta al pie
    const openCartBtn = page.getByRole('button', { name: /Abrir canasta y confirmar pedido/i });
    await expect(openCartBtn).toBeVisible();
    await openCartBtn.click();

    // 6. Completar formulario de checkout en el drawer
    await expect(page.getByRole('heading', { name: /Canasta y Confirmación de Pedido/i })).toBeVisible();

    const nameInput = page.getByLabel(/Tu Nombre y Apellido \*/i);
    await nameInput.fill('Doña Carmen Belén');

    // Si está seleccionada la opción de Domicilio, rellenar dirección
    const addressInput = page.getByLabel(/Dirección de Entrega \*/i);
    if (await addressInput.isVisible()) {
      await addressInput.fill('Carrera 76 # 32-15 Apto 402');
    }

    // 7. Confirmar el pedido
    const confirmBtn = page.getByRole('button', { name: /Confirmar Pedido Vecinal/i });
    await confirmBtn.click();

    // 8. Verificar que redirige a la pantalla de Rastreo de Pedido en Vivo
    await expect(page).toHaveURL(/#\/pedido\//);
    await expect(page.getByRole('heading', { name: /Rastreo de Pedido en Vivo/i })).toBeVisible();
    await expect(page.getByText(/Turno del Pedido:/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recibido' })).toBeVisible();
    await expect(page.getByText(/Doña Carmen Belén/i)).toBeVisible();
  });
});
