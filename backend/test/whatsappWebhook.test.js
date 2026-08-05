const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const {
  createWebhookRateLimiter,
  createWhatsAppWebhookHandler,
  registerWhatsAppWebhookRoutes,
} = require('../whatsappWebhook');

async function requestRoute({ rawBody, secret = 'app-secret', signatureOverride, handlerOptions = {} } = {}) {
  const app = express();
  registerWhatsAppWebhookRoutes(app, {
    path: '/',
    getSecret: () => secret,
    getVerifyToken: () => 'verify-token',
    handler: createWhatsAppWebhookHandler(handlerOptions),
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const signature = signatureOverride !== undefined
    ? signatureOverride
    : secret
    ? `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
    : undefined;
  const headers = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Hub-Signature-256'] = signature;
  const response = await fetch(`http://127.0.0.1:${address.port}/`, {
    method: 'POST',
    headers,
    body: rawBody,
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch (error) {
    // The preserved 200 webhook response uses Express sendStatus('OK').
  }
  const result = { status: response.status, body };
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

async function requestVerification({ configuredToken, suppliedToken } = {}) {
  const app = express();
  registerWhatsAppWebhookRoutes(app, {
    path: '/',
    getSecret: () => 'app-secret',
    getVerifyToken: () => configuredToken,
    handler: createWhatsAppWebhookHandler(),
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const query = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.challenge': 'challenge-1',
  });
  if (suppliedToken !== undefined) query.set('hub.verify_token', suppliedToken);
  const response = await fetch(`http://127.0.0.1:${address.port}/?${query}`);
  const result = { status: response.status, body: await response.text() };
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

const validPayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{
    field: 'messages',
    value: {
      contacts: [{ profile: { name: 'Customer' } }],
      messages: [{ from: '5491112345678', text: { body: 'Hola' } }],
    },
  }] }],
});

test('accepts a valid signature over the exact raw body and processes the payload', async () => {
  const calls = [];
  const result = await requestRoute({
    rawBody: ` { "object": "whatsapp_business_account", "entry": [] } `,
    handlerOptions: {
      getOrCreateConversation: async (...args) => { calls.push(['conversation', ...args]); return 'conversation-1'; },
      saveMessage: async (...args) => calls.push(['message', ...args]),
      updateConversationTimestamp: async (...args) => calls.push(['timestamp', ...args]),
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls, []);
});

test('preserves configured GET verification and rejects missing configured token', async () => {
  const valid = await requestVerification({ configuredToken: 'verify-token', suppliedToken: 'verify-token' });
  assert.equal(valid.status, 200);
  assert.equal(valid.body, 'challenge-1');

  const missing = await requestVerification({ configuredToken: undefined, suppliedToken: undefined });
  assert.equal(missing.status, 403);
});

test('rejects missing, malformed, and invalid signatures before processing', async () => {
  const processed = [];
  const handlerOptions = {
    getOrCreateConversation: async () => { processed.push('processed'); return 'conversation-1'; },
  };

  const missing = await requestRoute({ rawBody: validPayload, secret: null, handlerOptions });
  assert.equal(missing.status, 401);

  const malformed = await requestRoute({ rawBody: validPayload, signatureOverride: 'sha256=not-hex', handlerOptions });
  assert.equal(malformed.status, 401);

  const invalid = await requestRoute({
    rawBody: validPayload,
    signatureOverride: `sha256=${'f'.repeat(64)}`,
    handlerOptions,
  });
  assert.equal(invalid.status, 401);
  assert.deepEqual(processed, []);
});

test('fails closed when the app secret is missing even if a signature is supplied', async () => {
  const result = await requestRoute({ rawBody: validPayload, secret: null, signatureOverride: `sha256=${'f'.repeat(64)}` });
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: 'No autorizado' });
});

test('rejects malformed JSON with invalid or missing HMAC before JSON parsing', async () => {
  const processed = [];
  const handlerOptions = {
    getOrCreateConversation: async () => { processed.push('processed'); return 'conversation-1'; },
  };
  const malformed = '{"object":';

  const invalidSignature = await requestRoute({
    rawBody: malformed,
    signatureOverride: `sha256=${'f'.repeat(64)}`,
    handlerOptions,
  });
  assert.equal(invalidSignature.status, 401);
  assert.deepEqual(invalidSignature.body, { error: 'No autorizado' });

  const missingSignature = await requestRoute({
    rawBody: malformed,
    signatureOverride: null,
    handlerOptions,
  });
  assert.equal(missingSignature.status, 401);
  assert.deepEqual(missingSignature.body, { error: 'No autorizado' });
  assert.deepEqual(processed, []);
});

test('rate limits the public webhook with a bounded expiring limiter', async () => {
  const app = express();
  let now = 0;
  const limiter = createWebhookRateLimiter({ limit: 1, windowMs: 1000, maxEntries: 2, now: () => now });
  app.post('/', limiter, (req, res) => res.sendStatus(200));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();

  const request = () => fetch(`http://127.0.0.1:${address.port}/`, { method: 'POST' });
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
  assert.equal(limiter.size(), 1);
  now = 1001;
  assert.equal((await request()).status, 200);
  assert.equal(limiter.size(), 1);

  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('processes a valid WhatsApp message and preserves the success response', async () => {
  const calls = [];
  const result = await requestRoute({
    rawBody: validPayload,
    handlerOptions: {
      getOrCreateConversation: async (phone, name) => {
        calls.push(['conversation', phone, name]);
        return 'conversation-1';
      },
      saveMessage: async (...args) => calls.push(['message', ...args]),
      updateConversationTimestamp: async (...args) => calls.push(['timestamp', ...args]),
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls, [
    ['conversation', '5491112345678', 'Customer'],
    ['message', 'conversation-1', 'customer', 'Hola', 'text'],
    ['timestamp', 'conversation-1'],
  ]);
});
