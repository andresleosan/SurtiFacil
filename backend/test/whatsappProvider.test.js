const assert = require('node:assert/strict');
const test = require('node:test');

const { createWhatsAppMessageSender, DEFAULT_FETCH } = require('../whatsappProvider');

test('default sender uses an available Node 16-compatible fetch without injection', () => {
  const sender = createWhatsAppMessageSender({
    token: 'backend-token',
    phoneNumberId: 'phone-id',
  });

  assert.equal(typeof DEFAULT_FETCH, 'function');
  assert.equal(typeof sender, 'function');
});

test('converts a provider timeout into a generic failure and static log', async () => {
  const logs = [];
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('provider token secret')), { once: true });
  });
  const sendWhatsAppMessage = createWhatsAppMessageSender({
    fetchImpl,
    token: 'backend-token',
    phoneNumberId: 'phone-id',
    timeoutMs: 5,
    logError: (message) => logs.push(message),
  });

  await assert.rejects(
    sendWhatsAppMessage('5551234567', 'Hola'),
    (error) => error.message === 'WhatsApp provider request failed',
  );
  assert.deepEqual(logs, ['WhatsApp provider request']);
});

test('converts provider failures into a generic error without exposing the payload', async () => {
  const logs = [];
  const sendWhatsAppMessage = createWhatsAppMessageSender({
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ error: { message: 'provider token secret' } }),
    }),
    token: 'backend-token',
    phoneNumberId: 'phone-id',
    logError: (message) => logs.push(message),
  });

  await assert.rejects(
    sendWhatsAppMessage('5551234567', 'Hola'),
    (error) => error.message === 'WhatsApp provider request failed',
  );
  assert.deepEqual(logs, ['WhatsApp provider request']);
});

test('preserves the successful WhatsApp provider response contract', async () => {
  const responseData = { messages: [{ id: 'wamid-1' }] };
  let request;
  const sendWhatsAppMessage = createWhatsAppMessageSender({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => responseData };
    },
    token: 'backend-token',
    phoneNumberId: 'phone-id',
  });

  const result = await sendWhatsAppMessage('5551234567', 'Hola');

  assert.deepEqual(result, responseData);
  assert.equal(request.url, 'https://graph.facebook.com/v18.0/phone-id/messages');
  assert.equal(request.options.signal instanceof AbortSignal, true);
  assert.equal(request.options.headers.Authorization, 'Bearer backend-token');
});
