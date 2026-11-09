import { expect, test, type Page } from '@playwright/test';

function createFakeFirebaseJwt(uid: string, email: string): string {
  const toBase64Url = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url({ alg: 'RS256', typ: 'JWT', kid: 'e2e-key-1' });
  const payload = toBase64Url({
    iss: 'https://securetoken.google.com/surtifacilapp',
    aud: 'surtifacilapp',
    auth_time: now - 60,
    user_id: uid,
    sub: uid,
    iat: now - 60,
    exp: now + 86400,
    email,
    email_verified: true,
    firebase: {
      identities: { email: [email] },
      sign_in_provider: 'password',
    },
  });

  return `${header}.${payload}.e2e_signature`;
}

async function setupProductionE2EHarness(page: Page) {
  const adminUid = 'uid-admin-surtifacil';
  const adminEmail = 'andres.san1404@gmail.com';
  const idToken = createFakeFirebaseJwt(adminUid, adminEmail);

  // Estado autoritativo multi-tenant en memoria para la sesión E2E
  const products = [
    {
      id: 'prod-leche-1',
      negocio_id: 'surtifacil',
      name: 'Leche Entera Colanta 1L',
      price_cents: 420000,
      last_cost_cents: 310000,
      stock: 40,
      min_stock: 5,
      unit: 'litro',
      category: 'Lácteos y Huevos',
      barcode: '7702129001100',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 0,
    },
    {
      id: 'prod-arroz-1',
      negocio_id: 'surtifacil',
      name: 'Arroz Diana 1kg',
      price_cents: 480000,
      last_cost_cents: 360000,
      stock: 50,
      min_stock: 8,
      unit: 'kilo',
      category: 'Granos y Despensa',
      barcode: '7702001051001',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 1,
      precio_oferta_cents: 440000,
    },
    {
      id: 'prod-aguacate-1',
      negocio_id: 'surtifacil',
      name: 'Aguacate Hass Maduro',
      price_cents: 380000,
      last_cost_cents: 240000,
      stock: 25,
      min_stock: 5,
      unit: 'libra',
      category: 'Frutas y Verduras',
      barcode: '7709990001112',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 0,
    },
  ];

  const combos = [
    {
      id: 'combo-desayuno-1',
      negocio_id: 'surtifacil',
      name: 'Combo Desayuno Paisa',
      description: 'Leche entera + Arroz Diana para la semana',
      price_cents: 820000,
      original_price_cents: 900000,
      active: 1,
      items: [
        { product_id: 'prod-leche-1', product_name: 'Leche Entera Colanta 1L', quantity: 1, unit_price_cents: 420000 },
        { product_id: 'prod-arroz-1', product_name: 'Arroz Diana 1kg', quantity: 1, unit_price_cents: 480000 },
      ],
    },
  ];

  const creditCustomers = [
    {
      id: 'cc-marta-1',
      negocio_id: 'surtifacil',
      name: 'Doña Marta Restrepo',
      phone: '3004567890',
      notes: 'Vecina apto 301',
      balance_cents: 1850000,
      active: 1,
      created_at: new Date().toISOString(),
    },
  ];

  const creditEntries = [
    {
      id: 'ce-1',
      negocio_id: 'surtifacil',
      customer_id: 'cc-marta-1',
      type: 'debt',
      amount_cents: 1850000,
      description: 'Mercado quincenal fiado',
      created_by_uid: adminUid,
      created_by_role: 'admin',
      created_at: new Date().toISOString(),
    },
  ];

  const customerOrders: Array<Record<string, any>> = [];
  const sales: Array<Record<string, any>> = [];
  const cashClosings: Array<Record<string, any>> = [];

  let storeSettings = {
    id: 'surtifacil',
    slug: 'surtifacil',
    nombre: 'SurtiFácil Abastos Central',
    barrio: 'La Candelaria / Centro',
    direccion: 'Calle 50 # 45-12, Medellín',
    telefono_whatsapp: '573001234567',
    horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
    datos_pago_offline: 'Nequi: 300 123 4567 - Ahorros Bancolombia: 123-456789-00',
    slogan: 'Frescura y economía para tu hogar en Medellín',
    permite_domicilio: true,
    permite_retiro: true,
    costo_domicilio_cents: 350000,
    plan_id: 'enterprise',
    estado: 'activo',
    dias_restantes: 365,
    cuota_ia_usada: 18,
    cuota_ia_limite: 999999,
  };

  const saasStores: Array<Record<string, any>> = [
    {
      id: 'surtifacil',
      nombre: 'SurtiFácil Abastos Central',
      slug: 'surtifacil',
      barrio: 'La Candelaria / Centro',
      ciudad: 'Medellín',
      telefono_whatsapp: '573001234567',
      plan_id: 'enterprise',
      estado: 'activo',
      suscripcion_vence_en: new Date(Date.now() + 365 * 86400000).toISOString(),
      cuota_ia_usada: 18,
      cuota_ia_total: 999999,
      costo_domicilio_cents: 350000,
      total_sales: 12,
      total_products: 3,
      total_users: 2,
    },
    {
      id: 'abastos-laureles',
      nombre: 'Mercados La 70 Laureles',
      slug: 'mercados-la-70',
      barrio: 'Laureles - Estadio',
      ciudad: 'Medellín',
      telefono_whatsapp: '573119876543',
      plan_id: 'mensual_30d',
      estado: 'activo',
      suscripcion_vence_en: new Date(Date.now() + 14 * 86400000).toISOString(),
      cuota_ia_usada: 120,
      cuota_ia_total: 3000,
      costo_domicilio_cents: 400000,
      total_sales: 45,
      total_products: 80,
      total_users: 3,
    },
  ];

  // 1. Interceptar llamadas a Firebase Auth IdentityToolkit y SecureToken
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('accounts:signInWithPassword') || url.includes('accounts:signUp')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: adminUid,
          email: adminEmail,
          displayName: 'Andrés Sánchez (SuperAdmin)',
          idToken,
          registered: true,
          refreshToken: 'e2e-refresh-token',
          expiresIn: '86400',
        }),
      });
      return;
    }

    if (url.includes('accounts:lookup')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#GetAccountInfoResponse',
          users: [
            {
              localId: adminUid,
              email: adminEmail,
              emailVerified: true,
              displayName: 'Andrés Sánchez (SuperAdmin)',
              providerUserInfo: [
                {
                  providerId: 'password',
                  displayName: 'Andrés Sánchez (SuperAdmin)',
                  email: adminEmail,
                  federatedId: adminEmail,
                  rawId: adminEmail,
                },
              ],
              validSince: '1700000000',
              lastLoginAt: String(Date.now()),
              createdAt: '1700000000000',
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/securetoken.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: idToken,
        expires_in: '86400',
        token_type: 'Bearer',
        refresh_token: 'e2e-refresh-token',
        id_token: idToken,
        user_id: adminUid,
        project_id: 'surtifacilapp',
      }),
    });
  });

  // 2. Interceptar llamadas a la API Serverless (/api/**)
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const urlObj = new URL(req.url());
    const pathname = urlObj.pathname.replace(/^\/api/, '');

    const jsonResponse = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });

    let body: any = {};
    if (method === 'POST' || method === 'PUT') {
      try {
        body = req.postDataJSON() || {};
      } catch {
        body = {};
      }
    }

    // Auth Me
    if (pathname === '/auth/me' && method === 'GET') {
      return jsonResponse({
        user: {
          id: adminUid,
          email: adminEmail,
          displayName: 'Andrés Sánchez (SuperAdmin)',
          role: 'admin',
          isSuperAdmin: true,
          negocioId: 'surtifacil',
          active: 1,
        },
        negocio: storeSettings,
      });
    }

    // Registro público de negocio
    if (pathname === '/registro-negocio' && method === 'POST') {
      const createdStore = {
        id: body.slug || `tienda-${Date.now()}`,
        nombre: body.nombre,
        slug: body.slug,
        barrio: body.barrio || 'Laureles',
        telefono_whatsapp: body.telefono_whatsapp,
        plan_id: body.plan_id || 'prueba_3d',
        estado: 'activo',
        dias_restantes: 7,
        cuota_ia_usada: 0,
        cuota_ia_limite: 700,
      };
      saasStores.push(createdStore);
      return jsonResponse({ success: true, negocio: createdStore }, 201);
    }

    // Catálogo público de tienda / kiosco
    if (pathname.startsWith('/public/store/') && method === 'GET') {
      return jsonResponse({
        store: storeSettings,
        products,
        combos,
      });
    }

    // Productos CRUD
    if (pathname === '/products' && method === 'GET') {
      return jsonResponse(products);
    }
    if (pathname === '/products' && method === 'POST') {
      const created = {
        id: `prod-${Date.now()}`,
        negocio_id: 'surtifacil',
        ...body,
      };
      products.push(created);
      return jsonResponse(created, 201);
    }
    if (pathname.startsWith('/products/') && method === 'PUT') {
      const id = decodeURIComponent(pathname.split('/')[2]);
      const idx = products.findIndex((p) => p.id === id);
      if (idx >= 0) {
        products[idx] = { ...products[idx], ...body };
        return jsonResponse(products[idx]);
      }
      return jsonResponse({ ok: true });
    }

    // Combos CRUD
    if (pathname === '/combos' && method === 'GET') {
      return jsonResponse(combos);
    }
    if (pathname === '/combos' && method === 'POST') {
      const created = {
        id: `combo-${Date.now()}`,
        negocio_id: 'surtifacil',
        ...body,
      };
      combos.push(created);
      return jsonResponse(created, 201);
    }

    // Configuración de tienda
    if (pathname === '/settings' && method === 'GET') {
      return jsonResponse(storeSettings);
    }
    if (pathname === '/settings' && method === 'PUT') {
      storeSettings = { ...storeSettings, ...body };
      return jsonResponse(storeSettings);
    }

    // Pedidos de Kiosco y Tienda Vecinal
    if (pathname === '/customer-orders' && method === 'POST') {
      const orderNum = customerOrders.length + 1;
      const prefix = body.source === 'kiosk' ? 'K' : 'T';
      const orderCode = `#${prefix}-${String(orderNum).padStart(2, '0')}`;
      const trackingToken = `trk_${Date.now()}_${orderNum}`;
      const items = (body.items || []).map((it: any) => {
        const prod = products.find((p) => p.id === it.product_id) || products[0];
        const unitPrice = prod.en_oferta && prod.precio_oferta_cents ? prod.precio_oferta_cents : prod.price_cents;
        return {
          product_id: prod.id,
          product_name: prod.name,
          quantity: it.quantity || 1,
          unit_price_cents: unitPrice,
          subtotal_cents: unitPrice * (it.quantity || 1),
        };
      });
      const subtotal = items.reduce((s: number, i: any) => s + i.subtotal_cents, 0);
      const deliveryFee = body.delivery_type === 'delivery' ? storeSettings.costo_domicilio_cents : 0;

      const createdOrder = {
        id: `ord-${Date.now()}-${orderNum}`,
        negocio_id: 'surtifacil',
        order_code: orderCode,
        tracking_token: trackingToken,
        source: body.source || 'kiosk',
        customer_name: body.customer_name || 'Cliente Vecino',
        customer_phone: body.customer_phone || '',
        delivery_type: body.delivery_type || 'pickup_counter',
        delivery_address: body.delivery_address || '',
        payment_method: body.payment_method || 'cash',
        items,
        subtotal_cents: subtotal,
        delivery_fee_cents: deliveryFee,
        total_cents: subtotal + deliveryFee,
        status: 'pending',
        created_at: new Date().toISOString(),
        store_name: storeSettings.nombre,
        store_whatsapp: storeSettings.telefono_whatsapp,
      };
      customerOrders.unshift(createdOrder);
      return jsonResponse({ success: true, order: createdOrder }, 201);
    }

    if (pathname === '/customer-orders' && method === 'GET') {
      return jsonResponse(customerOrders);
    }

    if (pathname.startsWith('/customer-orders/track/') && method === 'GET') {
      const token = decodeURIComponent(pathname.replace('/customer-orders/track/', ''));
      const found = customerOrders.find((o) => o.tracking_token === token) || customerOrders[0];
      return jsonResponse(
        found ? { order: found, store: storeSettings } : { error: 'No encontrado' },
        found ? 200 : 404,
      );
    }

    if (pathname.endsWith('/convert-to-sale') && method === 'POST') {
      const parts = pathname.split('/');
      const orderId = decodeURIComponent(parts[2]);
      const found = customerOrders.find((o) => o.id === orderId);
      const saleId = `sale-from-order-${Date.now()}`;
      if (found) {
        found.status = 'delivered';
        found.sale_id = saleId;
        sales.unshift({
          id: saleId,
          total_cents: found.total_cents,
          payment_method: found.payment_method === 'credit' ? 'credit' : 'cash',
          items: found.items,
          created_at: new Date().toISOString(),
        });
      }
      return jsonResponse({ success: true, ok: true, sale_id: saleId, order_code: found?.order_code || '#K-01' });
    }

    // Ventas POS
    if (pathname === '/sales' && method === 'GET') {
      if (urlObj.searchParams.get('totals') === 'true') {
        return jsonResponse({
          count: sales.length,
          totalCents: sales.reduce((sum, s) => sum + (s.total_cents || 0), 0),
        });
      }
      return jsonResponse(sales);
    }

    if (pathname === '/sales' && method === 'POST') {
      const saleId = `sale-${Date.now()}`;
      const mappedItems = (body.items || []).map((it: any) => {
        const prod = products.find((p) => p.id === it.product_id) || products[0];
        prod.stock = Math.max(0, prod.stock - Number(it.quantity || 1));
        return {
          product_id: prod.id,
          product_name: prod.name,
          quantity: Number(it.quantity || 1),
          price_cents: prod.price_cents,
          subtotal_cents: prod.price_cents * Number(it.quantity || 1),
        };
      });
      const totalCents = mappedItems.reduce((s: number, i: any) => s + i.subtotal_cents, 0);
      const createdSale = {
        id: saleId,
        total_cents: totalCents,
        payment_method: body.payment_method || 'cash',
        credit_customer_id: body.credit_customer_id,
        items: mappedItems,
        created_at: new Date().toISOString(),
      };
      sales.unshift(createdSale);
      return jsonResponse({ id: saleId, saleId }, 201);
    }

    // Libro de Fiados
    if (pathname === '/credits/customers' && method === 'GET') {
      return jsonResponse(creditCustomers);
    }
    if (pathname === '/credits/customers' && method === 'POST') {
      const created = {
        id: `cc-${Date.now()}`,
        negocio_id: 'surtifacil',
        name: body.name,
        phone: body.phone || '',
        notes: body.notes || '',
        balance_cents: 0,
        active: 1,
        created_at: new Date().toISOString(),
      };
      creditCustomers.push(created);
      return jsonResponse(created, 201);
    }
    if (pathname === '/credits/entries' && method === 'GET') {
      return jsonResponse(creditEntries);
    }
    if (pathname === '/credits/entries' && method === 'POST') {
      const cust = creditCustomers.find((c) => c.id === body.customer_id);
      if (cust) {
        const delta = body.type === 'debt' ? body.amount_cents : -body.amount_cents;
        cust.balance_cents = Math.max(0, cust.balance_cents + delta);
      }
      const createdEntry = {
        id: `ce-${Date.now()}`,
        customer_id: body.customer_id,
        type: body.type,
        amount_cents: body.amount_cents,
        description: body.description || 'Abono en mostrador',
        created_at: new Date().toISOString(),
      };
      creditEntries.unshift(createdEntry);
      return jsonResponse(createdEntry, 201);
    }

    // Arqueo y Cierre de Caja COP
    if (pathname === '/cash-closings/summary' && method === 'GET') {
      const initialCashCents = Number(urlObj.searchParams.get('initial_cash_cents') || 10000000);
      const salesCashCents = 5000000; // $50.000 COP
      return jsonResponse({
        negocio_id: 'surtifacil',
        shift_start: new Date(Date.now() - 3600000 * 6).toISOString(),
        current_time: new Date().toISOString(),
        initial_cash_cents: initialCashCents,
        sales_cash_cents: salesCashCents,
        sales_transfer_cents: 2000000,
        sales_credit_cents: 1850000,
        sales_total_cents: 8850000,
        sales_count: 8,
        credit_payments_cash_cents: 0,
        expected_cash_cents: initialCashCents + salesCashCents,
      });
    }
    if (pathname === '/cash-closings' && method === 'POST') {
      const closing = {
        id: `ACTA-E2E-${cashClosings.length + 1}`,
        negocio_id: 'surtifacil',
        created_at: new Date().toISOString(),
        closed_by_uid: adminUid,
        closed_by_name: 'Andrés Sánchez',
        initial_cash_cents: body.initial_cash_cents || 10000000,
        sales_cash_cents: 5000000,
        sales_transfer_cents: 2000000,
        sales_credit_cents: 1850000,
        credit_payments_cash_cents: 0,
        expected_cash_cents: 15000000,
        counted_cash_cents: body.counted_cash_cents || 15000000,
        difference_cents: (body.counted_cash_cents || 15000000) - 15000000,
        status: 'balanced',
        breakdown: body.breakdown || { bills: {}, coins: {} },
        notes: body.notes || '',
      };
      cashClosings.unshift(closing);
      return jsonResponse(closing, 201);
    }
    if (pathname === '/cash-closings' && method === 'GET') {
      return jsonResponse(cashClosings);
    }

    // Copiloto Gerencial Sarin IA
    if (pathname === '/ai/copilot' && method === 'POST') {
      return jsonResponse({
        success: true,
        reply:
          '¡Claro que sí, parce! Hoy llevas 8 ventas registradas por $ 88.500 COP con una ganancia neta estimada de $ 26.500 COP (margen del 30%).',
        toolsInvoked: [
          {
            tool: 'consultar_ventas_y_ganancias',
            data: {
              period_label: 'Hoy',
              total_ventas_cop: '$ 88.500',
              total_costo_cop: '$ 62.000',
              ganancia_neta_cop: '$ 26.500',
              margen_porcentaje: 30,
              numero_ventas: 8,
            },
          },
        ],
        quota: {
          remaining: 999980,
          total: 999999,
          used: 19,
        },
      });
    }

    // SuperAdmin Multi-Tenant
    if (pathname === '/super-admin/negocios' && method === 'GET') {
      return jsonResponse({
        kpis: {
          totalTiendas: saasStores.length,
          tiendasActivas: saasStores.filter((n) => n.estado === 'activo').length,
          recaudoEstimadoCOP: 185000,
          cuotaIATotal: 1002999,
          cuotaIAUsada: 138,
        },
        negocios: saasStores,
      });
    }
    if (pathname.startsWith('/super-admin/negocios/') && pathname.endsWith('/renovar') && method === 'POST') {
      const storeId = decodeURIComponent(pathname.split('/')[3]);
      const target = saasStores.find((s) => s.id === storeId);
      if (target) {
        target.dias_restantes = (target.dias_restantes || 0) + Number(body.dias || 7);
        target.estado = 'activo';
      }
      return jsonResponse(target || { ok: true });
    }

    // Diagnóstico de Integraciones
    if (pathname === '/integrations/status' && method === 'GET') {
      return jsonResponse({
        deepseek: {
          configured: true,
          mode: 'live',
          model: 'deepseek-chat',
          provider: 'DeepSeek API v3 (Edge)',
        },
        whatsapp: {
          configured: true,
          mode: 'live',
          phone_id: '***1234',
          webhook_url: 'https://surtifacil.pages.dev/api/webhooks/whatsapp',
          verify_token_configured: true,
        },
        database: {
          status: 'connected',
          engine: 'Cloudflare D1 (SQLite Edge)',
          multi_tenant: true,
        },
      });
    }

    if (pathname === '/integrations/test-deepseek' && method === 'POST') {
      return jsonResponse({
        success: true,
        mode: 'live',
        latency_ms: 45,
        message: 'Conexión exitosa con DeepSeek API oficial en la nube.',
      });
    }

    // Fallback amigable para otros endpoints (proveedores, órdenes, empleados)
    return jsonResponse([]);
  });
}

async function loginAsStaffAdmin(page: Page) {
  await page.goto('/#/login');
  await page.getByLabel('Correo electrónico').fill('andres.san1404@gmail.com');
  await page.getByLabel('Contraseña').fill('Surtifacil2026!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('complementary', { name: 'Menú principal' })).toBeVisible();
}

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

    // 5.4 Arqueo y Cierre de Caja COP
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: /Arqueo y Cierre COP/i }).last().click();
    const closingDialog = page.getByRole('dialog');
    await expect(closingDialog.getByText(/Resumen del Turno Actual/i)).toBeVisible();
    await closingDialog.getByRole('button', { name: /Cerrar Caja y Generar Acta/i }).click();
    await expect(closingDialog.getByText(/Cierre de Caja Guardado con Éxito/i)).toBeVisible();
    await closingDialog.getByRole('button', { name: 'Listo' }).click();

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
});
