const express = require('express');
const { getSafeApiError, getSafeApiLogMessage } = require('./apiErrorContract');
const { createRateLimiter } = require('./userProvisioning');
const {
  createAuthenticatedRateLimitMiddleware,
  createFirebaseAdminRoleMiddleware,
} = require('./whatsappAdminRoutes');

const ANTHROPIC_RATE_LIMIT = 5;
const ANTHROPIC_RATE_WINDOW_MS = 60_000;
const ANTHROPIC_RATE_MAX_ENTRIES = 1_000;
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;
const MAX_AUDIO_TEXT_LENGTH = 4_096;
const ANTHROPIC_REQUEST_TIMEOUT_MS = 15_000;

function sendApiError(res, status, code = 'internal') {
  return res.status(status).json(getSafeApiError(code));
}

function createAnthropicRateLimiter() {
  return createRateLimiter({
    limit: ANTHROPIC_RATE_LIMIT,
    windowMs: ANTHROPIC_RATE_WINDOW_MS,
    maxEntries: ANTHROPIC_RATE_MAX_ENTRIES,
  });
}

function createAnthropicHandler({
  kind,
  apiKey,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = ANTHROPIC_REQUEST_TIMEOUT_MS,
}) {
  return async function analyze(req, res) {
    if (!apiKey) return sendApiError(res, 503, 'notConfigured');

    const value = kind === 'image' ? req.body?.imageBase64 : req.body?.transcribedText;
    const maxLength = kind === 'image' ? MAX_IMAGE_BASE64_LENGTH : MAX_AUDIO_TEXT_LENGTH;
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
      return sendApiError(res, 400, 'badRequest');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const content = kind === 'image'
        ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: value } },
          {
            type: 'text',
            text: `Analiza esta imagen de un producto de supermercado.
Extrae SOLO un JSON: { nombre: string, precio_sugerido: number, categoria: string }
Si no puedes identificar el precio, usa null.
Categorías: Abarrotes, Bebidas, Lácteos, Limpieza, Otros
Responde SOLO con el JSON.`,
          },
        ]
        : `El usuario dictó: "${value}"
Extrae SOLO un JSON: { nombre: string, precio: number, stock: number, categoria: string }
Si falta algún campo, usa null.
Categorías: Abarrotes, Bebidas, Lácteos, Limpieza, Otros
Responde SOLO con el JSON.`;
      const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content }],
        }),
      });

      if (!response.ok) throw new Error('Anthropic provider failure');
      const data = await response.json();
      const text = data.content?.[0]?.text;
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid provider response');

      return res.json({ success: true, data: JSON.parse(jsonMatch[0]) });
    } catch {
      console.error(getSafeApiLogMessage(`Anthropic ${kind} analysis`));
      return sendApiError(res, 500);
    } finally {
      clearTimeout(timeout);
    }
  };
}

function createAnthropicRouter({
  admin,
  db,
  apiKey,
  fetchImpl,
  requestTimeoutMs,
  rateLimiter = createAnthropicRateLimiter(),
}) {
  const router = express.Router();
  const requireAdminRole = createFirebaseAdminRoleMiddleware({ admin, db });
  const limitImage = createAuthenticatedRateLimitMiddleware({ route: 'anthropic-image', rateLimiter });
  const limitAudio = createAuthenticatedRateLimitMiddleware({ route: 'anthropic-audio', rateLimiter });

  router.post('/analyze-image', requireAdminRole, limitImage, createAnthropicHandler({ kind: 'image', apiKey, fetchImpl, requestTimeoutMs }));
  router.post('/analyze-audio', requireAdminRole, limitAudio, createAnthropicHandler({ kind: 'audio', apiKey, fetchImpl, requestTimeoutMs }));
  return router;
}

module.exports = {
  ANTHROPIC_REQUEST_TIMEOUT_MS,
  MAX_AUDIO_TEXT_LENGTH,
  MAX_IMAGE_BASE64_LENGTH,
  createAnthropicRateLimiter,
  createAnthropicRouter,
};
