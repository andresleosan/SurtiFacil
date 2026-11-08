import { D1Database } from '../types';

let schemaMigrated = false;

/**
 * Calcula un hash SHA-256 hexadecimal determinístico usando Web Crypto API
 * Compatible con Cloudflare Workers / Pages Functions y navegadores modernos.
 */
export async function hashPassword(password: string): Promise<string> {
  const normalized = password.trim();
  const data = new TextEncoder().encode(`surtifacil_salt_v1:${normalized}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ejecuta una sentencia SQL ignorando errores si la columna/tabla ya existe.
 */
async function safeRun(db: D1Database, sql: string, bindings: unknown[] = []): Promise<void> {
  try {
    const stmt = db.prepare(sql);
    if (bindings.length > 0) {
      await stmt.bind(...bindings).run();
    } else {
      await stmt.run();
    }
  } catch {
    // Ignorar errores de columna duplicada o restricción existente en migraciones idempotentes
  }
}

/**
 * Auto-migración idempotente del esquema Multi-Tenant en Cloudflare D1 (`surtifacil-db`).
 * Garantiza que tanto bases de datos nuevas como bases de datos creadas en la Fase 1
 * tengan todas las tablas, columnas `negocio_id` y semillas iniciales operativas.
 */
export async function ensureDatabaseSchema(db: D1Database, force = false): Promise<void> {
  if (!db) return;
  if (schemaMigrated && !force) return;

  // 1. Crear tablas maestras si no existen
  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS negocios (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      barrio TEXT DEFAULT 'Medellín',
      ciudad TEXT DEFAULT 'Medellín',
      telefono_whatsapp TEXT,
      direccion TEXT,
      horario TEXT DEFAULT 'Lunes a Domingo 7:00 AM - 9:00 PM',
      logo_url TEXT,
      estado TEXT NOT NULL DEFAULT 'activo',
      plan_id TEXT NOT NULL DEFAULT 'prueba_3d',
      suscripcion_vence_en TEXT,
      cuota_ia_total INTEGER NOT NULL DEFAULT 300,
      cuota_ia_usada INTEGER NOT NULL DEFAULT 0,
      costo_domicilio_cents INTEGER NOT NULL DEFAULT 0,
      datos_pago_offline TEXT,
      config_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      email TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'cashier',
      is_super_admin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT,
      deleted_at TEXT,
      deleted_by_uid TEXT
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      category TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      total_orders INTEGER NOT NULL DEFAULT 0,
      total_spent_cents INTEGER NOT NULL DEFAULT 0,
      lead_time_days INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 5,
      unit TEXT NOT NULL DEFAULT 'unidad',
      category TEXT DEFAULT 'General',
      image_url TEXT,
      supplier_id TEXT,
      barcode TEXT,
      visible_kiosco INTEGER NOT NULL DEFAULT 1,
      visible_tienda INTEGER NOT NULL DEFAULT 1,
      en_oferta INTEGER NOT NULL DEFAULT 0,
      precio_oferta_cents INTEGER,
      last_cost_cents INTEGER,
      last_cost_source TEXT,
      last_cost_updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS combos (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      image_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      visible_kiosco INTEGER NOT NULL DEFAULT 1,
      visible_tienda INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS credit_customers (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_entry_at TEXT
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS credit_entries (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      customer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      description TEXT,
      sale_id TEXT,
      created_by_uid TEXT NOT NULL DEFAULT 'system',
      created_by_role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      total_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      credit_customer_id TEXT,
      credit_customer_name TEXT,
      total_cost_cents INTEGER DEFAULT 0,
      created_by_uid TEXT,
      created_by_role TEXT,
      schema_version INTEGER DEFAULT 2,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      unit_cost_cents INTEGER DEFAULT 0,
      cost_subtotal_cents INTEGER DEFAULT 0,
      cost_source TEXT,
      cost_is_estimated INTEGER DEFAULT 0,
      category TEXT
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      supplier_id TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      total_cents INTEGER NOT NULL DEFAULT 0,
      received_total_cents INTEGER NOT NULL DEFAULT 0,
      expected_date TEXT,
      received_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      name TEXT,
      category TEXT,
      quantity INTEGER NOT NULL,
      received_quantity INTEGER NOT NULL DEFAULT 0,
      unit_cost_cents INTEGER NOT NULL,
      final_cost_cents INTEGER,
      is_new_product INTEGER NOT NULL DEFAULT 0
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS customer_orders (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      order_code TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'kiosk',
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      delivery_type TEXT NOT NULL DEFAULT 'pickup_counter',
      delivery_address TEXT,
      delivery_neighborhood TEXT,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      items_json TEXT NOT NULL DEFAULT '[]',
      total_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      tracking_token TEXT UNIQUE,
      sale_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await safeRun(
    db,
    `CREATE TABLE IF NOT EXISTS cash_closings (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil',
      closing_number INTEGER NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_by_uid TEXT NOT NULL,
      closed_by_name TEXT,
      initial_cash_cents INTEGER NOT NULL DEFAULT 0,
      sales_cash_cents INTEGER NOT NULL DEFAULT 0,
      credit_payments_cash_cents INTEGER NOT NULL DEFAULT 0,
      expected_cash_cents INTEGER NOT NULL,
      counted_cash_cents INTEGER NOT NULL,
      difference_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'balanced',
      breakdown_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT,
      total_sales_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`
  );

  // 2. Migrar columnas faltantes en tablas preexistentes de Fase 1
  const alterColumns = [
    // users
    "ALTER TABLE users ADD COLUMN negocio_id TEXT NOT NULL DEFAULT 'surtifacil'",
    'ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN password_hash TEXT',
    'ALTER TABLE users ADD COLUMN last_login TEXT',
    'ALTER TABLE users ADD COLUMN deleted_at TEXT',
    'ALTER TABLE users ADD COLUMN deleted_by_uid TEXT',
    // products
    "ALTER TABLE products ADD COLUMN negocio_id TEXT NOT NULL DEFAULT 'surtifacil'",
    'ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 5',
    "ALTER TABLE products ADD COLUMN unit TEXT NOT NULL DEFAULT 'unidad'",
    'ALTER TABLE products ADD COLUMN image_url TEXT',
    'ALTER TABLE products ADD COLUMN supplier_id TEXT',
    'ALTER TABLE products ADD COLUMN barcode TEXT',
    'ALTER TABLE products ADD COLUMN visible_kiosco INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE products ADD COLUMN visible_tienda INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE products ADD COLUMN en_oferta INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE products ADD COLUMN precio_oferta_cents INTEGER',
    'ALTER TABLE products ADD COLUMN last_cost_cents INTEGER',
    'ALTER TABLE products ADD COLUMN last_cost_source TEXT',
    'ALTER TABLE products ADD COLUMN last_cost_updated_at TEXT',
    "ALTER TABLE products ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))",
    // suppliers
    "ALTER TABLE suppliers ADD COLUMN negocio_id TEXT NOT NULL DEFAULT 'surtifacil'",
    'ALTER TABLE suppliers ADD COLUMN contact_name TEXT',
    'ALTER TABLE suppliers ADD COLUMN phone TEXT',
    'ALTER TABLE suppliers ADD COLUMN email TEXT',
    'ALTER TABLE suppliers ADD COLUMN address TEXT',
    'ALTER TABLE suppliers ADD COLUMN category TEXT',
    'ALTER TABLE suppliers ADD COLUMN active INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE suppliers ADD COLUMN total_orders INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE suppliers ADD COLUMN total_spent_cents INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE suppliers ADD COLUMN lead_time_days INTEGER DEFAULT 0',
    // credit_customers
    "ALTER TABLE credit_customers ADD COLUMN negocio_id TEXT NOT NULL DEFAULT 'surtifacil'",
    'ALTER TABLE credit_customers ADD COLUMN phone TEXT',
    'ALTER TABLE credit_customers ADD COLUMN notes TEXT',
    'ALTER TABLE credit_customers ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE credit_customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1',
    "ALTER TABLE credit_customers ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))",
    'ALTER TABLE credit_customers ADD COLUMN last_entry_at TEXT',
    // credit_entries
    "ALTER TABLE credit_entries ADD COLUMN negocio_id TEXT NOT NULL DEFAULT 'surtifacil'",
    'ALTER TABLE credit_entries ADD COLUMN sale_id TEXT',
    "ALTER TABLE credit_entries ADD COLUMN created_by_uid TEXT NOT NULL DEFAULT 'system'",
    "ALTER TABLE credit_entries ADD COLUMN created_by_role TEXT DEFAULT 'admin'",
    // sales
    "ALTER TABLE sales ADD COLUMN negocio_id TEXT NOT NULL DEFAULT 'surtifacil'",
    'ALTER TABLE sales ADD COLUMN credit_customer_id TEXT',
    'ALTER TABLE sales ADD COLUMN credit_customer_name TEXT',
    'ALTER TABLE sales ADD COLUMN total_cost_cents INTEGER DEFAULT 0',
    'ALTER TABLE sales ADD COLUMN created_by_uid TEXT',
    'ALTER TABLE sales ADD COLUMN created_by_role TEXT',
    'ALTER TABLE sales ADD COLUMN schema_version INTEGER DEFAULT 2',
    // sale_items
    'ALTER TABLE sale_items ADD COLUMN unit_cost_cents INTEGER DEFAULT 0',
    'ALTER TABLE sale_items ADD COLUMN cost_subtotal_cents INTEGER DEFAULT 0',
    'ALTER TABLE sale_items ADD COLUMN cost_source TEXT',
    'ALTER TABLE sale_items ADD COLUMN cost_is_estimated INTEGER DEFAULT 0',
    'ALTER TABLE sale_items ADD COLUMN category TEXT',
    // purchase_orders
    "ALTER TABLE purchase_orders ADD COLUMN negocio_id TEXT NOT NULL DEFAULT 'surtifacil'",
    'ALTER TABLE purchase_orders ADD COLUMN received_total_cents INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE purchase_orders ADD COLUMN expected_date TEXT',
    'ALTER TABLE purchase_orders ADD COLUMN received_date TEXT',
    'ALTER TABLE purchase_orders ADD COLUMN notes TEXT',
  ];

  for (const sql of alterColumns) {
    await safeRun(db, sql);
  }

  // 3. Semillas iniciales de Negocios Multi-Tenant
  const oneYearFromNow = new Date(Date.now() + 365 * 86400000).toISOString();
  const fifteenDaysFromNow = new Date(Date.now() + 15 * 86400000).toISOString();

  await safeRun(
    db,
    `INSERT OR IGNORE INTO negocios (
      id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, estado, plan_id, suscripcion_vence_en, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, datos_pago_offline, config_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activo', 'enterprise', ?, 999999, 120, 350000, 'Nequi / Bancolombia: 300 123 4567', ?)`,
    [
      'surtifacil',
      'surtifacil',
      'SurtiFácil Abastos Central - Medellín',
      'La Candelaria / Centro',
      'Medellín',
      '573001234567',
      'Calle 50 # 50-20, Centro, Medellín',
      'Lunes a Domingo 7:00 AM - 9:00 PM',
      oneYearFromNow,
      JSON.stringify({
        slogan: 'El motor digital del tendero paisa',
        permite_domicilio: true,
        permite_retiro: true,
      }),
    ]
  );

  await safeRun(
    db,
    `INSERT OR IGNORE INTO negocios (
      id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, estado, plan_id, suscripcion_vence_en, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, datos_pago_offline, config_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activo', 'quincenal_15d', ?, 1500, 340, 400000, 'Nequi: 311 987 6543', ?)`,
    [
      'abastos-la-80',
      'abastos-la-80',
      'Minimercado y Abastos La 80',
      'Belén',
      'Medellín',
      '3119876543',
      'Avenida 80 # 30-15, Belén',
      'Lunes a Sábado 7:00 AM - 8:30 PM',
      fifteenDaysFromNow,
      JSON.stringify({
        slogan: 'Frescura y economía para tu hogar en Belén',
        permite_domicilio: true,
        permite_retiro: true,
      }),
    ]
  );

  // 4. Semillas iniciales de Usuarios por Rol (SuperAdmin, Admin, Gerente, Cajero y Cuenta Ejemplo)
  const defaultUsers = [
    {
      id: 'admin-andres-san1404',
      negocio_id: 'surtifacil',
      email: 'andres.san1404@gmail.com',
      display_name: 'Andrés Sánchez (SuperAdmin)',
      role: 'admin',
      is_super_admin: 1,
    },
    {
      id: 'user-admin-surtifacil',
      negocio_id: 'surtifacil',
      email: 'admin@surtifacil.com',
      display_name: 'Don Carlos (Administrador)',
      role: 'admin',
      is_super_admin: 0,
    },
    {
      id: 'user-manager-surtifacil',
      negocio_id: 'surtifacil',
      email: 'gerente@surtifacil.com',
      display_name: 'Marta Gómez (Gerente Inventario)',
      role: 'manager',
      is_super_admin: 0,
    },
    {
      id: 'user-cashier-surtifacil',
      negocio_id: 'surtifacil',
      email: 'cajero@surtifacil.com',
      display_name: 'Mateo Restrepo (Cajero Mostrador)',
      role: 'cashier',
      is_super_admin: 0,
    },
    {
      id: 'user-ejemplo-mitienda',
      negocio_id: 'surtifacil',
      email: 'ejemplo@mitienda.com',
      display_name: 'Tendero Demo (SurtiFácil)',
      role: 'admin',
      is_super_admin: 0,
    },
    {
      id: 'user-qa-surtifacil',
      negocio_id: 'surtifacil',
      email: 'qa@surtifacil.com',
      display_name: 'Cuenta QA Automatizada',
      role: 'admin',
      is_super_admin: 0,
    },
  ];

  for (const u of defaultUsers) {
    await safeRun(
      db,
      `INSERT OR IGNORE INTO users (id, negocio_id, email, display_name, role, is_super_admin, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [u.id, u.negocio_id, u.email, u.display_name, u.role, u.is_super_admin]
    );
  }

  // Asegurar que andres.san1404@gmail.com tenga siempre is_super_admin = 1 y active = 1
  await safeRun(
    db,
    "UPDATE users SET is_super_admin = 1, active = 1, role = 'admin' WHERE lower(email) = 'andres.san1404@gmail.com'"
  );

  // 5. Semillas de Catálogo de Productos para 'surtifacil' (si existen pocos productos)
  await safeRun(
    db,
    "UPDATE products SET negocio_id = 'surtifacil', visible_kiosco = 1, visible_tienda = 1 WHERE negocio_id IS NULL OR negocio_id = ''"
  );

  const seedProducts = [
    {
      id: 'prod-leche-alqueria-1l',
      name: 'Leche Entera Alquería 1L',
      price_cents: 450000,
      stock: 48,
      min_stock: 10,
      unit: 'litro',
      category: 'Lácteos y Huevos',
      barcode: '7702177001234',
      image_url: '/images/products/leche-alqueria-1l.svg',
      en_oferta: 1,
      precio_oferta_cents: 420000,
      last_cost_cents: 340000,
    },
    {
      id: 'prod-arroz-diana-1lb',
      name: 'Arroz Diana 500g (1 Libra)',
      price_cents: 280000,
      stock: 85,
      min_stock: 15,
      unit: 'libra',
      category: 'Granos y Abarrotes',
      barcode: '7702001012345',
      image_url: '/images/products/arroz-diana-1lb.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 210000,
    },
    {
      id: 'prod-huevos-aa-x30',
      name: 'Cubeta de Huevos AA x30',
      price_cents: 1850000,
      stock: 24,
      min_stock: 6,
      unit: 'cubeta',
      category: 'Lácteos y Huevos',
      barcode: '7709990003030',
      image_url: '/images/products/huevos-aa-x30.svg',
      en_oferta: 1,
      precio_oferta_cents: 1750000,
      last_cost_cents: 1450000,
    },
    {
      id: 'prod-chocolate-corona-500g',
      name: 'Chocolate Corona 500g',
      price_cents: 890000,
      stock: 32,
      min_stock: 8,
      unit: 'libra',
      category: 'Despensa y Café',
      barcode: '7702004005009',
      image_url: '/images/products/chocolate-corona-500g.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 690000,
    },
    {
      id: 'prod-arepas-antioquenas-x10',
      name: 'Arepas Antioqueñas de Maíz x10',
      price_cents: 420000,
      stock: 40,
      min_stock: 10,
      unit: 'paquete',
      category: 'Panadería y Arepa',
      barcode: '7708881112223',
      image_url: '/images/products/arepas-antioquenas-x10.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 290000,
    },
    {
      id: 'prod-quesito-antioqueno-400g',
      name: 'Quesito Antioqueño Colanta 400g',
      price_cents: 980000,
      stock: 18,
      min_stock: 5,
      unit: 'unidad',
      category: 'Lácteos y Huevos',
      barcode: '7702123456789',
      image_url: '/images/products/quesito-antioqueno-400g.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 760000,
    },
    {
      id: 'prod-aceite-gourmet-1l',
      name: 'Aceite Gourmet Familia 1L',
      price_cents: 1250000,
      stock: 22,
      min_stock: 5,
      unit: 'litro',
      category: 'Granos y Abarrotes',
      barcode: '7702020304050',
      image_url: '/images/products/aceite-gourmet-1l.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 980000,
    },
    {
      id: 'prod-cocacola-15l',
      name: 'Coca-Cola Original 1.5L',
      price_cents: 650000,
      stock: 50,
      min_stock: 12,
      unit: 'litro',
      category: 'Bebidas y Licores',
      barcode: '7702535001505',
      image_url: '/images/products/cocacola-15l.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 480000,
    },
    {
      id: 'prod-frijol-cargamanto-1lb',
      name: 'Fríjol Cargamanto Rojo 500g',
      price_cents: 520000,
      stock: 35,
      min_stock: 10,
      unit: 'libra',
      category: 'Granos y Abarrotes',
      barcode: '7703332221110',
      image_url: '/images/products/frijol-cargamanto-1lb.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 390000,
    },
    {
      id: 'prod-cafe-sello-rojo-500g',
      name: 'Café Sello Rojo 500g',
      price_cents: 1480000,
      stock: 25,
      min_stock: 8,
      unit: 'libra',
      category: 'Despensa y Café',
      barcode: '7702004001230',
      image_url: '/images/products/cafe-sello-rojo-500g.svg',
      en_oferta: 1,
      precio_oferta_cents: 1390000,
      last_cost_cents: 1180000,
    },
    {
      id: 'prod-panela-pastilla-unidad',
      name: 'Panela en Pastilla 500g',
      price_cents: 320000,
      stock: 45,
      min_stock: 12,
      unit: 'unidad',
      category: 'Despensa y Café',
      barcode: '7705554443332',
      image_url: '/images/products/panela-pastilla-unidad.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 220000,
    },
    {
      id: 'prod-jabon-rey-unidad',
      name: 'Jabón Rey Barra 300g',
      price_cents: 290000,
      stock: 60,
      min_stock: 15,
      unit: 'unidad',
      category: 'Aseo y Hogar',
      barcode: '7702008001114',
      image_url: '/images/products/jabon-rey-unidad.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 190000,
    },
    {
      id: 'prod-gaseosa-colombiana-15l',
      name: 'Gaseosa Colombiana Postobón 1.5L',
      price_cents: 580000,
      stock: 38,
      min_stock: 10,
      unit: 'litro',
      category: 'Bebidas y Licores',
      barcode: '7702535002229',
      image_url: '/images/products/gaseosa-colombiana-15l.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 420000,
    },
    {
      id: 'prod-chocoramo-unidad',
      name: 'Chocoramo Ramo 65g',
      price_cents: 260000,
      stock: 75,
      min_stock: 20,
      unit: 'unidad',
      category: 'Snacks y Dulces',
      barcode: '7702009003335',
      image_url: '/images/products/chocoramo-unidad.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 180000,
    },
    {
      id: 'prod-papas-margarita-pollo',
      name: 'Papas Margarita Pollo 105g',
      price_cents: 390000,
      stock: 45,
      min_stock: 12,
      unit: 'unidad',
      category: 'Snacks y Dulces',
      barcode: '7702010004448',
      image_url: '/images/products/papas-margarita-pollo.svg',
      en_oferta: 0,
      precio_oferta_cents: null,
      last_cost_cents: 270000,
    },
  ];

  for (const p of seedProducts) {
    await safeRun(
      db,
      `INSERT INTO products (
        id, negocio_id, name, price_cents, stock, min_stock, unit, category, image_url, barcode,
        visible_kiosco, visible_tienda, en_oferta, precio_oferta_cents, last_cost_cents, last_cost_source, created_at, updated_at
      ) VALUES (?, 'surtifacil', ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, 'purchase', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        image_url = excluded.image_url,
        price_cents = excluded.price_cents,
        category = excluded.category,
        barcode = excluded.barcode,
        updated_at = datetime('now')`,
      [
        p.id,
        p.name,
        p.price_cents,
        p.stock,
        p.min_stock,
        p.unit,
        p.category,
        p.image_url,
        p.barcode,
        p.en_oferta,
        p.precio_oferta_cents,
        p.last_cost_cents,
      ]
    );
  }

  // 5.1 Enlace retroactivo de imágenes colombianas por nombre en todas las tiendas
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/leche-alqueria-1l.svg' WHERE lower(name) LIKE '%leche%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/arroz-diana-1lb.svg' WHERE lower(name) LIKE '%arroz%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/huevos-aa-x30.svg' WHERE (lower(name) LIKE '%huevo%' OR lower(name) LIKE '%cubeta%') AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/chocolate-corona-500g.svg' WHERE (lower(name) LIKE '%chocolate%' OR lower(name) LIKE '%corona%') AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/arepas-antioquenas-x10.svg' WHERE lower(name) LIKE '%arepa%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/quesito-antioqueno-400g.svg' WHERE (lower(name) LIKE '%quesito%' OR lower(name) LIKE '%queso%') AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/aceite-gourmet-1l.svg' WHERE lower(name) LIKE '%aceite%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/cocacola-15l.svg' WHERE (lower(name) LIKE '%coca%' OR lower(name) LIKE '%cola%') AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/frijol-cargamanto-1lb.svg' WHERE lower(name) LIKE '%frijol%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/cafe-sello-rojo-500g.svg' WHERE lower(name) LIKE '%cafe%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/panela-pastilla-unidad.svg' WHERE lower(name) LIKE '%panela%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/jabon-rey-unidad.svg' WHERE lower(name) LIKE '%jabon%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/gaseosa-colombiana-15l.svg' WHERE lower(name) LIKE '%colombiana%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/chocoramo-unidad.svg' WHERE lower(name) LIKE '%chocoramo%' AND (image_url IS NULL OR image_url = '')"
  );
  await safeRun(
    db,
    "UPDATE products SET image_url = '/images/products/papas-margarita-pollo.svg' WHERE lower(name) LIKE '%margarita%' AND (image_url IS NULL OR image_url = '')"
  );

  // 6. Semilla de Combo Desayuno Paisa con Imagen
  await safeRun(
    db,
    `INSERT INTO combos (
      id, negocio_id, name, description, price_cents, items_json, image_url, active, visible_kiosco, visible_tienda, created_at, updated_at
    ) VALUES (?, 'surtifacil', ?, ?, ?, ?, '/images/products/combo-desayuno-paisa.svg', 1, 1, 1, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      image_url = '/images/products/combo-desayuno-paisa.svg',
      updated_at = datetime('now')`,
    [
      'combo-desayuno-paisa',
      'Combo Desayuno Paisa',
      'Chocolate Corona 500g, Quesito Antioqueño y Arepas de Maíz x10',
      2100000,
      JSON.stringify([
        { product_id: 'prod-chocolate-corona-500g', product_name: 'Chocolate Corona 500g', quantity: 1, unit_price_cents: 890000 },
        { product_id: 'prod-quesito-antioqueno-400g', product_name: 'Quesito Antioqueño Colanta 400g', quantity: 1, unit_price_cents: 980000 },
        { product_id: 'prod-arepas-antioquenas-x10', product_name: 'Arepas Antioqueñas de Maíz x10', quantity: 1, unit_price_cents: 420000 },
      ]),
    ]
  );

  // 7. Semillas de Clientes de Fiados y Proveedores
  await safeRun(
    db,
    `INSERT OR IGNORE INTO credit_customers (
      id, negocio_id, name, phone, notes, balance_cents, active, created_at, updated_at
    ) VALUES ('ccust-don-carlos', 'surtifacil', 'Don Carlos Restrepo', '3004567890', 'Vecino del edificio frente al parque', 2450000, 1, datetime('now'), datetime('now'))`
  );

  await safeRun(
    db,
    `INSERT OR IGNORE INTO credit_customers (
      id, negocio_id, name, phone, notes, balance_cents, active, created_at, updated_at
    ) VALUES ('ccust-dona-marta', 'surtifacil', 'Doña Marta Gómez', '3112345678', 'Paga puntualmente cada quincena', 1500000, 1, datetime('now'), datetime('now'))`
  );

  await safeRun(
    db,
    `INSERT OR IGNORE INTO suppliers (
      id, negocio_id, name, contact_name, phone, email, address, category, active, total_orders, total_spent_cents, lead_time_days, created_at
    ) VALUES ('supp-colanta', 'surtifacil', 'Cooperativa Colanta Medellín', 'Jorge Peláez', '3001112233', 'pedidos@colanta.com.co', 'Caribe, Medellín', 'Lácteos y Huevos', 1, 5, 18500000, 1, datetime('now'))`
  );

  await safeRun(
    db,
    `INSERT OR IGNORE INTO suppliers (
      id, negocio_id, name, contact_name, phone, email, address, category, active, total_orders, total_spent_cents, lead_time_days, created_at
    ) VALUES ('supp-mayorista', 'surtifacil', 'Central Mayorista Bloque 14', 'Luz Marina Vélez', '3123334455', 'ventas@mayoristab14.co', 'Itagüí, Antioquia', 'Granos y Abarrotes', 1, 8, 42000000, 2, datetime('now'))`
  );

  schemaMigrated = true;
}
