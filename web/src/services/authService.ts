import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { User, UserRole } from '../firebase/db';

const auth = getAuth();

/**
 * Sincroniza los custom claims de Firebase Auth con el rol del usuario
 * almacenado en Firestore. Es idempotente y seguro de llamar después
 * de cada login. Ver ADR-0001.
 */
async function syncCustomClaims(uid: string): Promise<void> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;
  try {
    await fetch(`${backendUrl}/api/auth/sync-claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, idToken }),
    });
  } catch (err) {
    console.warn('No se pudieron sincronizar custom claims:', err);
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

/**
 * Verifica si Firebase está configurado
 */
function isFirebaseConfigured(): boolean {
  return !!(db && typeof db === 'object' && import.meta.env.VITE_FIREBASE_PROJECT_ID);
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
  if (!isFirebaseConfigured()) {
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

  try {
    // Crear usuario en Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Actualizar perfil con nombre
    await updateProfile(firebaseUser, { displayName });

    // Crear documento en Firestore
    const userData: Omit<User, 'id'> = {
      email,
      displayName,
      role,
      active: true,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'users'), userData);

    // Sincronizar custom claims inmediatamente para que el usuario recién
    // creado pueda escribir según su rol sin re-login. Ver ADR-0001.
    await syncCustomClaims(firebaseUser.uid);

    return {
      id: docRef.id,
      ...userData,
    };
  } catch (error: any) {
    console.error('Error registering user:', error);
    throw new Error(error.message || 'Error al registrar usuario');
  }
}

/**
 * Inicia sesión con email y password
 */
export async function loginUser(email: string, password: string): Promise<User> {
  if (!isFirebaseConfigured()) {
    // Modo mock
    const user = mockUsers.find(u => u.email === email);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
    currentUser = user;
    return user;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Obtener datos del usuario desde Firestore
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      throw new Error('Usuario no encontrado en la base de datos');
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data() as Omit<User, 'id'>;

    // Actualizar último login
    await updateDoc(doc(db, 'users', userDoc.id), {
      lastLogin: serverTimestamp(),
    });

    // Sincronizar custom claims (admin/manager) para que Firestore rules funcionen.
    // Ver ADR-0001.
    await syncCustomClaims(firebaseUser.uid);

    currentUser = {
      id: userDoc.id,
      ...userData,
    };

    return currentUser;
  } catch (error: any) {
    console.error('Error logging in:', error);
    throw new Error(error.message || 'Error al iniciar sesión');
  }
}

/**
 * Cierra la sesión actual
 */
export async function logoutUser(): Promise<void> {
  if (!isFirebaseConfigured()) {
    currentUser = null;
    return;
  }

  try {
    await signOut(auth);
    currentUser = null;
  } catch (error: any) {
    console.error('Error logging out:', error);
    throw new Error(error.message || 'Error al cerrar sesión');
  }
}

/**
 * Obtiene el usuario actual
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!isFirebaseConfigured()) {
    return currentUser;
  }

  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;

  // Leer rol desde custom claims (verdad criptográfica, ver ADR-0001).
  // Fallback a cashier si los claims aún no se han propagado (re-login requerido).
  let role: UserRole = 'cashier';
  try {
    const tokenResult = await firebaseUser.getIdTokenResult();
    if (tokenResult.claims.admin === true) role = 'admin';
    else if (tokenResult.claims.manager === true) role = 'manager';
  } catch {
    role = 'cashier';
  }

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || '',
    role,
    active: true,
  };
}

/**
 * Obtiene todos los usuarios (solo admin)
 */
export async function getUsers(): Promise<User[]> {
  if (!isFirebaseConfigured()) {
    return mockUsers;
  }

  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    const users: User[] = [];

    snapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...(doc.data() as Omit<User, 'id'>),
      });
    });

    return users;
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

/**
 * Actualiza el rol de un usuario (solo admin)
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  if (!isFirebaseConfigured()) {
    const user = mockUsers.find(u => u.id === userId);
    if (user) {
      user.role = role;
    }
    return;
  }

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role });
  } catch (error: any) {
    console.error('Error updating user role:', error);
    throw new Error(error.message || 'Error al actualizar rol');
  }
}

/**
 * Activa/desactiva un usuario (solo admin)
 */
export async function toggleUserActive(userId: string, active: boolean): Promise<void> {
  if (!isFirebaseConfigured()) {
    const user = mockUsers.find(u => u.id === userId);
    if (user) {
      user.active = active;
    }
    return;
  }

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { active });
  } catch (error: any) {
    console.error('Error toggling user status:', error);
    throw new Error(error.message || 'Error al actualizar estado');
  }
}

/**
 * Elimina un usuario (solo admin)
 */
export async function deleteUser(userId: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    mockUsers = mockUsers.filter(u => u.id !== userId);
    return;
  }

  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new Error(error.message || 'Error al eliminar usuario');
  }
}

/**
 * Verifica si el usuario actual tiene un rol específico (async, lee custom claims).
 */
export async function hasRoleAsync(role: UserRole): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === role;
}

/**
 * Verifica si el usuario actual es admin (async, lee custom claims).
 */
export async function isAdminAsync(): Promise<boolean> {
  return hasRoleAsync('admin');
}

/**
 * Verifica si el usuario actual tiene un rol específico.
 * Solo lee del cache local (currentUser). Útil en tests o paths que no
 * quieren await. Para gates de seguridad en producción usar isAdminAsync().
 */
export function hasRole(role: UserRole): boolean {
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
