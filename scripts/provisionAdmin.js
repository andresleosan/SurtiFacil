#!/usr/bin/env node
/**
 * Provisiona (o repara) una cuenta administradora para SurtiFácil.
 *
 * Crea la cuenta en Firebase Authentication si no existe (con el correo verificado,
 * para que "Continuar con Google" se vincule a ella automáticamente), fija los claims
 * derivados y escribe el documento autoritativo `/users/{uid}` con rol y estado activo.
 *
 * Uso:
 *   node scripts/provisionAdmin.js --email andres@example.com --name "Andrés" [--role admin]
 *
 * Credenciales (una de las dos):
 *   - GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT_PATH apuntando al JSON de la
 *     cuenta de servicio, o
 *   - Application Default Credentials (`gcloud auth application-default login`).
 */
const path = require('node:path');

const VALID_ROLES = new Set(['admin', 'manager', 'cashier']);

function loadFirebaseAdmin() {
  const candidates = [path.join(__dirname, '..', 'backend'), path.join(__dirname, '..')];
  try {
    return require(require.resolve('firebase-admin', { paths: candidates }));
  } catch {
    console.error('ERROR: falta `firebase-admin`. Ejecuta `npm ci` dentro de backend/ primero.');
    process.exit(1);
  }
}

function parseArgs(argv) {
  const args = { role: 'admin' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--email') args.email = value?.trim().toLowerCase();
    if (flag === '--name') args.name = value?.trim();
    if (flag === '--role') args.role = value?.trim();
    if (flag?.startsWith('--')) index += 1;
  }
  if (!args.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
    console.error('ERROR: indica un correo válido con --email.');
    process.exit(1);
  }
  if (!VALID_ROLES.has(args.role)) {
    console.error(`ERROR: rol inválido "${args.role}". Usa admin, manager o cashier.`);
    process.exit(1);
  }
  args.name = args.name || args.email.split('@')[0];
  return args;
}

async function main() {
  const { email, name, role } = parseArgs(process.argv.slice(2));
  const admin = loadFirebaseAdmin();

  if (!admin.apps.length) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
    admin.initializeApp({
      credential: serviceAccountPath
        ? admin.credential.cert(require(path.resolve(serviceAccountPath)))
        : admin.credential.applicationDefault(),
    });
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let userRecord;
  let created = false;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    userRecord = await auth.createUser({ email, emailVerified: true, displayName: name });
    created = true;
  }

  await auth.setCustomUserClaims(userRecord.uid, {
    admin: role === 'admin',
    manager: role === 'admin' || role === 'manager',
    role,
  });

  const userRef = db.collection('users').doc(userRecord.uid);
  const snapshot = await userRef.get();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await userRef.set(
    {
      email,
      displayName: snapshot.exists && snapshot.get('displayName') ? snapshot.get('displayName') : name,
      role,
      active: true,
      ...(snapshot.exists ? {} : { createdAt: now }),
      deletedAt: admin.firestore.FieldValue.delete(),
      deletedByUid: admin.firestore.FieldValue.delete(),
    },
    { merge: true },
  );

  console.log(`${created ? 'Cuenta creada' : 'Cuenta existente'}: ${email}`);
  console.log(`uid: ${userRecord.uid}`);
  console.log(`rol: ${role} (activo). Ya puede entrar con correo/contraseña o "Continuar con Google".`);
  process.exit(0);
}

main().catch((error) => {
  console.error('ERROR:', error?.message || error);
  process.exit(1);
});
