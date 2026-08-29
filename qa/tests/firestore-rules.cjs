const assert = require('node:assert/strict');

const projectId = 'smartmarket-b37ce';
const firestoreBase = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
const authBase = 'http://127.0.0.1:9099';
const authApiBase = `${authBase}/identitytoolkit.googleapis.com/v1`;

async function call(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function createUser(label, claims) {
  const created = await call(`${authApiBase}/accounts:signUp?key=test-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${label}@example.test`,
      password: 'rules-test-password',
      returnSecureToken: true,
    }),
  });
  assert.equal(created.status, 200, `could not create auth user ${label}`);

  const { localId, idToken } = created.body;
  const claimUpdate = await call(`${authApiBase}/projects/${projectId}/accounts:update`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      localId,
      customAttributes: JSON.stringify(claims),
    }),
  });
  assert.equal(claimUpdate.status, 200, `could not set claims for ${label}: ${JSON.stringify(claimUpdate.body)}`);

  const refreshed = await call(`${authApiBase}/accounts:signInWithPassword?key=test-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${label}@example.test`,
      password: 'rules-test-password',
      returnSecureToken: true,
    }),
  });
  assert.equal(refreshed.status, 200, `could not refresh token for ${label}`);
  return { uid: localId, idToken: refreshed.body.idToken };
}

async function seedDocument(collection, id, fields) {
  const result = await call(`${firestoreBase}/${collection}/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  assert.equal(result.status, 200, `could not seed ${collection}/${id}`);
}

function authHeaders(idToken) {
  return idToken ? { Authorization: `Bearer ${idToken}` } : {};
}

async function read(collection, id, idToken) {
  return call(`${firestoreBase}/${collection}/${id}`, { headers: authHeaders(idToken) });
}

async function readCollection(collection, idToken) {
  return call(`${firestoreBase}/${collection}`, { headers: authHeaders(idToken) });
}

async function create(collection, id, fields, idToken) {
  return call(`${firestoreBase}/${collection}?documentId=${id}`, {
    method: 'POST',
    headers: { ...authHeaders(idToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function update(collection, id, fields, idToken) {
  const updateMask = Object.keys(fields)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  return call(`${firestoreBase}/${collection}/${id}?${updateMask}`, {
    method: 'PATCH',
    headers: { ...authHeaders(idToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function remove(collection, id, idToken) {
  return call(`${firestoreBase}/${collection}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(idToken),
  });
}

function expectStatus(label, actual, expected) {
  assert.equal(actual.status, expected, `${label}: expected ${expected}, got ${actual.status}`);
}

const activeUserFields = (role) => ({
  active: { booleanValue: true },
  role: { stringValue: role },
  email: { stringValue: `${role}@example.test` },
});

function saleItemFields(overrides = {}) {
  return {
    product_id: { stringValue: 'rules-product' },
    product_name: { stringValue: 'Rules Product' },
    quantity: { integerValue: '1' },
    price_cents: { integerValue: '100' },
    subtotal: { integerValue: '100' },
    unit_cost_cents: { integerValue: '40' },
    cost_subtotal_cents: { integerValue: '40' },
    cost_source: { stringValue: 'purchase' },
    cost_is_estimated: { booleanValue: false },
    category: { stringValue: 'Rules Category' },
    ...overrides,
  };
}

function saleFields(overrides = {}) {
  return {
    date: { timestampValue: '2026-08-04T00:00:00Z' },
    createdAt: { timestampValue: '2026-08-04T00:00:00Z' },
    schema_version: { integerValue: '2' },
    created_by_uid: { stringValue: 'rules-cashier' },
    created_by_role: { stringValue: 'cashier' },
    total: { integerValue: '100' },
    total_cost_cents: { integerValue: '40' },
    payment_method: { stringValue: 'cash' },
    items: { arrayValue: { values: [{ mapValue: { fields: saleItemFields() } }] } },
    ...overrides,
  };
}

