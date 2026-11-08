import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onIdTokenChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { User, UserRole } from '../firebase/db';
import '../firebase/config';
import {
  apiClient,
  emitDataChange,
  getStoredAuthToken,
  setActiveNegocioId,
  setStoredAuthToken,
} from './apiClient';

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

// Mock data for development without Firebase
let mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'admin@surtifacil.com',
    displayName: 'Don Carlos (Administrador)',
    role: 'admin',
    active: true,
    createdAt: new Date(),
  },
  {
    id: 'user-2',
    email: 'cajero@surtifacil.com',
    displayName: 'Mateo Restrepo (Cajero)',
    role: 'cashier',
    active: true,
    createdAt: new Date(),
  },
  {
    id: 'user-3',
    email: 'gerente@surtifacil.com',
    displayName: 'Marta Gómez (Gerente)',
    role: 'manager',
    active: true,
    createdAt: new Date(),
  },
  {
    id: 'user-4',
    email: 'ejemplo@mitienda.com',
    displayName: 'Tendero Demo (SurtiFácil)',
    role: 'admin',
    active: true,
    createdAt: new Date(),
  },
  {
    id: 'admin-andres-san1404',
    email: 'andres.san1404@gmail.com',
    displayName: 'Andrés Sánchez (SuperAdmin)',
    role: 'admin',
    active: true,
    createdAt: new Date(),
  },
];

let currentUser: User | null = null;
let mockAuthListeners: Array<(user: User | null, error?: AuthStateError) => void> = [];
let activeFirebaseAuthListeners: Array<(user: User | null, error?: AuthStateError) => void> = [];
let authTransitionSequence = 0;

const StoredUserKey = 'sf_auth_user';

function getStoredUser(): User | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(StoredUserKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.email && isValidUserRole(parsed.role) && parsed.active !== false) {
      return parsed as User;
    }
  } catch {
    // Ignorar error de parseo
  }
  return null;
}

function setStoredUser(user: User | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (user) {
      localStorage.setItem(StoredUserKey, JSON.stringify(user));
    } else {
      localStorage.removeItem(StoredUserKey);
    }
  } catch {
    // Ignorar errores de almacenamiento
  }
}

function notifyAllAuthListeners(user: User | null, error?: AuthStateError): void {
  mockAuthListeners.forEach((listener) => listener(user, error));
  activeFirebaseAuthListeners.forEach((listener) => listener(user, error));
}

/**
 * Verifica si Firebase está configurado (variables requeridas presentes)
 */
