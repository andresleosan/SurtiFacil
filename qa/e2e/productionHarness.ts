import { expect, type Page } from '@playwright/test';
import {
  computeLineSubtotalCents,
  isFractionalProduct,
  roundQuantity,
} from '../../web/functions/_lib/bulkWeight';
import {
  parseWholesaleTiers,
  resolveProductUnitPricing,
} from '../../web/functions/_lib/wholesalePricing';
import {
  DEFAULT_LOYALTY_CONFIG,
  isValidLoyaltyPhone,
  maskPublicCustomerName,
  normalizeCouponCode,
  normalizeLoyaltyConfig,
  normalizeLoyaltyPhone,
  settleOrderLoyaltyAndCoupon,
  validateCouponForSubtotal,
} from '../../web/functions/_lib/loyaltyEngine';
import {
  calculateNetProfitStatement,
  extractSalePaymentBuckets,
  isSaleVoided,
  resolveSalePaymentBreakdown,
} from '../../web/functions/_lib/saleAccounting';

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
    {
      id: 'prod-papa-1',
      negocio_id: 'surtifacil',
      name: 'Papa Criolla a Granel',
      price_cents: 400000,
      last_cost_cents: 260000,
      stock: 30,
      min_stock: 5,
      unit: 'libra',
      category: 'Frutas y Verduras',
      barcode: '7709990001199',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 0,
      allow_fractional: 1,
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

  let loyaltyConfig = { ...DEFAULT_LOYALTY_CONFIG };
  const loyaltyAccounts: Array<Record<string, any>> = [
    {
      id: 'loy-don-carlos',
      negocio_id: 'surtifacil',
      phone: '3004567890',
      customer_name: 'Don Carlos Restrepo',
      points_balance: 85,
      lifetime_points_earned: 120,
      lifetime_points_redeemed: 35,
      total_purchases_count: 9,
      total_spent_cents: 12000000,
      active: 1,
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'loy-dona-marta',
      negocio_id: 'surtifacil',
      phone: '3112345678',
      customer_name: 'Doña Marta Gómez',
      points_balance: 40,
      lifetime_points_earned: 40,
      lifetime_points_redeemed: 0,
      total_purchases_count: 4,
      total_spent_cents: 4000000,
      active: 1,
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  const loyaltyMovements: Array<Record<string, any>> = [
    {
      id: 'lmov-seed-carlos',
      negocio_id: 'surtifacil',
      account_id: 'loy-don-carlos',
      type: 'bonus',
      points_delta: 85,
      balance_after: 85,
      amount_cents: 0,
      description: 'Saldo inicial Club de Puntos del Barrio',
      created_at: new Date().toISOString(),
    },
  ];
  let discountCoupons: Array<Record<string, any>> = [
    {
      id: 'coup-vecino10',
      negocio_id: 'surtifacil',
      code: 'VECINO10',
      description: '10% de descuento para vecinos del barrio',
      discount_type: 'percentage',
      discount_value: 10,
      min_purchase_cents: 1000000,
      max_discount_cents: 1000000,
      max_uses: 100,
      used_count: 3,
      expires_at: null,
      active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'coup-mercado2000',
      negocio_id: 'surtifacil',
      code: 'MERCADO2000',
      description: '$ 2.000 COP de regalo en tu mercado',
      discount_type: 'fixed_cents',
      discount_value: 200000,
      min_purchase_cents: 1200000,
      max_discount_cents: null,
      max_uses: 50,
      used_count: 1,
      expires_at: null,
      active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const kardexEntries: Array<Record<string, any>> = [
    {
      id: 'kdx-seed-papa-e2e',
      negocio_id: 'surtifacil',
      product_id: 'prod-papa-1',
      product_name: 'Papa Criolla a Granel',
      unit: 'libra',
      movement_type: 'initial',
      quantity_delta: 30,
      stock_before: 0,
      stock_after: 30,
      unit_cost_cents: 260000,
      unit_price_cents: 400000,
      total_value_cents: 7800000,
      reference_id: null,
      notes: 'Inventario inicial bulto 30 lb',
      created_by_uid: 'admin-1',
      created_by_name: 'Andrés Sánchez',
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  const pushKardexEntry = (entry: {
    product: Record<string, any>;
    movement_type: string;
    quantity_delta: number;
    stock_before: number;
    stock_after: number;
    unit_cost_cents?: number;
    unit_price_cents?: number;
    total_value_cents?: number;
    reference_id?: string | null;
    notes?: string | null;
    actor_uid: string;
    actor_name: string;
  }) => {
    kardexEntries.unshift({
      id: `kdx-e2e-${Date.now()}-${kardexEntries.length + 1}`,
      negocio_id: 'surtifacil',
      product_id: entry.product.id,
      product_name: entry.product.name,
      unit: entry.product.unit || 'unidad',
      movement_type: entry.movement_type,
      quantity_delta: roundQuantity(entry.quantity_delta, true),
      stock_before: roundQuantity(entry.stock_before, true),
      stock_after: roundQuantity(entry.stock_after, true),
      unit_cost_cents: Math.round(entry.unit_cost_cents ?? entry.product.last_cost_cents ?? 0),
      unit_price_cents: Math.round(entry.unit_price_cents ?? entry.product.price_cents ?? 0),
      total_value_cents: Math.round(entry.total_value_cents ?? 0),
      reference_id: entry.reference_id ?? null,
      notes: entry.notes ?? null,
      created_by_uid: entry.actor_uid,
      created_by_name: entry.actor_name,
      created_at: new Date().toISOString(),
    });
  };

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

  let demoQuickAccessEnabled = true;

  const resolveActorFromAuthHeader = (authHeader?: string): HarnessUser => {
    const raw = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (raw.startsWith('d1s.')) {
      try {
        const payloadB64 = raw.split('.')[1] || '';
        const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
        const email = String(payload.email || '').toLowerCase();
        const matched = DEFAULT_USERS.find((u) => u.email.toLowerCase() === email);
        if (matched) return matched;
        return {
          id: payload.uid || 'd1s-user',
          email: email || adminUser.email,
          displayName: email || 'Usuario D1',
          role: (payload.role as HarnessUser['role']) || 'admin',
          isSuperAdmin: Boolean(payload.isSuperAdmin) || email === adminUser.email,
          negocioId: payload.negocioId || 'surtifacil',
        };
      } catch {
        return adminUser;
      }
    }
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

    // Configuración Pública de Seguridad
    if (pathname === '/auth/public-config' && method === 'GET') {
      return jsonResponse({
        demo_quick_access_enabled: demoQuickAccessEnabled,
        superadmin_quick_access_enabled: demoQuickAccessEnabled,
        token_signing: 'HMAC-SHA256',
        password_hashing: 'PBKDF2-SHA256',
      });
    }

    // Login Nativo D1 / Acceso Rápido Multi-Rol
    if (pathname === '/auth/login' && method === 'POST') {
      if (body.quick_access && !demoQuickAccessEnabled) {
        return jsonResponse(
          { error: 'El acceso rápido de demostración está deshabilitado en este entorno.' },
          403
        );
      }
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
        store: { ...storeSettings, loyalty_config: loyaltyConfig },
        products,
        combos,
      });
    }

    // Endpoints públicos de Club de Puntos y Cupones
    if (pathname === '/public/loyalty/lookup' && method === 'GET') {
      const normalized = normalizeLoyaltyPhone(urlObj.searchParams.get('phone') || '');
      if (!isValidLoyaltyPhone(normalized)) {
        return jsonResponse({ error: 'Ingresa un número celular válido (7 a 15 dígitos).' }, 400);
      }
      const acc = loyaltyAccounts.find((a) => a.phone === normalized && a.active === 1);
      if (!acc) {
        return jsonResponse({
          enrolled: false,
          phone: normalized,
          display_name: null,
          points_balance: 0,
          redeemable_value_cents: 0,
          config: loyaltyConfig,
        });
      }
      return jsonResponse({
        enrolled: true,
        phone: normalized,
        display_name: maskPublicCustomerName(acc.customer_name),
        points_balance: acc.points_balance,
        redeemable_value_cents: acc.points_balance * loyaltyConfig.point_value_cents,
        config: loyaltyConfig,
      });
    }

    if (pathname === '/public/coupons/validate' && method === 'POST') {
      const code = normalizeCouponCode(body.code || '');
      const coupon = discountCoupons.find((c) => c.code === code) || null;
      const outcome = validateCouponForSubtotal(coupon as any, Number(body.subtotal_cents) || 0);
      if (!outcome.valid) {
        return jsonResponse({ valid: false, error: outcome.error }, 400);
      }
      return jsonResponse({
        valid: true,
        coupon,
        discount_cents: outcome.discount_cents,
        final_subtotal_cents: outcome.final_subtotal_cents,
      });
    }

    // Productos CRUD y Kardex
    if (pathname === '/products' && method === 'GET') {
      return jsonResponse(products);
    }
    if (pathname === '/products' && method === 'POST') {
      const tiers = parseWholesaleTiers(body.wholesale_tiers ?? body.wholesale_tiers_json);
      const isFrac = isFractionalProduct({
        allow_fractional: body.allow_fractional,
        unit: body.unit,
      });
      const initialStock = roundQuantity(Number(body.stock || 0), isFrac);
      const created = {
        id: `prod-${Date.now()}`,
        negocio_id: 'surtifacil',
        ...body,
        stock: initialStock,
        allow_fractional: isFrac ? 1 : 0,
        wholesale_tiers: tiers,
        wholesale_tiers_json: JSON.stringify(tiers),
      };
      products.push(created);
      if (initialStock > 0) {
        pushKardexEntry({
          product: created,
          movement_type: 'initial',
          quantity_delta: initialStock,
          stock_before: 0,
          stock_after: initialStock,
          total_value_cents: computeLineSubtotalCents(created.last_cost_cents ?? created.price_cents ?? 0, initialStock),
          notes: 'Creación inicial en catálogo',
          actor_uid: actor.id,
          actor_name: actor.displayName,
        });
      }
      return jsonResponse(created, 201);
    }
    if (pathname.startsWith('/products/') && pathname.endsWith('/kardex') && method === 'GET') {
      const prodId = decodeURIComponent(pathname.split('/')[2]);
      const prod = products.find((p) => p.id === prodId);
      if (!prod) {
        return jsonResponse({ error: 'Producto no encontrado.' }, 404);
      }
      const movementFilter = urlObj.searchParams.get('movement_type') || '';
      const filtered = kardexEntries.filter(
        (k) => k.product_id === prodId && (!movementFilter || k.movement_type === movementFilter)
      );
      let totalIn = 0;
      let totalOut = 0;
      for (const e of filtered) {
        if (e.quantity_delta > 0) totalIn += e.quantity_delta;
        else if (e.quantity_delta < 0) totalOut += Math.abs(e.quantity_delta);
      }
      return jsonResponse({
        product: prod,
        summary: {
          total_in: roundQuantity(totalIn, true),
          total_out: roundQuantity(totalOut, true),
          net_change: roundQuantity(totalIn - totalOut, true),
          movements_count: filtered.length,
        },
        entries: filtered,
      });
    }
    if (pathname.startsWith('/products/') && pathname.endsWith('/kardex/adjust') && method === 'POST') {
      if (actor.role !== 'admin' && actor.role !== 'manager') {
        return jsonResponse({ error: 'Solo administradores y gerentes pueden ajustar inventario.' }, 403);
      }
      const prodId = decodeURIComponent(pathname.split('/')[2]);
      const prod = products.find((p) => p.id === prodId);
      if (!prod) {
        return jsonResponse({ error: 'Producto no encontrado.' }, 404);
      }
      const isFrac = isFractionalProduct(prod);
      const qty = roundQuantity(Number(body.quantity || 0), isFrac);
      const before = roundQuantity(Number(prod.stock || 0), true);
      let after = before;
      if (body.mode === 'add') after = roundQuantity(before + qty, true);
      else if (body.mode === 'subtract') after = roundQuantity(before - qty, true);
      else after = roundQuantity(qty, isFrac);
      if (after < 0) {
        return jsonResponse({ error: 'El stock resultante no puede ser negativo.' }, 400);
      }
      const delta = roundQuantity(after - before, true);
      prod.stock = after;
      const reason = String(body.reason || '').trim() || 'Ajuste manual en Kardex';
      pushKardexEntry({
        product: prod,
        movement_type: 'adjustment',
        quantity_delta: delta,
        stock_before: before,
        stock_after: after,
        total_value_cents: computeLineSubtotalCents(prod.last_cost_cents ?? prod.price_cents ?? 0, Math.abs(delta)),
        notes: reason,
        actor_uid: actor.id,
        actor_name: actor.displayName,
      });
      return jsonResponse({ success: true, product: prod, kardex_entry: kardexEntries[0] });
    }
    if (pathname.startsWith('/products/') && method === 'PUT') {
      const id = decodeURIComponent(pathname.split('/')[2]);
      const idx = products.findIndex((p) => p.id === id);
      if (idx >= 0) {
        const prev = products[idx];
        const nextWholesale =
          body.wholesale_tiers !== undefined || body.wholesale_tiers_json !== undefined
            ? parseWholesaleTiers(body.wholesale_tiers ?? body.wholesale_tiers_json)
            : prev.wholesale_tiers;
        const nextIsFrac = isFractionalProduct({
          allow_fractional: body.allow_fractional ?? prev.allow_fractional,
          unit: body.unit ?? prev.unit,
        });
        const nextStock =
          body.stock !== undefined ? roundQuantity(Number(body.stock), nextIsFrac) : prev.stock;
        products[idx] = {
          ...prev,
          ...body,
          stock: nextStock,
          allow_fractional: nextIsFrac ? 1 : 0,
          wholesale_tiers: nextWholesale,
          wholesale_tiers_json: JSON.stringify(nextWholesale || []),
        };
        if (Math.abs(nextStock - prev.stock) > 1e-4) {
          const delta = roundQuantity(nextStock - prev.stock, true);
          pushKardexEntry({
            product: products[idx],
            movement_type: 'adjustment',
            quantity_delta: delta,
            stock_before: prev.stock,
            stock_after: nextStock,
            total_value_cents: computeLineSubtotalCents(
              products[idx].last_cost_cents ?? products[idx].price_cents ?? 0,
              Math.abs(delta)
            ),
            notes: body.adjustment_reason || 'Edición de catálogo',
            actor_uid: actor.id,
            actor_name: actor.displayName,
          });
        }
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
        const isFrac = isFractionalProduct(prod);
        const qty = roundQuantity(Math.max(isFrac ? 0.05 : 1, Number(it.quantity || 1)), isFrac);
        const pricing = resolveProductUnitPricing(prod, qty);
        return {
          product_id: prod.id,
          product_name: prod.name,
          unit: prod.unit || 'unidad',
          allow_fractional: Boolean(prod.allow_fractional),
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
      const normalizedPhone = body.customer_phone ? normalizeLoyaltyPhone(body.customer_phone) : '';
      const hasValidPhone = Boolean(normalizedPhone && isValidLoyaltyPhone(normalizedPhone));
      const requestedCouponCode = normalizeCouponCode(body.coupon_code || '');
      const dbCoupon = requestedCouponCode
        ? discountCoupons.find((c) => c.code === requestedCouponCode) || null
        : null;
      const dbAcc = hasValidPhone
        ? loyaltyAccounts.find((a) => a.phone === normalizedPhone && a.active === 1) || null
        : null;
      const settlement = settleOrderLoyaltyAndCoupon({
        itemsSubtotalCents: subtotal,
        deliveryFeeCents: deliveryFee,
        config: loyaltyConfig,
        coupon: dbCoupon as any,
        couponCodeRequested: requestedCouponCode || null,
        hasValidPhone,
        accountPointsBalance: dbAcc?.points_balance ?? 0,
        pointsToRedeemRequested: body.loyalty_points_redeemed ?? 0,
      });
      if (!settlement.ok) {
        return jsonResponse({ error: settlement.error }, 400);
      }
      if (dbCoupon && settlement.coupon_code) {
        dbCoupon.used_count += 1;
      }
      if (dbAcc && settlement.points_redeemed > 0) {
        dbAcc.points_balance = Math.max(0, dbAcc.points_balance - settlement.points_redeemed);
        dbAcc.lifetime_points_redeemed += settlement.points_redeemed;
      }

      const createdOrder = {
        id: `ord-${Date.now()}-${orderNum}`,
        negocio_id: 'surtifacil',
        order_code: orderCode,
        tracking_token: trackingToken,
        source: body.source || 'kiosk',
        customer_name: body.customer_name || 'Cliente Vecino',
        customer_phone: hasValidPhone ? normalizedPhone : body.customer_phone || '',
        delivery_type: body.delivery_type || 'pickup_counter',
        delivery_address: body.delivery_address || '',
        payment_method: body.payment_method || 'cash',
        items,
        subtotal_cents: subtotal,
        coupon_code: settlement.coupon_code,
        coupon_discount_cents: settlement.coupon_discount_cents,
        loyalty_account_id: dbAcc?.id ?? null,
        loyalty_points_redeemed: settlement.points_redeemed,
        loyalty_discount_cents: settlement.points_discount_cents,
        loyalty_points_earned: settlement.points_earned,
        loyalty_settled: 0,
        delivery_fee_cents: deliveryFee,
        total_cents: settlement.final_total_cents,
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

    if (pathname.startsWith('/customer-orders/') && pathname.endsWith('/status') && method === 'PUT') {
      const parts = pathname.split('/');
      const orderId = decodeURIComponent(parts[2]);
      const found = customerOrders.find((o) => o.id === orderId);
      if (found) {
        if (body.status === 'cancelled' && found.status !== 'cancelled' && !found.loyalty_settled) {
          if (found.loyalty_points_redeemed > 0 && found.loyalty_account_id) {
            const acc = loyaltyAccounts.find((a) => a.id === found.loyalty_account_id);
            if (acc) acc.points_balance += Number(found.loyalty_points_redeemed || 0);
          }
          if (found.coupon_code) {
            const c = discountCoupons.find((cp) => cp.code === found.coupon_code);
            if (c) c.used_count = Math.max(0, c.used_count - 1);
          }
          found.loyalty_settled = 1;
        }
        found.status = body.status;
      }
      return jsonResponse(found || { error: 'No encontrado' }, found ? 200 : 404);
    }

    if (pathname.endsWith('/convert-to-sale') && method === 'POST') {
      const parts = pathname.split('/');
      const orderId = decodeURIComponent(parts[2]);
      const found = customerOrders.find((o) => o.id === orderId);
      const saleId = `sale-from-order-${Date.now()}`;
      if (found) {
        found.status = 'completed';
        found.sale_id = saleId;
        for (const it of found.items || []) {
          const prod = products.find((p) => p.id === it.product_id);
          if (prod) {
            const qty = roundQuantity(Number(it.quantity || 0), true);
            const before = prod.stock;
            const after = roundQuantity(Math.max(0, before - qty), true);
            prod.stock = after;
            pushKardexEntry({
              product: prod,
              movement_type: 'sale',
              quantity_delta: -qty,
              stock_before: before,
              stock_after: after,
              unit_price_cents: it.unit_price_cents ?? prod.price_cents,
              total_value_cents: it.subtotal_cents ?? computeLineSubtotalCents(prod.price_cents, qty),
              reference_id: saleId,
              notes: `Pedido ${found.order_code} facturado`,
              actor_uid: actor.id,
              actor_name: actor.displayName,
            });
          }
        }
        if (!found.loyalty_settled && found.customer_phone) {
          const acc = loyaltyAccounts.find((a) => a.phone === normalizeLoyaltyPhone(found.customer_phone));
          const earned = Number(found.loyalty_points_earned || 0);
          if (acc) {
            acc.points_balance += earned;
            acc.lifetime_points_earned += earned;
            acc.total_purchases_count += 1;
          }
          found.loyalty_settled = 1;
        }
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
        const activeSales = sales.filter((s) => !isSaleVoided(s));
        return jsonResponse({
          count: activeSales.length,
          totalCents: activeSales.reduce((sum, s) => sum + (s.total_cents || 0), 0),
        });
      }
      return jsonResponse(sales);
    }

    if (pathname.startsWith('/sales/') && pathname.endsWith('/void') && method === 'POST') {
      if (actor.role !== 'admin' && actor.role !== 'manager') {
        return jsonResponse({ error: 'Solo administradores y gerentes pueden anular ventas.' }, 403);
      }
      const saleId = decodeURIComponent(pathname.replace(/^\/sales\//, '').replace(/\/void$/, ''));
      const found = sales.find((s) => s.id === saleId);
      if (!found) {
        return jsonResponse({ error: 'Venta no encontrada.' }, 404);
      }
      if (isSaleVoided(found)) {
        return jsonResponse({ error: 'Esta venta ya fue anulada previamente.' }, 409);
      }
      const reason = String(body.reason || '').trim();
      if (reason.length < 3) {
        return jsonResponse({ error: 'Motivo de anulación inválido.' }, 400);
      }

      const buckets = extractSalePaymentBuckets(found);
      let restockedUnits = 0;
      for (const item of found.items || []) {
        const qty = roundQuantity(Number(item.quantity || 0), true);
        restockedUnits = roundQuantity(restockedUnits + qty, true);
        const prod = products.find((p) => p.id === item.product_id);
        if (prod) {
          const before = prod.stock;
          const after = roundQuantity(before + qty, true);
          prod.stock = after;
          pushKardexEntry({
            product: prod,
            movement_type: 'sale_void',
            quantity_delta: qty,
            stock_before: before,
            stock_after: after,
            unit_price_cents: item.price_cents ?? prod.price_cents,
            total_value_cents: item.subtotal_cents ?? computeLineSubtotalCents(prod.price_cents, qty),
            reference_id: found.id,
            notes: `Anulación de venta: ${reason}`,
            actor_uid: actor.id,
            actor_name: actor.displayName,
          });
        }
      }

      if (buckets.credit_cents > 0 && found.credit_customer_id) {
        const cust = creditCustomers.find((c) => c.id === found.credit_customer_id);
        if (cust) {
          cust.balance_cents = Math.max(0, cust.balance_cents - buckets.credit_cents);
          creditEntries.unshift({
            id: `ce-void-${Date.now()}`,
            negocio_id: 'surtifacil',
            customer_id: cust.id,
            type: 'payment',
            amount_cents: buckets.credit_cents,
            description: `Reversión por anulación venta #${found.id.slice(0, 8)}: ${reason}`,
            sale_id: found.id,
            created_by_uid: actor.id,
            created_by_role: actor.role,
            created_at: new Date().toISOString(),
          });
        }
      }

      if (found.coupon_code) {
        const c = discountCoupons.find((cp) => cp.code === found.coupon_code);
        if (c) c.used_count = Math.max(0, c.used_count - 1);
      }

      let loyaltyDelta = 0;
      const earned = Number(found.loyalty_points_earned || 0);
      const redeemed = Number(found.loyalty_points_redeemed || 0);
      if (found.loyalty_phone && (earned > 0 || redeemed > 0)) {
        const acc = loyaltyAccounts.find((a) => a.phone === normalizeLoyaltyPhone(found.loyalty_phone));
        if (acc) {
          loyaltyDelta = redeemed - earned;
          acc.points_balance = Math.max(0, acc.points_balance + loyaltyDelta);
        }
      }

      found.status = 'voided';
      found.void_reason = reason;
      found.voided_by_uid = actor.id;
      found.voided_by_name = actor.displayName;
      found.voided_at = new Date().toISOString();

      return jsonResponse({
        success: true,
        sale: found,
        restocked_units: restockedUnits,
        credit_reversed_cents: buckets.credit_cents,
        loyalty_points_delta: loyaltyDelta,
      });
    }

    if (pathname === '/sales' && method === 'POST') {
      const saleId = `sale-${Date.now()}`;
      const mappedItems = (body.items || []).map((it: any) => {
        const prod = products.find((p) => p.id === it.product_id) || products[0];
        const isFrac = isFractionalProduct(prod);
        const qty = roundQuantity(Math.max(isFrac ? 0.05 : 1, Number(it.quantity || 1)), isFrac);
        const before = prod.stock;
        const after = roundQuantity(Math.max(0, before - qty), true);
        prod.stock = after;
        const pricing = resolveProductUnitPricing(prod, qty);
        const unitCost = prod.last_cost_cents ?? Math.round(pricing.unit_price_cents * 0.7);
        pushKardexEntry({
          product: prod,
          movement_type: 'sale',
          quantity_delta: -qty,
          stock_before: before,
          stock_after: after,
          unit_cost_cents: unitCost,
          unit_price_cents: pricing.unit_price_cents,
          total_value_cents: pricing.subtotal_cents,
          reference_id: saleId,
          notes: 'Venta en mostrador POS',
          actor_uid: actor.id,
          actor_name: actor.displayName,
        });
        return {
          product_id: prod.id,
          product_name: prod.name,
          unit: prod.unit || 'unidad',
          allow_fractional: Boolean(prod.allow_fractional),
          quantity: qty,
          price_cents: pricing.unit_price_cents,
          subtotal_cents: pricing.subtotal_cents,
          unit_cost_cents: unitCost,
          cost_subtotal_cents: computeLineSubtotalCents(unitCost, qty),
          regular_price_cents: pricing.active_base_unit_price_cents,
          applied_wholesale_tier: pricing.applied_tier,
          wholesale_savings_cents: pricing.wholesale_savings_cents,
        };
      });
      const subtotalCents = mappedItems.reduce((s: number, i: any) => s + i.subtotal_cents, 0);
      const totalCostCents = mappedItems.reduce((s: number, i: any) => s + i.cost_subtotal_cents, 0);
      const normalizedPhone = body.loyalty_phone ? normalizeLoyaltyPhone(body.loyalty_phone) : '';
      const hasValidPhone = Boolean(normalizedPhone && isValidLoyaltyPhone(normalizedPhone));
      const requestedCouponCode = normalizeCouponCode(body.coupon_code || '');
      const dbCoupon = requestedCouponCode
        ? discountCoupons.find((c) => c.code === requestedCouponCode) || null
        : null;
      let dbAcc = hasValidPhone
        ? loyaltyAccounts.find((a) => a.phone === normalizedPhone && a.active === 1) || null
        : null;
      const settlement = settleOrderLoyaltyAndCoupon({
        itemsSubtotalCents: subtotalCents,
        deliveryFeeCents: 0,
        config: loyaltyConfig,
        coupon: dbCoupon as any,
        couponCodeRequested: requestedCouponCode || null,
        hasValidPhone,
        accountPointsBalance: dbAcc?.points_balance ?? 0,
        pointsToRedeemRequested: body.loyalty_points_redeemed ?? 0,
      });
      if (!settlement.ok) {
        return jsonResponse({ error: settlement.error }, 400);
      }

      const paymentResolution = resolveSalePaymentBreakdown({
        totalCents: settlement.final_total_cents,
        paymentMethod: body.payment_method || 'cash',
        paymentBreakdown: body.payment_breakdown,
        creditCustomerId: body.credit_customer_id,
      });
      if (!paymentResolution.ok) {
        return jsonResponse({ error: paymentResolution.error }, 400);
      }

      if (dbCoupon && settlement.coupon_code) {
        dbCoupon.used_count += 1;
      }
      if (hasValidPhone) {
        if (!dbAcc) {
          dbAcc = {
            id: `loy-${Date.now()}`,
            negocio_id: 'surtifacil',
            phone: normalizedPhone,
            customer_name: body.loyalty_customer_name || `Vecino ${normalizedPhone.slice(-4)}`,
            points_balance: settlement.points_earned,
            lifetime_points_earned: settlement.points_earned,
            lifetime_points_redeemed: 0,
            total_purchases_count: 1,
            total_spent_cents: settlement.final_total_cents,
            active: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          loyaltyAccounts.unshift(dbAcc);
        } else {
          dbAcc.points_balance = Math.max(
            0,
            dbAcc.points_balance - settlement.points_redeemed + settlement.points_earned
          );
          dbAcc.lifetime_points_earned += settlement.points_earned;
          dbAcc.lifetime_points_redeemed += settlement.points_redeemed;
          dbAcc.total_purchases_count += 1;
          dbAcc.total_spent_cents += settlement.final_total_cents;
        }
      }

      const creditCust =
        paymentResolution.credit_cents > 0 && body.credit_customer_id
          ? creditCustomers.find((c) => c.id === body.credit_customer_id)
          : undefined;
      if (creditCust && paymentResolution.credit_cents > 0) {
        creditCust.balance_cents += paymentResolution.credit_cents;
        creditEntries.unshift({
          id: `ce-${Date.now()}`,
          negocio_id: 'surtifacil',
          customer_id: creditCust.id,
          type: 'debt',
          amount_cents: paymentResolution.credit_cents,
          description: paymentResolution.is_mixed ? 'Saldo fiado en venta mixta' : 'Venta fiada en mostrador',
          sale_id: saleId,
          created_by_uid: actor.id,
          created_by_role: actor.role,
          created_at: new Date().toISOString(),
        });
      }

      const createdSale = {
        id: saleId,
        total_cents: settlement.final_total_cents,
        subtotal_cents: subtotalCents,
        total_cost_cents: totalCostCents,
        coupon_code: settlement.coupon_code,
        coupon_discount_cents: settlement.coupon_discount_cents,
        loyalty_phone: hasValidPhone ? normalizedPhone : null,
        loyalty_points_redeemed: settlement.points_redeemed,
        loyalty_discount_cents: settlement.points_discount_cents,
        loyalty_points_earned: settlement.points_earned,
        payment_method: paymentResolution.effective_payment_method,
        payment_breakdown: paymentResolution.breakdown,
        status: 'completed',
        credit_customer_id: creditCust?.id,
        credit_customer_name: creditCust?.name,
        items: mappedItems,
        created_at: new Date().toISOString(),
      };
      sales.unshift(createdSale);
      return jsonResponse({
        id: saleId,
        saleId,
        total_cents: settlement.final_total_cents,
        subtotal_cents: subtotalCents,
        total_cost_cents: totalCostCents,
        coupon_code: settlement.coupon_code,
        coupon_discount_cents: settlement.coupon_discount_cents,
        loyalty_points_redeemed: settlement.points_redeemed,
        loyalty_discount_cents: settlement.points_discount_cents,
        loyalty_points_earned: settlement.points_earned,
        payment_method: paymentResolution.effective_payment_method,
        payment_breakdown: paymentResolution.breakdown,
        status: 'completed',
        items: mappedItems,
      }, 201);
    }

    if (pathname === '/reports/net-profit' && method === 'GET') {
      const days = Number(urlObj.searchParams.get('days') || '30');
      const statement = calculateNetProfitStatement({
        sales,
        shrinkageEntries,
        cashExpenses,
        days,
      });
      return jsonResponse(statement);
    }

    // Club de Puntos y Cupones (Admin / Staff)
    if (pathname === '/loyalty/config' && method === 'GET') {
      return jsonResponse(loyaltyConfig);
    }
    if (pathname === '/loyalty/config' && method === 'PUT') {
      if (actor.role === 'cashier') {
        return jsonResponse({ error: 'Solo administradores y gerentes pueden modificar reglas.' }, 403);
      }
      loyaltyConfig = normalizeLoyaltyConfig({ ...loyaltyConfig, ...body });
      return jsonResponse(loyaltyConfig);
    }
    if (pathname === '/loyalty/summary' && method === 'GET') {
      const activePts = loyaltyAccounts.reduce((s, a) => s + a.points_balance, 0);
      return jsonResponse({
        total_members: loyaltyAccounts.length,
        active_points_balance: activePts,
        active_points_value_cents: activePts * loyaltyConfig.point_value_cents,
        lifetime_points_earned: loyaltyAccounts.reduce((s, a) => s + a.lifetime_points_earned, 0),
        lifetime_points_redeemed: loyaltyAccounts.reduce((s, a) => s + a.lifetime_points_redeemed, 0),
        active_coupons_count: discountCoupons.filter((c) => c.active === 1).length,
        total_coupon_redemptions: discountCoupons.reduce((s, c) => s + c.used_count, 0),
        config: loyaltyConfig,
      });
    }
    if (pathname === '/loyalty/accounts/lookup' && method === 'GET') {
      const normalized = normalizeLoyaltyPhone(urlObj.searchParams.get('phone') || '');
      if (!isValidLoyaltyPhone(normalized)) {
        return jsonResponse({ error: 'Número celular inválido.' }, 400);
      }
      const acc = loyaltyAccounts.find((a) => a.phone === normalized && a.active === 1) || null;
      return jsonResponse({
        enrolled: Boolean(acc),
        phone: normalized,
        account: acc,
        redeemable_value_cents: (acc?.points_balance || 0) * loyaltyConfig.point_value_cents,
        config: loyaltyConfig,
      });
    }
    if (pathname === '/loyalty/accounts' && method === 'GET') {
      return jsonResponse(loyaltyAccounts);
    }
    if (pathname === '/loyalty/accounts' && method === 'POST') {
      const normalized = normalizeLoyaltyPhone(body.phone || '');
      const bonus = Math.max(0, Math.round(Number(body.welcome_bonus_points || 0)));
      const created = {
        id: `loy-${Date.now()}`,
        negocio_id: 'surtifacil',
        phone: normalized,
        customer_name: body.customer_name,
        points_balance: bonus,
        lifetime_points_earned: bonus,
        lifetime_points_redeemed: 0,
        total_purchases_count: 0,
        total_spent_cents: 0,
        active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      loyaltyAccounts.unshift(created);
      return jsonResponse(created, 201);
    }
    if (pathname.startsWith('/loyalty/accounts/') && pathname.endsWith('/movements') && method === 'GET') {
      const accId = decodeURIComponent(pathname.split('/')[3]);
      return jsonResponse(loyaltyMovements.filter((m) => m.account_id === accId));
    }
    if (pathname.startsWith('/loyalty/accounts/') && pathname.endsWith('/adjust') && method === 'POST') {
      if (actor.role === 'cashier') {
        return jsonResponse({ error: 'Solo administradores y gerentes pueden ajustar puntos.' }, 403);
      }
      const accId = decodeURIComponent(pathname.split('/')[3]);
      const acc = loyaltyAccounts.find((a) => a.id === accId);
      if (acc) {
        const delta = Math.round(Number(body.points_delta || 0));
        acc.points_balance = Math.max(0, acc.points_balance + delta);
        if (delta > 0) acc.lifetime_points_earned += delta;
        loyaltyMovements.unshift({
          id: `lmov-${Date.now()}`,
          negocio_id: 'surtifacil',
          account_id: accId,
          type: delta > 0 ? 'bonus' : 'adjust',
          points_delta: delta,
          balance_after: acc.points_balance,
          amount_cents: 0,
          description: body.description,
          created_at: new Date().toISOString(),
        });
      }
      return jsonResponse(acc || { ok: true });
    }
    if (pathname === '/coupons' && method === 'GET') {
      return jsonResponse(discountCoupons);
    }
    if (pathname === '/coupons/validate' && method === 'POST') {
      const code = normalizeCouponCode(body.code || '');
      const coupon = discountCoupons.find((c) => c.code === code) || null;
      const outcome = validateCouponForSubtotal(coupon as any, Number(body.subtotal_cents) || 0);
      if (!outcome.valid) {
        return jsonResponse({ valid: false, error: outcome.error }, 400);
      }
      return jsonResponse({
        valid: true,
        coupon,
        discount_cents: outcome.discount_cents,
        final_subtotal_cents: outcome.final_subtotal_cents,
      });
    }
    if (pathname === '/coupons' && method === 'POST') {
      if (actor.role === 'cashier') {
        return jsonResponse({ error: 'Solo administradores y gerentes pueden crear cupones.' }, 403);
      }
      const created = {
        id: `coup-${Date.now()}`,
        negocio_id: 'surtifacil',
        code: normalizeCouponCode(body.code || ''),
        description: body.description || null,
        discount_type: body.discount_type || 'percentage',
        discount_value: Math.round(Number(body.discount_value || 0)),
        min_purchase_cents: Math.round(Number(body.min_purchase_cents || 0)),
        max_discount_cents: body.max_discount_cents ?? null,
        max_uses: body.max_uses ?? null,
        used_count: 0,
        expires_at: body.expires_at ?? null,
        active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      discountCoupons.unshift(created);
      return jsonResponse(created, 201);
    }
    if (pathname.startsWith('/coupons/') && method === 'PUT') {
      const id = decodeURIComponent(pathname.replace('/coupons/', ''));
      const c = discountCoupons.find((cp) => cp.id === id);
      if (c) {
        if (body.active !== undefined) c.active = body.active ? 1 : 0;
        if (body.description !== undefined) c.description = body.description;
      }
      return jsonResponse(c || { ok: true });
    }
    if (pathname.startsWith('/coupons/') && method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/coupons/', ''));
      discountCoupons = discountCoupons.filter((cp) => cp.id !== id);
      return jsonResponse({ success: true, id });
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
      const isFrac = isFractionalProduct(targetProd);
      const rawQty = Number(body.quantity || 0);
      const qty = isFrac ? roundQuantity(rawQty, true) : Math.floor(rawQty);
      if (qty <= 0 || qty > targetProd.stock) {
        return jsonResponse({ error: 'Stock insuficiente o cantidad inválida.' }, 400);
      }
      const unitCostCents = targetProd.last_cost_cents ?? Math.round(targetProd.price_cents * 0.7);
      const before = targetProd.stock;
      const after = roundQuantity(Math.max(0, before - qty), true);
      targetProd.stock = after;
      const totalCostLossCents = computeLineSubtotalCents(unitCostCents, qty);
      const retailValueCents = computeLineSubtotalCents(targetProd.price_cents, qty);
      const created = {
        id: `shk-e2e-${Date.now()}-${shrinkageEntries.length + 1}`,
        negocio_id: 'surtifacil',
        product_id: targetProd.id,
        product_name: targetProd.name,
        category: targetProd.category,
        unit: targetProd.unit,
        quantity: qty,
        unit_cost_cents: unitCostCents,
        total_cost_loss_cents: totalCostLossCents,
        retail_value_cents: retailValueCents,
        cost_source: 'purchase',
        reason: body.reason || 'damaged',
        notes: body.notes || null,
        created_by_uid: actor.id,
        created_by_name: actor.displayName,
        created_at: new Date().toISOString(),
        updated_stock: targetProd.stock,
      };
      shrinkageEntries.unshift(created);
      pushKardexEntry({
        product: targetProd,
        movement_type: 'shrinkage',
        quantity_delta: -qty,
        stock_before: before,
        stock_after: after,
        unit_cost_cents: unitCostCents,
        unit_price_cents: targetProd.price_cents,
        total_value_cents: totalCostLossCents,
        reference_id: created.id,
        notes: body.notes || `Merma (${body.reason || 'damaged'})`,
        actor_uid: actor.id,
        actor_name: actor.displayName,
      });
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
        if (prod) {
          const qty = roundQuantity(Number(entry.quantity || 0), true);
          const before = prod.stock;
          const after = roundQuantity(before + qty, true);
          prod.stock = after;
          pushKardexEntry({
            product: prod,
            movement_type: 'shrinkage_revert',
            quantity_delta: qty,
            stock_before: before,
            stock_after: after,
            unit_cost_cents: entry.unit_cost_cents ?? prod.last_cost_cents,
            unit_price_cents: prod.price_cents,
            total_value_cents: entry.total_cost_loss_cents ?? 0,
            reference_id: entry.id,
            notes: 'Reversión de merma',
            actor_uid: actor.id,
            actor_name: actor.displayName,
          });
        }
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
    if (pathname === '/super-admin/security-config' && method === 'PUT') {
      if (!actor.isSuperAdmin) {
        return jsonResponse({ error: 'Acceso denegado.' }, 403);
      }
      demoQuickAccessEnabled = Boolean(body.demo_quick_access_enabled);
      return jsonResponse({
        success: true,
        demo_quick_access_enabled: demoQuickAccessEnabled,
        superadmin_quick_access_enabled: demoQuickAccessEnabled,
      });
    }

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
          app_secret_configured: true,
        },
        database: {
          status: 'connected',
          engine: 'Cloudflare D1 (SQLite Edge)',
          multi_tenant: true,
        },
        security: {
          session_signing: 'HMAC-SHA256',
          jwt_secret_source: 'cloudflare_env',
          password_hashing: 'PBKDF2-SHA256 (100.000 iteraciones)',
          mock_tokens_blocked_in_prod: true,
          whatsapp_hmac_configured: true,
          demo_quick_access_enabled: demoQuickAccessEnabled,
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
