const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const { createSalesRouter } = require('../salesRoutes');
const { createRateLimiter } = require('../userProvisioning');

async function requestRoute(router, { body, headers = {} } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/sales', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/sales/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const result = {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

function createSalesDependencies({ role = 'cashier', active = true, products = {} } = {}) {
  const writes = [];
  const users = {
    cashierToken: { uid: 'cashier-1' },
    managerToken: { uid: 'manager-1' },
  };
  const userData = { active, role };
  const admin = {
    auth: () => ({
      verifyIdToken: async (token) => {
        if (!users[token]) throw new Error('invalid token');
        return users[token];
      },
    }),
    firestore: {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    },
  };
  const db = {
    collection(name) {
      if (name === 'users') {
        return { doc: () => ({ get: async () => ({ exists: active, data: () => userData }) }) };
      }
      if (name === 'products') return { doc: (id) => ({ id }) };
      if (name === 'sales') return { doc: () => ({ id: 'sale-1' }) };
      throw new Error(`unexpected collection ${name}`);
    },
    async runTransaction(callback) {
      const transaction = {
        async get(ref) {
          const product = products[ref.id];
          return product
            ? { exists: true, id: ref.id, data: () => product }
            : { exists: false, id: ref.id, data: () => undefined };
        },
        set(ref, data) { writes.push({ type: 'set', id: ref.id, data }); },
        update(ref, data) { writes.push({ type: 'update', id: ref.id, data }); },
      };
      return callback(transaction);
    },
  };
  return { admin, db, writes };
}

function routerFor(dependencies) {
  return createSalesRouter({ ...dependencies, rateLimiter: { consume: () => ({ allowed: true, retryAfterMs: 0 }) } });
}

function routerWithRealLimiter(dependencies) {
  return createSalesRouter({
    ...dependencies,
    rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000, maxEntries: 10 }),
  });
}

test('sales endpoint rejects requests without a Firebase bearer token', async () => {
  const dependencies = createSalesDependencies({ products: {} });
  const result = await requestRoute(routerFor(dependencies), {
    body: { items: [{ product_id: 'p1', quantity: 1 }], payment_method: 'cash' },
  });

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: 'No autorizado' });
});

test('sales endpoint returns 429 and Retry-After when the real limiter is exhausted', async () => {
  const dependencies = createSalesDependencies({
    products: { p1: { name: 'Arroz', price_cents: 250, stock: 4 } },
  });
  const router = routerWithRealLimiter(dependencies);
  const request = {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'p1', quantity: 1 }], payment_method: 'cash' },
  };

  const first = await requestRoute(router, request);
  const second = await requestRoute(router, request);

  assert.equal(first.status, 201);
  assert.equal(second.status, 429);
  assert.match(second.headers.get('Retry-After'), /^\d+$/);
  assert.deepEqual(second.body, { error: 'Demasiadas solicitudes' });
});

test('sales endpoint rejects inactive users even with a valid Firebase token', async () => {
  const dependencies = createSalesDependencies({ active: false, products: {} });
  const result = await requestRoute(routerFor(dependencies), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'p1', quantity: 1 }], payment_method: 'cash' },
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'No autorizado' });
});

test('sales endpoint rejects forged totals and extra client-owned sale fields', async () => {
  const dependencies = createSalesDependencies({
    products: { p1: { name: 'Arroz', price_cents: 250, stock: 4 } },
  });
  const result = await requestRoute(routerFor(dependencies), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: {
      items: [{ product_id: 'p1', quantity: 1, product_name: 'Forged', price_cents: 1, subtotal: 1 }],
      payment_method: 'cash',
      total: 1,
    },
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: 'Solicitud inválida' });
  assert.equal(dependencies.writes.length, 0);
});

test('sales endpoint calculates the sale from authoritative product data and returns only its ID', async () => {
  const dependencies = createSalesDependencies({
    products: {
      p1: {
        name: 'Arroz', price_cents: 250, stock: 4, category: 'Abarrotes', last_cost_cents: 100,
      },
      p2: { name: 'Leche', price_cents: 375, stock: 8 },
    },
  });
  const result = await requestRoute(routerFor(dependencies), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: {
      items: [{ product_id: 'p1', quantity: 2 }, { product_id: 'p2', quantity: 1 }],
      payment_method: 'cash',
    },
  });

  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { saleId: 'sale-1' });
  assert.deepEqual(dependencies.writes, [
    {
      type: 'set',
      id: 'sale-1',
      data: {
        date: 'server-timestamp',
        createdAt: 'server-timestamp',
        schema_version: 2,
        created_by_uid: 'cashier-1',
        created_by_role: 'cashier',
        total: 875,
        total_cost_cents: 387,
        payment_method: 'cash',
        items: [
          {
            product_id: 'p1',
            product_name: 'Arroz',
            quantity: 2,
            price_cents: 250,
            subtotal: 500,
            unit_cost_cents: 100,
            cost_subtotal_cents: 200,
            cost_source: 'purchase',
            cost_is_estimated: false,
            category: 'Abarrotes',
          },
          {
            product_id: 'p2',
            product_name: 'Leche',
            quantity: 1,
            price_cents: 375,
            subtotal: 375,
            unit_cost_cents: 187,
            cost_subtotal_cents: 187,
            cost_source: 'fallback_price',
            cost_is_estimated: true,
            category: 'Sin categoría',
          },
        ],
      },
    },
    { type: 'update', id: 'p1', data: { stock: 2 } },
    { type: 'update', id: 'p2', data: { stock: 7 } },
  ]);
});

