const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const {
  createFirebaseAdminRoleMiddleware,
  createWhatsAppRateLimitMiddlewares,
  createWhatsAppRateLimitMiddleware,
  createWhatsAppSendHandler,
} = require('../whatsappAdminRoutes');
const { createWhatsAppTestHandler } = require('../apiRoutes');
const { createRateLimiter } = require('../userProvisioning');

async function requestRoute(middleware, handler, { body, headers = {}, middlewares = [] } = {}) {
  const app = express();
  app.use(express.json());
  app.post('/', middleware, ...middlewares, handler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const result = {
    status: response.status,
    body: await response.json(),
    retryAfter: response.headers.get('Retry-After'),
  };
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

function fakeDb(user, conversation = { phoneNumber: '573001234567' }) {
  const savedMessages = [];
  const updates = [];
  return {
    savedMessages,
    updates,
    collection(name) {
      if (name === 'users') {
        return { doc: () => ({ get: async () => ({ exists: Boolean(user), data: () => user }) }) };
      }
      if (name === 'whatsapp_conversations') {
        return {
          doc: () => ({
            get: async () => ({ exists: Boolean(conversation), data: () => conversation }),
            update: async (data) => updates.push(data),
          }),
        };
      }
      return { add: async (data) => savedMessages.push(data) };
    },
  };
}

function fakeAdmin(decoded = { uid: 'user-1' }) {
  return { auth: () => ({ verifyIdToken: async () => decoded }) };
}

function authorizedMiddleware(user, decoded) {
  return createFirebaseAdminRoleMiddleware({
    admin: fakeAdmin(decoded),
    db: fakeDb(user),
  });
}

test('rejects API keys and missing Bearer tokens on WhatsApp admin routes', async () => {
  const handler = async (_req, res) => res.json({ success: true });
  const middleware = authorizedMiddleware({ active: true, role: 'admin' });

  const missing = await requestRoute(middleware, handler, {
    headers: { 'X-API-Key': 'configured-admin-key' },
    body: {},
  });

  assert.equal(missing.status, 401);
  assert.deepEqual(missing.body, { error: 'No autorizado' });
});

test('rejects inactive and cashier users before sending WhatsApp messages', async () => {
  const provider = async () => {
    throw new Error('provider should not be called');
  };
  const handler = createWhatsAppSendHandler({
    db: fakeDb({ active: true, role: 'cashier' }),
    sendWhatsAppMessage: provider,
  });

  const cashier = await requestRoute(
    authorizedMiddleware({ active: true, role: 'cashier' }),
    handler,
    { headers: { Authorization: 'Bearer cashier-token' }, body: { conversationId: 'conv-1', message: 'Hola', messageType: 'text' } },
  );
  assert.equal(cashier.status, 403);

  const inactive = await requestRoute(
    authorizedMiddleware({ active: false, role: 'admin' }),
    handler,
    { headers: { Authorization: 'Bearer inactive-token' }, body: { conversationId: 'conv-1', message: 'Hola', messageType: 'text' } },
  );
  assert.equal(inactive.status, 403);
});

test('allows active managers and records a message only after provider delivery', async () => {
  const db = fakeDb({ active: true, role: 'manager' });
  const calls = [];
  const handler = createWhatsAppSendHandler({
    db,
    sendWhatsAppMessage: async (...args) => {
      calls.push(args);
      return { messages: [{ id: 'wamid-1' }] };
    },
    saveMessage: async (conversationId, sender, message, messageType) => {
      db.savedMessages.push({ conversationId, sender, message, messageType });
    },
    updateConversationTimestamp: async (conversationId) => {
      db.updates.push({ conversationId });
    },
  });

  const result = await requestRoute(
    authorizedMiddleware({ active: true, role: 'manager' }),
    handler,
    {
      headers: { Authorization: 'Bearer manager-token' },
      body: { conversationId: 'conv-1', message: 'Hola cliente', messageType: 'text' },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, data: { messages: [{ id: 'wamid-1' }] } });
  assert.deepEqual(calls, [['573001234567', 'Hola cliente']]);
  assert.equal(db.savedMessages.length, 1);
  assert.deepEqual(db.savedMessages[0], {
    conversationId: 'conv-1',
    sender: 'admin',
    message: 'Hola cliente',
    messageType: 'text',
  });
  assert.equal(db.updates.length, 1);
});

test('returns a generic error and does not persist when provider delivery fails', async () => {
  const db = fakeDb({ active: true, role: 'admin' });
  const handler = createWhatsAppSendHandler({
    db,
    sendWhatsAppMessage: async () => { throw new Error('provider token secret'); },
  });

  const result = await requestRoute(
    authorizedMiddleware({ active: true, role: 'admin' }),
    handler,
    {
      headers: { Authorization: 'Bearer admin-token' },
      body: { conversationId: 'conv-1', message: 'Hola cliente', messageType: 'text' },
    },
  );

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Error interno del servidor' });
  assert.equal(db.savedMessages.length, 0);
  assert.doesNotMatch(JSON.stringify(result.body), /provider|secret/);
});

test('rate limits authenticated send requests per user and returns Retry-After', async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 10 });
  const rateLimit = createWhatsAppRateLimitMiddleware({ route: 'send', rateLimiter: limiter });
  const handler = async (_req, res) => res.json({ success: true });
  const authorized = authorizedMiddleware({ active: true, role: 'admin' }, { uid: 'admin-1' });

  const first = await requestRoute(authorized, handler, {
    middlewares: [rateLimit],
    headers: { Authorization: 'Bearer admin-token' },
  });
  const limited = await requestRoute(authorized, handler, {
    middlewares: [rateLimit],
    headers: { Authorization: 'Bearer admin-token' },
  });

  assert.equal(first.status, 200);
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfter, '1');
  assert.deepEqual(limited.body, { error: 'Demasiadas solicitudes' });
});

