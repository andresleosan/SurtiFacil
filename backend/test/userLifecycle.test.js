const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createDeactivateUserHandler, isValidUid } = require('../userLifecycle');
const { createRateLimiter } = require('../userProvisioning');

function responseDouble() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
    send() { this.body = undefined; return this; },
  };
}

function firebaseDouble({
  actor = { active: true, role: 'admin' },
  target = { active: true, role: 'cashier' },
  failTransaction = false,
  transactionActor,
} = {}) {
  const users = new Map([
    ['admin-1', actor],
    ['target-1', target],
  ]);
  const calls = { authUpdates: [], auditWrites: [], userUpdates: [], logs: [] };
  const makeSnapshot = (uid) => ({
    exists: users.has(uid),
    data: () => users.get(uid),
  });
  const makeUserRef = (uid) => ({ uid, get: async () => makeSnapshot(uid) });
  const auditRef = { id: 'audit-1' };
  const db = {
    collection(name) {
      return {
        doc(uid) {
          if (name === 'user_audit') return auditRef;
          return makeUserRef(uid);
        },
      };
    },
    async runTransaction(callback) {
      if (failTransaction) throw new Error('firestore token=secret');
      if (transactionActor) users.set('admin-1', transactionActor);
      return callback({
        get: async (ref) => makeSnapshot(ref.uid),
        update: (ref, data) => {
          calls.userUpdates.push({ uid: ref.uid, data });
          users.set(ref.uid, { ...users.get(ref.uid), ...data });
        },
        set: (_ref, data) => calls.auditWrites.push(data),
      });
    },
  };
  const admin = {
    firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } },
    auth: () => ({
      verifyIdToken: async () => ({ uid: 'admin-1' }),
      getUser: async () => ({ uid: 'target-1', disabled: false }),
      updateUser: async (uid, data) => calls.authUpdates.push({ uid, data }),
    }),
  };
  return { admin, db, calls, logError: (context) => calls.logs.push(context) };
}

function request(uid = 'target-1') {
  return { headers: { authorization: 'Bearer valid-token' }, params: { uid } };
}

test('validates Firebase-compatible UIDs without allowing path separators or controls', () => {
  assert.equal(isValidUid('target_1-abc:123'), true);
  assert.equal(isValidUid(''), false);
  assert.equal(isValidUid('nested/user'), false);
  assert.equal(isValidUid(`bad\nuid`), false);
  assert.equal(isValidUid('a'.repeat(129)), false);
});

test('disables Auth and atomically writes the user tombstone plus audit event', async () => {
  const firebase = firebaseDouble();
  const res = responseDouble();

  await createDeactivateUserHandler(firebase)(request(), res);

  assert.equal(res.statusCode, 204);
  assert.deepEqual(firebase.calls.authUpdates, [{ uid: 'target-1', data: { disabled: true } }]);
  assert.deepEqual(firebase.calls.userUpdates[0], {
    uid: 'target-1',
    data: { active: false, deletedAt: 'server-timestamp', deletedByUid: 'admin-1' },
  });
  assert.deepEqual(firebase.calls.auditWrites[0], {
    action: 'user.deactivated',
    actor_uid: 'admin-1',
    target_uid: 'target-1',
    previous_active: true,
    previous_auth_disabled: false,
    target_role: 'cashier',
    createdAt: 'server-timestamp',
  });
});

test('rejects missing auth, non-admin actors, self-deactivation, and invalid UIDs', async () => {
  const missing = firebaseDouble();
  const missingResponse = responseDouble();
  await createDeactivateUserHandler(missing)({ headers: {}, params: { uid: 'target-1' } }, missingResponse);
  assert.equal(missingResponse.statusCode, 401);

  const manager = firebaseDouble({ actor: { active: true, role: 'manager' } });
  const managerResponse = responseDouble();
  await createDeactivateUserHandler(manager)(request(), managerResponse);
  assert.equal(managerResponse.statusCode, 403);

  const inactive = firebaseDouble({ actor: { active: false, role: 'admin' } });
  const inactiveResponse = responseDouble();
  await createDeactivateUserHandler(inactive)(request(), inactiveResponse);
  assert.equal(inactiveResponse.statusCode, 403);

  const self = firebaseDouble();
  const selfResponse = responseDouble();
  await createDeactivateUserHandler(self)(request('admin-1'), selfResponse);
  assert.equal(selfResponse.statusCode, 403);

  const invalid = firebaseDouble();
  const invalidResponse = responseDouble();
  await createDeactivateUserHandler(invalid)(request('nested/user'), invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
});

test('binds the lifecycle handler to the frontend DELETE contract', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'whatsapp-webhook.js'), 'utf8');

  assert.match(serverSource, /app\.delete\('\/api\/auth\/users\/:uid', deactivateUser\);/);
});

test('restores the previous Auth disabled state when the Firestore transaction fails', async () => {
  const firebase = firebaseDouble({ failTransaction: true });
  const res = responseDouble();

  await createDeactivateUserHandler(firebase)(request(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(firebase.calls.authUpdates, [
    { uid: 'target-1', data: { disabled: true } },
    { uid: 'target-1', data: { disabled: false } },
  ]);
  assert.deepEqual(res.body, { error: 'Error interno del servidor' });
  assert.deepEqual(firebase.calls.logs, ['User deactivation transaction']);
});

test('rechecks the actor inside the transaction and rolls Auth back after a concurrent role change', async () => {
  const firebase = firebaseDouble({ transactionActor: { active: true, role: 'manager' } });
  const res = responseDouble();

  await createDeactivateUserHandler(firebase)(request(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(firebase.calls.authUpdates, [
    { uid: 'target-1', data: { disabled: true } },
    { uid: 'target-1', data: { disabled: false } },
  ]);
  assert.deepEqual(firebase.calls.auditWrites, []);
  assert.deepEqual(firebase.calls.userUpdates, []);
});

test('rate limits repeated deactivation attempts per authenticated admin', async () => {
  const firebase = firebaseDouble();
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 10 });
  const handler = createDeactivateUserHandler({ ...firebase, rateLimiter: limiter });
  const first = responseDouble();
  const limited = responseDouble();

  await handler(request(), first);
  await handler(request(), limited);

  assert.equal(first.statusCode, 204);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Retry-After'], '1');
});
