const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const { createAnthropicRouter } = require('../anthropicRoutes');

async function requestRoute(router, { path, body, headers = {} }) {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/anthropic', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/anthropic${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const result = { status: response.status, headers: response.headers, body: await response.json() };
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

function createDependencies({ role = 'admin', active = true, fetchImpl } = {}) {
  const admin = {
    auth: () => ({
      verifyIdToken: async (token) => {
        if (token !== 'valid-token') throw new Error('invalid token');
        return { uid: 'anthropic-user' };
      },
    }),
  };
  const db = {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ active, role }) }) }),
    }),
  };
  return {
    admin,
    db,
    enabled: true,
    apiKey: 'anthropic-test-key',
    model: 'claude-sonnet-5',
    fetchImpl,
    rateLimiter: { consume: () => ({ allowed: true, retryAfterMs: 0 }) },
  };
}

test('Anthropic routes return generic 401/403 responses at request level', async () => {
  const fetchImpl = async () => { throw new Error('provider must not be called'); };
  const unauthenticated = await requestRoute(createAnthropicRouter(createDependencies({ fetchImpl })), {
    path: '/analyze-image',
    body: { imageBase64: 'image' },
  });
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(unauthenticated.body, { error: 'No autorizado' });

  const cashier = await requestRoute(createAnthropicRouter(createDependencies({ role: 'cashier', fetchImpl })), {
    path: '/analyze-audio',
    headers: { Authorization: 'Bearer valid-token' },
    body: { transcribedText: 'leche' },
  });
  assert.equal(cashier.status, 403);
  assert.deepEqual(cashier.body, { error: 'No autorizado' });
});

test('Anthropic routes degrade with 503 when the paid integration is disabled or incomplete', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error('provider must not be called');
  };
  const disabledDependencies = createDependencies({ fetchImpl });
  disabledDependencies.enabled = false;
  const disabled = await requestRoute(createAnthropicRouter(disabledDependencies), {
    path: '/analyze-image',
    headers: { Authorization: 'Bearer valid-token' },
    body: { imageBase64: 'image' },
  });

  const missingModelDependencies = createDependencies({ fetchImpl });
  missingModelDependencies.model = '';
  const missingModel = await requestRoute(createAnthropicRouter(missingModelDependencies), {
    path: '/analyze-audio',
    headers: { Authorization: 'Bearer valid-token' },
    body: { transcribedText: 'leche' },
  });

  assert.equal(disabled.status, 503);
  assert.deepEqual(disabled.body, { error: 'Servicio no configurado' });
  assert.equal(missingModel.status, 503);
  assert.deepEqual(missingModel.body, { error: 'Servicio no configurado' });
  assert.equal(calls, 0);
});

test('Anthropic routes apply a bounded per-user rate limit with Retry-After', async () => {
  let calls = 0;
  let providerRequest;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    providerRequest = JSON.parse(options.body);
    return new Response(JSON.stringify({ content: [{ text: '{"nombre":"Arroz"}' }] }), { status: 200 });
  };
  let consumed = 0;
  const dependencies = createDependencies({ fetchImpl });
  dependencies.rateLimiter = {
    consume: () => {
      consumed += 1;
      return consumed === 1 ? { allowed: true, retryAfterMs: 0 } : { allowed: false, retryAfterMs: 2500 };
    },
  };
  const router = createAnthropicRouter(dependencies);

  const first = await requestRoute(router, {
    path: '/analyze-image',
    headers: { Authorization: 'Bearer valid-token' },
    body: { imageBase64: 'image' },
  });
  const second = await requestRoute(router, {
    path: '/analyze-image',
    headers: { Authorization: 'Bearer valid-token' },
    body: { imageBase64: 'image' },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(second.headers.get('Retry-After'), '3');
  assert.deepEqual(second.body, { error: 'Demasiadas solicitudes' });
  assert.equal(calls, 1);
  assert.equal(providerRequest.model, 'claude-sonnet-5');
});

test('Anthropic routes reject oversized image and audio inputs before calling the provider', async () => {
  let calls = 0;
  const dependencies = createDependencies({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('provider must not be called');
    },
  });
  const router = createAnthropicRouter(dependencies);

  const image = await requestRoute(router, {
    path: '/analyze-image',
    headers: { Authorization: 'Bearer valid-token' },
    body: { imageBase64: 'x'.repeat(8 * 1024 * 1024 + 1) },
  });
  const audio = await requestRoute(router, {
    path: '/analyze-audio',
    headers: { Authorization: 'Bearer valid-token' },
    body: { transcribedText: 'x'.repeat(4096 + 1) },
  });

  assert.equal(image.status, 400);
  assert.deepEqual(image.body, { error: 'Solicitud inválida' });
  assert.equal(audio.status, 400);
  assert.deepEqual(audio.body, { error: 'Solicitud inválida' });
  assert.equal(calls, 0);
});

test('Anthropic image and audio provider calls abort at the configured timeout and return generic errors', async () => {
  const abortedKinds = [];
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      abortedKinds.push(options.body.includes('"type":"image"') ? 'image' : 'audio');
      const error = new Error('provider timeout secret');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const dependencies = createDependencies({ fetchImpl });
  const router = createAnthropicRouter({ ...dependencies, requestTimeoutMs: 5 });

  const image = await requestRoute(router, {
    path: '/analyze-image',
    headers: { Authorization: 'Bearer valid-token' },
    body: { imageBase64: 'image' },
  });
  const audio = await requestRoute(router, {
    path: '/analyze-audio',
    headers: { Authorization: 'Bearer valid-token' },
    body: { transcribedText: 'leche' },
  });

  assert.equal(image.status, 500);
  assert.deepEqual(image.body, { error: 'Error interno del servidor' });
  assert.equal(audio.status, 500);
  assert.deepEqual(audio.body, { error: 'Error interno del servidor' });
  assert.deepEqual(abortedKinds, ['image', 'audio']);
});

test('Anthropic provider failures return a generic error without provider details', async () => {
  const router = createAnthropicRouter(createDependencies({
    fetchImpl: async () => { throw new Error('provider secret=do-not-leak'); },
  }));
  const result = await requestRoute(router, {
    path: '/analyze-audio',
    headers: { Authorization: 'Bearer valid-token' },
    body: { transcribedText: 'leche' },
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Error interno del servidor' });
  assert.doesNotMatch(JSON.stringify(result.body), /secret|provider/);
});