(async () => {
  const admin = await createUser('rules-admin', { admin: true, manager: true });
  const manager = await createUser('rules-manager', { manager: true });
  const cashier = await createUser('rules-cashier', {});
  const inactive = await createUser('rules-inactive', { admin: true, manager: true });
  const roleTarget = await createUser('rules-role-target', { admin: true, manager: true });
  const activeTransition = await createUser('rules-active-transition', { admin: true, manager: true });
  const invalidRole = await createUser('rules-invalid-role', { admin: true, manager: true });

  await seedDocument('users', admin.uid, activeUserFields('admin'));
  await seedDocument('users', manager.uid, activeUserFields('manager'));
  await seedDocument('users', cashier.uid, activeUserFields('cashier'));
  await seedDocument('users', inactive.uid, {
    ...activeUserFields('admin'),
    active: { booleanValue: false },
  });
  await seedDocument('users', roleTarget.uid, activeUserFields('admin'));
  await seedDocument('users', activeTransition.uid, activeUserFields('admin'));
  await seedDocument('users', invalidRole.uid, activeUserFields('owner'));
  await seedDocument('products', 'rules-product', {
    name: { stringValue: 'Rules Product' },
    price_cents: { integerValue: '100' },
    stock: { integerValue: '10' },
  });
  await seedDocument('sales', 'rules-sale', { total: { integerValue: '100' } });
  await seedDocument('roles', 'rules-role', { name: { stringValue: 'Rules Role' } });
  await seedDocument('whatsapp_conversations', 'rules-conversation', { status: { stringValue: 'active' } });
  await seedDocument('whatsapp_orders', 'rules-order', { status: { stringValue: 'draft' } });
  await seedDocument('suppliers', 'rules-supplier', { name: { stringValue: 'Rules Supplier' } });
  await seedDocument('purchase_orders', 'rules-order', { status: { stringValue: 'draft' } });

  expectStatus('unauthenticated user read', await read('products', 'rules-product'), 403);
  expectStatus('active invalid-role user cannot read a product', await read('products', 'rules-product', invalidRole.idToken), 403);
  expectStatus('active invalid-role user cannot read the products collection', await readCollection('products', invalidRole.idToken), 403);
  expectStatus('active user reads own user document', await read('users', admin.uid, admin.idToken), 200);
  expectStatus('inactive user reads own user document to discover status', await read('users', inactive.uid, inactive.idToken), 200);
  expectStatus('inactive user cannot update lastLogin', await update('users', inactive.uid, { lastLogin: { stringValue: 'blocked' } }, inactive.idToken), 403);
  expectStatus('active user can update only lastLogin', await update('users', cashier.uid, { lastLogin: { stringValue: 'allowed' } }, cashier.idToken), 200);
  expectStatus('active user cannot update another user', await update('users', cashier.uid, { role: { stringValue: 'admin' } }, cashier.idToken), 403);
  expectStatus('admin can read another user', await read('users', cashier.uid, admin.idToken), 200);
  expectStatus('manager cannot read another user', await read('users', cashier.uid, manager.idToken), 403);
  expectStatus('cashier cannot read another user', await read('users', manager.uid, cashier.idToken), 403);
  expectStatus('active admin can create a user document', await create('users', 'rules-created-user', activeUserFields('cashier'), admin.idToken), 200);
  expectStatus('manager cannot create a user document', await create('users', 'rules-manager-created-user', activeUserFields('cashier'), manager.idToken), 403);
  expectStatus('inactive admin cannot create a user document', await create('users', 'rules-inactive-created-user', activeUserFields('cashier'), inactive.idToken), 403);
  expectStatus('admin cannot change its own role', await update('users', admin.uid, { role: { stringValue: 'cashier' } }, admin.idToken), 403);
  expectStatus('active admin can update a user document', await update('users', roleTarget.uid, { role: { stringValue: 'manager' } }, admin.idToken), 200);
  expectStatus('active admin can delete a user document', await remove('users', 'rules-created-user', admin.idToken), 200);

  expectStatus('admin changes target role to cashier', await update('users', roleTarget.uid, { role: { stringValue: 'cashier' } }, admin.idToken), 200);
  expectStatus('stale admin claim cannot read manager-only data after cashier change', await read('suppliers', 'rules-supplier', roleTarget.idToken), 403);
  expectStatus('stale admin claim cannot write products after cashier change', await create('products', 'rules-stale-cashier-product', { name: { stringValue: 'Stale Cashier' } }, roleTarget.idToken), 403);
  expectStatus('admin changes target role to manager', await update('users', roleTarget.uid, { role: { stringValue: 'manager' } }, admin.idToken), 200);
  expectStatus('manager role change takes effect for reads immediately', await read('suppliers', 'rules-supplier', roleTarget.idToken), 200);
  expectStatus('manager role change takes effect for writes immediately', await create('products', 'rules-fresh-manager-product', { name: { stringValue: 'Fresh Manager' } }, roleTarget.idToken), 200);
  expectStatus('manager cannot delete products after role change', await remove('products', 'rules-fresh-manager-product', roleTarget.idToken), 403);
  expectStatus('active privileged user can read operational data before deactivation', await read('suppliers', 'rules-supplier', activeTransition.idToken), 200);
  expectStatus('admin deactivates the transition target', await update('users', activeTransition.uid, { active: { booleanValue: false } }, admin.idToken), 200);
  expectStatus('stale privileged token cannot read after active-to-inactive transition', await read('suppliers', 'rules-supplier', activeTransition.idToken), 403);
  expectStatus('stale privileged token cannot write after active-to-inactive transition', await create('products', 'rules-deactivated-product', { name: { stringValue: 'Deactivated' } }, activeTransition.idToken), 403);
  expectStatus('deactivated user can still read own document to discover status', await read('users', activeTransition.uid, activeTransition.idToken), 200);

  for (const user of [admin, manager, cashier]) {
    expectStatus(`${user.uid} can read products`, await read('products', 'rules-product', user.idToken), 200);
    expectStatus(`${user.uid} can read sales`, await read('sales', 'rules-sale', user.idToken), 200);
    expectStatus(`${user.uid} cannot create direct sales`, await create('sales', `rules-sale-${user.uid}`, saleFields(), user.idToken), 403);
    expectStatus(`${user.uid} can read roles`, await read('roles', 'rules-role', user.idToken), 200);
  }

  expectStatus('admin cannot mutate an immutable sale', await update('sales', 'rules-sale', { total: { integerValue: '1' } }, admin.idToken), 403);
  expectStatus('admin cannot delete an immutable sale', await remove('sales', 'rules-sale', admin.idToken), 403);

  expectStatus('cashier cannot decrement product stock directly', await update('products', 'rules-product', { stock: { integerValue: '7' } }, cashier.idToken), 403);
  expectStatus('cashier cannot increase product stock', await update('products', 'rules-product', { stock: { integerValue: '8' } }, cashier.idToken), 403);
  expectStatus('cashier cannot set negative product stock', await update('products', 'rules-product', { stock: { integerValue: '-1' } }, cashier.idToken), 403);
  expectStatus('cashier cannot edit product fields', await update('products', 'rules-product', { name: { stringValue: 'Changed by cashier' } }, cashier.idToken), 403);
  expectStatus('cashier cannot edit stock and product fields together', await update('products', 'rules-product', { stock: { integerValue: '6' }, name: { stringValue: 'Changed by cashier' } }, cashier.idToken), 403);
  expectStatus('manager retains full product updates', await update('products', 'rules-product', { name: { stringValue: 'Updated by manager' }, stock: { integerValue: '20' } }, manager.idToken), 200);

  expectStatus('sale missing date is rejected', await create('sales', 'rules-sale-missing-date', saleFields({ date: undefined }), cashier.idToken), 403);
  expectStatus('sale missing createdAt is rejected', await create('sales', 'rules-sale-missing-created-at', saleFields({ createdAt: undefined }), cashier.idToken), 403);
  expectStatus('sale with negative total is rejected', await create('sales', 'rules-sale-negative-total', saleFields({ total: { integerValue: '-1' } }), cashier.idToken), 403);
  expectStatus('sale with invalid payment method is rejected', await create('sales', 'rules-sale-invalid-payment', saleFields({ payment_method: { stringValue: 'crypto' } }), cashier.idToken), 403);
  expectStatus('sale with empty items is rejected', await create('sales', 'rules-sale-empty-items', saleFields({ items: { arrayValue: { values: [] } } }), cashier.idToken), 403);
  expectStatus('sale with invalid item quantity is rejected', await create('sales', 'rules-sale-invalid-item', saleFields({
    items: { arrayValue: { values: [{ mapValue: { fields: saleItemFields({ quantity: { integerValue: '0' } }) } }] } },
  }), cashier.idToken), 403);
  expectStatus('sale with missing item product ID is rejected', await create('sales', 'rules-sale-missing-product-id', saleFields({
    items: { arrayValue: { values: [{ mapValue: { fields: saleItemFields({ product_id: { stringValue: '' } }) } }] } },
  }), cashier.idToken), 403);
  expectStatus('sale with negative item price is rejected', await create('sales', 'rules-sale-negative-price', saleFields({
    items: { arrayValue: { values: [{ mapValue: { fields: saleItemFields({ price_cents: { integerValue: '-1' } }) } }] } },
  }), cashier.idToken), 403);
  expectStatus('sale with negative item subtotal is rejected', await create('sales', 'rules-sale-negative-subtotal', saleFields({
    items: { arrayValue: { values: [{ mapValue: { fields: saleItemFields({ subtotal: { integerValue: '-1' } }) } }] } },
  }), cashier.idToken), 403);

  expectStatus('admin can create WhatsApp conversations', await create('whatsapp_conversations', 'rules-admin-conversation', { phoneNumber: { stringValue: '573001234567' } }, admin.idToken), 200);
  expectStatus('manager can create WhatsApp conversations', await create('whatsapp_conversations', 'rules-manager-conversation', { phoneNumber: { stringValue: '573001234568' } }, manager.idToken), 200);
  expectStatus('cashier cannot create WhatsApp conversations', await create('whatsapp_conversations', 'rules-cashier-conversation', { phoneNumber: { stringValue: '573001234569' } }, cashier.idToken), 403);
  expectStatus('admin can create WhatsApp messages', await create('whatsapp_messages', 'rules-admin-message', { message: { stringValue: 'rules' } }, admin.idToken), 200);
  expectStatus('manager can create WhatsApp messages', await create('whatsapp_messages', 'rules-manager-message', { message: { stringValue: 'rules' } }, manager.idToken), 200);
  expectStatus('cashier cannot create WhatsApp messages', await create('whatsapp_messages', 'rules-cashier-message', { message: { stringValue: 'rules' } }, cashier.idToken), 403);
  expectStatus('admin can create WhatsApp orders', await create('whatsapp_orders', 'rules-admin-order', { status: { stringValue: 'draft' } }, admin.idToken), 200);
  expectStatus('manager can create WhatsApp orders', await create('whatsapp_orders', 'rules-manager-order', { status: { stringValue: 'draft' } }, manager.idToken), 200);
  expectStatus('cashier cannot create WhatsApp orders', await create('whatsapp_orders', 'rules-cashier-order', { status: { stringValue: 'draft' } }, cashier.idToken), 403);

  expectStatus('admin can create products', await create('products', 'rules-admin-product', { name: { stringValue: 'Admin Product' } }, admin.idToken), 200);
  expectStatus('manager can create products', await create('products', 'rules-manager-product', { name: { stringValue: 'Manager Product' } }, manager.idToken), 200);
  expectStatus('cashier cannot create products', await create('products', 'rules-cashier-product', { name: { stringValue: 'Cashier Product' } }, cashier.idToken), 403);
  expectStatus('admin can write roles', await update('roles', 'rules-role', { name: { stringValue: 'Admin Role' } }, admin.idToken), 200);
  expectStatus('manager cannot write roles', await update('roles', 'rules-role', { name: { stringValue: 'Manager Role' } }, manager.idToken), 403);
  expectStatus('cashier cannot write roles', await update('roles', 'rules-role', { name: { stringValue: 'Cashier Role' } }, cashier.idToken), 403);

  for (const collection of ['whatsapp_conversations', 'whatsapp_messages', 'whatsapp_orders']) {
    const ids = {
      whatsapp_conversations: 'rules-conversation',
       whatsapp_messages: 'rules-admin-message',
      whatsapp_orders: 'rules-order',
    };
    const id = ids[collection];
    expectStatus(`${collection} admin read`, await read(collection, id, admin.idToken), 200);
    expectStatus(`${collection} manager read`, await read(collection, id, manager.idToken), 200);
    expectStatus(`${collection} cashier read`, await read(collection, id, cashier.idToken), 403);
  }

  for (const collection of ['suppliers', 'purchase_orders']) {
    const id = collection === 'suppliers' ? 'rules-supplier' : 'rules-order';
    expectStatus(`${collection} admin read`, await read(collection, id, admin.idToken), 200);
    expectStatus(`${collection} manager read`, await read(collection, id, manager.idToken), 200);
    expectStatus(`${collection} cashier read`, await read(collection, id, cashier.idToken), 403);
    expectStatus(`${collection} admin write`, await update(collection, id, { status: { stringValue: 'admin' } }, admin.idToken), 200);
    expectStatus(`${collection} manager write`, await update(collection, id, { status: { stringValue: 'manager' } }, manager.idToken), 200);
    expectStatus(`${collection} cashier write`, await update(collection, id, { status: { stringValue: 'cashier' } }, cashier.idToken), 403);
  }

  console.log('Firestore rules emulator scenarios passed.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
