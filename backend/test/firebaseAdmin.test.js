const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createFirebaseAdminFacade,
  createFirebaseAppOptions,
  createFirebaseCredential,
  initializeFirebaseAdmin,
} = require('../firebaseAdmin');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'whatsapp-webhook.js'), 'utf8');

test('server binds Firebase Admin through the portable initializer without a default JSON key', () => {
  assert.match(serverSource, /initializeFirebaseAdmin\(\{ admin, getFirestore \}\)/);
  assert.doesNotMatch(serverSource, /\.\/serviceAccountKey\.json|credential\.cert\(/);
});

test('Firebase Admin uses Application Default Credentials when no local key path is configured', () => {
  let adcCalls = 0;
  const credential = createFirebaseCredential({
    admin: {
      credential: {
        applicationDefault: () => {
          adcCalls += 1;
          return { source: 'adc' };
        },
        cert: () => assert.fail('certificate credentials must not be used'),
      },
    },
    env: {},
    readFileSync: () => assert.fail('the filesystem must not be read'),
  });

  assert.deepEqual(credential, { source: 'adc' });
  assert.equal(adcCalls, 1);
});

test('Firebase Admin accepts an inline service-account JSON secret before any path or ADC', () => {
  const calls = [];
  const credential = createFirebaseCredential({
    admin: {
      credential: {
        applicationDefault: () => assert.fail('ADC must not be used with an inline secret'),
        cert: (value) => {
          calls.push(value);
          return { source: 'certificate' };
        },
      },
    },
    env: {
      FIREBASE_SERVICE_ACCOUNT_JSON: ' {"project_id":"vercel-project","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"} ',
      FIREBASE_SERVICE_ACCOUNT_PATH: 'ignored.json',
    },
    readFileSync: () => assert.fail('the filesystem must not be read'),
  });

  assert.deepEqual(credential, { source: 'certificate' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].project_id, 'vercel-project');
  assert.match(calls[0].private_key, /BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----/);
});

test('Firebase Admin rejects a malformed inline service-account JSON without logging it', () => {
  assert.throws(
    () => createFirebaseCredential({
      admin: { credential: { applicationDefault: () => assert.fail('must not fall back'), cert: () => assert.fail('must not cert') } },
      env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{not-json' },
    }),
    /FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON/,
  );
});

test('server only listens when executed directly, so it can run as a serverless function', () => {
  assert.match(serverSource, /if \(require\.main === module\) app\.listen\(PORT/);
  assert.match(serverSource, /module\.exports = app;/);
});

test('Firebase Admin accepts an explicit local service-account path without a default key fallback', () => {
  const calls = [];
  const credential = createFirebaseCredential({
    admin: {
      credential: {
        applicationDefault: () => assert.fail('ADC must not be used for an explicit path'),
        cert: (value) => {
          calls.push(['cert', value]);
          return { source: 'certificate' };
        },
      },
    },
    env: { FIREBASE_SERVICE_ACCOUNT_PATH: '  local/firebase.json  ' },
    resolvePath: (value) => path.join('resolved', value),
    readFileSync: (value, encoding) => {
      calls.push(['read', value, encoding]);
      return '{"project_id":"staging-project"}';
    },
  });

  assert.deepEqual(credential, { source: 'certificate' });
  assert.deepEqual(calls, [
    ['read', path.join('resolved', 'local/firebase.json'), 'utf8'],
    ['cert', { project_id: 'staging-project' }],
  ]);
});

test('Firebase Admin emulator mode uses an explicit project without loading credentials', () => {
  const options = createFirebaseAppOptions({
    admin: {
      credential: {
        applicationDefault: () => assert.fail('ADC must not be used in emulator mode'),
        cert: () => assert.fail('certificate credentials must not be used in emulator mode'),
      },
    },
    env: {
      NODE_ENV: 'development',
      FIREBASE_EMULATOR_MODE: 'true',
      FIREBASE_PROJECT_ID: '  demo-surtifacil  ',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    },
    readFileSync: () => assert.fail('the filesystem must not be read in emulator mode'),
  });

  assert.deepEqual(options, { projectId: 'demo-surtifacil' });
});

test('Firebase Admin emulator mode is rejected in production and when configuration is incomplete', () => {
  const admin = {
    credential: {
      applicationDefault: () => assert.fail('ADC must not be used for invalid emulator config'),
    },
  };

  assert.throws(
    () => createFirebaseAppOptions({
      admin,
      env: {
        NODE_ENV: 'production',
        FIREBASE_EMULATOR_MODE: 'true',
        FIREBASE_PROJECT_ID: 'demo-surtifacil',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      },
    }),
    /only available in development or test/,
  );

  assert.throws(
    () => createFirebaseAppOptions({
      admin,
      env: {
        FIREBASE_EMULATOR_MODE: 'true',
        FIREBASE_PROJECT_ID: 'demo-surtifacil',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      },
    }),
    /only available in development or test/,
  );

  assert.throws(
    () => createFirebaseAppOptions({
      admin,
      env: {
        NODE_ENV: 'development',
        FIREBASE_EMULATOR_MODE: 'true',
        FIREBASE_PROJECT_ID: 'demo-surtifacil',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      },
    }),
    /requires project and emulator hosts/,
  );
});

test('Firebase Admin initializes once and returns Firestore without exposing credential details', () => {
  const initialized = [];
  const db = { name: 'firestore' };
  const admin = {
    apps: [],
    credential: {
      applicationDefault: () => ({ source: 'adc' }),
    },
    initializeApp: (options) => {
      initialized.push(options);
      admin.apps.push({ name: 'default' });
    },
  };

  const first = initializeFirebaseAdmin({ admin, getFirestore: () => db, env: {} });
  const second = initializeFirebaseAdmin({ admin, getFirestore: () => db, env: {} });

  assert.equal(first, db);
  assert.equal(second, db);
  assert.deepEqual(initialized, [{ credential: { source: 'adc' } }]);
});

test('the admin facade exposes the legacy surface over the modular firebase-admin 14 modules', () => {
  const facade = createFirebaseAdminFacade();
  assert.equal(typeof facade.initializeApp, 'function');
  assert.equal(typeof facade.credential.cert, 'function');
  assert.equal(typeof facade.credential.applicationDefault, 'function');
  assert.equal(typeof facade.auth, 'function');
  assert.ok(Array.isArray(facade.apps));
  assert.equal(typeof facade.firestore.FieldValue.serverTimestamp, 'function');
  assert.match(serverSource, /const admin = createFirebaseAdminFacade\(\);/);
  assert.doesNotMatch(serverSource, /require\('firebase-admin'\)/);
});

test('the admin facade initializes with an inline service account and resolves auth lazily', () => {
  const calls = [];
  const facade = createFirebaseAdminFacade({
    appModule: {
      initializeApp: (options) => { calls.push(['init', options]); return { name: 'app' }; },
      getApps: () => [],
      cert: (value) => ({ certified: value.project_id }),
      applicationDefault: () => assert.fail('ADC must not be used'),
    },
    authModule: { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'u1' }) }) },
    firestoreModule: { FieldValue: { serverTimestamp: () => 'ts' }, Timestamp: {} },
  });

  const firestore = initializeFirebaseAdmin({
    admin: facade,
    getFirestore: () => 'firestore',
    env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"p","client_email":"e","private_key":"k"}' },
  });

  assert.equal(firestore, 'firestore');
  assert.deepEqual(calls, [['init', { credential: { certified: 'p' } }]]);
  assert.equal(typeof facade.auth().verifyIdToken, 'function');
});
