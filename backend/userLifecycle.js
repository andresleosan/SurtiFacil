const { FieldValue } = require('firebase-admin/firestore');
const { getSafeApiError, getSafeApiLogMessage } = require('./apiErrorContract');
const { createRateLimiter } = require('./userProvisioning');

function isValidUid(uid) {
  return typeof uid === 'string'
    && uid.length > 0
    && uid.length <= 128
    && !/[\u0000-\u001f\u007f/]/u.test(uid);
}

function sendApiError(res, status, code = 'internal') {
  return res.status(status).json(getSafeApiError(code));
}

function createDeactivateUserHandler({
  admin,
  db,
  rateLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 }),
  logError = (context) => console.error(getSafeApiLogMessage(context)),
}) {
  const serverTimestamp = () => admin.firestore?.FieldValue?.serverTimestamp?.()
    ?? FieldValue.serverTimestamp();

  return async function deactivateUser(req, res) {
    const authorization = req.headers.authorization || '';
    const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!tokenMatch) return sendApiError(res, 401, 'unauthorized');

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(tokenMatch[1]);
    } catch {
      return sendApiError(res, 401, 'unauthorized');
    }

    const rate = rateLimiter.consume(decoded.uid);
    if (!rate.allowed) {
      res.set('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
      return sendApiError(res, 429, 'rateLimited');
    }

    const targetUid = req.params?.uid;
    if (!isValidUid(targetUid)) return sendApiError(res, 400, 'badRequest');
    if (targetUid === decoded.uid) return sendApiError(res, 403, 'forbidden');

    const actorRef = db.collection('users').doc(decoded.uid);
    const targetRef = db.collection('users').doc(targetUid);
    let actorSnapshot;
    let targetSnapshot;
    try {
      [actorSnapshot, targetSnapshot] = await Promise.all([actorRef.get(), targetRef.get()]);
    } catch {
      logError('User deactivation authorization');
      return sendApiError(res, 500);
    }

    const actor = actorSnapshot.exists ? actorSnapshot.data() : null;
    if (!actor || actor.active !== true || actor.role !== 'admin') {
      return sendApiError(res, 403, 'forbidden');
    }
    if (!targetSnapshot.exists || targetSnapshot.data()?.deletedAt) {
      return sendApiError(res, 404, 'notFound');
    }

    let targetAuthUser;
    try {
      targetAuthUser = await admin.auth().getUser(targetUid);
    } catch {
      logError('User deactivation Auth lookup');
      return sendApiError(res, 500);
    }

    const previousAuthDisabled = targetAuthUser.disabled === true;
    try {
      await admin.auth().updateUser(targetUid, { disabled: true });
    } catch {
      logError('User deactivation Auth update');
      return sendApiError(res, 500);
    }

    try {
      const auditRef = db.collection('user_audit').doc();
      await db.runTransaction(async (transaction) => {
        const [latestActor, latestTarget] = await Promise.all([
          transaction.get(actorRef),
          transaction.get(targetRef),
        ]);
        const latestActorData = latestActor.exists ? latestActor.data() : null;
        const latestData = latestTarget.exists ? latestTarget.data() : null;
        if (!latestActorData || latestActorData.active !== true || latestActorData.role !== 'admin') {
          throw new Error('Actor is no longer authorized');
        }
        if (!latestData || latestData.deletedAt) throw new Error('Target user is unavailable');

        const timestamp = serverTimestamp();
        transaction.update(targetRef, {
          active: false,
          deletedAt: timestamp,
          deletedByUid: decoded.uid,
        });
        transaction.set(auditRef, {
          action: 'user.deactivated',
          actor_uid: decoded.uid,
          target_uid: targetUid,
          previous_active: latestData.active === true,
          previous_auth_disabled: previousAuthDisabled,
          target_role: latestData.role,
          createdAt: timestamp,
        });
      });
      return res.status(204).send();
    } catch {
      try {
        await admin.auth().updateUser(targetUid, { disabled: previousAuthDisabled });
      } catch {
        logError('User deactivation rollback');
      }
      logError('User deactivation transaction');
      return sendApiError(res, 500);
    }
  };
}

module.exports = { createDeactivateUserHandler, isValidUid };
