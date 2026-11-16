import { expect, type Page } from '@playwright/test';
import {
  parseWholesaleTiers,
  resolveProductUnitPricing,
} from '../../web/functions/_lib/wholesalePricing';

export function createFakeFirebaseJwt(uid: string, email: string): string {
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

export interface HarnessUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'cashier';
  isSuperAdmin: boolean;
  negocioId: string;
}

const DEFAULT_USERS: HarnessUser[] = [
  {
    id: 'uid-admin-surtifacil',
    email: 'andres.san1404@gmail.com',
    displayName: 'Andrés Sánchez (SuperAdmin)',
    role: 'admin',
    isSuperAdmin: true,
    negocioId: 'surtifacil',
  },
  {
    id: 'user-admin-surtifacil',
    email: 'admin@surtifacil.com',
    displayName: 'Don Carlos (Administrador)',
    role: 'admin',
    isSuperAdmin: false,
    negocioId: 'surtifacil',
  },
  {
    id: 'user-manager-surtifacil',
    email: 'gerente@surtifacil.com',
    displayName: 'Marta Gómez (Gerente Inventario)',
    role: 'manager',
    isSuperAdmin: false,
    negocioId: 'surtifacil',
  },
  {
    id: 'user-cashier-surtifacil',
    email: 'cajero@surtifacil.com',
    displayName: 'Mateo Restrepo (Cajero Mostrador)',
    role: 'cashier',
    isSuperAdmin: false,
    negocioId: 'surtifacil',
  },
  {
    id: 'user-ejemplo-mitienda',
    email: 'ejemplo@mitienda.com',
    displayName: 'Tendero Demo (SurtiFácil)',
    role: 'admin',
    isSuperAdmin: false,
    negocioId: 'surtifacil',
  },
];