test('sales endpoint rejects invalid cost snapshots without writing partial financial data', async () => {
  const dependencies = createSalesDependencies({
    products: {
      p1: { name: 'Arroz', price_cents: 250, stock: 4, last_cost_cents: -1 },
    },
  });
  const result = await requestRoute(routerFor(dependencies), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'p1', quantity: 1 }], payment_method: 'cash' },
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Error interno del servidor' });
  assert.equal(dependencies.writes.length, 0);
});

test('sales endpoint preserves a zero unit cost as an exact non-estimated snapshot', async () => {
  const dependencies = createSalesDependencies({
    products: {
      p1: { name: 'Muestra', price_cents: 250, stock: 4, last_cost_cents: 0 },
    },
  });
  const result = await requestRoute(routerFor(dependencies), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'p1', quantity: 2 }], payment_method: 'cash' },
  });

  assert.equal(result.status, 201);
  assert.equal(dependencies.writes[0].data.total_cost_cents, 0);
  assert.deepEqual(dependencies.writes[0].data.items[0], {
    product_id: 'p1',
    product_name: 'Muestra',
    quantity: 2,
    price_cents: 250,
    subtotal: 500,
    unit_cost_cents: 0,
    cost_subtotal_cents: 0,
    cost_source: 'purchase',
    cost_is_estimated: false,
    category: 'Sin categoría',
  });
});

test('sales endpoint rejects cost multiplication outside the safe integer range', async () => {
  const dependencies = createSalesDependencies({
    products: {
      p1: {
        name: 'Costo extremo', price_cents: 1, stock: 2, last_cost_cents: Number.MAX_SAFE_INTEGER,
      },
    },
  });
  const result = await requestRoute(routerFor(dependencies), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'p1', quantity: 2 }], payment_method: 'cash' },
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Error interno del servidor' });
  assert.equal(dependencies.writes.length, 0);
});

test('sales endpoint returns generic errors for missing products and insufficient stock', async () => {
  const missing = createSalesDependencies({ products: {} });
  const missingResult = await requestRoute(routerFor(missing), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'missing', quantity: 1 }], payment_method: 'cash' },
  });
  assert.equal(missingResult.status, 404);
  assert.deepEqual(missingResult.body, { error: 'Recurso no encontrado' });
  assert.doesNotMatch(JSON.stringify(missingResult.body), /missing|Producto/);

  const insufficient = createSalesDependencies({ products: { p1: { name: 'Secreto', price_cents: 250, stock: 1 } } });
  const insufficientResult = await requestRoute(routerFor(insufficient), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'p1', quantity: 2 }], payment_method: 'cash' },
  });
  assert.equal(insufficientResult.status, 400);
  assert.deepEqual(insufficientResult.body, { error: 'Solicitud inválida' });
  assert.doesNotMatch(JSON.stringify(insufficientResult.body), /Secreto|stock|2/);
});

test('sales endpoint rejects empty, duplicate, and excessive cart lines', async () => {
  const dependencies = createSalesDependencies({ products: {} });
  const cases = [
    { items: [], payment_method: 'cash' },
    { items: [{ product_id: 'p1', quantity: 0 }], payment_method: 'cash' },
    { items: [{ product_id: 'p1', quantity: 1001 }], payment_method: 'cash' },
    { items: [{ product_id: 'p1', quantity: 1 }, { product_id: 'p1', quantity: 1 }], payment_method: 'cash' },
  ];

  for (const body of cases) {
    const result = await requestRoute(routerFor(dependencies), {
      headers: { Authorization: 'Bearer cashierToken' },
      body,
    });
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { error: 'Solicitud inválida' });
  }
});

test('concurrent sales are serialized by the transaction and only one can consume the last unit', async () => {
  const dependencies = createSalesDependencies({
    products: { p1: { name: 'Arroz', price_cents: 250, stock: 1 } },
  });
  let stock = 1;
  let lock = Promise.resolve();
  dependencies.db.runTransaction = async (callback) => {
    const previous = lock;
    let release;
    lock = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const transaction = {
        async get(ref) {
          return { exists: true, id: ref.id, data: () => ({ name: 'Arroz', price_cents: 250, stock }) };
        },
        set() {},
        update(_ref, data) { stock = data.stock; },
      };
      return await callback(transaction);
    } finally {
      release();
    }
  };
  const router = routerFor(dependencies);
  const request = {
    headers: { Authorization: 'Bearer cashierToken' },
    body: { items: [{ product_id: 'p1', quantity: 1 }], payment_method: 'cash' },
  };

  const [first, second] = await Promise.all([
    requestRoute(router, request),
    requestRoute(router, request),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 400]);
  assert.equal(stock, 0);
});

test('sales endpoint rejects totals outside the safe integer range', async () => {
  const dependencies = createSalesDependencies({
    products: {
      p1: { name: 'Producto 1', price_cents: Number.MAX_SAFE_INTEGER, stock: 1 },
      p2: { name: 'Producto 2', price_cents: Number.MAX_SAFE_INTEGER, stock: 1 },
    },
  });
  const result = await requestRoute(routerFor(dependencies), {
    headers: { Authorization: 'Bearer cashierToken' },
    body: {
      items: [{ product_id: 'p1', quantity: 1 }, { product_id: 'p2', quantity: 1 }],
      payment_method: 'cash',
    },
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Error interno del servidor' });
  assert.equal(dependencies.writes.length, 0);
});
