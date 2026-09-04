const fs = require('node:fs');
const path = require('node:path');

/**
 * firebase-admin >= 13 solo exporta la API modular desde `require('firebase-admin')`
 * (sin `admin.credential`, `admin.auth()` ni `admin.apps`). Esta fachada conserva la
 * superficie que usan las rutas del backend sobre los modulos `firebase-admin/app`,
 * `firebase-admin/auth` y `firebase-admin/firestore`.
 */
function createFirebaseAdminFacade({
  appModule = require('firebase-admin/app'),
  authModule = require('firebase-admin/auth'),
  firestoreModule = require('firebase-admin/firestore'),
} = {}) {
  return {
    initializeApp: (options) => appModule.initializeApp(options),
    get apps() {
      return appModule.getApps();
    },
    credential: {
      cert: (serviceAccount) => appModule.cert(serviceAccount),
      applicationDefault: () => appModule.applicationDefault(),
    },
    auth: () => authModule.getAuth(),
    firestore: {
      FieldValue: firestoreModule.FieldValue,
      Timestamp: firestoreModule.Timestamp,
    },
  };
}

function createFirebaseCredential({
  admin,
  env = process.env,
  readFileSync = fs.readFileSync,
  resolvePath = path.resolve,
}) {
  // Plataformas sin identidad de servicio (Vercel Functions): el JSON de la cuenta
  // de servicio llega como secreto de entorno, nunca como archivo en el repo/imagen.
  const inlineJson = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(inlineJson);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON');
    }
    return admin.credential.cert(serviceAccount);
  }

  const configuredPath = env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (!configuredPath) {
    return admin.credential.applicationDefault();
  }

  const absolutePath = resolvePath(configuredPath);
  const serviceAccount = JSON.parse(readFileSync(absolutePath, 'utf8'));
  return admin.credential.cert(serviceAccount);
}

function createFirebaseAppOptions({
  admin,
  env = process.env,
  readFileSync,
  resolvePath,
}) {
  const emulatorMode = env.FIREBASE_EMULATOR_MODE?.trim().toLowerCase() === 'true';
  if (!emulatorMode) {
    return {
      credential: createFirebaseCredential({
        admin,
        env,
        readFileSync,
        resolvePath,
      }),
    };
  }

  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error('Firebase emulator mode is only available in development or test');
  }

  const projectId = (env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT)?.trim();
  const firestoreHost = env.FIRESTORE_EMULATOR_HOST?.trim();
  const authHost = env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
  if (!projectId || !firestoreHost || !authHost) {
    throw new Error('Firebase emulator mode requires project and emulator hosts');
  }

  return { projectId };
}

function initializeFirebaseAdmin({
  admin,
  getFirestore,
  env = process.env,
  readFileSync,
  resolvePath,
}) {
  if (!Array.isArray(admin.apps) || admin.apps.length === 0) {
    const options = createFirebaseAppOptions({
      admin,
      env,
      readFileSync,
      resolvePath,
    });
    admin.initializeApp(options);
  }

  return getFirestore();
}

module.exports = {
  createFirebaseAdminFacade,
  createFirebaseAppOptions,
  createFirebaseCredential,
  initializeFirebaseAdmin,
};
