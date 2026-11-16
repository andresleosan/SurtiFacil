import { expect, test } from '@playwright/test';
import { loginAsStaffAdmin, setupProductionE2EHarness } from './productionHarness';

test.describe('Suite E2E de Certificación de Producción — SurtiFácil SaaS', () => {
  test('1. Registro multi-tenant de nueva tienda (#/registro-negocio) y Login de Staff', async ({ page }) => {
    await setupProductionE2EHarness(page);

    // 1.1 Aprovisionamiento de un nuevo local en Medellín
    await page.goto('/#/registro-negocio');
    await expect(
      page.getByRole('heading', { name: 'Registra tu Tienda de Barrio o Abastos' }),
    ).toBeVisible();

    await page.getByLabel(/Nombre de la Tienda o Minimercado/i).fill('Abastos El Roble');
    await page.getByLabel(/Tu Nombre Completo/i).fill('Don Hernando Gaviria');
    await page.getByLabel(/Teléfono WhatsApp/i).fill('3009998877');
    await page.getByLabel(/Correo Electrónico de Acceso/i).fill('hernando@elroble.co');
    await page.getByLabel(/Contraseña de Administrador/i).fill('Roble2026!');

    await page.getByRole('button', { name: /Comenzar mi Tienda en SurtiFácil/i }).click();

    await expect(page.getByRole('heading', { name: '¡Bienvenido a SurtiFácil!' })).toBeVisible();
    await expect(page.getByText('#abastos-el-roble')).toBeVisible();

    // 1.2 Inicio de sesión del administrador
    await loginAsStaffAdmin(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('2. Gestión de catálogo, combos y configuración de tienda por el staff', async ({ page }) => {
    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 2.1 Navegar a Inventario y Menú
    const sidebar = page.getByRole('complementary', { name: 'Menú principal' });
    await sidebar.getByRole('button', { name: 'Inventario' }).click();
    await expect(page).toHaveURL(/#\/inventory$/);

    await expect(page.getByText('Leche Entera Colanta 1L').first()).toBeVisible();
    await expect(page.getByText('Arroz Diana 1kg').first()).toBeVisible();

    // 2.1b Verificar editor fotográfico con captura desde celular y compresor WebP
    const editLecheBtn = page.getByRole('button', { name: /Editar Leche Entera Colanta 1L/i }).first();
    if (await editLecheBtn.isVisible()) {
      await editLecheBtn.click();
      await expect(page.getByRole('heading', { name: 'Editar producto' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Tomar con Celular/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Subir de Galería/i })).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar' }).click();
    }

    // Verificar pestaña de Combos y Kits
    const combosTab = page.getByRole('button', { name: /Combos y Kits/i });
    if (await combosTab.isVisible()) {
      await combosTab.click();
      await expect(page.getByText('Combo Desayuno Paisa')).toBeVisible();
    }

    // 2.2 Navegar a Configuración del Local (#/settings)
    await sidebar.getByRole('button', { name: 'Configuración', exact: true }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { name: 'Configuración del Negocio' })).toBeVisible();
    await expect(page.getByText(/Afiches y Códigos QR para el Mostrador/i)).toBeVisible();

    const saveBtn = page.getByRole('button', { name: /Guardar Configuración/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await expect(page.getByText(/¡Configuración del local guardada exitosamente!/i)).toBeVisible();
  });

  test('3. Flujo completo de pedido en Modo Kiosco iPad (#/kiosco/surtifacil) y facturación en POS', async ({
    page,
  }) => {
    await setupProductionE2EHarness(page);

    // 3.1 Cliente arma su pedido en el iPad de la entrada
    await page.goto('/#/kiosco/surtifacil');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SurtiFácil Abastos Central');

    const addButtons = page.getByRole('button', { name: /Agregar/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    await page.getByRole('button', { name: /CONTINUAR PEDIDO/i }).first().click();
    await page.getByLabel(/Tu Nombre o Apellido/i).fill('Don Octavio Kiosco');
    await page.getByRole('button', { name: /Siguiente: Forma de Pago/i }).click();
    await page.getByRole('button', { name: /Confirmar y Sacar Turno/i }).click();

    await expect(page.getByText(/¡Pedido Registrado con Éxito!/i)).toBeVisible();
    await expect(page.getByText('#K-01')).toBeVisible();

    // 3.2 Cajero recibe el pedido en la Bandeja en Vivo del POS y lo factura a 1 clic
    await loginAsStaffAdmin(page);
    await page.getByRole('button', { name: '+ Nueva Venta' }).click();
    await expect(page).toHaveURL(/#\/create-sale$/);

    await page.getByRole('button', { name: /Bandeja Pedidos Kiosco \/ Web/i }).click();
    await expect(page.getByText('Don Octavio Kiosco')).toBeVisible();
    await expect(page.getByText('#K-01')).toBeVisible();

    await page.getByRole('button', { name: /Facturar y Despachar/i }).click();
    await expect(page.getByText(/#K-01 facturado exitosamente/i)).toBeVisible();
  });

  test('4. Flujo de Tienda Vecinal (#/tienda/surtifacil) y rastreo de pedido en vivo (#/pedido/:token)', async ({
    page,
  }) => {
    await setupProductionE2EHarness(page);

    await page.goto('/#/tienda/surtifacil');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SurtiFácil Abastos Central');

    const addButtons = page.getByRole('button', { name: /AGREGAR/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    await page.getByRole('button', { name: /Abrir canasta y confirmar pedido/i }).click();
    await page.getByLabel(/Tu Nombre y Apellido \*/i).fill('Doña Elena Laureles');

    const addressInput = page.getByLabel(/Dirección de Entrega \*/i);
    if (await addressInput.isVisible()) {
      await addressInput.fill('Circular 4 # 70-18 Apto 201');
    }

    await page.getByRole('button', { name: /Confirmar Pedido Vecinal/i }).click();

    await expect(page).toHaveURL(/#\/pedido\//);
    await expect(page.getByRole('heading', { name: /Rastreo de Pedido en Vivo/i })).toBeVisible();
    await expect(page.getByText(/Doña Elena Laureles/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Hablar por WhatsApp con la Tienda/i })).toBeVisible();
  });

  test('5. Venta en POS con Copiloto Sarin, Libro de Fiados, Arqueo de Caja COP y Panel SuperAdmin', async ({
    page,
  }) => {
    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 5.1 Venta en POS asistida por Voz Sarin
    await page.getByRole('button', { name: '+ Nueva Venta' }).click();
    await expect(page).toHaveURL(/#\/create-sale$/);

    await page.getByRole('button', { name: /Escribir \/ Simular comando/i }).click();
    await page.getByPlaceholder(/Sarin, dos leches/i).fill('Sarin, agrega dos leches, pagan con 20 mil');
    await page.getByRole('button', { name: /Interpretar Comando/i }).click();

    const confirmCard = page.getByRole('region', { name: /Confirmación didáctica de comando de voz/i });
    await expect(confirmCard).toBeVisible();
    await expect(confirmCard.getByText(/Vueltas a Entregar/i)).toBeVisible();
    await confirmCard.getByRole('button', { name: /Aplicar productos al carrito/i }).click();

    // 5.1.1 Teclado Táctil de Billetes COP y Calculadora Visual de Vueltas en POS (Tarea 20)
    const cashCalc = page.getByRole('region', { name: /Calculadora de efectivo y vueltas COP/i });
    await expect(cashCalc).toBeVisible();
    await expect(cashCalc.getByText(/Vueltas a Entregar/i)).toBeVisible();
    await expect(cashCalc.getByRole('button', { name: /Pago exacto de/i })).toBeVisible();

    await page.getByRole('button', { name: /Confirmar venta/i }).click();
    await expect(page.getByRole('status')).toContainText('Venta registrada exitosamente');

    // 5.2 Copiloto Gerencial Sarin IA
    await page.getByRole('button', { name: 'Abrir Sarin Copiloto Gerencial' }).first().click();
    const copilotDialog = page.getByRole('dialog', { name: /Sarin Copiloto Gerencial/i });
    await expect(copilotDialog).toBeVisible();
    await copilotDialog.getByRole('button', { name: /Ventas y Ganancias de Hoy/i }).click();
    await expect(copilotDialog.getByText(/Balance de Ventas/i)).toBeVisible();
    await copilotDialog.getByRole('button', { name: /Cerrar Copiloto Sarin/i }).click();

    // 5.3 Libro Digital de Fiados (#/credits)
    const sidebar = page.getByRole('complementary', { name: 'Menú principal' });
    await sidebar.getByRole('button', { name: 'Fiados', exact: true }).click();
    await expect(page).toHaveURL(/#\/credits$/);
    await expect(page.getByText('Doña Marta Restrepo')).toBeVisible();

    // 5.4 Caja Menor del Turno y Arqueo/Cierre de Caja COP
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: /Arqueo y Cierre COP/i }).last().click();
    const closingDialog = page.getByRole('dialog', { name: /Arqueo y Cierre de Caja/i });
    await expect(closingDialog.getByText(/Resumen del Turno Actual/i)).toBeVisible();

    // Registrar gasto de caja menor desde el arqueo y verificar descuento automático
    await closingDialog.getByRole('button', { name: /Registrar Gasto/i }).click();
    const pettyDialog = page.getByRole('dialog', { name: /Caja Menor y Gastos del Turno/i });
    await expect(pettyDialog).toBeVisible();
    await pettyDialog.getByRole('button', { name: '$ 20.000' }).click();
    await pettyDialog.getByLabel(/Concepto \/ Descripción/i).fill('Pago panadería del turno');
    await pettyDialog.getByRole('button', { name: /Registrar Salida de Caja/i }).click();
    await expect(pettyDialog.getByRole('status')).toContainText('Salida registrada: $ 20.000');
    await pettyDialog.getByRole('button', { name: 'Listo' }).click();
    await expect(pettyDialog).not.toBeVisible();

    await expect(closingDialog.getByText(/Gastos Caja Menor \(1\)/i)).toBeVisible();
    await expect(closingDialog.getByText('-$ 20.000')).toBeVisible();

    await closingDialog.getByRole('button', { name: /Cerrar Caja y Generar Acta/i }).click();
    const savedDialog = page.getByRole('dialog', { name: /Acta de Cierre/i });
    await expect(savedDialog.getByText(/Cierre de Caja Guardado con Éxito/i)).toBeVisible();
    await expect(savedDialog.getByText(/Salidas de Caja Menor descontadas del esperado/i)).toBeVisible();
    await expect(savedDialog.getByText('-$ 20.000')).toBeVisible();
    await savedDialog.getByRole('button', { name: 'Listo' }).click();

    // 5.5 Centro de Control SuperAdmin (#/super-admin)
    await page.getByRole('button', { name: 'SuperAdmin' }).first().click();
    await expect(page).toHaveURL(/#\/super-admin$/);
    await expect(page.getByRole('heading', { name: 'Centro de Control SuperAdmin' })).toBeVisible();
    await expect(page.getByText('Mercados La 70 Laureles')).toBeVisible();
  });

  test('6. Modo Offline Resiliente en Mostrador (IndexedDB + Cola FIFO + Auto-Sincronización)', async ({
    page,
  }) => {
    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 6.1 Ir al POS para que el catálogo quede respaldado en IndexedDB local
    await page.getByRole('button', { name: '+ Nueva Venta' }).click();
    await expect(page).toHaveURL(/#\/create-sale$/);
    await expect(page.getByText('Leche Entera Colanta 1L').first()).toBeVisible();

    // 6.2 Abrir el modal de Resiliencia Offline y activar el corte de internet simulado
    await page.getByRole('button', { name: 'Inspeccionar cola offline y resiliencia' }).click();
    const offlineDialog = page.getByRole('dialog', {
      name: /Resiliencia Offline y Cola FIFO Multi-Tenant/i,
    });
    await expect(offlineDialog).toBeVisible();

    await offlineDialog.getByRole('button', { name: /Simular Corte de Internet/i }).click();
    await offlineDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    // 6.3 Verificar que el banner ámbar interactivo aparece en la cabecera
    const banner = page.getByRole('region', {
      name: 'Estado de modo offline y cola de sincronización',
    });
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/Modo Offline Resiliente Activo/i)).toBeVisible();

    // 6.4 Registrar una venta en POS estando sin internet
    const list = page.getByRole('list', { name: 'Productos disponibles' });
    await list.getByRole('button', { name: /Agregar Leche Entera Colanta 1L/i }).click();
    await page.getByRole('button', { name: /Confirmar venta/i }).click();

    await expect(page.getByRole('status')).toContainText('Encolada en Modo Offline (FIFO)');
    await expect(banner.getByText('1 en cola FIFO')).toBeVisible();

    // 6.5 Reconectar y sincronizar desde el banner interactivo
    await banner.getByRole('button', { name: /Reconectar y Sincronizar/i }).click();
    await expect(banner).not.toBeVisible();
  });

  test('7. Suite Fase 3: Libro Fiscal DIAN, Notificaciones Push y Centro de Integraciones en Vivo', async ({
    page,
  }) => {
    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 7.1 Reportes: Apertura del Libro Fiscal de Registro de Operaciones Diarias (DIAN Art. 616-1)
    await page.goto('/#/reports');
    const fiscalBtn = page.getByRole('button', { name: /Libro Fiscal DIAN/i });
    await expect(fiscalBtn).toBeVisible();
    await fiscalBtn.click();

    await expect(page.getByText(/Registro DIAN \(Art\. 616-1 E\.T\.\)/i)).toBeVisible();
    await expect(page.getByText(/No Responsable de IVA/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Exportar Excel CSV/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Imprimir/i })).toBeVisible();
    await page.getByRole('button', { name: 'Listo' }).click();

    // 7.2 POS Mostrador: Botón accesible de alertas de pedidos
    await page.goto('/#/create-sale');
    await expect(page.getByRole('button', { name: /Alertas/i })).toBeVisible();

    // 7.3 Configuración: Notificaciones push y Centro de Integraciones en Vivo
    await page.goto('/#/settings');
    await expect(page.getByText(/Notificaciones Push y Alertas de Mostrador/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Probar Alerta Ahora/i })).toBeVisible();
    await expect(page.getByText(/Centro de Integraciones y Auditoría de Secretos/i)).toBeVisible();
    await expect(page.getByText(/DeepSeek IA \(Copiloto\)/i)).toBeVisible();
    await expect(page.getByText(/WhatsApp Cloud API/i)).toBeVisible();

    // Probar conexión de DeepSeek en vivo
    const testDeepSeekBtn = page.getByRole('button', { name: /Probar Conexión DeepSeek/i });
    await expect(testDeepSeekBtn).toBeVisible();
    await testDeepSeekBtn.click();
    await expect(page.getByText(/Conexión exitosa/i).first()).toBeVisible();
  });

  test('8. Suite Fases 4 y 5: Catálogo Fotográfico Colombiano, Billetes COP, Cobranza WhatsApp y Tirilla Térmica (58mm/80mm + QR + DIAN)', async ({
    page,
  }) => {
    await setupProductionE2EHarness(page);
    await loginAsStaffAdmin(page);

    // 8.1 Catálogo Fotográfico Colombiano y Editor con Compresor WebP (#/inventory)
    await page.goto('/#/inventory');
    await page.getByRole('button', { name: /Catálogo Táctil/i }).click();

    await expect(page.getByRole('img', { name: 'Leche Entera Colanta 1L' })).toBeVisible();
    await expect(page.getByText('OFERTA', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /Editar Leche Entera Colanta 1L/i }).first().click();
    const editDialog = page.getByRole('dialog', { name: 'Editar producto' });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByRole('button', { name: /Tomar con Celular/i })).toBeVisible();
    await expect(editDialog.getByRole('button', { name: /Subir de Galería/i })).toBeVisible();

    await editDialog.getByRole('button', { name: /escribir \/ pegar URL web de la foto/i }).click();
    await editDialog.getByLabel(/URL directa de imagen/i).fill('/images/products/leche-colanta-1l.svg');
    await editDialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(editDialog).not.toBeVisible();

    // Verificar también el badge accesible de <ProductImage /> en la vitrina vecinal
    await page.goto('/#/tienda/surtifacil');
    await expect(page.getByRole('img', { name: 'Arroz Diana 1kg' })).toBeVisible();
    await expect(page.getByLabel('Producto en oferta').first()).toBeVisible();

    // 8.2 Teclado Táctil de Billetes COP y Calculadora Visual de Vueltas en POS (#/create-sale)
    await page.goto('/#/create-sale');
    await page
      .getByRole('list', { name: 'Productos disponibles' })
      .getByRole('button', { name: /Agregar Leche Entera Colanta 1L/i })
      .click();

    const mobileCartBtn = page.getByRole('button', { name: /Ver carrito,/i });
    if (await mobileCartBtn.isVisible()) {
      await mobileCartBtn.click();
    }

    const cashCalc = page.getByRole('region', { name: /Calculadora de efectivo y vueltas COP/i });
    await expect(cashCalc).toBeVisible();

    // Billete insuficiente ($ 2.000 para compra de $ 4.200) -> bloquea la venta
    await cashCalc.getByRole('button', { name: /Paga con billete de \$ 2\.000/i }).click();
    await expect(cashCalc.getByRole('alert')).toContainText('Dinero Insuficiente');
    await expect(cashCalc.getByRole('alert')).toContainText('Faltan $2200.00');
    await expect(page.getByRole('button', { name: /Dinero insuficiente/i })).toBeDisabled();

    // Billete suficiente ($ 50.000 para compra de $ 4.200) -> vueltas $ 45.800
    await cashCalc.getByRole('button', { name: /Paga con billete de \$ 50\.000/i }).click();
    await expect(cashCalc.getByRole('status')).toContainText('Vueltas a Entregar');
    await expect(cashCalc.getByRole('status')).toContainText('$45800.00');

    const confirmSaleBtn = page.getByRole('button', { name: /Confirmar venta/i });
    await expect(confirmSaleBtn).toBeEnabled();
    await confirmSaleBtn.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' }),
    ).toBeVisible();

    // 8.3 Tirilla Térmica de 58mm y 80mm con Código QR Vecinal y Leyenda DIAN Art. 616-1
    await page.getByRole('button', { name: /Tirilla Térmica/i }).click();
    const receiptDialog = page.getByRole('dialog').filter({ hasText: /Tirilla de Venta/i });
    await expect(receiptDialog).toBeVisible();

    await expect(receiptDialog.getByText(/SURTIFÁCIL ABASTOS CENTRAL/i)).toBeVisible();
    await expect(receiptDialog.getByText(/Efectivo Recibido:/i)).toBeVisible();
    await expect(receiptDialog.getByText(/\$ 50\.000/)).toBeVisible();
    await expect(receiptDialog.getByText(/Vueltas a Entregar:/i)).toBeVisible();
    await expect(receiptDialog.getByText(/\$ 45\.800/)).toBeVisible();
    await expect(receiptDialog.getByText(/NO RESPONSABLE DE IVA/i)).toBeVisible();
    await expect(receiptDialog.getByText(/616-1 E\.T\./i)).toBeVisible();
    await expect(receiptDialog.getByLabel(/Código QR de verificación vecinal y pedidos/i)).toBeVisible();

    // Alternar entre 80mm y 58mm
    await receiptDialog.getByRole('button', { name: /80mm \(Ancho\)/i }).click();
    await expect(receiptDialog.getByText(/Vista previa térmica \(80mm\)/i)).toBeVisible();
    await expect(receiptDialog.getByText(/NO RESPONSABLE DE IVA \(ART\. 616-1 E\.T\.\)/i)).toBeVisible();
    await receiptDialog.getByRole('button', { name: /58mm \(Estándar\)/i }).click();
    await expect(receiptDialog.getByText(/Vista previa térmica \(58mm\)/i)).toBeVisible();

    // Alternar visualización de QR
    const toggleQrBtn = receiptDialog.getByRole('button', { name: /Alternar código QR en la tirilla/i });
    await toggleQrBtn.click();
    await expect(receiptDialog.getByLabel(/Código QR de verificación vecinal y pedidos/i)).not.toBeVisible();
    await toggleQrBtn.click();
    await expect(receiptDialog.getByLabel(/Código QR de verificación vecinal y pedidos/i)).toBeVisible();

    await receiptDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(receiptDialog).not.toBeVisible();

    // 8.4 Cobranza Vecinal de Fiados por WhatsApp con Link Nequi/Bancolombia y Tirilla Térmica de Abono (#/credits)
    await page.goto('/#/credits');
    await expect(page.getByText('Doña Marta Restrepo')).toBeVisible();

    await page.getByRole('button', { name: 'Cobrar por WhatsApp a Doña Marta Restrepo' }).click();
    const debtDialog = page.getByRole('dialog', { name: /Cobranza de Fiados por WhatsApp/i });
    await expect(debtDialog).toBeVisible();
    await expect(debtDialog.getByText('$ 18.500', { exact: true })).toBeVisible();

    await debtDialog.getByRole('radio', { name: /Corte Quincena/i }).click();
    await debtDialog.getByRole('button', { name: /Quincena \(15 \/ 30\)/i }).click();
    await expect(debtDialog.getByText(/Se acerca el corte de quincena/i)).toBeVisible();
    await expect(debtDialog.getByText(/Nequi: 300 123 4567/i)).toBeVisible();

    await debtDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(debtDialog).not.toBeVisible();

    // Registrar abono a Doña Marta Restrepo y verificar tirilla automática de abono
    const desktopDetailBtn = page.getByRole('button', { name: 'Ver movimientos' }).first();
    if (await desktopDetailBtn.isVisible()) {
      await desktopDetailBtn.click();
    } else {
      await page.getByRole('button', { name: 'Ver Doña Marta Restrepo' }).click();
    }

    const detailDialog = page.getByRole('dialog', { name: 'Doña Marta Restrepo' });
    await expect(detailDialog).toBeVisible();
    await detailDialog.getByRole('button', { name: /Registrar abono/i }).click();
    await detailDialog.getByLabel(/Monto \(\$\)/i).fill('5000');
    await detailDialog.getByLabel(/Descripción/i).fill('Abono quincena Nequi');
    await detailDialog.getByRole('button', { name: /Guardar abono/i }).click();

    const paymentReceiptDialog = page.getByRole('dialog').filter({ hasText: /COMPROBANTE DE ABONO A FIADOS/i });
    await expect(paymentReceiptDialog).toBeVisible();
    await expect(paymentReceiptDialog.getByText(/VALOR ABONADO:/i)).toBeVisible();
    await expect(paymentReceiptDialog.getByText(/\$ 5\.000/)).toBeVisible();
    await expect(paymentReceiptDialog.getByText(/NUEVO SALDO DEUDOR:/i)).toBeVisible();
    await expect(paymentReceiptDialog.getByText(/\$ 13\.500/)).toBeVisible();
    await expect(paymentReceiptDialog.getByText(/616-1 E\.T\./i)).toBeVisible();
    await expect(paymentReceiptDialog.getByLabel(/Código QR de verificación vecinal y pedidos/i)).toBeVisible();

    await paymentReceiptDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(paymentReceiptDialog).not.toBeVisible();

    await expect(
      detailDialog.getByRole('button', { name: /Ver tirilla térmica del abono de \$5\.000/i }),
    ).toBeVisible();
  });

  test('9. Control de Mermas, Averías y Alertas de Vencimiento en Fruver y Bodega (#/inventory)', async ({ page }) => {
    await setupProductionE2EHarness(page);

    await page.goto('/#/login');
    await page.getByLabel('Correo electrónico').fill('andres.san1404@gmail.com');
    await page.getByLabel('Contraseña').fill('TestPass123!');
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click();

    await page.goto('/#/inventory');
    await expect(page.getByText(/2 productos próximos a vencer o vencidos/i)).toBeVisible();
    await expect(page.getByText('Aguacate Hass Maduro')).toBeVisible();
    await expect(page.getByText('Vence en 1d').first()).toBeVisible();

    // Filtrar por vencer
    await page.getByRole('button', { name: /Filtrar por vencer \(2\)/i }).click();
    await expect(page.getByText('Aguacate Hass Maduro')).toBeVisible();
    await expect(page.getByText('Arroz Diana 1kg')).not.toBeVisible();
    await page.getByRole('button', { name: /Mostrar todos/i }).click();
    await expect(page.getByText('Arroz Diana 1kg')).toBeVisible();

    // Abrir modal de Mermas y Averías
    await page.getByRole('button', { name: /Mermas y Averías/i }).click();
    const shrinkageDialog = page.getByRole('dialog', {
      name: /Control de Mermas, Averías y Vencimientos/i,
    });
    await expect(shrinkageDialog).toBeVisible();

    await shrinkageDialog.locator('#shrinkage-product').selectOption('prod-aguacate-1');
    await shrinkageDialog.getByRole('button', { name: /Daño Fruver \/ Maduración/i }).click();
    await shrinkageDialog.getByRole('button', { name: '2', exact: true }).click();
    await shrinkageDialog.getByLabel(/Observación \/ Detalle/i).fill('Aguacate pasado en exhibidor');

    await shrinkageDialog.getByRole('button', { name: /Registrar Baja de Inventario/i }).click();

    await expect(shrinkageDialog.getByRole('status')).toHaveText(
      /Baja registrada: -2 libra de Aguacate Hass Maduro/i,
    );
    await expect(shrinkageDialog.getByText(/−\$ 4\.800/)).toBeVisible();

    // Cerrar y verificar stock actualizado en inventario (25 -> 23)
    await shrinkageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(shrinkageDialog).not.toBeVisible();
    await expect(page.getByText(/^23$/).or(page.getByText(/23\s*uds\./i)).first()).toBeVisible();

    // Reabrir y revertir merma en 2 toques restaurando stock (23 -> 25)
    await page.getByRole('button', { name: /Registrar merma de Aguacate Hass Maduro/i }).click();
    const dialogAfter = page.getByRole('dialog', {
      name: /Control de Mermas, Averías y Vencimientos/i,
    });
    await expect(dialogAfter).toBeVisible();
    await dialogAfter.getByRole('button', { name: /Revertir merma de Aguacate Hass Maduro/i }).click();
    await dialogAfter.getByRole('button', { name: /Devolver \+2/i }).click();
    await expect(dialogAfter.getByRole('status')).toHaveText(/Merma revertida/i);
    await dialogAfter.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(page.getByText(/^25$/).or(page.getByText(/25\s*uds\./i)).first()).toBeVisible();
  });

  test('10. Promociones Mayoristas (3+ a precio especial) en Inventario, Kiosco iPad, POS y Tienda Vecinal', async ({ page }) => {
    await setupProductionE2EHarness(page);

    // 1. Autenticación y configuración adicional de escala mayorista en Inventario (#/inventory)
    await page.goto('/#/login');
    await page.getByLabel('Correo electrónico').fill('andres.san1404@gmail.com');
    await page.getByLabel('Contraseña').fill('TestPass123!');
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click();

    await page.goto('/#/inventory');
    await expect(page.getByText(/🏷️\s*3\+/i).first()).toBeVisible();

    await page.getByRole('button', { name: /Editar Leche Entera Colanta 1L/i }).first().click();
    const editDialog = page.getByRole('dialog', { name: 'Editar producto' });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByText('Precios Mayoristas / Descuento por Volumen')).toBeVisible();

    // Agregar segundo tramo rápido (+6 uds) y guardar
    await editDialog.getByRole('button', { name: '+6 uds' }).click();
    await editDialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(editDialog).not.toBeVisible();

    // 2. Kiosco iPad (#/kiosco/surtifacil): activar 3+ y revertir al bajar a 2
    await page.goto('/#/kiosco/surtifacil');
    await expect(page.getByText(/🏷️ Lleva 3\+ a \$ 3\.800 c\/u/i)).toBeVisible();

    await page.getByRole('button', { name: 'Agregar Leche Entera Colanta 1L al pedido' }).click();
    const kioskPlus = page.getByRole('button', {
      name: 'Agregar otra unidad de Leche Entera Colanta 1L',
      exact: true,
    });
    await kioskPlus.click(); // 2 uds
    await kioskPlus.click(); // 3 uds -> activa promo 3+ ($3.800 x 3 = $11.400, ahorro $1.200)

    await expect(page.getByText(/✅ Promo 3\+ activa · Ahorras \$ 1\.200/i)).toBeVisible();
    await expect(page.getByText('🏷️ Ahorro mayorista aplicado:').first()).toBeVisible();

    await page
      .getByRole('button', { name: 'Quitar una unidad de Leche Entera Colanta 1L', exact: true })
      .click(); // vuelve a 2
    await expect(page.getByText(/✅ Promo 3\+ activa/i)).not.toBeVisible();

    // 3. POS (#/create-sale): nudge -> 3+ -> ahorro mayorista -> confirmar venta
    await page.goto('/#/create-sale');
    const posList = page.getByRole('list', { name: 'Productos disponibles' });
    const posAddMilk = posList.getByRole('button', { name: /Agregar Leche Entera Colanta 1L/i });
    await expect(posList.getByText(/🏷️\s*3\+/).first()).toBeVisible();

    await posAddMilk.click();
    await posAddMilk.click();
    await expect(page.getByText(/\+1 para 3\+/i)).toBeVisible();

    await posAddMilk.click(); // 3 unidades
    await expect(page.getByText(/🏷️ Mayorista 3\+/i)).toBeVisible();
    await expect(page.getByText('Ahorro mayorista')).toBeVisible();

    await page.getByRole('button', { name: /Pago exacto de/i }).click();
    await page.getByRole('button', { name: /Confirmar venta/i }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Venta registrada exitosamente' })
    ).toBeVisible();

    // 4. Tienda Vecinal (#/tienda/surtifacil): badge promocional y ahorro dinámico en checkout
    await page.goto('/#/tienda/surtifacil');
    await expect(page.getByText(/🏷️\s*3\+ a /i).first()).toBeVisible();
    await page
      .getByRole('button', { name: /Agregar Leche Entera Colanta 1L a la canasta/i })
      .click();
    await page.getByRole('button', { name: /Abrir canasta y confirmar pedido/i }).click();
    await expect(page.getByText(/Lleva 2 más para pagar/i)).toBeVisible();
    const storePlus = page.getByRole('button', { name: 'Sumar uno de Leche Entera Colanta 1L' });
    await storePlus.click();
    await storePlus.click();
    await expect(page.getByText(/🏷️ Mayorista 3\+/i)).toBeVisible();
    await expect(page.getByText(/🏷️ Ahorro mayorista incluido:/i)).toBeVisible();
  });
});
