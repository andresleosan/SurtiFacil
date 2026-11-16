import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  futureDayIso,
  isCompactPhoneViewport,
  loginAsStaffAdmin,
  setupProductionE2EHarness,
} from './productionHarness';

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `No debe existir scroll horizontal (${overflow.scrollWidth} > ${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

async function expectTapTarget(locator: Locator, minHeight = 44) {
  const box = await locator.boundingBox();
  expect(box, 'El botón/control táctil debe estar visible en pantalla').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minHeight);
}

test.describe('Certificación Multi-Dispositivo Fase 6 — Rentabilidad Real, Mermas y Mayoristas', () => {
  test('P6-1. Caja Menor (Efectivo vs Transferencia), Anulación en 2 Toques, Arqueo COP y Tirilla Térmica de Cierre', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 1. Verificar en Dashboard que <StockAlerts /> muestra las alertas de vencimiento desde D1
    await page.goto('/#/');
    await expect(page.getByText(/Alertas de Vencimiento/i)).toBeVisible();
    await expect(page.getByText('Aguacate Hass Maduro').first()).toBeVisible();
    await expect(page.getByText(/En riesgo:/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 2. Ir al POS (#/create-sale) y abrir Caja Menor desde la cabecera
    await page.goto('/#/create-sale');
    const pettyBtn = page.getByRole('button', { name: /Caja Menor/i }).first();
    await expect(pettyBtn).toBeVisible();
    await expectTapTarget(pettyBtn, 44);
    await pettyBtn.click();

    const pettyDialog = page.getByRole('dialog', { name: /Caja Menor y Gastos del Turno/i });
    await expect(pettyDialog).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 2.1 Registrar egreso en EFECTIVO ($ 20.000) -> Sí descuenta de caja esperada
    await pettyDialog.getByRole('button', { name: /Bolsas e Insumos/i }).click();
    const quick20k = pettyDialog.getByRole('button', { name: '$ 20.000' });
    await expectTapTarget(quick20k, 44);
    await quick20k.click();
    await pettyDialog.getByLabel(/Concepto \/ Descripción/i).fill('Bolsas biodegradables y rollos');
    await pettyDialog.getByLabel(/Proveedor o Beneficiario/i).fill('Plásticos Antioquia');
    await pettyDialog.getByRole('button', { name: /Registrar Salida de Caja/i }).click();
    await expect(pettyDialog.getByRole('status')).toContainText('Salida registrada: $ 20.000');

    // 2.2 Registrar egreso por TRANSFERENCIA ($ 50.000) -> NO debe descontar efectivo del cajón
    await pettyDialog.getByRole('button', { name: /Aseo y Servicios/i }).click();
    await pettyDialog.getByRole('radio', { name: /Transferencia Nequi/i }).click();
    await pettyDialog.getByRole('button', { name: '$ 50.000' }).click();
    await pettyDialog.getByLabel(/Concepto \/ Descripción/i).fill('Recarga internet tienda Nequi');
    await pettyDialog.getByRole('button', { name: /Registrar Salida de Caja/i }).click();
    await expect(pettyDialog.getByRole('status')).toContainText('Salida registrada: $ 50.000');

    // Validar tarjetas resumen de Caja Menor (Efectivo: $ 20.000 | Transferencia: $ 50.000 | Total: $ 70.000)
    await expect(pettyDialog.getByText('$ 20.000').first()).toBeVisible();
    await expect(pettyDialog.getByText('$ 50.000').first()).toBeVisible();
    await expect(pettyDialog.getByText('$ 70.000')).toBeVisible();
    await pettyDialog.getByRole('button', { name: 'Listo' }).click();
    await expect(pettyDialog).not.toBeVisible();

    // 3. Abrir Arqueo / Cierre COP y validar que solo los $ 20.000 en efectivo reducen el esperado ($ 130.000)
    const closingBtn = page.getByRole('button', { name: /Arqueo \/ Cierre COP/i }).first();
    await expectTapTarget(closingBtn, 44);
    await closingBtn.click();
    const closingDialog = page.getByRole('dialog', { name: /Arqueo y Cierre de Caja/i });
    await expect(closingDialog).toBeVisible();
    await expect(closingDialog.getByText(/Gastos Caja Menor \(1\)/i)).toBeVisible();
    await expect(closingDialog.getByText('-$ 20.000')).toBeVisible();
    await expect(closingDialog.getByText('$ 130.000').first()).toBeVisible();

    // 4. Anular en 2 toques el gasto en efectivo desde Caja Menor y validar recálculo ($ 150.000)
    await closingDialog.getByRole('button', { name: /Registrar Gasto/i }).click();
    const pettyReopen = page.getByRole('dialog', { name: /Caja Menor y Gastos del Turno/i });
    await expect(pettyReopen).toBeVisible();
    await pettyReopen
      .getByRole('button', { name: /Anular gasto Bolsas biodegradables y rollos/i })
      .click();
    await pettyReopen
      .getByRole('button', { name: /Confirmar anulación de Bolsas biodegradables y rollos/i })
      .click();
    await expect(pettyReopen.getByRole('status')).toContainText('Gasto anulado del turno');

    // Registrar egreso final de $ 10.000 en efectivo para verificar en tirilla de cierre
    await pettyReopen.getByRole('radio', { name: /Efectivo de Caja/i }).click();
    await pettyReopen.getByRole('button', { name: '$ 10.000' }).click();
    await pettyReopen.getByLabel(/Concepto \/ Descripción/i).fill('Domicilio urgente barrio');
    await pettyReopen.getByRole('button', { name: /Registrar Salida de Caja/i }).click();
    await expect(pettyReopen.getByRole('status')).toContainText('Salida registrada: $ 10.000');
    await pettyReopen.getByRole('button', { name: 'Listo' }).click();

    await expect(closingDialog.getByText('-$ 10.000')).toBeVisible();
    await expect(closingDialog.getByText('$ 140.000').first()).toBeVisible();

    // 5. Cerrar caja e imprimir tirilla térmica del Acta de Cierre con descuento de Caja Menor
    await closingDialog.getByRole('button', { name: /Cerrar Caja y Generar Acta/i }).click();
    const savedDialog = page.getByRole('dialog', { name: /Acta de Cierre/i });
    await expect(savedDialog.getByText(/Cierre de Caja Guardado con Éxito/i)).toBeVisible();
    await expect(savedDialog.getByText('-$ 10.000')).toBeVisible();

    await savedDialog.getByRole('button', { name: /Imprimir Tirilla/i }).click();
    const thermalClosing = page.getByRole('dialog').filter({ hasText: /ACTA DE ARQUEO Y CIERRE DE CAJA/i });
    await expect(thermalClosing).toBeVisible();
    await expect(thermalClosing.getByText(/Gastos Caja Menor \(-\):/i)).toBeVisible();
    await expect(thermalClosing.getByText(/-\$ 10\.000/)).toBeVisible();
    await expect(thermalClosing.getByText(/\$ 140\.000/)).toBeVisible();

    await thermalClosing.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await savedDialog.getByRole('button', { name: 'Listo' }).click();

    // 6. Verificar acceso a Caja Menor también desde Historial de Ventas (#/sales)
    await page.goto('/#/sales');
    await expect(page.getByRole('button', { name: /Caja Menor/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    expect(pageErrors).toEqual([]);
  });

  test('P6-2. Mermas, Vencimientos (Vencido vs Próximo), Filtro por Motivo, Reversión y Bloqueo RBAC para Cajero', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 1. Editar Aguacate Hass con fecha de vencimiento de ayer para probar badge rojo "Vencido"
    await page.goto('/#/inventory');
    await expectNoHorizontalOverflow(page);

    const editAvocadoBtn = page.getByRole('button', { name: /Editar Aguacate Hass Maduro/i }).first();
    await expect(editAvocadoBtn).toBeVisible();
    await editAvocadoBtn.click();

    const editDialog = page.getByRole('dialog', { name: 'Editar producto' });
    await expect(editDialog).toBeVisible();
    await editDialog.locator('#edit-expiration').fill(futureDayIso(-1));
    await editDialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(editDialog).not.toBeVisible();

    await expect(page.getByText(/Vencido \(1d\)/i).first()).toBeVisible();

    // Verificar botones de banner de vencimiento con área táctil >= 44px
    const filterExpiringBtn = page.getByRole('button', { name: /Filtrar por vencer/i });
    await expectTapTarget(filterExpiringBtn, 44);
    await filterExpiringBtn.click();
    await expect(page.getByText('Aguacate Hass Maduro')).toBeVisible();
    await expect(page.getByText('Arroz Diana 1kg')).not.toBeVisible();
    await page.getByRole('button', { name: /Mostrar todos/i }).click();

    // 2. Abrir Mermas y Averías -> debe auto-sugerir motivo "Producto Vencido" para Aguacate vencido
    const shrinkageBtn = page.getByRole('button', { name: /Mermas y Averías/i });
    await expectTapTarget(shrinkageBtn, 44);
    await shrinkageBtn.click();

    const shrinkageDialog = page.getByRole('dialog', {
      name: /Control de Mermas, Averías y Vencimientos/i,
    });
    await expect(shrinkageDialog).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await shrinkageDialog.locator('#shrinkage-product').selectOption('prod-aguacate-1');
    const expiredReasonBtn = shrinkageDialog.getByRole('button', { name: /Producto Vencido/i }).first();
    await expect(expiredReasonBtn).toHaveAttribute('aria-pressed', 'true');

    // Cambiar a Daño Fruver y bajar 2 unidades con botón táctil rápido >= 44px
    await shrinkageDialog.getByRole('button', { name: /Daño Fruver \/ Maduración/i }).click();
    const quickQty2 = shrinkageDialog.getByRole('button', { name: '2', exact: true });
    await expectTapTarget(quickQty2, 44);
    await quickQty2.click();
    await shrinkageDialog.getByLabel(/Observación \/ Detalle/i).fill('Lote madurado de más');
    await shrinkageDialog.getByRole('button', { name: /Registrar Baja de Inventario/i }).click();

    await expect(shrinkageDialog.getByRole('status')).toContainText(
      'Baja registrada: -2 libra de Aguacate Hass Maduro',
    );
    await expect(shrinkageDialog.getByText(/−\$ 4\.800/)).toBeVisible();

    // 3. Filtrar historial de mermas por motivo
    await shrinkageDialog.getByRole('button', { name: /^⏰ Vencido$/i }).click();
    await expect(shrinkageDialog.getByText(/No hay mermas registradas con el motivo seleccionado/i)).toBeVisible();
    await shrinkageDialog.getByRole('button', { name: /^🥑 Fruver$/i }).click();
    await expect(shrinkageDialog.getByText('Lote madurado de más')).toBeVisible();

    // 4. Revertir merma en 2 toques y confirmar restauración en tabla/tarjeta
    const revertBtn = shrinkageDialog.getByRole('button', { name: /Revertir merma de Aguacate Hass Maduro/i });
    await expectTapTarget(revertBtn, 44);
    await revertBtn.click();
    const confirmRevertBtn = shrinkageDialog.getByRole('button', { name: /Devolver \+2/i });
    await expectTapTarget(confirmRevertBtn, 44);
    await confirmRevertBtn.click();
    await expect(shrinkageDialog.getByRole('status')).toContainText('Merma revertida');

    await shrinkageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(shrinkageDialog).not.toBeVisible();

    // 5. Seguridad RBAC: Cerrar sesión, entrar como Cajero (Acceso Rápido) y verificar bloqueo de Mermas en UI y API (403)
    if (await isCompactPhoneViewport(page)) {
      await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Más' }).click();
      await page.getByRole('dialog', { name: 'Más opciones' }).getByRole('button', { name: 'Cerrar sesión' }).click();
    } else {
      await page.getByRole('complementary', { name: 'Menú principal' }).getByRole('button', { name: 'Cerrar sesión' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    await page.getByRole('button', { name: /Entrar como Cajero/i }).click();
    await expect(page).toHaveURL(/#\/create-sale/);

    await page.goto('/#/inventory');
    await expect(page.getByText('Aguacate Hass Maduro').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Mermas y Averías/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Registrar merma de/i })).toHaveCount(0);

    const cashierApiStatus = await page.evaluate(async () => {
      const token = window.localStorage.getItem('sf_auth_token') || '';
      const res = await fetch('/api/shrinkage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: 'prod-aguacate-1', quantity: 1, reason: 'damaged' }),
      });
      return res.status;
    });
    expect(cashierApiStatus).toBe(403);

    expect(pageErrors).toEqual([]);
  });

  test('P6-3. Mayoristas Multi-Tramo (3+ a 6+), Sarin Voz POS, Tirilla Térmica, Tienda->Bandeja POS, Kiosco y Modo Offline', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 1. Configurar segundo tramo mayorista (+6 uds a $ 3.500 c/u) en Inventario
    await page.goto('/#/inventory');
    await page.getByRole('button', { name: /Editar Leche Entera Colanta 1L/i }).first().click();
    const editDialog = page.getByRole('dialog', { name: 'Editar producto' });
    await expect(editDialog).toBeVisible();

    const preset6Btn = editDialog.getByRole('button', { name: '+6 uds' });
    await expectTapTarget(preset6Btn, 44);
    await preset6Btn.click();
    await editDialog.locator('#edit-wholesale-price-1').fill('350000');
    await editDialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(editDialog).not.toBeVisible();

    // 2. POS (#/create-sale): Dictar 3 unidades por Voz Sarin -> tarjeta didáctica muestra tarifa mayorista $ 11.400 y vueltas $ 8.600
    await page.goto('/#/create-sale');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /Escribir \/ Simular comando/i }).click();
    await page
      .getByPlaceholder(/Sarin, dos leches/i)
      .fill('Sarin, agrega 3 leches, pagan con 20 mil');
    await page.getByRole('button', { name: /Interpretar Comando/i }).click();

    const voiceCard = page.getByRole('region', { name: /Confirmación didáctica de comando de voz/i });
    await expect(voiceCard).toBeVisible();
    await expect(voiceCard.getByText(/🏷️ Mayorista 3\+/i)).toBeVisible();
    await expect(voiceCard.getByText('$ 11.400').first()).toBeVisible();
    await expect(voiceCard.getByText('$ 8.600')).toBeVisible();

    await voiceCard.getByRole('button', { name: /Aplicar productos al carrito/i }).click();

    // En móvil CreateSale abre automáticamente el modal de Carrito al aplicar comando de voz; abrirlo solo si aún no está visible
    const mobileCartBtn = page.getByRole('button', { name: /Ver carrito,/i });
    const cartDialog = page.getByRole('dialog', { name: /Carrito \(/i });
    if (!(await cartDialog.isVisible()) && (await mobileCartBtn.isVisible())) {
      await mobileCartBtn.click();
    }

    // Subir de 3 a 6 unidades -> cambia automáticamente al segundo tramo 6+ ($ 3.500 x 6 = $ 21.000, ahorro $ 4.200)
    const addOneBtn = page.getByRole('button', { name: 'Agregar uno de Leche Entera Colanta 1L' });
    await addOneBtn.click(); // 4
    await addOneBtn.click(); // 5
    await addOneBtn.click(); // 6
    await expect(page.getByText(/🏷️ Mayorista 6\+/i)).toBeVisible();
    await expect(page.getByText('Ahorro mayorista')).toBeVisible();

    // Bajar a 5 unidades -> vuelve a tramo 3+ ($ 3.800 x 5 = $ 19.000)
    await page.getByRole('button', { name: 'Quitar uno de Leche Entera Colanta 1L' }).click();
    await expect(page.getByText(/🏷️ Mayorista 3\+/i)).toBeVisible();

    // Pagar con billete de $ 50.000 y verificar Tirilla Térmica con Promo 3+ y Ahorro Mayorista
    const cashCalc = page.getByRole('region', { name: /Calculadora de efectivo y vueltas COP/i });
    await cashCalc.getByRole('button', { name: /Paga con billete de \$ 50\.000/i }).click();
    const confirmVoiceSaleBtn = page.getByRole('button', { name: /Confirmar venta/i });
    await confirmVoiceSaleBtn.scrollIntoViewIfNeeded();
    await confirmVoiceSaleBtn.click();

    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' })).toBeVisible();
    const openThermalBtn = page.getByRole('button', { name: /Tirilla Térmica/i });
    await expectTapTarget(openThermalBtn, 44);
    await openThermalBtn.click();

    const receiptDialog = page.getByRole('dialog').filter({ hasText: /Tirilla de Venta/i });
    await expect(receiptDialog).toBeVisible();
    await expect(receiptDialog.getByText(/Promo 3\+ c\/u/i)).toBeVisible();
    await expect(receiptDialog.getByText(/Ahorro Mayorista:/i)).toBeVisible();
    await expect(receiptDialog.getByText(/\$ 2\.000/)).toBeVisible();
    await receiptDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(receiptDialog).not.toBeVisible();

    // 3. Modo Offline Resiliente con Tarifa Mayorista 3+ y Sincronización FIFO
    await page.getByRole('button', { name: 'Inspeccionar cola offline y resiliencia' }).click();
    const offlineDialog = page.getByRole('dialog', {
      name: /Resiliencia Offline y Cola FIFO Multi-Tenant/i,
    });
    await expect(offlineDialog).toBeVisible();
    await offlineDialog.getByRole('button', { name: /Simular Corte de Internet/i }).click();
    await offlineDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    const posList = page.getByRole('list', { name: 'Productos disponibles' });
    const posAddMilk = posList.getByRole('button', { name: /Agregar Leche Entera Colanta 1L/i });
    await posAddMilk.scrollIntoViewIfNeeded();
    await posAddMilk.click();
    await posAddMilk.click();
    await posAddMilk.click(); // 3 uds -> $ 11.400

    if (!(await cartDialog.isVisible()) && (await mobileCartBtn.isVisible())) {
      await mobileCartBtn.click();
    }
    const confirmOfflineBtn = page.getByRole('button', { name: /Confirmar venta/i });
    await confirmOfflineBtn.scrollIntoViewIfNeeded();
    await confirmOfflineBtn.click();
    await expect(page.getByRole('status')).toContainText('Encolada en Modo Offline (FIFO)');
    await expect(page.getByRole('status')).toContainText('$ 11.400');

    const banner = page.getByRole('region', {
      name: 'Estado de modo offline y cola de sincronización',
    });
    await banner.getByRole('button', { name: /Reconectar y Sincronizar/i }).click();
    await expect(banner).not.toBeVisible();

    // 4. Tienda Vecinal (#/tienda/surtifacil): confirmar pedido mayorista 3+ y verlo en Bandeja POS
    await page.goto('/#/tienda/surtifacil');
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole('button', { name: /Agregar Leche Entera Colanta 1L a la canasta/i })
      .click();
    await page.getByRole('button', { name: /Abrir canasta y confirmar pedido/i }).click();
    const storePlus = page.getByRole('button', { name: 'Sumar uno de Leche Entera Colanta 1L' });
    await storePlus.click();
    await storePlus.click(); // 3 uds -> tarifa mayorista 3+
    await expect(page.getByText(/🏷️ Mayorista 3\+/i)).toBeVisible();

    const pickupBtn = page.getByRole('button', { name: /Retiro en Tienda/i });
    await pickupBtn.scrollIntoViewIfNeeded();
    await pickupBtn.click();
    await expect(page.getByLabel(/Dirección de Entrega \*/i)).not.toBeVisible();
    await page.getByLabel(/Tu Nombre y Apellido \*/i).fill('Vecino Mayorista');
    const confirmStoreOrderBtn = page.getByRole('button', { name: /Confirmar Pedido Vecinal/i });
    await confirmStoreOrderBtn.scrollIntoViewIfNeeded();
    await confirmStoreOrderBtn.click();

    await expect(page).toHaveURL(/#\/pedido\//);
    await expect(page.getByText(/Vecino Mayorista/i)).toBeVisible();

    // Volver al POS -> Bandeja Pedidos Kiosco / Web -> verificar badge 🏷️ 3+, total $ 11.400 y facturar a 1 clic
    await page.goto('/#/create-sale');
    await page.getByRole('button', { name: /Bandeja Pedidos Kiosco \/ Web/i }).click();
    await expect(page.getByText('Vecino Mayorista')).toBeVisible();
    await expect(page.getByText('$ 11.400').first()).toBeVisible();
    await expect(page.getByText('🏷️ 3+').first()).toBeVisible();
    await page.getByRole('button', { name: /Facturar y Despachar/i }).first().click();
    await expect(page.getByText(/facturado exitosamente/i)).toBeVisible();

    // 5. Kiosco iPad (#/kiosco/surtifacil): emitir turno con tarifa mayorista 3+ ($ 11.400)
    await page.goto('/#/kiosco/surtifacil');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Agregar Leche Entera Colanta 1L al pedido' }).click();
    const kioskPlus = page.getByRole('button', {
      name: 'Agregar otra unidad de Leche Entera Colanta 1L',
      exact: true,
    });
    await kioskPlus.click();
    await kioskPlus.click();
    await expect(page.getByText(/✅ Promo 3\+ activa · Ahorras \$ 1\.200/i)).toBeVisible();

    const continueBtn = page.getByRole('button', { name: /CONTINUAR PEDIDO/i });
    if (!(await continueBtn.isVisible())) {
      await page.getByRole('button', { name: /Ver canasta con 3 productos/i }).click();
    }
    await page.getByRole('button', { name: /CONTINUAR PEDIDO/i }).click();
    await page.getByLabel(/Tu Nombre o Apellido/i).fill('Cliente Kiosco Mayorista');
    await page.getByRole('button', { name: /Siguiente: Forma de Pago/i }).click();
    await page.getByRole('button', { name: /Confirmar y Sacar Turno/i }).click();

    await expect(page.getByText(/¡Pedido Registrado con Éxito!/i)).toBeVisible();
    await expect(page.getByText('$ 11.400')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
