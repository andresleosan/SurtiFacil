import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onIdTokenChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  getDocs,
  getDoc,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { User, UserRole } from '../firebase/db';

const auth = getAuth();
const CLAIMS_SYNC_ERROR = 'No se pudieron sincronizar custom claims.';
const FIREBASE_CONFIG_ERROR = 'Firebase no esta configurado correctamente.';
const AUTH_INFRASTRUCTURE_ERROR = 'No se pudo verificar la sesión. Inténtalo de nuevo.';
const AUTH_LOGOUT_ERROR = 'No se pudo cerrar sesión. Inténtalo de nuevo.';
const AUTH_LOGIN_STALE_ERROR = 'No se pudo completar el inicio de sesión.';
const AUTH_UNAUTHENTICATED_ERROR = 'No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.';
const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;
const VALID_USER_ROLES = new Set<UserRole>(['admin', 'manager', 'cashier']);

export type AuthStateErrorCode = 'unauthenticated' | 'infrastructure' | 'logout';

export interface AuthStateError extends Error {
  code: AuthStateErrorCode;
}

function createAuthStateError(
  code: AuthStateErrorCode,
  message = code === 'unauthenticated'
    ? AUTH_UNAUTHENTICATED_ERROR
    : code === 'logout'
      ? AUTH_LOGOUT_ERROR
      : AUTH_INFRASTRUCTURE_ERROR,
): AuthStateError {
  const error = new Error(message) as AuthStateError;
  error.name = 'AuthStateError';
  error.code = code;
  return error;
}

export function getSafeAuthErrorMessage(
  error: unknown,
  fallback = 'No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.',
): string {
  const safeFallback = [AUTH_UNAUTHENTICATED_ERROR, AUTH_INFRASTRUCTURE_ERROR, AUTH_LOGOUT_ERROR].includes(fallback)
    ? fallback
    : AUTH_UNAUTHENTICATED_ERROR;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code) as AuthStateErrorCode;
    if (code === 'infrastructure') return AUTH_INFRASTRUCTURE_ERROR;
    if (code === 'logout') return AUTH_LOGOUT_ERROR;
    if (code === 'unauthenticated') return AUTH_UNAUTHENTICATED_ERROR;
  }
  return safeFallback;
}

/**
 * Sincroniza claims derivados para backend optimizado. El documento activo
 * del usuario sigue siendo la fuente de verdad para reglas y UI.
 */
async function syncCustomClaims(uid: string, expectedUser: FirebaseUser): Promise<void> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
  try {
    if (auth.currentUser !== expectedUser) throw new Error(CLAIMS_SYNC_ERROR);
    const idToken = await expectedUser.getIdToken();
    if (!idToken) throw new Error(CLAIMS_SYNC_ERROR);

    const response = await fetch(`${backendUrl}/api/auth/sync-claims`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid }),
    });

    if (!response.ok) throw new Error(CLAIMS_SYNC_ERROR);
    if (auth.currentUser !== expectedUser) throw new Error(CLAIMS_SYNC_ERROR);

    await expectedUser.getIdToken(true);
  } catch {
    if (auth.currentUser !== expectedUser) throw new Error(AUTH_LOGIN_STALE_ERROR);
    // Los claims son cache derivada (ADR-0001): reglas y backend leen /users/{uid}.
    // Sin backend disponible el login sigue siendo valido; solo se pierde la optimizacion.
    console.warn(CLAIMS_SYNC_ERROR);
  }
}

// Mock data for development without Firebase
let mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'admin@surtifacil.com',
    displayName: 'Administrador',
    role: 'admin',
    active: true,
    createdAt: new Date(),
  },
  {
    id: 'user-2',
    email: 'cajero@surtifacil.com',
    displayName: 'Cajero Principal',
    role: 'cashier',
    active: true,
    createdAt: new Date(),
  },
];

let currentUser: User | null = null;
let mockAuthListeners: Array<(user: User | null) => void> = [];
let authTransitionSequence = 0;

/**
 * Verifica si Firebase está configurado
 */
function isFirebaseConfigured(): boolean {
  return !!(db && typeof db === 'object' && REQUIRED_FIREBASE_ENV.every((key) => Boolean(import.meta.env[key])));
}

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function requireFirebaseConfiguration(): void {
  if (!isFirebaseConfigured()) throw new Error(FIREBASE_CONFIG_ERROR);
}

function isValidUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_USER_ROLES.has(role as UserRole);
}