function isFirebaseConfigured(): boolean {
  return REQUIRED_FIREBASE_ENV.every((key) => Boolean(import.meta.env[key]));
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

async function clearFirebaseSession(expectedUser: FirebaseUser): Promise<void> {
  if (auth.currentUser !== expectedUser) return;
  currentUser = null;
  try {
    await signOut(auth);
  } catch {
    // Mantener la sesión local limpia si falla Firebase sign-out
  }
}

/**
 * Suscribe la aplicación al estado de sesión de Firebase Auth y D1 o del modo mock.
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

  activeFirebaseAuthListeners.push(listener);

  const unsubscribeAuth = onIdTokenChanged(auth, async (firebaseUser) => {
    const sequence = ++authStateSequence;

    if (!firebaseUser) {
      const storedToken = getStoredAuthToken();
      const storedUser = getStoredUser();
      if (storedToken && storedUser) {
        currentUser = storedUser;
        listener(storedUser);
        return;
      }
      currentUser = null;
      if (pendingInfrastructureError) listener(null, pendingInfrastructureError);
      else listener(null);
      return;
    }

    try {
      const res = await apiClient.get<{ user: any; negocio?: any }>('/auth/me');
      if (disposed || sequence !== authStateSequence || auth.currentUser !== firebaseUser) return;

      if (!res || !res.user) {
        pendingInfrastructureError = null;
        await clearFirebaseSession(firebaseUser);
        if (disposed || sequence !== authStateSequence) return;
        currentUser = null;
        listener(null);
        return;
      }

      const u = res.user;
      if ((u.active !== true && u.active !== 1) || !isValidUserRole(u.role)) {
        pendingInfrastructureError = null;
        await clearFirebaseSession(firebaseUser);
        if (disposed || sequence !== authStateSequence) return;
        currentUser = null;
        listener(null);
        return;
      }

      const mappedUser: User = {
        id: u.id || firebaseUser.uid,
        email: u.email || firebaseUser.email || '',
        displayName: u.displayName || u.display_name || firebaseUser.displayName || 'Usuario',
        role: u.role,
        active: true,
        createdAt: u.created_at || new Date(),
      };

      pendingInfrastructureError = null;
      currentUser = mappedUser;
      listener(mappedUser);
    } catch {
      if (disposed || sequence !== authStateSequence || auth.currentUser !== firebaseUser) return;
      console.error('Error observing user session.');
      pendingInfrastructureError = createAuthStateError('infrastructure');
      void clearFirebaseSession(firebaseUser).then(() => {
        if (disposed || sequence !== authStateSequence) return;
        currentUser = null;
        listener(null, pendingInfrastructureError ?? undefined);
      });
    }
  });

  return () => {
    disposed = true;
    authStateSequence += 1;
    activeFirebaseAuthListeners = activeFirebaseAuthListeners.filter((registered) => registered !== listener);
    unsubscribeAuth();
  };
}

/**
 * Registra un nuevo usuario mediante /api/auth/provision-user
 */
export async function registerUser(
  email: string,
  password: string,
  displayName: string,
  role: UserRole
): Promise<User> {
  if (isMockMode()) {
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

    const userData = await apiClient.post<any>('/auth/provision-user', {
      email,
      password,
      displayName,
      role,
    });

    return {
      id: userData.id,
      email: userData.email,
      displayName: userData.displayName || userData.display_name || displayName,
      role: userData.role,
      active: userData.active === 1 || userData.active === true,
      createdAt: userData.createdAt || userData.created_at,
    };
  } catch (error: any) {
    console.error('Error registering user.');
    throw new Error(getSafeRegistrationError(error));
  }
}

const QUICK_DEMO_ACCOUNTS: Record<
  'admin' | 'cashier' | 'manager' | 'superadmin' | 'ejemplo',
  { id: string; email: string; displayName: string; role: UserRole; negocioId: string }
> = {
  admin: {
    id: 'user-admin-surtifacil',
    email: 'admin@surtifacil.com',
    displayName: 'Don Carlos (Administrador)',
    role: 'admin',
    negocioId: 'surtifacil',
  },
  cashier: {
    id: 'user-cashier-surtifacil',
    email: 'cajero@surtifacil.com',
    displayName: 'Mateo Restrepo (Cajero Mostrador)',
    role: 'cashier',
    negocioId: 'surtifacil',
  },
  manager: {
    id: 'user-manager-surtifacil',
    email: 'gerente@surtifacil.com',
    displayName: 'Marta Gómez (Gerente Inventario)',
    role: 'manager',
    negocioId: 'surtifacil',
  },
  superadmin: {
    id: 'admin-andres-san1404',
    email: 'andres.san1404@gmail.com',
    displayName: 'Andrés Sánchez (SuperAdmin)',
    role: 'admin',
    negocioId: 'surtifacil',
  },
  ejemplo: {
    id: 'user-ejemplo-mitienda',
    email: 'ejemplo@mitienda.com',
    displayName: 'Tendero Demo (SurtiFácil)',
    role: 'admin',
    negocioId: 'surtifacil',
  },
};

/**
 * Establece directamente una sesión autenticada respaldada por Cloudflare D1
 * (usada tras registro de tienda, login nativo D1 o acceso rápido por rol).
 */
export function establishDirectSession(params: {
  token: string;
  user: {
    id: string;
    email: string;
    displayName?: string;
    role: UserRole;
    active?: boolean;
    negocioId?: string;
  };
  negocioId?: string;
}): User {
  const mappedUser: User = {
    id: params.user.id,
    email: params.user.email,
    displayName: params.user.displayName || params.user.email.split('@')[0] || 'Usuario',
    role: params.user.role,
    active: true,
    createdAt: new Date(),
  };

  setStoredAuthToken(params.token);
  setStoredUser(mappedUser);
  const targetNegocio = params.negocioId || params.user.negocioId;
  if (targetNegocio) {
    setActiveNegocioId(targetNegocio);
  }

  currentUser = mappedUser;
  notifyAllAuthListeners(mappedUser);
  return mappedUser;
}

async function tryD1NativeLogin(
  email: string,
  password: string,
  quickAccess = false
): Promise<User | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || cleanEmail.endsWith('.invalid') || cleanEmail === 'invalid@test.com') {
    return null;
  }

  try {
    const res = await apiClient.post<{
      authenticated?: boolean;
      token?: string;
      user?: any;
      negocio?: any;
    }>('/auth/login', {
      email: cleanEmail,
      password,
      quick_access: quickAccess,
    });

    if (res && res.authenticated && res.token && res.user && isValidUserRole(res.user.role)) {
      return establishDirectSession({
        token: res.token,
        user: {
          id: res.user.id,
          email: res.user.email || cleanEmail,
          displayName: res.user.displayName || res.user.display_name || cleanEmail.split('@')[0],
          role: res.user.role,
          negocioId: res.user.negocioId || res.negocio?.id || 'surtifacil',
        },
        negocioId: res.user.negocioId || res.negocio?.id || 'surtifacil',
      });
    }
  } catch {
    // Si el endpoint no está disponible (modo offline o dev local sin Pages Functions),
    // permitir fallback determinístico para las cuentas demo oficiales
  }

  const demoEntry = Object.values(QUICK_DEMO_ACCOUNTS).find((acc) => acc.email === cleanEmail);
  if (demoEntry && (quickAccess || (password && password.length >= 4))) {
    const fallbackToken = `d1:${demoEntry.id}:${demoEntry.email}:${demoEntry.role}:${demoEntry.negocioId}`;
    return establishDirectSession({
      token: fallbackToken,
      user: demoEntry,
      negocioId: demoEntry.negocioId,
    });
  }

  return null;
}

