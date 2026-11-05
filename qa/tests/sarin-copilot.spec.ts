import { test, expect } from '@playwright/test';

test.describe('Sarin Copilot & Voz Manos Libres en POS', () => {
  test('la landing comercial promociona el Copiloto Sarin con IA para mostrador y WhatsApp', async ({ page }) => {
    await page.goto('/#/landing');

    // Verificar mención de Copiloto Sarin con IA en la vitrina
    await expect(page.getByText(/Copiloto Sarin con IA/i)).toBeVisible();
    await expect(page.getByText(/Impulsado por DeepSeek/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('el Dashboard muestra el widget del Copiloto Gerencial Sarin y permite abrirlo', async ({ page }) => {
    const qaEmail = process.env.QA_TEST_EMAIL;
    const qaPassword = process.env.QA_TEST_PASSWORD;
    test.skip(
      !qaEmail || !qaPassword,
      'BLOCKED: no dedicated QA account was supplied through QA_TEST_EMAIL and QA_TEST_PASSWORD'
    );

    await page.goto('/#login');
    await page.getByLabel('Correo electrónico').fill(qaEmail!);
    await page.getByLabel('Contraseña').fill(qaPassword!);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    // Verificar presencia del widget en Dashboard
    const copilotWidget = page.getByText(/Sarin Copiloto Gerencial/i).first();
    await expect(copilotWidget).toBeVisible();

    const openBtn = page.getByRole('button', { name: /Consultar con Sarin/i });
    if (await openBtn.isVisible()) {
      await openBtn.click();
      // Verificar modal del Copiloto
      await expect(page.getByRole('dialog', { name: /Sarin Copiloto Gerencial/i })).toBeVisible();
      await expect(page.getByText(/Asesor financiero y operativo/i)).toBeVisible();

      // Probar chip de pregunta rápida
      const presetBtn = page.getByRole('button', { name: /Ventas y Ganancias de Hoy/i });
      await expect(presetBtn).toBeVisible();
      await presetBtn.click();

      // Verificar respuesta de Sarin con tarjeta analítica
      await expect(page.getByText(/Balance de Ventas/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Ganancia Bruta/i)).toBeVisible();

      // Cerrar modal
      await page.getByRole('button', { name: /Cerrar Copiloto Sarin/i }).click();
      await expect(page.getByRole('dialog', { name: /Sarin Copiloto Gerencial/i })).not.toBeVisible();
    }
  });

  test('el POS (#/create-sale) cuenta con Sarin Voz y tarjeta de doble confirmación con vueltas', async ({ page }) => {
    const qaEmail = process.env.QA_TEST_EMAIL;
    const qaPassword = process.env.QA_TEST_PASSWORD;
    test.skip(
      !qaEmail || !qaPassword,
      'BLOCKED: no dedicated QA account was supplied through QA_TEST_EMAIL and QA_TEST_PASSWORD'
    );

    await page.goto('/#login');
    await page.getByLabel('Correo electrónico').fill(qaEmail!);
    await page.getByLabel('Contraseña').fill(qaPassword!);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await page.goto('/#create-sale');

    // Verificar botón táctil de micrófono Sarin
    const voiceBtn = page.getByRole('button', { name: /Dictar Venta \(Voz Sarin\)/i });
    await expect(voiceBtn).toBeVisible();

    // Abrir simulador de comando de voz
    const simulateToggle = page.getByRole('button', { name: /Escribir \/ Simular comando/i });
    await expect(simulateToggle).toBeVisible();
    await simulateToggle.click();

    // Ingresar comando de venta rápida
    const input = page.getByPlaceholderText(/Sarin, dos leches/i);
    await expect(input).toBeVisible();
    await input.fill('Sarin, agrega dos leches, pagan con 20 mil');

    const submitBtn = page.getByRole('button', { name: /Interpretar Comando/i });
    await submitBtn.click();

    // Verificar tarjeta didáctica de doble confirmación
    const confirmCard = page.getByRole('region', { name: /Confirmación didáctica de comando de voz/i });
    await expect(confirmCard).toBeVisible();

    // Verificar desglose financiero y vueltas gigantes
    await expect(confirmCard.getByText(/Vueltas a Entregar/i)).toBeVisible();
    await expect(confirmCard.getByRole('button', { name: /Aplicar a la Venta/i })).toBeVisible();
    await expect(confirmCard.getByRole('button', { name: /Repetir por Voz/i })).toBeVisible();
    await expect(confirmCard.getByRole('button', { name: /Deshacer/i })).toBeVisible();

    // Aplicar al carrito
    await confirmCard.getByRole('button', { name: /Aplicar a la Venta/i }).click();
    await expect(confirmCard).not.toBeVisible();
  });
});
