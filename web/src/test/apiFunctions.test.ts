import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from '../../functions/api/[[route]]';
import { D1Database, D1PreparedStatement, D1Result, Env } from '../../functions/types';

// Simulador en memoria de Cloudflare D1 para pruebas unitarias
class MockD1Database implements D1Database {
  public tables: {
    negocios: any[];
    users: any[];
    products: any[];
    sales: any[];
    sale_items: any[];
    credit_customers: any[];
    credit_entries: any[];
    suppliers: any[];
    purchase_orders: any[];
    purchase_order_items: any[];
  };

  constructor() {
    this.tables = {
      negocios: [
        {
          id: 'surtifacil',
          slug: 'surtifacil',
          nombre: 'SurtiFácil Abastos Central',
          barrio: 'Centro',
          ciudad: 'Medellín',
          estado: 'activo',
          plan_id: 'enterprise',
        },
      ],
      users: [
        {
          id: 'admin-1',
          negocio_id: 'surtifacil',
          email: 'admin@surtifacil.com',
          display_name: 'Admin Test',
          role: 'admin',
          is_super_admin: 1,
          active: 1,
        },
        {
          id: 'cashier-1',
          negocio_id: 'surtifacil',
          email: 'cajero@surtifacil.com',
          display_name: 'Cajero Test',
          role: 'cashier',
          is_super_admin: 0,
          active: 1,
        },
      ],
      products: [
        {
          id: 'p-1',
          negocio_id: 'surtifacil',
          name: 'Arroz Diana 1kg',
          price_cents: 450000,
          stock: 20,
          min_stock: 5,
          unit: 'libra',
          category: 'Granos y Despensa',
          last_cost_cents: 350000,
          barcode: '7701234567890',
          visible_kiosco: 1,
          visible_tienda: 1,
        },
        {
          id: 'p-other-store',
          negocio_id: 'otra-tienda',
          name: 'Producto Secreto Otra Tienda',
          price_cents: 999900,
          stock: 10,
          min_stock: 2,
          unit: 'unidad',
          category: 'General',
          last_cost_cents: 800000,
          barcode: '9999999999999',
          visible_kiosco: 1,
          visible_tienda: 1,
        },
      ],
      sales: [],
      sale_items: [],
      credit_customers: [
        {
          id: 'cust-1',
          negocio_id: 'surtifacil',
          name: 'Doña Gloria',
          phone: '3001234567',
          balance_cents: 5000000, // Debe $50.000 COP
          active: 1,
        },
      ],
      credit_entries: [],
      suppliers: [
        {
          id: 'supp-1',
          negocio_id: 'surtifacil',
          name: 'Distribuidora Paisa',
          active: 1,
        },
      ],
      purchase_orders: [],
      purchase_order_items: [],
    };
  }

