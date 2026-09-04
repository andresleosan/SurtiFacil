import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

const firebaseAuthMock = vi.hoisted(() => ({
  currentUser: null as any,
}));

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

vi.mock('../firebase/config', () => ({
  db: {},
  auth: {},
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => firebaseAuthMock),
  onIdTokenChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  GoogleAuthProvider: vi.fn(function GoogleAuthProviderMock(this: any) {
    this.setCustomParameters = vi.fn();
  }),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
}));

import {
  registerUser,
  loginUser,
  loginWithGoogle,
  logoutUser,
  getUsers,
  updateUserRole,
  toggleUserActive,
  deleteUser,
  getCurrentUser,
  isAdmin,
  hasRole,
  getSafeAuthErrorMessage,
} from '../services/authService';

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseAuthMock.currentUser = null;
    vi.stubEnv('VITE_USE_MOCK_DATA', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('safe auth error messages', () => {
    it('uses only fixed messages for adversarial typed errors', () => {
      const infrastructureError = Object.assign(
        new Error('Firebase permission-denied token=secret provider=internal'),
        { code: 'infrastructure' },
      );
      const logoutError = Object.assign(
        new Error('Admin SDK private key leaked'),
        { code: 'logout' },
      );
      expect(getSafeAuthErrorMessage(infrastructureError)).toBe('No se pudo verificar la sesión. Inténtalo de nuevo.');
      expect(getSafeAuthErrorMessage(logoutError)).toBe('No se pudo cerrar sesión. Inténtalo de nuevo.');
      expect(getSafeAuthErrorMessage({
        code: 'unexpected-provider-code',
        message: 'provider payload token=secret',
      }, 'Mensaje alternativo')).toBe('No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.');
    });
  });

  describe('registerUser (modo mock - Firebase no configurado)', () => {
    it('crea un nuevo usuario con rol cashier por defecto', async () => {
      const user = await registerUser(
        'nuevo@test.com',
        'password123',
        'Nuevo Usuario',
        'cashier'
      );

      expect(user.email).toBe('nuevo@test.com');
      expect(user.displayName).toBe('Nuevo Usuario');
      expect(user.role).toBe('cashier');
      expect(user.active).toBe(true);
      expect(user.id).toMatch(/^user-/);
    });

    it('crea usuario admin', async () => {
      const user = await registerUser(
        'admin@test.com',
        'password123',
        'Admin User',
        'admin'
      );
      expect(user.role).toBe('admin');
    });
  });

  describe('loginUser (modo mock)', () => {
    it('inicia sesión con usuario existente', async () => {
      await registerUser('login@test.com', 'password', 'Test User', 'cashier');
      const user = await loginUser('login@test.com', 'password');
      expect(user.email).toBe('login@test.com');
    });

    it('falla si el usuario no existe', async () => {
      await expect(
        loginUser('noexiste@test.com', 'wrongpass')
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('falla si el usuario está inactivo', async () => {
      const user = await registerUser('inactive-mock@test.com', 'password', 'Inactive Mock', 'cashier');
      await toggleUserActive(user.id, false);

      await expect(
        loginUser('inactive-mock@test.com', 'password')
      ).rejects.toThrow('Usuario inactivo');
    });
  });

  describe('modo Firebase configurado', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
      vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
      vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'sender');
      vi.stubEnv('VITE_FIREBASE_APP_ID', 'app-id');
    });

    it('guarda el usuario registrado en el documento cuyo ID es el UID de Firebase', async () => {
      const firebaseUser = {
        uid: 'firebase-user-1',
        getIdToken: vi.fn().mockResolvedValue('token'),
      };
      firebaseAuthMock.currentUser = firebaseUser;
      const userRef = { path: 'users/firebase-user-1' };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'firebase-user-1',
          email: 'firebase@test.com',
          displayName: 'Firebase User',
          role: 'cashier',
          active: true,
        }),
      }));

      const user = await registerUser(
        'firebase@test.com',
        'password123',
        'Firebase User',
        'cashier'
      );

       expect(fetch).toHaveBeenCalledWith(
         'http://localhost:3000/api/auth/provision-user',
         expect.objectContaining({
           method: 'POST',
           headers: expect.objectContaining({ Authorization: 'Bearer token' }),
         }),
       );
       expect(firebaseAuthMock.currentUser).toBe(firebaseUser);
       expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
       expect(user.id).toBe('firebase-user-1');
    });

    it('rechaza el login cuando no existe el documento del UID autenticado', async () => {
      const firebaseUser = {
        uid: 'missing-user-1',
      };
      firebaseAuthMock.currentUser = firebaseUser;

      vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: firebaseUser } as any);
      const userRef = { path: 'users/missing-user-1' };
      vi.mocked(doc).mockReturnValue(userRef as any);
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
      vi.mocked(signOut).mockResolvedValue(undefined);

      await expect(
        loginUser('missing@test.com', 'password123')
      ).rejects.toMatchObject({ code: 'unauthenticated' });

      expect(doc).toHaveBeenCalledWith(expect.anything(), 'users', 'missing-user-1');
      expect(getDoc).toHaveBeenCalledWith(userRef);
      expect(signOut).toHaveBeenCalled();
    });

    it('rechaza el login de un usuario inactivo con un error seguro', async () => {
      const firebaseUser = {
        uid: 'inactive-user-1',
      };
      firebaseAuthMock.currentUser = firebaseUser;

      vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: firebaseUser } as any);
      const userRef = { path: 'users/inactive-user-1' };
      vi.mocked(doc).mockReturnValue(userRef as any);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          email: 'inactive@test.com',
          displayName: 'Inactive User',
          role: 'cashier',
          active: false,
        }),
      } as any);
      vi.mocked(signOut).mockResolvedValue(undefined);

      await expect(
        loginUser('inactive@test.com', 'password123')
      ).rejects.toMatchObject({ code: 'unauthenticated' });
      expect(signOut).toHaveBeenCalled();
    });

    it('rechaza el login cuando el documento no confirma un usuario activo', async () => {
      const firebaseUser = {
        uid: 'missing-active-flag-1',
      };
      firebaseAuthMock.currentUser = firebaseUser;

      vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: firebaseUser } as any);
      vi.mocked(doc).mockReturnValue({ path: 'users/missing-active-flag-1' } as any);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          email: 'missing-active@test.com',
          displayName: 'Missing Active Flag',
          role: 'cashier',
        }),
      } as any);
      vi.mocked(signOut).mockResolvedValue(undefined);

      await expect(
        loginUser('missing-active@test.com', 'password123'),
      ).rejects.toMatchObject({ code: 'unauthenticated' });
      expect(signOut).toHaveBeenCalled();
    });

    it('rechaza el login de un usuario activo con rol inválido', async () => {
      const firebaseUser = {
        uid: 'invalid-role-user-1',
        getIdToken: vi.fn().mockResolvedValue('token'),
      };
      firebaseAuthMock.currentUser = firebaseUser;

      vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: firebaseUser } as any);
      vi.mocked(doc).mockReturnValue({ path: 'users/invalid-role-user-1' } as any);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          email: 'invalid-role@test.com',
          displayName: 'Invalid Role',
          role: 'owner',
          active: true,
        }),
      } as any);
      vi.mocked(signOut).mockResolvedValue(undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await expect(
        loginUser('invalid-role@test.com', 'password123'),
      ).rejects.toMatchObject({ code: 'unauthenticated' });
      expect(signOut).toHaveBeenCalled();
    });

    it('rechaza el mapeo de sesión cuando un usuario activo tiene rol inválido', async () => {
      const firebaseUser = {
        uid: 'invalid-session-role-1',
      };
      firebaseAuthMock.currentUser = firebaseUser;
      vi.mocked(doc).mockReturnValue({ path: 'users/invalid-session-role-1' } as any);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          email: 'invalid-session-role@test.com',
          displayName: 'Invalid Session Role',
          role: 'owner',
          active: true,
        }),
      } as any);
      vi.mocked(signOut).mockResolvedValue(undefined);

      await expect(getCurrentUser()).resolves.toBeNull();
      expect(signOut).toHaveBeenCalled();
    });

    it('registra un mensaje estatico y relanza el error de Firebase sin exponer sus detalles', async () => {
      const firebaseError = new Error('Firebase: Error (auth/invalid-credential).');
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(signInWithEmailAndPassword).mockRejectedValue(firebaseError);

      await expect(
        loginUser('invalid@test.com', 'password123')
      ).rejects.toBe(firebaseError);

      expect(consoleError).toHaveBeenCalledWith('Error logging in.');
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('auth/invalid-credential');
      consoleError.mockRestore();
    });

    it('limpia la sesión si falla una operación posterior a la autenticación', async () => {
      const firebaseUser = {
        uid: 'post-auth-failure-1',
        getIdToken: vi.fn(),
      };
      firebaseAuthMock.currentUser = firebaseUser;
      const sensitiveError = new Error('Firebase: permission-denied token=secret');
      vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: firebaseUser } as any);
      vi.mocked(doc).mockReturnValue({ path: 'users/post-auth-failure-1' } as any);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          email: 'post-auth@test.com',
          displayName: 'Post Auth Failure',
          role: 'cashier',
          active: true,
        }),
      } as any);
      vi.mocked(updateDoc).mockRejectedValue(sensitiveError);
      vi.mocked(signOut).mockResolvedValue(undefined);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        loginUser('post-auth@test.com', 'password123'),
      ).rejects.toMatchObject({
        code: 'infrastructure',
        message: 'No se pudo verificar la sesión. Inténtalo de nuevo.',
      });

      expect(signOut).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('Error logging in.');
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('permission-denied');
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret');
      consoleError.mockRestore();
    });

    it('completa el login aunque el backend no sincronice los custom claims', async () => {
      const firebaseUser = {
        uid: 'claims-rejected-1',
        getIdToken: vi.fn().mockResolvedValue('token'),
      };
      firebaseAuthMock.currentUser = firebaseUser;
      vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: firebaseUser } as any);
      vi.mocked(doc).mockReturnValue({ path: 'users/claims-rejected-1' } as any);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          email: 'claims-rejected@test.com',
          displayName: 'Claims Rejected',
          role: 'cashier',
          active: true,
        }),
      } as any);
      vi.mocked(updateDoc).mockResolvedValue(undefined);
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal('fetch', fetchMock);
      vi.mocked(signOut).mockResolvedValue(undefined);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      // ADR-0001: el documento /users/{uid} es la autoridad; los claims son cache derivada,
      // por lo que un backend caido no debe impedir el acceso.
      await expect(
        loginUser('claims-rejected@test.com', 'password123'),
      ).resolves.toMatchObject({ id: 'claims-rejected-1', role: 'cashier', active: true });
      expect(signOut).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('No se pudieron sincronizar custom claims.');
      warn.mockRestore();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/sync-claims',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uid: 'claims-rejected-1' }),
        }),
      );
    });

    it('inicia sesión con Google y valida el documento autoritativo del usuario', async () => {
      const firebaseUser = { uid: 'google-1', getIdToken: vi.fn().mockResolvedValue('token') };
      firebaseAuthMock.currentUser = firebaseUser;
      vi.mocked(signInWithPopup).mockResolvedValue({ user: firebaseUser } as any);
      vi.mocked(doc).mockReturnValue({ path: 'users/google-1' } as any);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ email: 'admin@example.com', displayName: 'Admin', role: 'admin', active: true }),
      } as any);
      vi.mocked(updateDoc).mockResolvedValue(undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await expect(loginWithGoogle()).resolves.toMatchObject({ id: 'google-1', role: 'admin', active: true });
      expect(signInWithPopup).toHaveBeenCalledOnce();
      expect(updateDoc).toHaveBeenCalledWith({ path: 'users/google-1' }, expect.objectContaining({ lastLogin: expect.anything() }));
      expect(signOut).not.toHaveBeenCalled();
    });

    it('cierra la sesión de Google cuando la cuenta no tiene documento de usuario', async () => {
      const firebaseUser = { uid: 'google-unknown', getIdToken: vi.fn().mockResolvedValue('token') };
      firebaseAuthMock.currentUser = firebaseUser;
      vi.mocked(signInWithPopup).mockResolvedValue({ user: firebaseUser } as any);
      vi.mocked(doc).mockReturnValue({ path: 'users/google-unknown' } as any);
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
      vi.mocked(signOut).mockResolvedValue(undefined);
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(loginWithGoogle()).rejects.toMatchObject({ code: 'unauthenticated' });
      expect(signOut).toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith('Error logging in with Google.');
      errorLog.mockRestore();
    });

    it('devuelve null si la persona cierra la ventana de Google', async () => {
      vi.mocked(signInWithPopup).mockRejectedValue(Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }));

      await expect(loginWithGoogle()).resolves.toBeNull();
      expect(signOut).not.toHaveBeenCalled();
      expect(signInWithRedirect).not.toHaveBeenCalled();
    });

    it('cae al flujo de redirección cuando el navegador bloquea la ventana emergente', async () => {
      vi.mocked(signInWithPopup).mockRejectedValue(Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' }));
      vi.mocked(signInWithRedirect).mockImplementation(() => Promise.resolve() as Promise<never>);

      await expect(loginWithGoogle()).resolves.toBeNull();
      expect(signInWithRedirect).toHaveBeenCalledOnce();
    });

    it('expone solo un mensaje seguro cuando falla el registro de Firebase', async () => {
      const firebaseUser = {
        uid: 'registration-failure-1',
        getIdToken: vi.fn(),
      };
      firebaseAuthMock.currentUser = firebaseUser;
      const firebaseError = new Error('Firebase: auth/operation-not-allowed token=secret');
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
       vi.stubGlobal('fetch', vi.fn().mockRejectedValue(firebaseError));

      await expect(
        registerUser('registration-failure@test.com', 'password123', 'Registration Failure', 'cashier'),
      ).rejects.toThrow('No se pudo crear el usuario');
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('operation-not-allowed');
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret');
       expect(signOut).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('configuracion incompleta sin mock explicito', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    });

    it('rechaza login y operaciones de usuarios en vez de usar datos mock', async () => {
      await expect(loginUser('admin@surtifacil.com', 'password')).rejects.toThrow(
        'Firebase no esta configurado correctamente.',
      );
      await expect(getUsers()).rejects.toThrow('Firebase no esta configurado correctamente.');
    });
  });

  describe('logoutUser', () => {
    it('cierra sesión sin errores', async () => {
      await expect(logoutUser()).resolves.not.toThrow();
    });
  });

  describe('getUsers', () => {
    it('retorna lista de usuarios (al menos los mock iniciales)', async () => {
      const users = await getUsers();
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('updateUserRole', () => {
    it('actualiza el rol de un usuario existente', async () => {
      const users = await getUsers();
      const firstUser = users[0];
      await updateUserRole(firstUser.id, 'manager');
      const updatedUsers = await getUsers();
      const updated = updatedUsers.find(u => u.id === firstUser.id);
      expect(updated?.role).toBe('manager');
    });
  });

  describe('toggleUserActive', () => {
    it('cambia el estado activo de un usuario', async () => {
      const user = await registerUser('toggle@test.com', 'pass', 'Toggle', 'cashier');
      expect(user.active).toBe(true);
      await toggleUserActive(user.id, false);
      const users = await getUsers();
      const updated = users.find(u => u.id === user.id);
      expect(updated?.active).toBe(false);
    });
  });

  describe('deleteUser', () => {
    it('elimina un usuario existente', async () => {
      const user = await registerUser('delete@test.com', 'pass', 'Delete Me', 'cashier');
      await deleteUser(user.id);
      const users = await getUsers();
      expect(users.find(u => u.id === user.id)).toBeUndefined();
    });
  });

  describe('hasRole / isAdmin', () => {
    it('retorna false cuando no hay usuario logueado', () => {
      expect(isAdmin()).toBe(false);
      expect(hasRole('cashier')).toBe(false);
    });
  });
});
