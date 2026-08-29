const assert = require('node:assert/strict');
const path = require('node:path');
const backendModulePaths = [path.resolve(__dirname, '../../backend')];
const admin = require(require.resolve('firebase-admin', { paths: backendModulePaths }));
const { getFirestore } = require(require.resolve('firebase-admin/firestore', { paths: backendModulePaths }));
const { createSalesHandler } = require('../../backend/salesRoutes');

const projectId = process.env.GCLOUD_PROJECT || 'smartmarket-b37ce';
admin.initializeApp({ projectId });
const db = getFirestore();

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

(async () => {
  const productRef = db.collection('products').doc('transaction-product');
  const saleRef = db.collection('sales').doc('transaction-sale');
  await productRef.set({
    name: 'Emulator Product',
    price_cents: 125,
    stock: 3,
    category: 'Emulator Category',
    last_cost_cents: 40,
    last_cost_source: 'purchase',
  });
  await saleRef.delete();

  const handler = createSalesHandler({
    admin,
    db,
  });
  const response = responseRecorder();
  await handler({
    authContext: { uid: 'emulator-cashier', role: 'cashier' },
    body: { items: [{ product_id: productRef.id, quantity: 2 }], payment_method: 'cash' },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(Object.keys(response.body), ['saleId']);
  assert.equal(typeof response.body.saleId, 'string');

  const [product, sale] = await Promise.all([productRef.get(), db.collection('sales').doc(response.body.saleId).get()]);
  assert.equal(product.data().stock, 1);
  assert.deepEqual(sale.data().items, [{
    product_id: productRef.id,
    product_name: 'Emulator Product',
    quantity: 2,
    price_cents: 125,
    subtotal: 250,
    unit_cost_cents: 40,
    cost_subtotal_cents: 80,
    cost_source: 'purchase',
    cost_is_estimated: false,
    category: 'Emulator Category',
  }]);
  assert.equal(sale.data().total, 250);
  assert.equal(sale.data().total_cost_cents, 80);
  assert.equal(sale.data().schema_version, 2);
  assert.equal(sale.data().created_by_uid, 'emulator-cashier');
  assert.equal(sale.data().created_by_role, 'cashier');

  console.log('Sales Admin SDK transaction emulator scenario passed.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
