const { resolveClaimsForUser: defaultResolveClaimsForUser } = require('./authClaims');
const { getSafeApiError, getSafeApiLogMessage } = require('./apiErrorContract');

function sendApiError(res, status, code = 'internal') {
  return res.status(status).json(getSafeApiError(code));
}

function logApiError(context) {
  console.error(getSafeApiLogMessage(context));
}

function createSyncClaimsHandler({ admin, db, resolveClaims = defaultResolveClaimsForUser }) {
  return async function syncClaims(req, res) {
    try {
      const authorization = req.get('Authorization');
      const tokenMatch = typeof authorization === 'string'
        ? authorization.match(/^Bearer\s+(\S+)$/i)
        : null;
      if (!tokenMatch) return sendApiError(res, 401, 'unauthorized');

      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || typeof body.uid !== 'string' || body.uid.length === 0
        || Object.keys(body).length !== 1) {
        return sendApiError(res, 400, 'badRequest');
      }
      const { uid } = body;

      const decoded = await admin.auth().verifyIdToken(tokenMatch[1]);
      if (decoded.uid !== uid) return sendApiError(res, 403, 'forbidden');

      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) return sendApiError(res, 404, 'notFound');

      const decision = resolveClaims(userDoc.data());
      if (!decision.allowed) {
        if (decision.clearClaims) {
          await admin.auth().setCustomUserClaims(uid, decision.claims);
        }
        console.warn('Rejected custom claims sync request.');
        return sendApiError(res, decision.status, decision.status === 403 ? 'forbidden' : 'badRequest');
      }

      await admin.auth().setCustomUserClaims(uid, decision.claims);
      console.log('Custom claims synchronized.');
      return res.json({ success: true, claims: decision.claims });
    } catch {
      logApiError('Custom claims synchronization');
      return sendApiError(res, 500);
    }
  };
}

function createWhatsAppTestHandler({ sendWhatsAppMessage }) {
  return async function sendTestMessage(req, res) {
    try {
      const { phoneNumber } = req.body || {};
      if (typeof phoneNumber !== 'string' || !/^\d{10,15}$/.test(phoneNumber)) {
        return sendApiError(res, 400, 'badRequest');
      }

      console.log('WhatsApp test message requested.');
      const result = await sendWhatsAppMessage(
        phoneNumber,
        '✅ Este es un mensaje de prueba desde SurtiFácil Admin.',
      );
      return res.json({ success: true, message: 'Test message sent', data: result });
    } catch {
      logApiError('WhatsApp test message');
      return sendApiError(res, 500);
    }
  };
}

module.exports = { createSyncClaimsHandler, createWhatsAppTestHandler };
