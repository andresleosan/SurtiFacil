const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProvisionUserHandler,
  createRateLimiter,
} = require('../userProvisioning');

function responseDouble() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function firebaseDouble({ adminData = { active: true, role: 'admin' }, failUserDoc = false } = {}) {
  const calls = {
    createUser: [],
    setClaims: [],
    setDoc: [],
    deleteUser: [],
  };
  const adminUserDoc = {
    exists: Boolean(adminData),
    data: () => adminData,
  };
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => adminUserDoc,
        set: async (data) => {
          calls.setDoc.push(data);
          if (failUserDoc) throw new Error('firestore unavailable');
        },
      }),
    }),
  };
  const admin = {
    firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } },
    auth: () => ({
      verifyIdToken: async () => ({ uid: 'admin-1' }),
      createUser: async (data) => {
        calls.createUser.push(data);
        return { uid: 'created-1' };
      },
      setCustomUserClaims: async (uid, claims) => calls.setClaims.push({ uid, claims }),
      deleteUser: async (uid) => calls.deleteUser.push(uid),
    }),
  };
  return { admin, db, calls };
}

const validRequest = {
  headers: { authorization: 'Bearer valid-token' },
  body: {
    email: 'employee@example.com',
    password: 'secret123',
    displayName: 'Employee Example',
    role: 'cashier',
  },
};

test('provisions an Auth user, derived claims, and the Firestore document', async () => {
  const firebase = firebaseDouble();
  const res = responseDouble();
  const handler = createProvisionUserHandler(firebase);

  await handler(validRequest, res);

  assert.equal(res.statusCode, 201);
  assert.equal(firebase.calls.createUser[0].password, 'secret123');
  assert.deepEqual(firebase.calls.setClaims[0], {
    uid: 'created-1',
    claims: { admin: false, manager: false },
  });
  assert.equal(firebase.calls.setDoc[0].role, 'cashier');
  assert.deepEqual(firebase.calls.deleteUser, []);
});

test('rejects missing auth, inactive users, and invalid input', async () => {
  const missingAuth = firebaseDouble();
  const handler = createProvisionUserHandler(missingAuth);
  const missingAuthResponse = responseDouble();
  await handler({ headers: {}, body: validRequest.body }, missingAuthResponse);
  assert.equal(missingAuthResponse.statusCode, 401);

  const inactive = firebaseDouble({ adminData: { active: false, role: 'admin' } });
  const inactiveResponse = responseDouble();
  await createProvisionUserHandler(inactive)(validRequest, inactiveResponse);
  assert.equal(inactiveResponse.statusCode, 403);

  const invalidResponse = responseDouble();
  await handler({ ...validRequest, body: { ...validRequest.body, role: 'owner' } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
});

test('rejects an authenticated active non-admin caller', async () => {
  const firebase = firebaseDouble({ adminData: { active: true, role: 'manager' } });
  const res = responseDouble();

  await createProvisionUserHandler(firebase)(validRequest, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(firebase.calls.createUser, []);
});

test('deletes the Auth user when Firestore provisioning fails', async () => {
  const firebase = firebaseDouble({ failUserDoc: true });
  const res = responseDouble();

  await createProvisionUserHandler(firebase)(validRequest, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(firebase.calls.deleteUser, ['created-1']);
  assert.equal(res.body.error, 'Unable to provision user');
});

test('enforces a finite per-admin rate limit', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 10 });
  assert.equal(limiter.consume('admin-1').allowed, true);
  assert.equal(limiter.consume('admin-1').allowed, true);
  assert.equal(limiter.consume('admin-1').allowed, false);
  assert.equal(limiter.consume('admin-2').allowed, true);
});

test('expires rate-limit entries and bounds the entry map', () => {
  let now = 10;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, maxEntries: 2, now: () => now });

  limiter.consume('admin-1');
  limiter.consume('admin-2');
  limiter.consume('admin-3');
  assert.equal(limiter.size(), 2);

  now = 1010;
  limiter.consume('admin-4');
  assert.equal(limiter.size(), 1);
});

test('returns 429 with Retry-After after the finite provisioning limit', async () => {
  const firebase = firebaseDouble();
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 10 });
  const handler = createProvisionUserHandler({ ...firebase, rateLimiter: limiter });
  const firstResponse = responseDouble();
  const limitedResponse = responseDouble();

  await handler(validRequest, firstResponse);
  await handler(validRequest, limitedResponse);

  assert.equal(firstResponse.statusCode, 201);
  assert.equal(limitedResponse.statusCode, 429);
  assert.equal(limitedResponse.headers['Retry-After'], '1');
});
