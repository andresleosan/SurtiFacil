const crypto = require('node:crypto');
const express = require('express');
const { getSafeApiError } = require('./apiErrorContract');

const DEFAULT_AUTO_RESPONSE = '👋 Hola, gracias por tu mensaje. Un administrador te responderá pronto.';

function captureRawBody(req, res, buffer) {
  req.rawBody = Buffer.from(buffer);
}

function createWebhookSignatureMiddleware({ getSecret = () => process.env.WHATSAPP_APP_SECRET } = {}) {
  return (req, res, next) => {
    const secret = getSecret();
    const signature = req.get('X-Hub-Signature-256');

    if (typeof secret !== 'string' || secret.length === 0 || !Buffer.isBuffer(req.rawBody)) {
      return res.status(401).json(getSafeApiError('unauthorized'));
    }

    if (typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
      return res.status(401).json(getSafeApiError('unauthorized'));
    }

    const provided = Buffer.from(signature.slice('sha256='.length), 'hex');
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest();

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json(getSafeApiError('unauthorized'));
    }

    return next();
  };
}

function createWebhookRateLimiter({
  limit = 100,
  windowMs = 60_000,
  maxEntries = 10_000,
  now = Date.now,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('limit must be a positive integer');
  if (!Number.isInteger(windowMs) || windowMs < 1) throw new TypeError('windowMs must be a positive integer');
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new TypeError('maxEntries must be a positive integer');

  const entries = new Map();

  function removeExpired(timestamp) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= timestamp) entries.delete(key);
    }
  }

  function getKey(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  function middleware(req, res, next) {
    const timestamp = now();
    removeExpired(timestamp);
    const key = getKey(req);
    let entry = entries.get(key);

    if (!entry) {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entry = { count: 0, resetAt: timestamp + windowMs };
      entries.set(key, entry);
    }

    if (entry.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
      return res
        .status(429)
        .set('Retry-After', String(retryAfter))
        .json({ error: 'Demasiadas solicitudes' });
    }

    entry.count += 1;
    return next();
  }

  middleware.size = () => entries.size;
  return middleware;
}

function createWhatsAppWebhookHandler({
  getOrCreateConversation,
  saveMessage,
  updateConversationTimestamp,
  sendWhatsAppMessage,
  isAutoResponseEnabled = () => false,
  getAutoResponseMessage = () => DEFAULT_AUTO_RESPONSE,
  logError = () => undefined,
} = {}) {
  return async (req, res) => {
    try {
      const body = req.body;

      if (!body || body.object !== 'whatsapp_business_account') {
        return res.sendStatus(200);
      }

      if (!Array.isArray(body.entry)) {
        return res.status(400).json(getSafeApiError('badRequest'));
      }

      for (const entry of body.entry) {
        if (!entry.changes || !Array.isArray(entry.changes)) continue;

        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;

          const value = change.value || {};
          const messages = Array.isArray(value.messages) ? value.messages : [];
          const contacts = Array.isArray(value.contacts) ? value.contacts : [];

          for (const message of messages) {
            if (!message.from || typeof message.from !== 'string') continue;
            if (!/^\d{10,15}$/.test(message.from)) continue;

            const phoneNumber = message.from;
            const messageText = typeof message.text?.body === 'string'
              ? message.text.body.slice(0, 1000)
              : '[Mensaje sin texto]';
            const customerName = typeof contacts[0]?.profile?.name === 'string'
              ? contacts[0].profile.name.slice(0, 100)
              : 'Cliente';

            try {
              const conversationId = await getOrCreateConversation(phoneNumber, customerName);
              await saveMessage(conversationId, 'customer', messageText, 'text');
              await updateConversationTimestamp(conversationId);

              if (isAutoResponseEnabled()) {
                await sendWhatsAppMessage(phoneNumber, getAutoResponseMessage());
              }
            } catch (error) {
              logError('WhatsApp message processing', error);
            }
          }
        }
      }

      return res.sendStatus(200);
    } catch (error) {
      logError('WhatsApp webhook', error);
      return res.status(500).json(getSafeApiError('internal'));
    }
  };
}

function parseCapturedJson(req, res, next) {
  try {
    req.body = JSON.parse(req.rawBody.toString('utf8'));
    return next();
  } catch (error) {
    return next(error);
  }
}

function registerWhatsAppWebhookRoutes(app, {
  path = '/api/webhooks/whatsapp',
  getSecret = () => process.env.WHATSAPP_APP_SECRET,
  getVerifyToken = () => process.env.WEBHOOK_VERIFY_TOKEN,
  handler,
} = {}) {
  const rateLimiter = createWebhookRateLimiter({ limit: 100, windowMs: 60_000, maxEntries: 10_000 });
  const signatureMiddleware = createWebhookSignatureMiddleware({ getSecret });

  app.get(path, (req, res) => {
    const configuredToken = getVerifyToken();
    const isValid = typeof configuredToken === 'string'
      && configuredToken.length > 0
      && req.query['hub.mode'] === 'subscribe'
      && req.query['hub.verify_token'] === configuredToken;

    if (!isValid) return res.sendStatus(403);
    return res.status(200).send(req.query['hub.challenge']);
  });

  app.post(
    path,
    rateLimiter,
    express.raw({ limit: '10mb', type: '*/*', verify: captureRawBody }),
    signatureMiddleware,
    parseCapturedJson,
    handler,
  );

  return rateLimiter;
}

module.exports = {
  captureRawBody,
  createWebhookRateLimiter,
  createWebhookSignatureMiddleware,
  createWhatsAppWebhookHandler,
  registerWhatsAppWebhookRoutes,
  DEFAULT_AUTO_RESPONSE,
};
