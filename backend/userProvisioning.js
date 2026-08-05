const VALID_ROLES = new Set(['admin', 'manager', 'cashier']);
const { FieldValue } = require('firebase-admin/firestore');

const GENERIC_PROVISIONING_ERROR = 'Unable to provision user';

function validateProvisioningInput(body) {
  if (!body || typeof body !== 'object') return false;

  const { email, password, displayName, role } = body;
  return typeof email === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    && typeof password === 'string'
    && password.length >= 6
    && typeof displayName === 'string'
    && displayName.trim().length > 0
    && displayName.trim().length <= 100
    && typeof role === 'string'
    && VALID_ROLES.has(role);
}

function createRateLimiter({
  limit = 10,
  windowMs = 60_000,
  maxEntries = 1000,
  now = () => Date.now(),
} = {}) {
  const entries = new Map();

  function removeExpired(currentTime) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= currentTime) entries.delete(key);
    }
  }

  function removeOldest() {
    let oldestKey;
    let oldestResetAt = Infinity;
    for (const [key, entry] of entries) {
      if (entry.resetAt < oldestResetAt) {
        oldestKey = key;
        oldestResetAt = entry.resetAt;
      }
    }
    if (oldestKey !== undefined) entries.delete(oldestKey);
  }

  return {
    consume(key) {
      const currentTime = now();
      removeExpired(currentTime);
      const current = entries.get(key);
      if (!current || current.resetAt <= currentTime) {
        if (entries.size >= maxEntries) removeOldest();
        entries.set(key, { count: 1, resetAt: currentTime + windowMs });
        return { allowed: true, retryAfterMs: 0 };
      }

      if (current.count >= limit) {
        return { allowed: false, retryAfterMs: current.resetAt - currentTime };
      }

      current.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
    size() {
      removeExpired(now());
      return entries.size;
    },
  };
}

function createProvisionUserHandler({ admin, db, rateLimiter = createRateLimiter() }) {
  const serverTimestamp = () => admin.firestore?.FieldValue?.serverTimestamp?.()
    ?? FieldValue.serverTimestamp();

  return async function provisionUser(req, res) {
    const authorization = req.headers.authorization || '';
    const tokenMatch = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!tokenMatch) {
      return res.status(401).json({ error: GENERIC_PROVISIONING_ERROR });
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(tokenMatch[1]);
    } catch {
      return res.status(401).json({ error: GENERIC_PROVISIONING_ERROR });
    }

    const rate = rateLimiter.consume(decodedToken.uid);
    if (!rate.allowed) {
      res.set('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
      return res.status(429).json({ error: GENERIC_PROVISIONING_ERROR });
    }

    if (!validateProvisioningInput(req.body)) {
      return res.status(400).json({ error: GENERIC_PROVISIONING_ERROR });
    }

    let adminSnapshot;
    try {
      adminSnapshot = await db.collection('users').doc(decodedToken.uid).get();
    } catch {
      return res.status(500).json({ error: GENERIC_PROVISIONING_ERROR });
    }
    const adminData = adminSnapshot.exists ? adminSnapshot.data() : null;
    if (!adminData || adminData.active !== true || adminData.role !== 'admin') {
      return res.status(403).json({ error: GENERIC_PROVISIONING_ERROR });
    }

    const { email, password, displayName, role } = req.body;
    let createdUser = null;
    try {
      createdUser = await admin.auth().createUser({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });

      const claims = {
        admin: role === 'admin',
        manager: role === 'manager' || role === 'admin',
      };
      await admin.auth().setCustomUserClaims(createdUser.uid, claims);
      await db.collection('users').doc(createdUser.uid).set({
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        active: true,
        createdAt: serverTimestamp(),
      });

      return res.status(201).json({
        id: createdUser.uid,
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        active: true,
      });
    } catch {
      if (createdUser) {
        try {
          await admin.auth().deleteUser(createdUser.uid);
        } catch {
          // Cleanup is best effort; do not expose provider details to clients.
        }
      }
      return res.status(500).json({ error: GENERIC_PROVISIONING_ERROR });
    }
  };
}

module.exports = {
  GENERIC_PROVISIONING_ERROR,
  createProvisionUserHandler,
  createRateLimiter,
  validateProvisioningInput,
};