function getSafeRegistrationError(error: unknown): string {
  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  const errorMessage = error instanceof Error ? error.message : '';
  const codeOrMessage = `${errorCode} ${errorMessage}`;

  if (codeOrMessage.includes('auth/email-already-in-use')) return 'El correo ya esta registrado';
  if (codeOrMessage.includes('auth/invalid-email')) return 'El correo electronico no es valido';
  if (codeOrMessage.includes('auth/weak-password')) return 'La contrasena no cumple los requisitos';
  if (errorMessage === CLAIMS_SYNC_ERROR) return CLAIMS_SYNC_ERROR;
  return 'No se pudo crear el usuario';
}

function notifyMockAuthState(): void {
  mockAuthListeners.forEach((listener) => listener(currentUser));
}

async function getFirebaseUserData(uid: string): Promise<Omit<User, 'id'> | null> {
  try {
    const snapshot = await getDoc(doc(db, 'users', uid));
    if (!snapshot.exists()) return null;

    const userData = snapshot.data() as Omit<User, 'id'>;
    return userData.active === true && isValidUserRole(userData.role) ? userData : null;
  } catch {
    throw createAuthStateError('infrastructure');
  }
}

async function mapFirebaseUser(
  firebaseUser: FirebaseUser,
  userData?: Omit<User, 'id'> | null,
): Promise<User | null> {
  const firestoreUser = userData === undefined
    ? await getFirebaseUserData(firebaseUser.uid)
    : userData;
  if (!firestoreUser || firestoreUser.active !== true || !isValidUserRole(firestoreUser.role)) return null;

  return {
    id: firebaseUser.uid,
    ...firestoreUser,
    role: firestoreUser.role,
  };
}

async function clearFirebaseSession(expectedUser: FirebaseUser): Promise<void> {
  if (auth.currentUser !== expectedUser) return;
  currentUser = null;
  try {
    await signOut(auth);
  } catch {
    // Keep the local session cleared if Firebase sign-out fails.
  }
}

/**
 * Suscribe la aplicación al estado de sesión de Firebase o del modo mock explícito.
 */
export function subscribeToAuthState(
  listener: (user: User | null, error?: AuthStateError) => void,
): () => void {
  if (isMockMode()) {
    mockAuthListeners.push(listener);
    listener(currentUser);
    return () => {
      mockAuthListeners = mockAuthListeners.filter((registered) => registered !== listener);
    };
  }

  if (!isFirebaseConfigured()) {
    currentUser = null;
    listener(null, createAuthStateError('infrastructure', FIREBASE_CONFIG_ERROR));
    return () => undefined;
  }

  let authStateSequence = 0;
  let disposed = false;
  let pendingInfrastructureError: AuthStateError | null = null;
  let unsubscribeUserDocument: (() => void) | null = null;

  const stopUserDocumentSubscription = () => {
    unsubscribeUserDocument?.();
    unsubscribeUserDocument = null;
  };

  const emitUserDocumentState = async (
    firebaseUser: FirebaseUser,
    userData: Omit<User, 'id'> | null,
    sequence: number,
  ) => {
    if (disposed || sequence !== authStateSequence || auth.currentUser !== firebaseUser) return;

    const mappedUser = await mapFirebaseUser(firebaseUser, userData);
    if (disposed || sequence !== authStateSequence || auth.currentUser !== firebaseUser) return;

    if (!mappedUser) {
      pendingInfrastructureError = null;
      await clearFirebaseSession(firebaseUser);
      if (disposed || sequence !== authStateSequence) return;
    }

    pendingInfrastructureError = null;
    currentUser = mappedUser;
    listener(mappedUser);
  };

  const unsubscribeAuth = onIdTokenChanged(auth, async (firebaseUser) => {
    const sequence = ++authStateSequence;
    stopUserDocumentSubscription();

    if (!firebaseUser) {
      currentUser = null;
      if (pendingInfrastructureError) listener(null, pendingInfrastructureError);
      else listener(null);
      return;
    }

    unsubscribeUserDocument = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snapshot) => {
        const userData = snapshot.exists()
          ? snapshot.data() as Omit<User, 'id'>
          : null;
        void emitUserDocumentState(firebaseUser, userData, sequence);
      },
      () => {
        if (disposed || sequence !== authStateSequence || auth.currentUser !== firebaseUser) return;
        console.error('Error observing user session.');
        pendingInfrastructureError = createAuthStateError('infrastructure');
        void clearFirebaseSession(firebaseUser).then(() => {
          if (disposed || sequence !== authStateSequence) return;
          currentUser = null;
          listener(null, pendingInfrastructureError ?? undefined);
        });
      },
    );
  });

  return () => {
    disposed = true;
    authStateSequence += 1;
    stopUserDocumentSubscription();
    unsubscribeAuth();
  };
}