  prepare(query: string): D1PreparedStatement {
    const db = this;
    let boundValues: any[] = [];

    const stmt: D1PreparedStatement = {
      bind(...values: any[]) {
        boundValues = values;
        return stmt;
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const res = await stmt.all<T>();
        if (!res.results || res.results.length === 0) return null;
        if (colName) return ((res.results[0] as any)[colName] ?? null) as T;
        return res.results[0] as T;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const q = query.trim();

        if (q.includes('SELECT 1 as alive')) {
          return { results: [{ alive: 1 } as unknown as T], success: true };
        }

        if (q.startsWith('SELECT id, negocio_id, email') && q.includes('FROM users WHERE id = ?')) {
          const user = db.tables.users.find((u) => u.id === boundValues[0]);
          return { results: user ? [user as T] : [], success: true };
        }

        if (q.startsWith('SELECT id, negocio_id, email') && q.includes('FROM users WHERE email = ?')) {
          const user = db.tables.users.find((u) => u.email === boundValues[0]);
          return { results: user ? [user as T] : [], success: true };
        }

        if (q.includes('FROM negocios WHERE id = ?')) {
          const n = db.tables.negocios.find((neg) => neg.id === boundValues[0]);
          return { results: n ? [n as T] : [], success: true };
        }

        if (q.includes('FROM products WHERE negocio_id = ?') && q.includes('id IN')) {
          // Extract product IDs
          const storeId = boundValues[0];
          const ids = boundValues.slice(1);
          const prods = db.tables.products.filter(
            (p) => p.negocio_id === storeId && ids.includes(p.id)
          );
          return { results: prods as T[], success: true };
        }

        if (q.startsWith('SELECT * FROM products WHERE negocio_id = ?')) {
          const prods = db.tables.products.filter((p) => p.negocio_id === boundValues[0]);
          return { results: prods as T[], success: true };
        }

        if (q.includes('FROM products WHERE id = ? AND negocio_id = ?')) {
          const p = db.tables.products.find(
            (prod) => prod.id === boundValues[0] && prod.negocio_id === boundValues[1]
          );
          return { results: p ? [p as T] : [], success: true };
        }

        if (q.includes('FROM sales WHERE negocio_id = ?')) {
          const s = db.tables.sales.filter((sale) => sale.negocio_id === boundValues[0]);
          return { results: s as T[], success: true };
        }

        if (q.includes('FROM sale_items WHERE sale_id = ?')) {
          const items = db.tables.sale_items.filter((it) => it.sale_id === boundValues[0]);
          return { results: items as T[], success: true };
        }

        if (q.includes('FROM credit_customers WHERE negocio_id = ?')) {
          const c = db.tables.credit_customers.filter((cust) => cust.negocio_id === boundValues[0]);
          return { results: c as T[], success: true };
        }

        if (q.includes('FROM credit_customers WHERE id = ? AND negocio_id = ?')) {
          const c = db.tables.credit_customers.find(
            (cust) => cust.id === boundValues[0] && cust.negocio_id === boundValues[1]
          );
          return { results: c ? [c as T] : [], success: true };
        }

        if (q.includes('FROM suppliers WHERE negocio_id = ?')) {
          const s = db.tables.suppliers.filter((sup) => sup.negocio_id === boundValues[0]);
          return { results: s as T[], success: true };
        }

        if (q.includes('FROM purchase_orders WHERE id = ? AND negocio_id = ?')) {
          const o = db.tables.purchase_orders.find(
            (ord) => ord.id === boundValues[0] && ord.negocio_id === boundValues[1]
          );
          return { results: o ? [o as T] : [], success: true };
        }

        if (q.includes('FROM purchase_order_items WHERE order_id = ?')) {
          const items = db.tables.purchase_order_items.filter((it) => it.order_id === boundValues[0]);
          return { results: items as T[], success: true };
        }

        if (q.includes('FROM users WHERE negocio_id = ?')) {
          const u = db.tables.users.filter(
            (user) => user.negocio_id === boundValues[0] && !user.deleted_at
          );
          return { results: u as T[], success: true };
        }

        return { results: [], success: true };
      },
      async run() {
        const q = query.trim();

        if (q.startsWith('INSERT INTO products')) {
          const [id, negocio_id, name, price_cents, stock, min_stock, unit, category, image_url, supplier_id, barcode, visible_kiosco, visible_tienda, en_oferta, precio_oferta_cents, last_cost_cents] = boundValues;
          db.tables.products.push({
            id,
            negocio_id,
            name,
            price_cents,
            stock,
            min_stock,
            unit,
            category,
            image_url,
            supplier_id,
            barcode,
            visible_kiosco,
            visible_tienda,
            en_oferta,
            precio_oferta_cents,
            last_cost_cents,
          });
        }

        if (q.includes('UPDATE products') && q.includes('stock = stock - ?')) {
          const [qty, prodId, negId] = boundValues;
          const prod = db.tables.products.find((p) => p.id === prodId && p.negocio_id === negId);
          if (prod) prod.stock -= qty;
        }

        if (q.includes('UPDATE products') && q.includes('stock = stock + ?')) {
          const [qty, lastCost, prodId, negId] = boundValues;
          const prod = db.tables.products.find((p) => p.id === prodId && p.negocio_id === negId);
          if (prod) {
            prod.stock += qty;
            prod.last_cost_cents = lastCost;
          }
        }

        if (q.startsWith('INSERT INTO sales')) {
          const [id, negocio_id, total_cents, payment_method, credit_customer_id, credit_customer_name, total_cost_cents, created_by_uid, created_by_role] = boundValues;
          db.tables.sales.push({
            id,
            negocio_id,
            total_cents,
            payment_method,
            credit_customer_id,
            credit_customer_name,
            total_cost_cents,
            created_by_uid,
            created_by_role,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('INSERT INTO sale_items')) {
          const [id, sale_id, product_id, product_name, quantity, price_cents, subtotal_cents, unit_cost_cents, cost_subtotal_cents, category] = boundValues;
          db.tables.sale_items.push({
            id,
            sale_id,
            product_id,
            product_name,
            quantity,
            price_cents,
            subtotal_cents,
            unit_cost_cents,
            cost_subtotal_cents,
            category,
          });
        }

        if (q.startsWith('INSERT INTO credit_entries')) {
          const [id, negocio_id, customer_id, type, amount_cents, description, sale_id, created_by_uid, created_by_role] = boundValues;
          db.tables.credit_entries.push({
            id,
            negocio_id,
            customer_id,
            type,
            amount_cents,
            description,
            sale_id,
            created_by_uid,
            created_by_role,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('UPDATE credit_customers SET balance_cents = balance_cents + ?')) {
          const [delta, customer_id, negId] = boundValues;
          const cust = db.tables.credit_customers.find(
            (c) => c.id === customer_id && c.negocio_id === negId
          );
          if (cust) cust.balance_cents += delta;
        }

        if (q.startsWith('INSERT INTO purchase_orders')) {
          const [id, negocio_id, supplier_id, supplier_name, total_cents, expected_date, notes] = boundValues;
          db.tables.purchase_orders.push({
            id,
            negocio_id,
            supplier_id,
            supplier_name,
            status: 'draft',
            total_cents,
            expected_date,
            notes,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('INSERT INTO purchase_order_items')) {
          const [id, order_id, product_id, name, category, quantity, unit_cost_cents] = boundValues;
          db.tables.purchase_order_items.push({
            id,
            order_id,
            product_id,
            name,
            category,
            quantity,
            received_quantity: 0,
            unit_cost_cents,
          });
        }

        if (q.includes("UPDATE purchase_orders SET status = 'received'")) {
          const [orderId, negId] = boundValues;
          const ord = db.tables.purchase_orders.find(
            (o) => o.id === orderId && o.negocio_id === negId
          );
          if (ord) ord.status = 'received';
        }

        if (q.startsWith('DELETE FROM products WHERE id = ? AND negocio_id = ?')) {
          const [prodId, negId] = boundValues;
          db.tables.products = db.tables.products.filter(
            (p) => !(p.id === prodId && p.negocio_id === negId)
          );
        }

        return { success: true };
      },
      async raw() {
        return [];
      },
    };
    return stmt;
  }

  async batch(statements: any[]) {
    const results: any[] = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  async dump() {
    return new ArrayBuffer(0);
  }

  async exec(query: string) {
    return { success: true };
  }
}

function createMockContext(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body: any = null,
  db: MockD1Database
) {
  const reqInit: RequestInit = {
    method,
    headers: new Headers(headers),
  };
  if (body) {
    reqInit.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  const req = new Request(url, reqInit);

  const env: Env = {
    DB: db,
    FIREBASE_PROJECT_ID: 'surtifacilapp',
  };

  return {
    request: req,
    env,
    params: {},
    data: {},
    functionPath: '/api',
    waitUntil: vi.fn(),
    next: vi.fn(),
  };
}

describe('Cloudflare Pages Functions API (/api/*)', () => {
  let db: MockD1Database;

  beforeEach(() => {
    db = new MockD1Database();
  });

  it('GET /api/health retorna 200 OK con d1: true', async () => {
    const ctx = createMockContext('GET', 'http://localhost/api/health', {}, null, db);
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.d1).toBe(true);
  });

  it('rechaza llamadas sin token de autenticación con 401', async () => {
    const ctx = createMockContext('GET', 'http://localhost/api/products', {}, null, db);
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('token');
  });

  it('GET /api/products filtra estrictamente por el negocio_id del usuario', async () => {
    const ctx = createMockContext(
      'GET',
      'http://localhost/api/products',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const products = await res.json();
    expect(products.length).toBe(1);
    expect(products[0].name).toBe('Arroz Diana 1kg');
    // Verifica que el producto de 'otra-tienda' no se filtre jamás
    expect(products.some((p: any) => p.name === 'Producto Secreto Otra Tienda')).toBe(false);
  });

  it('POST /api/products crea un producto validando datos y asociando negocio_id', async () => {
    const newProd = {
      name: 'Leche Colanta 1L',
      price_cents: 380000,
      stock: 30,
      unit: 'litro',
      category: 'Lácteos y Huevos',
    };
    const ctx = createMockContext(
      'POST',
      'http://localhost/api/products',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      newProd,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.name).toBe('Leche Colanta 1L');
    expect(created.negocio_id).toBe('surtifacil');
    expect(created.stock).toBe(30);
  });

  it('POST /api/sales registra venta atómica, descuenta stock y autoriza precios en servidor', async () => {
    const salePayload = {
      payment_method: 'cash',
      items: [
        {
          product_id: 'p-1',
          quantity: 2,
        },
      ],
    };

    const ctx = createMockContext(
      'POST',
      'http://localhost/api/sales',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      salePayload,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(201);
    const sale = await res.json();
    // 2 * 450000 = 900000 ($9.000 COP)
    expect(sale.total_cents).toBe(900000);
    expect(sale.items.length).toBe(1);

    // Stock de Arroz Diana debió reducirse de 20 a 18
    const arroz = db.tables.products.find((p) => p.id === 'p-1');
    expect(arroz?.stock).toBe(18);
  });

  it('POST /api/sales registra venta a crédito aumentando saldo del cliente de fiados', async () => {
    const salePayload = {
      payment_method: 'credit',
      credit_customer_id: 'cust-1',
      credit_customer_name: 'Doña Gloria',
      items: [
        {
          product_id: 'p-1',
          quantity: 1, // 450000 ($4.500 COP)
        },
      ],
    };

    const ctx = createMockContext(
      'POST',
      'http://localhost/api/sales',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      salePayload,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(201);

    // Saldo inicial 5000000 + 450000 = 5450000
    const donaGloria = db.tables.credit_customers.find((c) => c.id === 'cust-1');
    expect(donaGloria?.balance_cents).toBe(5450000);
    expect(db.tables.credit_entries.length).toBe(1);
    expect(db.tables.credit_entries[0].type).toBe('debt');
  });

  it('POST /api/credits/entries valida que el abono no exceda la deuda actual', async () => {
    const overpayment = {
      customer_id: 'cust-1',
      type: 'payment',
      amount_cents: 6000000, // Deuda es 5000000
      description: 'Abono excesivo',
    };

    const ctx = createMockContext(
      'POST',
      'http://localhost/api/credits/entries',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      overpayment,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toContain('no puede superar la deuda actual');
  });

  it('PUT /api/orders/:id con status received incrementa stock y actualiza costo de compra', async () => {
    // 1. Crear orden
    const createCtx = createMockContext(
      'POST',
      'http://localhost/api/orders',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {
        supplier_id: 'supp-1',
        supplier_name: 'Distribuidora Paisa',
        items: [
          {
            product_id: 'p-1',
            name: 'Arroz Diana 1kg',
            quantity: 15,
            unit_cost_cents: 360000,
          },
        ],
      },
      db
    );
    const createRes = await onRequest(createCtx as any);
    expect(createRes.status).toBe(201);
    const order = await createRes.json();

    // 2. Recibir orden
    const receiveCtx = createMockContext(
      'PUT',
      `http://localhost/api/orders/${order.id}`,
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      { status: 'received' },
      db
    );
    const receiveRes = await onRequest(receiveCtx as any);
    expect(receiveRes.status).toBe(200);

    // Stock de Arroz Diana debió aumentar 20 + 15 = 35 y costo a 360000
    const arroz = db.tables.products.find((p) => p.id === 'p-1');
    expect(arroz?.stock).toBe(35);
    expect(arroz?.last_cost_cents).toBe(360000);
  });

  it('GET /api/users bloquea acceso a cajeros y permite a administradores', async () => {
    // Cajero intentando listar usuarios
    const cashierCtx = createMockContext(
      'GET',
      'http://localhost/api/users',
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      null,
      db
    );
    const cashierRes = await onRequest(cashierCtx as any);
    expect(cashierRes.status).toBe(403);

    // Administrador listando usuarios
    const adminCtx = createMockContext(
      'GET',
      'http://localhost/api/users',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const adminRes = await onRequest(adminCtx as any);
    expect(adminRes.status).toBe(200);
    const users = await adminRes.json();
    expect(users.length).toBe(2);
  });
});