export function futureDayIso(deltaDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function setupProductionE2EHarness(page: Page) {
  const adminUser = DEFAULT_USERS[0];
  const idToken = createFakeFirebaseJwt(adminUser.id, adminUser.email);

  const products: Array<Record<string, any>> = [
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
      wholesale_tiers: [{ min_quantity: 3, unit_price_cents: 380000 }],
      expiration_date: futureDayIso(3),
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
      expiration_date: futureDayIso(1),
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
      created_by_uid: adminUser.id,
      created_by_role: 'admin',
      created_at: new Date().toISOString(),
    },
  ];

  const customerOrders: Array<Record<string, any>> = [];
  const sales: Array<Record<string, any>> = [];
  const cashClosings: Array<Record<string, any>> = [];
  let cashExpenses: Array<Record<string, any>> = [];
  let shrinkageEntries: Array<Record<string, any>> = [];

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

  const resolveActorFromAuthHeader = (authHeader?: string): HarnessUser => {
    const raw = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (raw.startsWith('d1:')) {
      const parts = raw.split(':');
      const email = (parts[2] || '').toLowerCase();
      const matched = DEFAULT_USERS.find((u) => u.email.toLowerCase() === email);
      if (matched) return matched;
      return {
        id: parts[1] || 'd1-user',
        email: email || adminUser.email,
        displayName: email || 'Usuario D1',
        role: (parts[3] as HarnessUser['role']) || 'admin',
        isSuperAdmin: email === adminUser.email,
        negocioId: parts[4] || 'surtifacil',
      };
    }
    return adminUser;
  };

  // 1. Interceptar llamadas a Firebase Auth IdentityToolkit y SecureToken
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('accounts:signInWithPassword') || url.includes('accounts:signUp')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: adminUser.id,
          email: adminUser.email,
          displayName: adminUser.displayName,
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
              localId: adminUser.id,
              email: adminUser.email,
              emailVerified: true,
              displayName: adminUser.displayName,
              providerUserInfo: [
                {
                  providerId: 'password',
                  displayName: adminUser.displayName,
                  email: adminUser.email,
                  federatedId: adminUser.email,
                  rawId: adminUser.email,
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
        user_id: adminUser.id,
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
    const actor = resolveActorFromAuthHeader(req.headers()['authorization']);

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

    // Login Nativo D1 / Acceso Rápido Multi-Rol
    if (pathname === '/auth/login' && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const matched = DEFAULT_USERS.find((u) => u.email.toLowerCase() === email);
      if (!matched) {
        return jsonResponse({ authenticated: false });
      }
      const token = `d1:${matched.id}:${matched.email}:${matched.role}:${matched.negocioId}`;
      return jsonResponse({
        authenticated: true,
        token,
        user: {
          ...matched,
          active: true,
        },
        negocio: storeSettings,
      });
    }

    // Auth Me
    if (pathname === '/auth/me' && method === 'GET') {
      return jsonResponse({
        user: {
          id: actor.id,
          email: actor.email,
          displayName: actor.displayName,
          role: actor.role,
          isSuperAdmin: actor.isSuperAdmin,
          negocioId: actor.negocioId,
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
      const tiers = parseWholesaleTiers(body.wholesale_tiers ?? body.wholesale_tiers_json);
      const created = {
        id: `prod-${Date.now()}`,
        negocio_id: 'surtifacil',
        ...body,
        wholesale_tiers: tiers,
        wholesale_tiers_json: JSON.stringify(tiers),
      };
      products.push(created);
      return jsonResponse(created, 201);
    }
    if (pathname.startsWith('/products/') && method === 'PUT') {
      const id = decodeURIComponent(pathname.split('/')[2]);
      const idx = products.findIndex((p) => p.id === id);
      if (idx >= 0) {
        const nextWholesale =
          body.wholesale_tiers !== undefined || body.wholesale_tiers_json !== undefined
            ? parseWholesaleTiers(body.wholesale_tiers ?? body.wholesale_tiers_json)
            : products[idx].wholesale_tiers;
        products[idx] = {
          ...products[idx],
          ...body,
          wholesale_tiers: nextWholesale,
          wholesale_tiers_json: JSON.stringify(nextWholesale || []),
        };
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
        const qty = Math.max(1, Number(it.quantity || 1));
        const pricing = resolveProductUnitPricing(prod, qty);
        return {
          product_id: prod.id,
          product_name: prod.name,
          quantity: qty,
          unit_price_cents: pricing.unit_price_cents,
          subtotal_cents: pricing.subtotal_cents,
          regular_price_cents: pricing.active_base_unit_price_cents,
          applied_wholesale_tier: pricing.applied_tier,
          wholesale_savings_cents: pricing.wholesale_savings_cents,
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
        found.status = 'completed';
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
        const qty = Math.max(1, Number(it.quantity || 1));
        prod.stock = Math.max(0, prod.stock - qty);
        const pricing = resolveProductUnitPricing(prod, qty);
        return {
          product_id: prod.id,
          product_name: prod.name,
          quantity: qty,
          price_cents: pricing.unit_price_cents,
          subtotal_cents: pricing.subtotal_cents,
          regular_price_cents: pricing.active_base_unit_price_cents,
          applied_wholesale_tier: pricing.applied_tier,
          wholesale_savings_cents: pricing.wholesale_savings_cents,
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
      return jsonResponse({ id: saleId, saleId, total_cents: totalCents, items: mappedItems }, 201);
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

    // Caja Menor y Gastos del Turno
    if (pathname === '/cash-expenses' && method === 'GET') {
      return jsonResponse(cashExpenses);
    }
    if (pathname === '/cash-expenses' && method === 'POST') {
      const createdExpense = {
        id: `cexp-e2e-${Date.now()}-${cashExpenses.length + 1}`,
        negocio_id: 'surtifacil',
        category: body.category || 'otro',
        description: body.description,
        beneficiary: body.beneficiary || null,
        amount_cents: Number(body.amount_cents || 0),
        payment_method: body.payment_method === 'transfer' ? 'transfer' : 'cash',
        created_by_uid: actor.id,
        created_by_name: actor.displayName,
        created_at: new Date().toISOString(),
      };
      cashExpenses.unshift(createdExpense);
      return jsonResponse(createdExpense, 201);
    }
    if (pathname.startsWith('/cash-expenses/') && method === 'DELETE') {
      const expenseId = decodeURIComponent(pathname.replace('/cash-expenses/', ''));
      cashExpenses = cashExpenses.filter((e) => e.id !== expenseId);
      return jsonResponse({ success: true, deletedId: expenseId });
    }

    // Mermas, Averías y Vencimientos (con validación RBAC estricta)
    if (pathname === '/shrinkage' && method === 'GET') {
      return jsonResponse(shrinkageEntries);
    }
    if (pathname === '/shrinkage/summary' && method === 'GET') {
      const totalUnits = shrinkageEntries.reduce((s, e) => s + Number(e.quantity || 0), 0);
      const totalCostLossCents = shrinkageEntries.reduce((s, e) => s + Number(e.total_cost_loss_cents || 0), 0);
      return jsonResponse({
        total_records: shrinkageEntries.length,
        total_units: totalUnits,
        total_cost_loss_cents: totalCostLossCents,
        total_retail_value_cents: shrinkageEntries.reduce((s, e) => s + Number(e.retail_value_cents || 0), 0),
        by_reason: {},
      });
    }
    if (pathname === '/shrinkage' && method === 'POST') {
      if (actor.role !== 'admin' && actor.role !== 'manager') {
        return jsonResponse(
          { error: 'Solo administradores y gerentes pueden registrar mermas e inventario dañado.' },
          403
        );
      }
      const targetProd = products.find((p) => p.id === body.product_id);
      if (!targetProd) {
        return jsonResponse({ error: 'Producto no encontrado.' }, 404);
      }
      const qty = Math.floor(Number(body.quantity || 0));
      if (qty <= 0 || qty > targetProd.stock) {
        return jsonResponse({ error: 'Stock insuficiente o cantidad inválida.' }, 400);
      }
      const unitCostCents = targetProd.last_cost_cents ?? Math.round(targetProd.price_cents * 0.7);
      targetProd.stock -= qty;
      const created = {
        id: `shk-e2e-${Date.now()}-${shrinkageEntries.length + 1}`,
        negocio_id: 'surtifacil',
        product_id: targetProd.id,
        product_name: targetProd.name,
        category: targetProd.category,
        unit: targetProd.unit,
        quantity: qty,
        unit_cost_cents: unitCostCents,
        total_cost_loss_cents: unitCostCents * qty,
        retail_value_cents: targetProd.price_cents * qty,
        cost_source: 'purchase',
        reason: body.reason || 'damaged',
        notes: body.notes || null,
        created_by_uid: actor.id,
        created_by_name: actor.displayName,
        created_at: new Date().toISOString(),
        updated_stock: targetProd.stock,
      };
      shrinkageEntries.unshift(created);
      return jsonResponse(created, 201);
    }
    if (pathname.startsWith('/shrinkage/') && method === 'DELETE') {
      if (actor.role !== 'admin' && actor.role !== 'manager') {
        return jsonResponse(
          { error: 'Solo administradores y gerentes pueden revertir bajas de inventario.' },
          403
        );
      }
      const shkId = decodeURIComponent(pathname.replace('/shrinkage/', ''));
      const entry = shrinkageEntries.find((s) => s.id === shkId);
      if (entry) {
        const prod = products.find((p) => p.id === entry.product_id);
        if (prod) prod.stock += Number(entry.quantity || 0);
        shrinkageEntries = shrinkageEntries.filter((s) => s.id !== shkId);
      }
      return jsonResponse({ success: true, deletedId: shkId });
    }

    // Arqueo y Cierre de Caja COP
    if (pathname === '/cash-closings/summary' && method === 'GET') {
      const initialCashCents = Number(
        urlObj.searchParams.get('initial_base_cents') ||
          urlObj.searchParams.get('initial_cash_cents') ||
          10000000,
      );
      const salesCashCents = 5000000; // $50.000 COP
      const cashExpList = cashExpenses.filter((e) => e.payment_method === 'cash');
      const expensesCashCents = cashExpList.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
      return jsonResponse({
        negocio_id: 'surtifacil',
        opened_at: new Date(Date.now() - 3600000 * 6).toISOString(),
        initial_cash_cents: initialCashCents,
        sales_cash_cents: salesCashCents,
        sales_cash_count: 8,
        credit_payments_cash_cents: 0,
        credit_payments_cash_count: 0,
        expenses_cash_cents: expensesCashCents,
        expenses_cash_count: cashExpList.length,
        expected_cash_cents: initialCashCents + salesCashCents - expensesCashCents,
        other_sales: [],
      });
    }
    if (pathname === '/cash-closings' && method === 'POST') {
      const initialCashCents = Number(body.initial_cash_cents || 10000000);
      const salesCashCents = 5000000;
      const expensesCashCents = cashExpenses
        .filter((e) => e.payment_method === 'cash')
        .reduce((sum, e) => sum + (e.amount_cents || 0), 0);
      const expectedCashCents = initialCashCents + salesCashCents - expensesCashCents;
      const countedCashCents = Number(body.counted_cash_cents ?? expectedCashCents);
      const closing = {
        id: `ACTA-E2E-${cashClosings.length + 1}`,
        negocio_id: 'surtifacil',
        closing_number: cashClosings.length + 1,
        opened_at: new Date(Date.now() - 3600000 * 6).toISOString(),
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        closed_by_uid: actor.id,
        closed_by_name: actor.displayName,
        initial_cash_cents: initialCashCents,
        sales_cash_cents: salesCashCents,
        credit_payments_cash_cents: 0,
        expenses_cash_cents: expensesCashCents,
        expected_cash_cents: expectedCashCents,
        counted_cash_cents: countedCashCents,
        difference_cents: countedCashCents - expectedCashCents,
        status: countedCashCents === expectedCashCents ? 'balanced' : countedCashCents > expectedCashCents ? 'surplus' : 'shortage',
        breakdown: body.breakdown || { bills: {}, coins: {} },
        notes: body.notes || '',
        total_sales_count: 8,
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

    return jsonResponse([]);
  });
}

export async function isCompactPhoneViewport(page: Page): Promise<boolean> {
  const width = page.viewportSize()?.width ?? 1280;
  return width < 768;
}

export async function loginAsStaffAdmin(page: Page) {
  await page.goto('/#/login');
  await page.getByLabel('Correo electrónico').fill('andres.san1404@gmail.com');
  await page.getByLabel('Contraseña').fill('Surtifacil2026!');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  if (await isCompactPhoneViewport(page)) {
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  } else {
    await expect(page.getByRole('complementary', { name: 'Menú principal' })).toBeVisible();
  }
}
