const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const { createProvisionUserHandler } = require('../userProvisioning');
const { createSyncClaimsHandler, createWhatsAppTestHandler } = require('../apiRoutes');

async function requestRoute(handler, { method = 'POST', body, headers = {} } = {}) {
  const app = express();
  app.use(express.json());
  app.post('/', handler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = { status: response.status, body: await response.json() };
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

function firebaseUserDb(userData = { active: true, role: 'admin' }) {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: Boolean(userData), data: () => userData }),
        set: async () => undefined,
      }),
    }),
  };
}

test('sync-claims route returns a generic body on provider failure', async () => {
  const handler = createSyncClaimsHandler({
    admin: { auth: () => ({ verifyIdToken: async () => { throw new Error('provider token=secret'); } }) },
    db: firebaseUserDb(),
  });

  const result = await requestRoute(handler, {
    headers: { Authorization: 'Bearer token' },
    body: { uid: 'user-1' },
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Error interno del servidor' });
  assert.doesNotMatch(JSON.stringify(result.body), /provider|secret/);
});

test('sync-claims route preserves the successful response contract', async () => {
  const claims = { admin: true, manager: true };
  const handler = createSyncClaimsHandler({
    admin: {
      auth: () => ({
        verifyIdToken: async () => ({ uid: 'user-1' }),
        setCustomUserClaims: async () => undefined,
      }),
    },
    db: firebaseUserDb(),
    resolveClaims: () => ({ allowed: true, claims }),
  });

  const result = await requestRoute(handler, {
    headers: { Authorization: 'Bearer token' },
    body: { uid: 'user-1' },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, claims });
});

test('sync-claims route rejects a JSON token and requires a Firebase Bearer header', async () => {
  const verifyIdToken = async () => ({ uid: 'user-1' });
  const handler = createSyncClaimsHandler({
    admin: { auth: () => ({ verifyIdToken }) },
    db: firebaseUserDb(),
  });

  const missingHeader = await requestRoute(handler, { body: { uid: 'user-1' } });
  assert.equal(missingHeader.status, 401);
  assert.equal(missingHeader.body.error, 'No autorizado');

  const bodyToken = await requestRoute(handler, {
    headers: { Authorization: 'Bearer token' },
    body: { uid: 'user-1', idToken: 'token' },
  });
  assert.equal(bodyToken.status, 400);
  assert.equal(bodyToken.body.error, 'Solicitud inválida');
});

test('provisioning route returns a generic body on Auth provider failure', async () => {
  const handler = createProvisionUserHandler({
    admin: {
      firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } },
      auth: () => ({
        verifyIdToken: async () => ({ uid: 'admin-1' }),
        createUser: async () => { throw new Error('auth provider token=secret'); },
      }),
    },
    db: firebaseUserDb(),
  });

  const result = await requestRoute(handler, {
    headers: { Authorization: 'Bearer valid-token' },
    body: {
      email: 'employee@example.com', password: 'secret123', displayName: 'Employee', role: 'cashier',
    },
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Unable to provision user' });
  assert.doesNotMatch(JSON.stringify(result.body), /provider|secret/);
});

test('WhatsApp test route returns generic errors and preserves success responses', async () => {
  const invalid = await requestRoute(createWhatsAppTestHandler({
    sendWhatsAppMessage: async () => ({ messages: [{ id: 'message-1' }] }),
  }), { body: { phoneNumber: 'not-a-phone' } });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: 'Solicitud inválida' });

  const failure = await requestRoute(createWhatsAppTestHandler({
    sendWhatsAppMessage: async () => { throw new Error('WhatsApp provider secret'); },
  }), { body: { phoneNumber: '5551234567' } });
  assert.equal(failure.status, 500);
  assert.deepEqual(failure.body, { error: 'Error interno del servidor' });
  assert.doesNotMatch(JSON.stringify(failure.body), /WhatsApp provider|secret/);

  const success = await requestRoute(createWhatsAppTestHandler({
    sendWhatsAppMessage: async () => ({ messages: [{ id: 'message-1' }] }),
  }), { body: { phoneNumber: '5551234567' } });
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, {
    success: true,
    message: 'Test message sent',
    data: { messages: [{ id: 'message-1' }] },
  });
});
