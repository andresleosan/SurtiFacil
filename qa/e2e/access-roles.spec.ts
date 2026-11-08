import { expect, test, type Page } from '@playwright/test';

interface RegisteredUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'cashier';
  negocioId: string;
  password?: string;
}

async function setupMultiRoleBackendMocks(page: Page) {
  const users: RegisteredUser[] = [
    {
      id: 'user-admin-surtifacil',
      email: 'admin@surtifacil.com',
      displayName: 'Don Carlos (Administrador)',
      role: 'admin',
      negocioId: 'surtifacil',
    },
    {
      id: 'user-cashier-surtifacil',
      email: 'cajero@surtifacil.com',
      displayName: 'Mateo Restrepo (Cajero Mostrador)',
      role: 'cashier',
      negocioId: 'surtifacil',
    },
    {
      id: 'user-manager-surtifacil',
      email: 'gerente@surtifacil.com',
      displayName: 'Marta Gómez (Gerente Inventario)',
      role: 'manager',
      negocioId: 'surtifacil',
    },
    {
      id: 'admin-andres-san1404',
      email: 'andres.san1404@gmail.com',
      displayName: 'Andrés Sánchez (SuperAdmin)',
      role: 'admin',
      negocioId: 'surtifacil',
    },
    {
      id: 'user-ejemplo-mitienda',
      email: 'ejemplo@mitienda.com',
      displayName: 'Tendero Demo (SurtiFácil)',
      role: 'admin',
      negocioId: 'surtifacil',
    },
  ];

  const products = [
    {
      id: 'prod-leche-1l',
      negocio_id: 'surtifacil',
      name: 'Leche Entera Alquería 1L',
      price_cents: 450000,
      stock: 40,
      min_stock: 10,
      unit: 'litro',
      category: 'Lácteos y Huevos',
      barcode: '7702177001234',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 1,
      precio_oferta_cents: 420000,
    },
    {
      id: 'prod-arroz-1lb',
      negocio_id: 'surtifacil',
      name: 'Arroz Diana 500g (1 Libra)',
      price_cents: 280000,
      stock: 60,
      min_stock: 12,
      unit: 'libra',
      category: 'Granos y Abarrotes',
      barcode: '7702001012345',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 0,
      precio_oferta_cents: null,
    },
  ];

  const stores = [
    {
      id: 'surtifacil',
      slug: 'surtifacil',
      nombre: 'SurtiFácil Abastos Central',
      barrio: 'La Candelaria / Centro',
      ciudad: 'Medellín',
      telefono_whatsapp: '3001234567',
      direccion: 'Calle 50 # 50-20',
      horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
      estado: 'activo',
      plan_id: 'enterprise',
      suscripcion_vence_en: '2027-12-31T23:59:59.000Z',
      cuota_ia_total: 999999,
      cuota_ia_usada: 120,
      costo_domicilio_cents: 350000,
      datos_pago_offline: 'Nequi / Bancolombia: 300 123 4567',
      config: { permite_domicilio: true, permite_retiro: true },
    },
  ];

  const customerOrders: any[] = [];

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method().toUpperCase();

    if (path === '/auth/login' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const email = String(body.email || '').trim().toLowerCase();
      const found = users.find((u) => u.email === email);
      if (!found) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated: false }),
        });
      }
      if (found.password && body.password !== found.password && !body.quick_access) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated: false }),
        });
      }
      const token = `d1:${found.id}:${found.email}:${found.role}:${found.negocioId}`;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          token,
          user: {
            id: found.id,
            email: found.email,
            displayName: found.displayName,
            role: found.role,
            isSuperAdmin: found.email === 'andres.san1404@gmail.com',
            negocioId: found.negocioId,
            active: true,
          },
          negocio: stores.find((s) => s.id === found.negocioId) || stores[0],
        }),
      });
    }

    if (path === '/registro-negocio' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const slug = String(body.slug || 'nueva-tienda').toLowerCase();
      const email = String(body.email || '').toLowerCase();
      const newUser: RegisteredUser = {
        id: `user-${slug}`,
        email,
        displayName: body.owner_name || body.nombre || 'Admin Tienda',
        role: 'admin',
        negocioId: slug,
        password: body.password,
      };
      users.push(newUser);
      const newStore = {
        id: slug,
        slug,
        nombre: body.nombre,
        barrio: body.barrio || 'Laureles',
        ciudad: 'Medellín',
        telefono_whatsapp: body.telefono_whatsapp || '3000000000',
        direccion: body.direccion || 'Calle 10',
        horario: '7:00 AM - 9:00 PM',
        estado: 'activo',
        plan_id: body.plan_id || 'prueba_3d',
        suscripcion_vence_en: '2027-12-31T23:59:59.000Z',
        cuota_ia_total: 300,
        cuota_ia_usada: 0,
        costo_domicilio_cents: 0,
        datos_pago_offline: '',
        config: { permite_domicilio: true, permite_retiro: true },
      };
      stores.push(newStore);
      const token = `d1:${newUser.id}:${newUser.email}:admin:${slug}`;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          token,
          negocio: newStore,
          user: newUser,
        }),
      });
    }

    if (path === '/auth/me' && method === 'GET') {
      const authHeader = req.headers()['authorization'] || '';
      const raw = authHeader.replace(/^Bearer\s+/i, '');
      const parts = raw.split(':');
      const email = parts[2] || 'admin@surtifacil.com';
      const role = (parts[3] as 'admin' | 'manager' | 'cashier') || 'admin';
      const found = users.find((u) => u.email === email) || users[0];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: found.id,
            email: found.email,
            displayName: found.displayName,
            role: found.role || role,
            isSuperAdmin: found.email === 'andres.san1404@gmail.com',
            negocioId: found.negocioId,
            active: true,
          },
          negocio: stores[0],
        }),
      });
    }

    if (path.startsWith('/public/store/') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          store: stores[0],
          products,
          combos: [],
        }),
      });
    }

    if (path === '/customer-orders' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const order = {
        id: `ord-${Date.now()}`,
        negocio_id: 'surtifacil',
        order_code: body.source === 'kiosk' ? '#K-01' : '#W-01',
        source: body.source || 'web',
        customer_name: body.customer_name || 'Cliente Vecino',
        customer_phone: body.customer_phone || '3001112233',
        delivery_type: body.delivery_type || 'pickup_counter',
        payment_method: body.payment_method || 'cash',
        items: body.items || [],
        total_cents: 420000,
        status: 'pending',
        tracking_token: 'tk_test_cliente_01',
        created_at: new Date().toISOString(),
      };
      customerOrders.push(order);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, order }),
      });
    }

    if (path.startsWith('/customer-orders/track/') && method === 'GET') {
      const order = customerOrders[0] || {
        id: 'ord-1',
        order_code: '#W-01',
        customer_name: 'Cliente Vecino',
        delivery_type: 'delivery',
        payment_method: 'cash',
        items: [{ product_id: 'prod-leche-1l', product_name: 'Leche Entera Alquería 1L', quantity: 1, unit_price_cents: 420000, subtotal_cents: 420000 }],
        total_cents: 770000,
        status: 'pending',
        tracking_token: 'tk_test_cliente_01',
        created_at: new Date().toISOString(),
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ order, store: stores[0] }),
      });
    }

    if (path === '/super-admin/negocios' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kpis: {
            totalTiendas: stores.length,
            tiendasActivas: stores.length,
            recaudoEstimadoCOP: 59900,
            cuotaIATotal: 999999,
            cuotaIAUsada: 120,
          },
          negocios: stores,
        }),
      });
    }

    if (path === '/products' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(products),
      });
    }

    if (path === '/users' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(users.map((u) => ({ ...u, active: 1 }))),
      });
    }

    if (path === '/settings' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stores[0]),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.describe('Certificación de Acceso Real Multi-Rol (Cliente, Cajero, Gerente, Admin y SuperAdmin)', () => {
  test('1. Inicia sesión con ejemplo@mitienda.com en el formulario de login sin error', async ({ page }) => {
    await setupMultiRoleBackendMocks(page);

    await page.goto('/#/login');
    await page.getByLabel('Correo electrónico').fill('ejemplo@mitienda.com');
    await page.getByLabel('Contraseña').fill('Surti2026!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('heading', { name: 'Panel de Control' })).toBeVisible();
  });

  test('2. Acceso Rápido en 1 Clic para Admin, Cajero, Gerente y SuperAdmin con validación de permisos RBAC', async ({ page }) => {
    await setupMultiRoleBackendMocks(page);

    // 2.1 Entrar como Cajero (accede a POS pero tiene bloqueado Proveedores y Empleados)
    await page.goto('/#/login');
    await page.getByRole('button', { name: /Entrar como Cajero/i }).click();
    await expect(page).toHaveURL(/#\/create-sale/);

    await page.goto('/#/suppliers');
    await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();

    const sidebar = page.getByRole('complementary', { name: 'Menú principal' });
    await sidebar.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    // 2.2 Entrar como Gerente (accede a Inventario pero tiene bloqueado Empleados)
    await page.getByRole('button', { name: /Entrar como Gerente/i }).click();
    await expect(page).toHaveURL(/#\/inventory/);

    await page.goto('/#/employees');
    await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Cerrar sesión' }).click();

    // 2.3 Entrar como SuperAdmin (accede al Centro de Control Multi-Tenant)
    await page.getByRole('button', { name: /Entrar como SuperAdmin/i }).click();
    await expect(page).toHaveURL(/#\/super-admin/);
    await expect(page.getByText('SurtiFácil Abastos Central')).toBeVisible();
  });

  test('3. Registro de nueva tienda con botón de entrada directa en 1 clic y posterior login con su contraseña', async ({ page }) => {
    await setupMultiRoleBackendMocks(page);

    await page.goto('/#/registro-negocio');
    await page.getByLabel(/Nombre de la Tienda/i).fill('Abastos El Roble');
    await page.getByLabel(/Tu Nombre Completo/i).fill('Carlos Gómez');
    await page.getByLabel(/Teléfono WhatsApp/i).fill('3009998877');
    await page.getByLabel(/Correo Electrónico de Acceso/i).fill('carlos@elroble.co');
    await page.getByLabel(/Contraseña de Administrador/i).fill('Roble2026!');

    await page.getByRole('button', { name: /Comenzar mi Tienda en SurtiFácil/i }).click();
    await expect(page.getByRole('heading', { name: /¡Bienvenido a SurtiFácil!/i })).toBeVisible();

    // Entrar directo con 1 clic
    await page.getByRole('button', { name: /Entrar directo a mi tienda ahora/i }).click();
    await expect(page.getByRole('heading', { name: 'Panel de Control' })).toBeVisible();

    // Cerrar sesión y volver a entrar con el correo y contraseña recién registrados
    const sidebar = page.getByRole('complementary', { name: 'Menú principal' });
    await sidebar.getByRole('button', { name: 'Cerrar sesión' }).click();

    await page.getByLabel('Correo electrónico').fill('carlos@elroble.co');
    await page.getByLabel('Contraseña').fill('Roble2026!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('heading', { name: 'Panel de Control' })).toBeVisible();
  });

  test('4. Acceso como Cliente desde Login hacia Tienda Vecinal y Kiosco Táctil', async ({ page }) => {
    await setupMultiRoleBackendMocks(page);

    // 4.1 Abrir Tienda Vecinal desde el acceso rápido en Login
    await page.goto('/#/login');
    await page.getByRole('link', { name: /Vista Cliente Tienda/i }).click();
    await expect(page).toHaveURL(/#\/tienda\/surtifacil/);
    await expect(page.getByText('Leche Entera Alquería 1L')).toBeVisible();

    // 4.2 Abrir Kiosco Táctil desde el acceso rápido en Login
    await page.goto('/#/login');
    await page.getByRole('link', { name: /Vista Cliente Kiosco/i }).click();
    await expect(page).toHaveURL(/#\/kiosco\/surtifacil/);
    await expect(page.getByText('Leche Entera Alquería 1L')).toBeVisible();
  });
});