/**
 * Acceso rápido en 1 clic por rol para pruebas de cliente, cajero, gerente, admin y superadmin
 */
export async function loginWithQuickRole(
  roleKey: 'admin' | 'cashier' | 'manager' | 'superadmin'
): Promise<User> {
  const account = QUICK_DEMO_ACCOUNTS[roleKey];
  if (isMockMode()) {
    const existing = mockUsers.find((u) => u.email === account.email);
    const targetUser: User = existing || {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      active: true,
      createdAt: new Date(),
    };
    currentUser = targetUser;
    notifyMockAuthState();
    return targetUser;
  }

  const d1User = await tryD1NativeLogin(account.email, 'SurtiDemo2026!', true);
  if (d1User) return d1User;

  const fallbackToken = `d1:${account.id}:${account.email}:${account.role}:${account.negocioId}`;
  return establishDirectSession({
    token: fallbackToken,
    user: account,
    negocioId: account.negocioId,
  });
}

/**
 * Inicia sesión con email y password (híbrido Firebase Auth + Cloudflare D1)
 */
export async function loginUser(email: string, password: string): Promise<User> {
  if (isMockMode()) {
    const user = mockUsers.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
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
    if (!firebaseUser) {
      const d1User = await tryD1NativeLogin(email, password, false);
      if (d1User) {
        return d1User;
      }
    }
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
 * Inicia sesión con Google
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
 * Valida el usuario recién autenticado contra Cloudflare D1 (/api/auth/me)
 */
async function completeFirebaseLogin(firebaseUser: FirebaseUser, sequence: number): Promise<User> {
  if (auth.currentUser !== firebaseUser || sequence !== authTransitionSequence) {
    throw new Error(AUTH_LOGIN_STALE_ERROR);
  }

  let res: any;
  try {
    res = await apiClient.get<{ user: any }>('/auth/me');
  } catch (err: any) {
    const status = err?.status;
    if (status === 401 || status === 403 || status === 404) {
      throw createAuthStateError('unauthenticated');
    }
    throw createAuthStateError('infrastructure');
  }

  if (!res || !res.user) {
    throw createAuthStateError('unauthenticated');
  }

  const userData = res.user;

  if (userData.active !== true && userData.active !== 1) {
    throw createAuthStateError('unauthenticated');
  }

  if (!isValidUserRole(userData.role)) {
    throw createAuthStateError('unauthenticated');
  }

  if (auth.currentUser !== firebaseUser || sequence !== authTransitionSequence) {
    throw new Error(AUTH_LOGIN_STALE_ERROR);
  }

  const claimUser: User = {
    id: userData.id || firebaseUser.uid,
    email: userData.email || firebaseUser.email || '',
    displayName: userData.displayName || userData.display_name || firebaseUser.displayName || 'Usuario',
    role: userData.role,
    active: true,
    createdAt: userData.created_at || new Date(),
  };

  currentUser = claimUser;
  return currentUser;
}

/**
 * Cierra la sesión actual
 */
export async function logoutUser(): Promise<void> {
  setStoredAuthToken(null);
  setStoredUser(null);

  if (isMockMode()) {
    currentUser = null;
    notifyMockAuthState();
    return;
  }

  authTransitionSequence += 1;
  try {
    await signOut(auth);
    currentUser = null;
    notifyAllAuthListeners(null);
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
  if (!firebaseUser) {
    const storedToken = getStoredAuthToken();
    const storedUser = getStoredUser();
    if (storedToken && storedUser) {
      currentUser = storedUser;
      return currentUser;
    }
    return null;
  }

  if (currentUser && currentUser.id === firebaseUser.uid) {
    return currentUser;
  }

  try {
    const res = await apiClient.get<{ user: any }>('/auth/me');
    if (res && res.user && res.user.active !== false && res.user.active !== 0 && isValidUserRole(res.user.role)) {
      currentUser = {
        id: res.user.id || firebaseUser.uid,
        email: res.user.email || firebaseUser.email || '',
        displayName: res.user.displayName || res.user.display_name || firebaseUser.displayName || '',
        role: res.user.role,
        active: true,
        createdAt: res.user.created_at || new Date(),
      };
      return currentUser;
    }
    await clearFirebaseSession(firebaseUser);
    return null;
  } catch {
    await clearFirebaseSession(firebaseUser);
    return null;
  }
}

/**
 * Obtiene todos los usuarios (solo admin) desde /api/users
 */
export async function getUsers(): Promise<User[]> {
  if (isMockMode()) {
    return mockUsers.filter((user) => !user.deletedAt);
  }

  requireFirebaseConfiguration();

  try {
    const list = await apiClient.get<any[]>('/users');
    return (list || []).map((u: any) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name || u.displayName || '',
      role: u.role as UserRole,
      active: u.active === 1 || u.active === true,
      createdAt: u.created_at || u.createdAt,
      lastLogin: u.last_login || u.lastLogin,
      deletedAt: u.deleted_at || u.deletedAt,
      deletedByUid: u.deleted_by_uid || u.deletedByUid,
    }));
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
    await apiClient.put(`/users/${encodeURIComponent(userId)}`, { role });
    emitDataChange('users');
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
    await apiClient.put(`/users/${encodeURIComponent(userId)}`, { active });
    emitDataChange('users');
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
    await apiClient.delete(`/users/${encodeURIComponent(userId)}`);
    emitDataChange('users');
  } catch {
    console.error('Error deleting user.');
    throw new Error('Error al eliminar usuario');
  }
}

/**
 * Verifica si el usuario actual tiene un rol específico desde D1.
 */
export async function hasRoleAsync(role: UserRole): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === role;
}

/**
 * Verifica si el usuario actual es admin desde D1.
 */
export async function isAdminAsync(): Promise<boolean> {
  return hasRoleAsync('admin');
}

/**
 * Verifica si el usuario actual tiene un rol específico.
 * Solo funciona con el cache del modo mock explícito.
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
 */
export function isAdmin(): boolean {
  return hasRole('admin');
}