/**
 * Registra un nuevo usuario en Firebase Auth y Firestore
 */
export async function registerUser(
  email: string,
  password: string,
  displayName: string,
  role: UserRole
): Promise<User> {
  if (isMockMode()) {
    // Modo mock
    const newUser: User = {
      id: `user-${Date.now()}`,
      email,
      displayName,
      role,
      active: true,
      createdAt: new Date(),
    };
    mockUsers.push(newUser);
    return newUser;
  }

  requireFirebaseConfiguration();

  try {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('No hay una sesion administrativa activa.');
    const idToken = await firebaseUser.getIdToken();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    const response = await fetch(`${backendUrl}/api/auth/provision-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ email, password, displayName, role }),
    });

    if (!response.ok) throw new Error('No se pudo crear el usuario');
    const userData = await response.json() as User;
    return {
      id: userData.id,
      email: userData.email,
      displayName: userData.displayName,
      role: userData.role,
      active: userData.active,
      createdAt: userData.createdAt,
    };
  } catch (error: any) {
    console.error('Error registering user.');
    throw new Error(getSafeRegistrationError(error));
  }
}

/**
 * Inicia sesión con email y password
 */
export async function loginUser(email: string, password: string): Promise<User> {
  if (isMockMode()) {
    // Modo mock
    const user = mockUsers.find(u => u.email === email);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
    if (user.active === false) {
      currentUser = null;
      notifyMockAuthState();
      throw new Error('Usuario inactivo');
    }
    currentUser = user;
    notifyMockAuthState();
    return user;
  }

  requireFirebaseConfiguration();

  const sequence = ++authTransitionSequence;
  let firebaseUser: FirebaseUser | null = null;
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    firebaseUser = userCredential.user;
    return await completeFirebaseLogin(firebaseUser, sequence);
  } catch (error: any) {
    if (firebaseUser) await clearFirebaseSession(firebaseUser);
    console.error('Error logging in.');
    throw error;
  }
}

const GOOGLE_POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);
const GOOGLE_CANCEL_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

function getFirebaseErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

/**
 * Inicia sesión con Google. Devuelve `null` si la persona cerró la ventana sin
 * completar el flujo. Cuando el navegador bloquea ventanas emergentes (PWA
 * instalada, WebViews) cae al flujo de redirección y la sesión se resuelve al
 * volver mediante `subscribeToAuthState`.
 */
export async function loginWithGoogle(): Promise<User | null> {
  if (isMockMode()) {
    const user = mockUsers.find((candidate) => candidate.role === 'admin' && candidate.active) ?? null;
    currentUser = user;
    notifyMockAuthState();
    return user;
  }

  requireFirebaseConfiguration();

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const sequence = ++authTransitionSequence;
  let firebaseUser: FirebaseUser | null = null;
  try {
    let userCredential;
    try {
      userCredential = await signInWithPopup(auth, provider);
    } catch (popupError) {
      const code = getFirebaseErrorCode(popupError);
      if (GOOGLE_CANCEL_CODES.has(code)) return null;
      if (GOOGLE_POPUP_FALLBACK_CODES.has(code)) {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw popupError;
    }
    firebaseUser = userCredential.user;
    return await completeFirebaseLogin(firebaseUser, sequence);
  } catch (error: any) {
    if (firebaseUser) await clearFirebaseSession(firebaseUser);
    console.error('Error logging in with Google.');
    throw error;
  }
}

/**
 * Valida el documento autoritativo del usuario recién autenticado, registra el
 * último acceso y sincroniza los claims derivados. Común a todos los proveedores.
 */
async function completeFirebaseLogin(firebaseUser: FirebaseUser, sequence: number): Promise<User> {
  if (auth.currentUser !== firebaseUser || sequence !== authTransitionSequence) {
    throw new Error(AUTH_LOGIN_STALE_ERROR);
  }

  const userRef = doc(db, 'users', firebaseUser.uid);
  let snapshot;
  try {
    snapshot = await getDoc(userRef);
  } catch {
    throw createAuthStateError('infrastructure');
  }

  if (!snapshot.exists()) {
    throw createAuthStateError('unauthenticated');
  }

  const userData = snapshot.data() as Omit<User, 'id'>;

  if (userData.active !== true) {
    throw createAuthStateError('unauthenticated');
  }

  if (!isValidUserRole(userData.role)) {
    throw createAuthStateError('unauthenticated');
  }

  if (auth.currentUser !== firebaseUser || sequence !== authTransitionSequence) {
    throw new Error(AUTH_LOGIN_STALE_ERROR);
  }

  try {
    await updateDoc(userRef, {
      lastLogin: serverTimestamp(),
    });
  } catch {
    throw createAuthStateError('infrastructure');
  }

  if (auth.currentUser !== firebaseUser || sequence !== authTransitionSequence) {
    throw new Error(AUTH_LOGIN_STALE_ERROR);
  }

  // Claims are derived for backend optimization; Firestore rules use the user document role.
  await syncCustomClaims(firebaseUser.uid, firebaseUser);

  if (auth.currentUser !== firebaseUser || sequence !== authTransitionSequence) {
    throw new Error(AUTH_LOGIN_STALE_ERROR);
  }

  const claimUser = await mapFirebaseUser(firebaseUser, userData);
  if (!claimUser) {
    throw createAuthStateError('unauthenticated');
  }
  currentUser = claimUser;

  return currentUser;
}

/**
 * Cierra la sesión actual
 */
export async function logoutUser(): Promise<void> {
  if (isMockMode()) {
    currentUser = null;
    notifyMockAuthState();
    return;
  }

  authTransitionSequence += 1;
  try {
    await signOut(auth);
    currentUser = null;
  } catch {
    console.error('Error logging out.');
    throw createAuthStateError('logout');
  }
}

/**
 * Obtiene el usuario actual
 */
export async function getCurrentUser(): Promise<User | null> {
  if (isMockMode()) {
    return currentUser;
  }
  if (!isFirebaseConfigured()) return null;

  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;

  const mappedUser = await mapFirebaseUser(firebaseUser);
  if (!mappedUser) await clearFirebaseSession(firebaseUser);
  return mappedUser;
}

/**
 * Obtiene todos los usuarios (solo admin)
 */
export async function getUsers(): Promise<User[]> {
  if (isMockMode()) {
    return mockUsers.filter((user) => !user.deletedAt);
  }

  requireFirebaseConfiguration();

  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    const users: User[] = [];

    snapshot.forEach((doc) => {
      const user = {
        id: doc.id,
        ...(doc.data() as Omit<User, 'id'>),
      };
      if (!user.deletedAt) users.push(user);
    });

    return users;
  } catch {
    console.error('Error getting users.');
    throw new Error('Error al cargar usuarios');
  }
}

/**
 * Actualiza el rol de un usuario (solo admin)
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  if (isMockMode()) {
    const user = mockUsers.find(u => u.id === userId);
    if (user) {
      user.role = role;
    }
    return;
  }

  requireFirebaseConfiguration();

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role });
  } catch {
    console.error('Error updating user role.');
    throw new Error('Error al actualizar rol');
  }
}

/**
 * Activa/desactiva un usuario (solo admin)
 */
export async function toggleUserActive(userId: string, active: boolean): Promise<void> {
  if (isMockMode()) {
    const user = mockUsers.find(u => u.id === userId);
    if (user) {
      user.active = active;
    }
    return;
  }

  requireFirebaseConfiguration();

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { active });
  } catch {
    console.error('Error toggling user status.');
    throw new Error('Error al actualizar estado');
  }
}

/**
 * Elimina un usuario (solo admin)
 */
export async function deleteUser(userId: string): Promise<void> {
  if (isMockMode()) {
    if (currentUser?.id === userId) throw new Error('No puedes eliminar tu propio usuario');
    mockUsers = mockUsers.map((user) => user.id === userId
      ? { ...user, active: false, deletedAt: new Date(), deletedByUid: currentUser?.id || 'mock-admin' }
      : user);
    return;
  }

  requireFirebaseConfiguration();

  try {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('No hay una sesion administrativa activa.');
    const idToken = await firebaseUser.getIdToken();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    const response = await fetch(`${backendUrl}/api/auth/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) throw new Error('Unable to deactivate user');
  } catch {
    console.error('Error deleting user.');
    throw new Error('Error al eliminar usuario');
  }
}

/**
 * Verifica si el usuario actual tiene un rol específico desde Firestore.
 */
export async function hasRoleAsync(role: UserRole): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === role;
}

/**
 * Verifica si el usuario actual es admin desde Firestore.
 */
export async function isAdminAsync(): Promise<boolean> {
  return hasRoleAsync('admin');
}

/**
 * Verifica si el usuario actual tiene un rol específico.
 * Solo funciona con el cache del modo mock explícito. En Firebase configurado
 * devuelve false para evitar autorizar antes de leer el documento vigente.
 */
export function hasRole(role: UserRole): boolean {
  if (!isMockMode()) return false;

  const user = currentUser;
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === role;
}

/**
 * Verifica si el usuario actual es admin (cache local).
 * Para gates de seguridad reales usar isAdminAsync().
 */
export function isAdmin(): boolean {
  return hasRole('admin');
}
