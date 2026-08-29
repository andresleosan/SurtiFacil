const fs = require('node:fs');
const path = require('node:path');

function createFirebaseCredential({
  admin,
  env = process.env,
  readFileSync = fs.readFileSync,
  resolvePath = path.resolve,
}) {
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
  createFirebaseAppOptions,
  createFirebaseCredential,
  initializeFirebaseAdmin,
};
