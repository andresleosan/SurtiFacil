const DEFAULT_FETCH = require('node-fetch');
const DEFAULT_TIMEOUT_MS = 10_000;

function resolveTimeoutMs(timeoutMs) {
  const value = Number(timeoutMs);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_TIMEOUT_MS;
}

function createWhatsAppMessageSender({
  fetchImpl = DEFAULT_FETCH,
  enabled = false,
  token = process.env.WHATSAPP_API_TOKEN,
  phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID,
  timeoutMs = process.env.WHATSAPP_REQUEST_TIMEOUT_MS,
  logError = () => undefined,
} = {}) {
  return async function sendWhatsAppMessage(phoneNumber, message) {
    if (enabled !== true
      || typeof token !== 'string' || token.trim().length === 0
      || typeof phoneNumberId !== 'string' || phoneNumberId.length === 0
      || typeof fetchImpl !== 'function') {
      logError('WhatsApp credentials');
      throw new Error('WhatsApp provider request failed');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs(timeoutMs));

    try {
      const response = await fetchImpl(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'text',
            text: { body: message },
          }),
          signal: controller.signal,
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error('WhatsApp provider rejected request');
      return data;
    } catch {
      logError('WhatsApp provider request');
      throw new Error('WhatsApp provider request failed');
    } finally {
      clearTimeout(timeout);
    }
  };
}

module.exports = { createWhatsAppMessageSender, DEFAULT_FETCH, DEFAULT_TIMEOUT_MS };