test('keeps send and test limits isolated by authenticated user and route', async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 10 });
  const { send: sendRateLimit, test: testRateLimit } = createWhatsAppRateLimitMiddlewares({ rateLimiter: limiter });
  const sendHandler = async (_req, res) => res.json({ success: true, route: 'send' });
  const testHandler = createWhatsAppTestHandler({ sendWhatsAppMessage: async () => ({ messages: [{ id: 'test-1' }] }) });
  const adminAuth = authorizedMiddleware({ active: true, role: 'admin' }, { uid: 'admin-1' });
  const managerAuth = authorizedMiddleware({ active: true, role: 'manager' }, { uid: 'manager-1' });

  const send = await requestRoute(adminAuth, sendHandler, {
    middlewares: [sendRateLimit],
    headers: { Authorization: 'Bearer admin-token' },
  });
  const test = await requestRoute(adminAuth, testHandler, {
    middlewares: [testRateLimit],
    headers: { Authorization: 'Bearer admin-token' },
    body: { phoneNumber: '5551234567' },
  });
  const otherUser = await requestRoute(managerAuth, sendHandler, {
    middlewares: [sendRateLimit],
    headers: { Authorization: 'Bearer manager-token' },
  });

  assert.equal(send.status, 200);
  assert.equal(test.status, 200);
  assert.equal(otherUser.status, 200);
});

test('rate limits the WhatsApp test route and returns Retry-After on exhaustion', async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 10 });
  const { test: testRateLimit } = createWhatsAppRateLimitMiddlewares({ rateLimiter: limiter });
  const handler = createWhatsAppTestHandler({ sendWhatsAppMessage: async () => ({ messages: [{ id: 'test-1' }] }) });
  const authorized = authorizedMiddleware({ active: true, role: 'admin' }, { uid: 'admin-1' });

  const first = await requestRoute(authorized, handler, {
    middlewares: [testRateLimit],
    headers: { Authorization: 'Bearer admin-token' },
    body: { phoneNumber: '5551234567' },
  });
  const limited = await requestRoute(authorized, handler, {
    middlewares: [testRateLimit],
    headers: { Authorization: 'Bearer admin-token' },
    body: { phoneNumber: '5551234567' },
  });

  assert.equal(first.status, 200);
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfter, '1');
  assert.deepEqual(limited.body, { error: 'Demasiadas solicitudes' });
});
