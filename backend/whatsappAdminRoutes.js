const { getSafeApiError, getSafeApiLogMessage } = require('./apiErrorContract');
const { createRateLimiter } = require('./userProvisioning');

const WHATSAPP_ADMIN_RATE_LIMIT = 10;
const WHATSAPP_ADMIN_RATE_WINDOW_MS = 60_000;
const WHATSAPP_ADMIN_RATE_MAX_ENTRIES = 1_000;

function createWhatsAppRateLimiter() {
  return createRateLimiter({
    limit: WHATSAPP_ADMIN_RATE_LIMIT,
    windowMs: WHATSAPP_ADMIN_RATE_WINDOW_MS,
    maxEntries: WHATSAPP_ADMIN_RATE_MAX_ENTRIES,
  });
}

function sendApiError(res, status, code = 'internal') {
  return res.status(status).json(getSafeApiError(code));
}

function createWhatsAppRateLimitMiddleware({
  route,
  rateLimiter = createWhatsAppRateLimiter(),
} = {}) {
  if (typeof route !== 'string' || route.length === 0) {
    throw new TypeError('route is required');
  }

  return function whatsappRateLimit(req, res, next) {
    const uid = req.user?.uid;
    if (typeof uid !== 'string' || uid.length === 0) return sendApiError(res, 401, 'unauthorized');

    const rate = rateLimiter.consume(`${route}:${uid}`);
    if (!rate.allowed) {
      res.set('Retry-After', String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))));
      return sendApiError(res, 429, 'rateLimited');
    }

    return next();
  };
}

const createAuthenticatedRateLimitMiddleware = createWhatsAppRateLimitMiddleware;

function createWhatsAppRateLimitMiddlewares({ rateLimiter = createWhatsAppRateLimiter() } = {}) {
  return {
    send: createWhatsAppRateLimitMiddleware({ route: 'send', rateLimiter }),
    test: createWhatsAppRateLimitMiddleware({ route: 'test', rateLimiter }),
  };
}

function createFirebaseAdminRoleMiddleware({ admin, db }) {
  return createFirebaseActiveRoleMiddleware({ admin, db, roles: ['admin', 'manager'] });
}

function createFirebaseActiveRoleMiddleware({ admin, db, roles = ['admin', 'manager', 'cashier'] }) {
  return async function requireFirebaseAdminRole(req, res, next) {
    const authorization = req.headers.authorization;
    const match = typeof authorization === 'string'
      ? authorization.match(/^Bearer\s+(.+)$/i)
      : null;

    if (!match) return sendApiError(res, 401, 'unauthorized');

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(match[1]);
    } catch {
      return sendApiError(res, 401, 'unauthorized');
    }

    if (typeof decoded?.uid !== 'string' || decoded.uid.length === 0) {
      return sendApiError(res, 401, 'unauthorized');
    }

    try {
      const userSnapshot = await db.collection('users').doc(decoded.uid).get();
      const user = userSnapshot.exists ? userSnapshot.data() : null;
      if (user?.active !== true || !roles.includes(user.role)) {
        return sendApiError(res, 403, 'forbidden');
      }

      req.user = decoded;
      req.authContext = { uid: decoded.uid, role: user.role };
      return next();
    } catch {
      console.error(getSafeApiLogMessage('WhatsApp authorization'));
      return sendApiError(res, 500);
    }
  };
}

function createWhatsAppSendHandler({ db, sendWhatsAppMessage, saveMessage, updateConversationTimestamp }) {
  return async function sendMessage(req, res) {
    const body = req.body || {};
    const { conversationId, message, messageType = 'text' } = body;

    if (
      typeof conversationId !== 'string'
      || conversationId.trim().length === 0
      || conversationId.length > 128
      || typeof message !== 'string'
      || message.trim().length === 0
      || message.length > 4096
      || !['text', 'order_request', 'location', 'image'].includes(messageType)
    ) {
      return sendApiError(res, 400, 'badRequest');
    }

    try {
      const conversationSnapshot = await db
        .collection('whatsapp_conversations')
        .doc(conversationId)
        .get();
      if (!conversationSnapshot.exists) return sendApiError(res, 404, 'notFound');

      const phoneNumber = conversationSnapshot.data()?.phoneNumber;
      if (typeof phoneNumber !== 'string' || !/^\d{10,15}$/.test(phoneNumber)) {
        return sendApiError(res, 400, 'badRequest');
      }

      const result = await sendWhatsAppMessage(phoneNumber, message);
      if (saveMessage) {
        await saveMessage(conversationId, 'admin', message, messageType);
      }
      if (updateConversationTimestamp) {
        await updateConversationTimestamp(conversationId);
      }

      return res.json({ success: true, data: result });
    } catch {
      console.error(getSafeApiLogMessage('Admin WhatsApp send'));
      return sendApiError(res, 500);
    }
  };
}

module.exports = {
  createFirebaseAdminRoleMiddleware,
  createFirebaseActiveRoleMiddleware,
  createWhatsAppRateLimitMiddlewares,
  createWhatsAppRateLimitMiddleware,
  createAuthenticatedRateLimitMiddleware,
  createWhatsAppRateLimiter,
  createWhatsAppSendHandler,
};
