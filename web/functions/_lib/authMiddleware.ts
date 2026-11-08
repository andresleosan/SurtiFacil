import { verifyFirebaseIdToken, DecodedFirebaseToken } from './firebaseAuth';
import { ensureDatabaseSchema } from './dbSchema';
import { D1Database, Env } from '../types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
  role: 'admin' | 'manager' | 'cashier';
  isSuperAdmin: boolean;
  negocioId: string;
}

export interface AuthContext {
  user: AuthenticatedUser;
  negocioId: string;
  token: DecodedFirebaseToken;
}

interface UserRow {
  id: string;
  negocio_id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_super_admin: number;
  active: number;
}

/**
 * Middleware para autenticar requests y extraer el usuario activo y su negocio_id.
 * Garantiza aislamiento multi-tenant estricto.
 */
export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<AuthContext> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No se proporcionó token de autorización Bearer.');
  }

  const token = authHeader.substring(7).trim();
  const projectId = (env.FIREBASE_PROJECT_ID as string) || 'surtifacilapp';
  const decoded = await verifyFirebaseIdToken(token, projectId);

  const db: D1Database = env.DB;
  if (!db) {
    throw new Error('Conexión a la base de datos D1 no disponible.');
  }

  // Asegurar que la base de datos D1 tenga el esquema multi-tenant actualizado y semillas
  await ensureDatabaseSchema(db);

  // 1. Buscar usuario por UID
  let userRow = await db
    .prepare('SELECT id, negocio_id, email, display_name, role, is_super_admin, active FROM users WHERE id = ?')
    .bind(decoded.uid)
    .first<UserRow>();

  // 2. Si no se encuentra por UID pero tenemos email, buscar por email (caso inicial/semillas/registro)
  if (!userRow && decoded.email) {
    const existingByEmail = await db
      .prepare('SELECT id, negocio_id, email, display_name, role, is_super_admin, active FROM users WHERE lower(email) = ?')
      .bind(decoded.email.toLowerCase())
      .first<UserRow>();

    if (existingByEmail) {
      await db
        .prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")
        .bind(existingByEmail.id)
        .run()
        .catch(() => {});

      userRow = existingByEmail;
    }
  }

  // 3. Auto-aprovisionamiento para SuperAdmin (andres.san1404@gmail.com) o cualquier cuenta autenticada válida (Google / Firebase / D1)
  if (!userRow && decoded.email) {
    const normalizedEmail = decoded.email.toLowerCase();
    const isSuper = normalizedEmail === 'andres.san1404@gmail.com' ? 1 : 0;
    const assignedRole =
      typeof decoded.role === 'string' && ['admin', 'manager', 'cashier'].includes(decoded.role)
        ? (decoded.role as 'admin' | 'manager' | 'cashier')
        : 'admin';
    const assignedNegocio =
      typeof decoded.negocioId === 'string' && decoded.negocioId.trim()
        ? decoded.negocioId.trim()
        : 'surtifacil';
    const displayName =
      decoded.name ||
      (isSuper ? 'Andrés Sánchez (SuperAdmin)' : normalizedEmail.split('@')[0] || 'Tendero SurtiFácil');

    await db
      .prepare(
        "INSERT OR IGNORE INTO users (id, negocio_id, email, display_name, role, is_super_admin, active, last_login) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))"
      )
      .bind(decoded.uid, assignedNegocio, normalizedEmail, displayName, assignedRole, isSuper)
      .run()
      .catch(() => {});

    userRow = {
      id: decoded.uid,
      negocio_id: assignedNegocio,
      email: normalizedEmail,
      display_name: displayName,
      role: assignedRole,
      is_super_admin: isSuper,
      active: 1,
    };
  }

  if (!userRow) {
    throw new Error('Usuario no registrado o pendiente de aprovisionamiento.');
  }

  if (userRow.active !== 1) {
    throw new Error('Usuario inactivo o suspendido.');
  }

  const isSuperAdmin = userRow.is_super_admin === 1;

  // Determinar negocio_id activo:
  // Si es SuperAdmin, se le permite operar con el negocio especificado en X-Negocio-Id
  let activeNegocioId = userRow.negocio_id;
  const requestedNegocioId = request.headers.get('X-Negocio-Id') || request.headers.get('x-negocio-id');
  if (isSuperAdmin && requestedNegocioId) {
    activeNegocioId = requestedNegocioId.trim();
  }

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name,
      role: (userRow.role as 'admin' | 'manager' | 'cashier') || 'cashier',
      isSuperAdmin,
      negocioId: userRow.negocio_id,
    },
    negocioId: activeNegocioId,
    token: decoded,
  };
}

