import { expect, test, type Locator, type Page } from '@playwright/test';
import {
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
    `No debe existir scroll horizontal (${overflow.scrollWidth} > ${overflow.innerWidth})`
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

async function expectTapTarget(locator: Locator, minHeight = 44) {
  const box = await locator.boundingBox();
  expect(box, 'El control táctil debe estar visible en pantalla').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minHeight);
}

async function logoutCurrentUser(page: Page) {
  if (await isCompactPhoneViewport(page)) {
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('button', { name: 'Más' })
      .click();
    await page
      .getByRole('dialog', { name: 'Más opciones' })
      .getByRole('button', { name: 'Cerrar sesión' })
      .click();
  } else {
    await page
      .getByRole('complementary', { name: 'Menú principal' })
      .getByRole('button', { name: 'Cerrar sesión' })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
}

async function openPosCartIfMobile(page: Page) {
  const mobileCartBtn = page.getByRole('button', { name: /Ver carrito,/i });
  const cartDialog = page.getByRole('dialog', { name: /Carrito \(/i });
  if (!(await cartDialog.isVisible()) && (await mobileCartBtn.isVisible())) {
    await mobileCartBtn.click();
  }
}

async function expandFirstSale(page: Page) {
  const desktopDetailsBtn = page.getByRole('button', { name: 'Ver detalles' }).first();
  if (await desktopDetailsBtn.isVisible()) {
    await desktopDetailsBtn.click();
  } else {
    await page.getByRole('list', { name: 'Ventas' }).getByRole('button').first().click();
  }
}

test.describe('Certificación Multi-Dispositivo Fase 7 — Blindaje, Fidelización, Finanzas Reales y Granel/Kardex', () => {
  test('P7-1. Blindaje Comercial Pre-Lanzamiento (Modo Demo SuperAdmin, Tarjeta Criptográfica, Ocultamiento en Login y Bloqueo 403)', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 1. SuperAdmin (#/super-admin): desactivar Modo Demo
    await page.goto('/#/super-admin');
    await expectNoHorizontalOverflow(page);

    const secBanner = page.getByTestId('superadmin-security-banner');
    await expect(secBanner).toBeVisible();
    await expect(secBanner.getByText('Activo (Pruebas / Demo)')).toBeVisible();

    const toggleDemoBtn = secBanner.getByRole('button', { name: /Desactivar Modo Demo/i });
    await expectTapTarget(toggleDemoBtn, 44);
    await toggleDemoBtn.click();
    await expect(secBanner.getByText('Cerrado Comercial')).toBeVisible();

    // 2. Ajustes (#/settings): validar tarjeta de Blindaje Criptográfico y touch targets
    await page.goto('/#/settings');
    await expectNoHorizontalOverflow(page);

    const securityCard = page.getByTestId('security-hardening-card');
    await expect(securityCard).toBeVisible();
    await expect(securityCard.getByText('Sesiones D1: HMAC-SHA256')).toBeVisible();
    await expect(securityCard.getByText(/PBKDF2-SHA256/)).toBeVisible();
    await expect(securityCard.getByText('Tokens Mock: Bloqueados en Prod')).toBeVisible();
    await expect(securityCard.getByText('Firma HMAC Meta: Configurada')).toBeVisible();
    await expect(securityCard.getByText(/Acceso rápido demo: Deshabilitado/i)).toBeVisible();

    const deepSeekBtn = page.getByRole('button', { name: /Probar Conexión DeepSeek/i });
    await deepSeekBtn.scrollIntoViewIfNeeded();
    await expectTapTarget(deepSeekBtn, 44);

    // 3. Cerrar sesión -> Login oculta acceso rápido demo y API rechaza quick_access con 403
    await logoutCurrentUser(page);
    await expectNoHorizontalOverflow(page);

    await expect(page.getByTestId('demo-access-disabled-notice')).toBeVisible();
    await expect(page.getByRole('button', { name: /Entrar como Admin/i })).toBeHidden();
    await expect(page.getByRole('button', { name: /Entrar como Cajero/i })).toBeHidden();
    await expect(page.getByRole('button', { name: /Entrar como SuperAdmin/i })).toBeHidden();

    const quickLoginStatus = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@surtifacil.com', quick_access: true }),
      });
      return res.status;
    });
    expect(quickLoginStatus).toBe(403);

    // 4. Reingresar con credenciales reales en formulario
    await page.getByLabel('Correo electrónico').fill('andres.san1404@gmail.com');
    await page.getByLabel('Contraseña').fill('Surtifacil2026!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    if (await isCompactPhoneViewport(page)) {
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    } else {
      await expect(page.getByRole('complementary', { name: 'Menú principal' })).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });

  test('P7-2. Club de Puntos del Barrio y Cupones WhatsApp Omnicanal (Admin, POS, Kiosco iPad, Tienda Vecinal y RBAC Cajero)', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 1. Panel Club de Puntos (#/loyalty): bono +20 pts y nuevo cupón FASE7 (10%)
    await page.goto('/#/loyalty');
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('heading', { name: /Club de Puntos del Barrio/i })).toBeVisible();

    const bonusBtn = page.getByRole('button', { name: /Bono \/ Ajuste/i }).first();
    await expectTapTarget(bonusBtn, 44);
    await bonusBtn.click();

    const adjustDialog = page.getByRole('dialog', { name: /Bono o Ajuste/i });
    await adjustDialog.getByRole('button', { name: '+20 pts' }).click();
    await adjustDialog.getByLabel(/Motivo del ajuste o bono/i).fill('Bono fidelidad Fase 7');
    await adjustDialog.getByRole('button', { name: 'Aplicar Ajuste' }).click();
    await expect(page.getByText('⭐ 105 pts')).toBeVisible();

    await page.getByRole('tab', { name: /Cupones WhatsApp/i }).click();
    const newCouponBtn = page.getByRole('button', { name: /Nuevo Cupón WhatsApp/i });
    await expectTapTarget(newCouponBtn, 44);
    await newCouponBtn.click();

    const coupDialog = page.getByRole('dialog', { name: /Crear Cupón Promocional WhatsApp/i });
    await coupDialog.getByLabel(/Código del Cupón/i).fill('FASE7');
    await coupDialog.getByLabel(/Porcentaje de descuento/i).fill('10');
    await coupDialog.getByLabel(/Compra Mínima/i).fill('5000');
    await coupDialog.getByRole('button', { name: 'Crear Cupón' }).click();
    await expect(page.getByText('FASE7').first()).toBeVisible();

    const fase7Card = page.locator('article').filter({ hasText: 'FASE7' }).first();
    await fase7Card.getByRole('button', { name: /Compartir WhatsApp/i }).click();
    const shareDialog = page.getByRole('dialog', { name: /Compartir Cupón FASE7/i });
    await expect(shareDialog).toBeVisible();
    await expect(shareDialog.getByText(/CUPÓN DE REGALO/i)).toBeVisible();
    await shareDialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await expect(shareDialog).not.toBeVisible();

    // 2. POS (#/create-sale): consulta celular, cupón FASE7, canje máximo y tirilla térmica
    await page.goto('/#/create-sale');
    await expectNoHorizontalOverflow(page);

    const posList = page.getByRole('list', { name: 'Productos disponibles' });
    const posAddMilk = posList.getByRole('button', { name: /Agregar Leche Entera Colanta 1L/i });
    await posAddMilk.click();
    await posAddMilk.click();
    await posAddMilk.click(); // 3 uds = $ 11.400

    await openPosCartIfMobile(page);

    const loyaltyToggleBtn = page.getByRole('button', { name: /Club de Puntos \/ Cupón/i });
    await expectTapTarget(loyaltyToggleBtn, 44);
    await loyaltyToggleBtn.click();

    await page.getByLabel(/Celular del Vecino/i).fill('3004567890');
    await page.getByRole('button', { name: 'Consultar' }).click();
    await expect(page.getByText('Don Carlos Restrepo')).toBeVisible();

    await page.getByLabel(/Código de Cupón WhatsApp/i).fill('FASE7');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/🎟️ FASE7/i)).toBeVisible();

    const redeemMaxBtn = page.getByRole('button', { name: /Canjear máx\./i });
    await expectTapTarget(redeemMaxBtn, 44);
    await redeemMaxBtn.click();

    const exactPayBtn = page.getByRole('button', { name: /Pago exacto de/i });
    await exactPayBtn.scrollIntoViewIfNeeded();
    await exactPayBtn.click();

    const confirmSaleBtn = page.getByRole('button', { name: /Confirmar venta/i });
    await confirmSaleBtn.scrollIntoViewIfNeeded();
    await confirmSaleBtn.click();

    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' })).toBeVisible();
    await page.getByRole('button', { name: /Tirilla Térmica/i }).click();
    const receiptDialog = page.getByRole('dialog');
    await expect(receiptDialog).toContainText('Cupón FASE7:');
    await expect(receiptDialog).toContainText('Canje Puntos');
    await expect(receiptDialog).toContainText('Puntos Ganados Club:');
    await receiptDialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();

    // 3. Kiosco iPad (#/kiosco/surtifacil): consulta puntos + cupón VECINO10
    await page.goto('/#/kiosco/surtifacil');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Agregar Leche Entera Colanta 1L al pedido' }).click();
    const kioskPlus = page.getByRole('button', {
      name: 'Agregar otra unidad de Leche Entera Colanta 1L',
      exact: true,
    });
    await kioskPlus.click();
    await kioskPlus.click();

    const kioskContinue = page.getByRole('button', { name: /CONTINUAR PEDIDO/i });
    if (!(await kioskContinue.isVisible())) {
      await page.getByRole('button', { name: /Ver canasta con 3 productos/i }).click();
    }
    await kioskContinue.click();

    await page.getByLabel(/Tu Nombre o Apellido/i).fill('Don Carlos Kiosco');
    await page.getByLabel(/Teléfono WhatsApp/i).fill('3004567890');
    await page.getByRole('button', { name: /Consultar mis Puntos/i }).click();
    await expect(page.getByText(/Don Carlos R\./i)).toBeVisible();
    await page.getByRole('button', { name: /Siguiente: Forma de Pago/i }).click();

    await page.getByLabel(/¿Tienes un cupón de descuento\?/i).fill('VECINO10');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/🎟️ VECINO10/i)).toBeVisible();
    await page.getByRole('button', { name: /Confirmar y Sacar Turno/i }).click();

    await expect(page.getByText(/¡Pedido Registrado con Éxito!/i)).toBeVisible();
    await expect(page.getByText(/🎟️ Cupón VECINO10/i)).toBeVisible();

    // 4. Tienda Vecinal (#/tienda/surtifacil): Doña Marta (3112345678) + canje + cupón VECINO10 -> rastreo
    await page.goto('/#/tienda/surtifacil');
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole('button', { name: /Agregar Leche Entera Colanta 1L a la canasta/i })
      .click();
    await page.getByRole('button', { name: /Abrir canasta y confirmar pedido/i }).click();
    const storePlusBtn = page.getByRole('button', { name: 'Sumar uno de Leche Entera Colanta 1L' });
    await storePlusBtn.click();
    await storePlusBtn.click();

    const pickupBtn = page.getByRole('button', { name: /Retiro en Tienda/i });
    await pickupBtn.scrollIntoViewIfNeeded();
    await pickupBtn.click();
    await page.getByLabel(/Tu Nombre y Apellido \*/i).fill('Doña Marta Tienda');
    await page.getByLabel(/Teléfono \/ WhatsApp de Contacto/i).fill('3112345678');
    await page.getByRole('button', { name: /Ver Puntos/i }).click();
    await expect(page.getByText(/Doña Marta G\./i)).toBeVisible();
    await page.getByRole('button', { name: /Usar \d+ puntos/i }).click();

    await page.getByLabel(/¿Tienes un cupón de descuento\?/i).fill('VECINO10');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/🎟️ VECINO10/i)).toBeVisible();

    const confirmStoreBtn = page.getByRole('button', { name: /Confirmar Pedido Vecinal/i });
    await confirmStoreBtn.scrollIntoViewIfNeeded();
    await confirmStoreBtn.click();
    await expect(page).toHaveURL(/#\/pedido\//);
    await expect(page.getByText(/🎟️ Cupón VECINO10:/i)).toBeVisible();
    await expect(page.getByText(/Puntos por ganar al entregar:/i)).toBeVisible();

    // 5. RBAC Cajero en #/loyalty y API 403
    await page.goto('/#/create-sale');
    await logoutCurrentUser(page);
    await page.getByRole('button', { name: /Entrar como Cajero/i }).click();
    await expect(page).toHaveURL(/#\/create-sale/);

    await page.goto('/#/loyalty');
    await expect(page.getByRole('heading', { name: /Club de Puntos del Barrio/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nuevo Cupón WhatsApp/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Bono \/ Ajuste/i })).toHaveCount(0);

    const rbacStatuses = await page.evaluate(async () => {
      const token = window.localStorage.getItem('sf_auth_token') || '';
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      const [cRes, cfgRes, adjRes] = await Promise.all([
        fetch('/api/coupons', {
          method: 'POST',
          headers,
          body: JSON.stringify({ code: 'CAJERO10', discount_type: 'percentage', discount_value: 10 }),
        }),
        fetch('/api/loyalty/config', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ enabled: false }),
        }),
        fetch('/api/loyalty/accounts/loy-don-carlos/adjust', {
          method: 'POST',
          headers,
          body: JSON.stringify({ points_delta: 100, description: 'Intento no autorizado' }),
        }),
      ]);
      return [cRes.status, cfgRes.status, adjRes.status];
    });
    expect(rbacStatuses).toEqual([403, 403, 403]);

    expect(pageErrors).toEqual([]);
  });

  test('P7-3. Pagos Mixtos, Impacto Real en Arqueo COP, Anulación Atómica con Reintegro, Utilidad Neta Real P&G y RBAC Cajero', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 1. POS (#/create-sale): Venta mixta 3 leches ($ 11.400) = Efectivo ($ 6.400) + Fiado ($ 5.000)
    await page.goto('/#/create-sale');
    const posList = page.getByRole('list', { name: 'Productos disponibles' });
    const posAddMilk = posList.getByRole('button', { name: /Agregar Leche Entera Colanta 1L/i });
    await posAddMilk.click();
    await posAddMilk.click();
    await posAddMilk.click();

    await openPosCartIfMobile(page);

    await page.getByRole('radio', { name: /Mixto/i }).click();
    const mixedRegion = page.getByRole('region', { name: 'Desglose de pago mixto' });
    await expect(mixedRegion).toBeVisible();

    const presetBtn = mixedRegion.getByRole('button', { name: /Efectivo \+ 📒 Fiado/i });
    await expectTapTarget(presetBtn, 44);
    await presetBtn.click();

    await mixedRegion.getByLabel(/Efectivo \(COP\)/i).fill('6400');
    await expect(mixedRegion).toContainText('Cuadre exacto');

    const creditSelect = page.getByLabel('Cliente al que se le fía');
    await creditSelect.scrollIntoViewIfNeeded();
    await creditSelect.selectOption('cc-marta-1');

    const confirmMixedBtn = page.getByRole('button', { name: /Confirmar venta/i });
    await confirmMixedBtn.scrollIntoViewIfNeeded();
    await confirmMixedBtn.click();

    const successBanner = page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' });
    await expect(successBanner).toBeVisible();
    await expect(successBanner).toContainText('Pago Mixto');

    await page.getByRole('button', { name: /Tirilla Térmica/i }).click();
    const receiptDialog = page.getByRole('dialog');
    await expect(receiptDialog).toContainText('Pago Mixto');
    await expect(receiptDialog).toContainText('$ 6.400');
    await expect(receiptDialog).toContainText('$ 5.000');
    await receiptDialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();

    // 2. Arqueo COP: solo la parte en efectivo ($ 6.400) incrementa el esperado ($ 150.000 -> $ 156.400)
    await page.getByRole('button', { name: /Arqueo \/ Cierre COP/i }).first().click();
    const closingDialog = page.getByRole('dialog', { name: /Arqueo y Cierre de Caja/i });
    await expect(closingDialog).toBeVisible();
    await expect(closingDialog.getByText('$ 156.400').first()).toBeVisible();
    await closingDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(closingDialog).not.toBeVisible();

    // 3. Historial (#/sales): auditoría de Pago Mixto y Anulación Atómica con reintegro
    await page.goto('/#/sales');
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/Pago Mixto/i).first()).toBeVisible();

    await expandFirstSale(page);
    await expect(page.getByText('🔀 Desglose de Pago Mixto')).toBeVisible();

    const voidBtn = page.getByRole('button', { name: /Anular \/ Devolver Venta/i });
    await expectTapTarget(voidBtn, 44);
    await voidBtn.click();

    const voidDialog = page.getByRole('dialog', { name: /Anular Venta/i });
    await expect(voidDialog).toBeVisible();
    await voidDialog.getByRole('button', { name: 'Devolución del cliente' }).click();
    await voidDialog.getByRole('button', { name: /Confirmar Anulación y Reintegrar Stock/i }).click();

    await expect(page.getByText(/anulada\. Se reintegraron 3 unidades/i)).toBeVisible();
    await expect(page.getByText('🚫 Anulada').first()).toBeVisible();

    // Verificar que Doña Marta Restrepo volvió a su saldo de $ 18.500 en Fiados
    await page.goto('/#/credits');
    await expect(page.getByText('Doña Marta Restrepo').first()).toBeVisible();
    await expect(page.getByText(/\$\s*18\.500/).first()).toBeVisible();

    // 4. Registrar 1 venta vigente ($ 8.400) + 1 gasto Caja Menor ($ 5.000) + 1 merma Aguacate ($ 2.400)
    await page.goto('/#/create-sale');
    const posList2 = page.getByRole('list', { name: 'Productos disponibles' });
    const posAddMilk2 = posList2.getByRole('button', { name: /Agregar Leche Entera Colanta 1L/i });
    await posAddMilk2.click();
    await posAddMilk2.click();
    await openPosCartIfMobile(page);
    const payExact2 = page.getByRole('button', { name: /Pago exacto de/i });
    await payExact2.scrollIntoViewIfNeeded();
    await payExact2.click();
    const confirm2 = page.getByRole('button', { name: /Confirmar venta/i });
    await confirm2.scrollIntoViewIfNeeded();
    await confirm2.click();
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' })).toBeVisible();

    await page.getByRole('button', { name: /Caja Menor/i }).first().click();
    const pettyDialog = page.getByRole('dialog', { name: /Caja Menor y Gastos del Turno/i });
    await pettyDialog.getByRole('button', { name: /Bolsas e Insumos/i }).click();
    await pettyDialog.getByRole('button', { name: '$ 5.000' }).click();
    await pettyDialog.getByLabel(/Concepto \/ Descripción/i).fill('Bolsas fase 7');
    await pettyDialog.getByRole('button', { name: /Registrar Salida de Caja/i }).click();
    await expect(pettyDialog.getByRole('status')).toContainText('Salida registrada: $ 5.000');
    await pettyDialog.getByRole('button', { name: 'Listo' }).click();

    await page.goto('/#/inventory');
    await page.getByRole('button', { name: /Mermas y Averías/i }).click();
    const shrinkageDialog = page.getByRole('dialog', {
      name: /Control de Mermas, Averías y Vencimientos/i,
    });
    await shrinkageDialog.locator('#shrinkage-product').selectOption('prod-aguacate-1');
    await shrinkageDialog.getByRole('button', { name: /Daño Fruver \/ Maduración/i }).click();
    await shrinkageDialog.locator('#shrinkage-quantity').fill('1');
    await shrinkageDialog.getByLabel(/Observación \/ Detalle/i).fill('Merma prueba P&G');
    await shrinkageDialog.getByRole('button', { name: /Registrar Baja de Inventario/i }).click();
    await expect(shrinkageDialog.getByRole('status')).toContainText('Baja registrada: -1 libra de Aguacate Hass Maduro');
    await shrinkageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click();

    // 5. Estado de Resultados P&G en #/reports y #/margins
    await page.goto('/#/reports');
    await expectNoHorizontalOverflow(page);
    const pnlReports = page.getByRole('region', { name: 'Estado de Resultados de Utilidad Neta Real' });
    await expect(pnlReports).toBeVisible();
    await expect(pnlReports).toContainText('1 anulada excluida');
    await expect(pnlReports).toContainText('-$ 2.400');
    await expect(pnlReports).toContainText('-$ 5.000');
    await expect(pnlReports).toContainText('UTILIDAD NETA REAL');
    await expectTapTarget(pnlReports.getByRole('button', { name: /Exportar Estado P&G/i }), 44);

    await page.goto('/#/margins');
    await expectNoHorizontalOverflow(page);
    const pnlMargins = page.getByRole('region', { name: 'Estado de Resultados de Utilidad Neta Real' });
    await expect(pnlMargins).toBeVisible();
    await expect(pnlMargins).toContainText('UTILIDAD NETA REAL');

    // 6. RBAC Cajero: no puede anular ventas en #/sales ni vía API (403)
    await logoutCurrentUser(page);
    await page.getByRole('button', { name: /Entrar como Cajero/i }).click();
    await expect(page).toHaveURL(/#\/create-sale/);

    await page.goto('/#/sales');
    await expectNoHorizontalOverflow(page);
    await expandFirstSale(page);
    await expect(page.getByRole('button', { name: /Anular \/ Devolver Venta/i })).toHaveCount(0);

    const cashierVoidStatus = await page.evaluate(async () => {
      const token = window.localStorage.getItem('sf_auth_token') || '';
      const salesRes = await fetch('/api/sales', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = await salesRes.json();
      const targetId = Array.isArray(list) && list[0]?.id ? list[0].id : 'sale-none';
      const voidRes = await fetch(`/api/sales/${targetId}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Intento de cajero' }),
      });
      return voidRes.status;
    });
    expect(cashierVoidStatus).toBe(403);

    expect(pageErrors).toEqual([]);
  });

  test('P7-4. Venta a Granel (Peso / Valor COP) Omnicanal, Voz Sarin Fraccionada, Offline FIFO y Kardex Trazable + RBAC Cajero', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 1. POS (#/create-sale): Venta a granel por Valor COP ($ 3.000 -> 0.75 lb)
    await page.goto('/#/create-sale');
    await expectNoHorizontalOverflow(page);

    const posList = page.getByRole('list', { name: 'Productos disponibles' });
    const bulkPosCard = posList.getByRole('button', { name: /Agregar Papa Criolla a Granel/i }).first();
    await bulkPosCard.scrollIntoViewIfNeeded();
    await bulkPosCard.click();

    const calcDialog = page.getByRole('dialog');
    await expect(calcDialog).toBeVisible();
    await calcDialog.getByRole('tab', { name: /Por Valor \(COP\)/i }).click();
    const preset3k = calcDialog.getByRole('button', { name: '$ 3.000' });
    await expectTapTarget(preset3k, 44);
    await preset3k.click();
    await calcDialog.getByRole('button', { name: /Agregar 0\.75 lb/i }).click();
    await expect(calcDialog).not.toBeVisible();

    await openPosCartIfMobile(page);
    await expect(page.getByText('0.75 lb').first()).toBeVisible();
    const payExact1 = page.getByRole('button', { name: /Pago exacto de/i });
    await payExact1.scrollIntoViewIfNeeded();
    await payExact1.click();
    const confirm1 = page.getByRole('button', { name: /Confirmar venta/i });
    await confirm1.scrollIntoViewIfNeeded();
    await confirm1.click();
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' })).toBeVisible();

    // 2. Voz Sarin fraccionada en POS: "Sarin, media libra de papa criolla, pagan con 5 mil"
    await page.getByRole('button', { name: /Escribir \/ Simular comando/i }).click();
    await page
      .getByPlaceholder(/Sarin, dos leches/i)
      .fill('Sarin, media libra de papa criolla, pagan con 5 mil');
    await page.getByRole('button', { name: /Interpretar Comando/i }).click();

    const voiceCard = page.getByRole('region', { name: /Confirmación didáctica de comando de voz/i });
    await expect(voiceCard).toBeVisible();
    await expect(voiceCard.getByText('$ 2.000').first()).toBeVisible();
    await expect(voiceCard.getByText('$ 3.000')).toBeVisible();
    await voiceCard.getByRole('button', { name: /Aplicar productos al carrito/i }).click();

    await openPosCartIfMobile(page);
    const confirmVoiceBtn = page.getByRole('button', { name: /Confirmar venta/i });
    await confirmVoiceBtn.scrollIntoViewIfNeeded();
    await confirmVoiceBtn.click();
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' })).toBeVisible();

    // 3. Modo Offline Resiliente fraccionado (0.25 lb) y sincronización FIFO
    await page.getByRole('button', { name: 'Inspeccionar cola offline y resiliencia' }).click();
    const offlineDialog = page.getByRole('dialog', {
      name: /Resiliencia Offline y Cola FIFO Multi-Tenant/i,
    });
    await expect(offlineDialog).toBeVisible();
    await offlineDialog.getByRole('button', { name: /Simular Corte de Internet/i }).click();
    await offlineDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    await bulkPosCard.scrollIntoViewIfNeeded();
    await bulkPosCard.click();
    const calcOffline = page.getByRole('dialog');
    await expect(calcOffline).toBeVisible();
    await calcOffline.getByRole('button', { name: /¼ lb/i }).click();
    await calcOffline.getByRole('button', { name: /Agregar 0\.25 lb/i }).click();
    await expect(calcOffline).not.toBeVisible();

    await openPosCartIfMobile(page);
    const confirmOfflineBtn = page.getByRole('button', { name: /Confirmar venta/i });
    await confirmOfflineBtn.scrollIntoViewIfNeeded();
    await confirmOfflineBtn.click();
    await expect(page.getByRole('status')).toContainText('Encolada en Modo Offline (FIFO)');

    const banner = page.getByRole('region', {
      name: 'Estado de modo offline y cola de sincronización',
    });
    await banner.getByRole('button', { name: /Reconectar y Sincronizar/i }).click();
    await expect(banner).not.toBeVisible();

    // 4. Inventario (#/inventory): Kardex trazable y ajuste manual (+1.5 lb -> 30 lb)
    await page.goto('/#/inventory');
    await expectNoHorizontalOverflow(page);

    const kardexBtn = page
      .getByRole('button', { name: 'Ver Kardex de Papa Criolla a Granel' })
      .filter({ visible: true })
      .first();
    await expect(kardexBtn).toBeVisible();
    await kardexBtn.click();

    const kardexDialog = page.getByRole('dialog', { name: /Kardex de Inventario/i });
    await expect(kardexDialog).toBeVisible();
    await expectTapTarget(kardexDialog.getByRole('button', { name: /Exportar Excel CSV/i }), 44);
    await expect(kardexDialog.getByText('Inventario inicial bulto 30 lb')).toBeVisible();
    await expect(kardexDialog.getByText('Venta en mostrador POS').first()).toBeVisible();

    await kardexDialog.getByRole('button', { name: /Ajuste Manual de Stock/i }).click();
    await kardexDialog.locator('#kardex-adjust-qty').fill('1.5');
    const reasonChip = kardexDialog.getByRole('button', { name: 'Conteo físico de bodega' });
    await expectTapTarget(reasonChip, 44);
    await reasonChip.click();
    await kardexDialog.getByRole('button', { name: /Guardar Ajuste en Kardex/i }).click();
    await expect(kardexDialog.getByText(/stock actualizado a 30 lb/i)).toBeVisible();

    await kardexDialog.getByRole('button', { name: /⚖️ Ajustes/i }).click();
    await expect(kardexDialog.getByText('Conteo físico de bodega').first()).toBeVisible();
    await kardexDialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();

    // 5. Kiosco iPad (#/kiosco/surtifacil): compra a granel con touch targets >= 56px
    await page.goto('/#/kiosco/surtifacil');
    await expectNoHorizontalOverflow(page);

    const kioskWeightBtn = page
      .getByRole('button', { name: /Pesar y agregar Papa Criolla a Granel al pedido/i })
      .first();
    await kioskWeightBtn.scrollIntoViewIfNeeded();
    await expectTapTarget(kioskWeightBtn, 56);
    await kioskWeightBtn.click();

    const kioskCalc = page.getByRole('dialog');
    await expect(kioskCalc).toBeVisible();
    const halfLbBtn = kioskCalc.getByRole('button', { name: /½ lb/i });
    await expectTapTarget(halfLbBtn, 56);
    await halfLbBtn.click();
    await kioskCalc.getByRole('button', { name: /Agregar 0\.5 lb/i }).click();

    const kioskContinue = page.getByRole('button', { name: /CONTINUAR PEDIDO/i }).first();
    if (!(await kioskContinue.isVisible())) {
      await page.getByRole('button', { name: /Ver canasta con 1 productos/i }).click();
    }
    await kioskContinue.click();
    await page.getByLabel(/Tu Nombre o Apellido/i).fill('Cliente Kiosco Granel P7');
    await page.getByRole('button', { name: /Siguiente: Forma de Pago/i }).click();
    await page.getByRole('button', { name: /Confirmar y Sacar Turno/i }).click();
    await expect(page.getByText(/¡Pedido Registrado con Éxito!/i)).toBeVisible();

    // 6. Tienda Vecinal (#/tienda/surtifacil): compra a granel por valor ($ 2.000) -> rastreo
    await page.goto('/#/tienda/surtifacil');
    await expectNoHorizontalOverflow(page);

    const storeWeightBtn = page
      .getByRole('button', { name: /Elegir peso de Papa Criolla a Granel/i })
      .first();
    await storeWeightBtn.scrollIntoViewIfNeeded();
    await storeWeightBtn.click();

    const storeCalc = page.getByRole('dialog');
    await expect(storeCalc).toBeVisible();
    await storeCalc.getByRole('tab', { name: /Por Valor \(COP\)/i }).click();
    await storeCalc.getByRole('button', { name: '$ 2.000' }).click();
    await storeCalc.getByRole('button', { name: /Agregar 0\.5 lb/i }).click();

    await page.getByRole('button', { name: /Abrir canasta y confirmar pedido/i }).click();
    const storePickupBtn = page.getByRole('button', { name: /Retiro en Tienda/i });
    await storePickupBtn.scrollIntoViewIfNeeded();
    await storePickupBtn.click();
    await page.getByLabel(/Tu Nombre y Apellido \*/i).fill('Vecino Granel Fase 7');
    const storeConfirmBtn = page.getByRole('button', { name: /Confirmar Pedido Vecinal/i });
    await storeConfirmBtn.scrollIntoViewIfNeeded();
    await storeConfirmBtn.click();

    await expect(page).toHaveURL(/#\/pedido\//);
    await expect(page.getByText(/Vecino Granel Fase 7/i)).toBeVisible();

    // 7. RBAC Cajero en Kardex: puede leer en desktop/tablet/móvil, pero NO ajustar (403)
    await page.goto('/#/create-sale');
    await logoutCurrentUser(page);
    await page.getByRole('button', { name: /Entrar como Cajero/i }).click();
    await expect(page).toHaveURL(/#\/create-sale/);

    await page.goto('/#/inventory');
    await expectNoHorizontalOverflow(page);
    const cashierKardexBtn = page
      .getByRole('button', { name: 'Ver Kardex de Papa Criolla a Granel' })
      .filter({ visible: true })
      .first();
    await expect(cashierKardexBtn).toBeVisible();
    await expectTapTarget(cashierKardexBtn, 44);
    await cashierKardexBtn.click();

    const cashierKardexDialog = page.getByRole('dialog', { name: /Kardex de Inventario/i });
    await expect(cashierKardexDialog).toBeVisible();
    await expect(cashierKardexDialog.getByRole('button', { name: /Ajuste Manual de Stock/i })).toHaveCount(0);

    const cashierAdjustStatus = await page.evaluate(async () => {
      const token = window.localStorage.getItem('sf_auth_token') || '';
      const res = await fetch('/api/products/prod-papa-1/kardex/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: 'add', quantity: 5, reason: 'Intento cajero' }),
      });
      return res.status;
    });
    expect(cashierAdjustStatus).toBe(403);

    expect(pageErrors).toEqual([]);
  });
});
