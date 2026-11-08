import { test, expect } from '@playwright/test';
import { mockPublicStoreApi } from './e2eStoreMocks';

test.describe('Modo Kiosco iPad y Bandeja de Pedidos en Vivo', () => {
  test('abre el Modo Kiosco en #/kiosco/surtifacil, muestra pasillos y emite turno', async ({ page }) => {
    await mockPublicStoreApi(page);

    // 1. Acceder a la ruta pública del kiosco
    await page.goto('/#/kiosco/surtifacil');

    // 2. Verificar cabecera táctil de autoatención
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SurtiFácil Abastos Central');
    await expect(page.getByText('Mostrador de Autoatención')).toBeVisible();

    // 3. Verificar pasillos táctiles
    await expect(page.getByRole('button', { name: /Frutas y Verduras/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Panadería y Arepas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Lácteos y Huevos/i })).toBeVisible();

    // 4. Agregar un producto al carrito táctil
    const addButtons = page.getByRole('button', { name: /Agregar/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    // 5. Proceder al checkout
    const continueBtn = page.getByRole('button', { name: /CONTINUAR PEDIDO/i });
    await expect(continueBtn.first()).toBeVisible();
    await continueBtn.first().click();

    // 6. Completar Paso 1: Nombre del cliente
    await expect(page.getByText(/¿A nombre de quién\?/i)).toBeVisible();
    await page.getByLabel(/Tu Nombre o Apellido/i).fill('Don Andrés Vecino');

    const nextStepBtn = page.getByRole('button', { name: /Siguiente: Forma de Pago/i });
    await nextStepBtn.click();

    // 7. Completar Paso 2: Medio de pago
    await expect(page.getByText(/¿Cómo vas a pagar\?/i)).toBeVisible();
    await expect(page.getByText(/Efectivo en Mostrador/i)).toBeVisible();

    const submitOrderBtn = page.getByRole('button', { name: /Confirmar y Sacar Turno/i });
    await submitOrderBtn.click();

    // 8. Pantalla final de Turno Gigante
    await expect(page.getByText(/¡Pedido Registrado con Éxito!/i)).toBeVisible();
    await expect(page.getByText(/¡Listo Don Andrés Vecino!/i)).toBeVisible();
    await expect(page.getByText(/Tu número de atención es:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Hacer Otro Pedido Ahora/i })).toBeVisible();
  });
});

