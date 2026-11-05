import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError } from '../services/apiClient';

const authMock = vi.hoisted(() => {
  const firebaseUser = {
    uid: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Administrador',
    getIdTokenResult: vi.fn(),
    getIdToken: vi.fn(async () => 'token'),
  };

  return {
    firebaseUser,
    firebaseAuth: { currentUser: firebaseUser as any },
    authStateListener: null as ((user: typeof firebaseUser | null) => void) | null,
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  };
});

vi.mock('../firebase/config', () => ({
  db: {},
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => authMock.firebaseAuth),
  onIdTokenChanged: vi.fn((_auth, listener) => {
    authMock.authStateListener = listener;
    listener(authMock.firebaseAuth.currentUser);
    return vi.fn();
  }),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: authMock.signInWithEmailAndPassword,
  signOut: authMock.signOut,
  updateProfile: vi.fn(),
}));

import { deleteUser, hasRole, isAdmin, loginUser, logoutUser, subscribeToAuthState } from '../services/authService';

describe('configured auth subscription', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'sender');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'app-id');
    authMock.authStateListener = null;
    authMock.firebaseAuth.currentUser = authMock.firebaseUser;
    authMock.signInWithEmailAndPassword.mockReset();
    authMock.signOut.mockReset();
    authMock.firebaseUser.getIdToken.mockReset();
    authMock.firebaseUser.getIdToken.mockResolvedValue('token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('emits the authenticated user role from the current user document', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: true },
    });
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => {
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
        id: 'admin-1',
        role: 'cashier',
      }));
    });
  });

  it('ignores a stale user document resolution after logout', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: true },
    });
    const listener = vi.fn();

    subscribeToAuthState(listener);
    authMock.authStateListener?.(null);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it('emits a null session when the authenticated UID has no user document', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ user: null });
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));
    expect(listener).not.toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
  });

  it('emits a null session when the authenticated UID document is inactive', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: false },
    });
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));
    expect(listener).not.toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
  });

  it('emits an infrastructure error when the live user document fails to load', async () => {
    authMock.signOut.mockImplementation(async () => {
      authMock.firebaseAuth.currentUser = null as any;
    });
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network error provider=secret'));
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ code: 'infrastructure' }),
    ));
  });

  it('preserves the infrastructure error when a null auth event follows the snapshot error', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('D1 unavailable provider=secret'));
    authMock.signOut.mockImplementation(async () => {
      authMock.firebaseAuth.currentUser = null as any;
      setTimeout(() => authMock.authStateListener?.(null), 0);
    });
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ code: 'infrastructure' }),
    ));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listener).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ code: 'infrastructure' }),
    );
  });

  it('returns an explicit infrastructure auth error when D1 cannot be read', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: authMock.firebaseUser });
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('permission-denied provider=secret'));

    await expect(loginUser('admin@example.com', 'password')).rejects.toMatchObject({
      code: 'infrastructure',
      message: 'No se pudo verificar la sesión. Inténtalo de nuevo.',
    });
  });

  it('marks missing or inactive user documents as unauthenticated', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: authMock.firebaseUser });
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError('No registrado', 404));

    await expect(loginUser('admin@example.com', 'password')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('returns an explicit logout error when Firebase sign out fails', async () => {
    authMock.signOut.mockRejectedValue(new Error('provider=secret'));

    await expect(logoutUser()).rejects.toMatchObject({
      code: 'logout',
      message: 'No se pudo cerrar sesión. Inténtalo de nuevo.',
    });
  });

  it('deactivates a user through the authenticated backend instead of deleting Firestore directly', async () => {
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue(undefined as any);

    await deleteUser('target-user');

    expect(deleteSpy).toHaveBeenCalledWith('/users/target-user');
  });

  it('does not sign out a newer Firebase session when an older login flow fails', async () => {
    const olderUser = {
      uid: 'older-user',
      email: 'older@example.com',
      displayName: 'Older',
      getIdToken: vi.fn().mockResolvedValue('older-token'),
    };
    const newerUser = {
      uid: 'newer-user',
      email: 'newer@example.com',
      displayName: 'Newer',
      getIdToken: vi.fn().mockResolvedValue('newer-token'),
    };
    authMock.signInWithEmailAndPassword.mockImplementationOnce(async () => {
      authMock.firebaseAuth.currentUser = olderUser;
      return { user: olderUser };
    });

    let rejectGet: ((error: Error) => void) | undefined;
    vi.spyOn(apiClient, 'get').mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectGet = reject; }),
    );

    const loginPromise = loginUser('older@example.com', 'password');
    const loginRejection = expect(loginPromise).rejects.toThrow(
      'No se pudo verificar la sesión. Inténtalo de nuevo.',
    );
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    authMock.firebaseAuth.currentUser = newerUser;
    rejectGet?.(new Error('permission-denied token=secret'));

    await loginRejection;
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  it('does not let an older successful login overwrite a newer session', async () => {
    const olderUser = {
      uid: 'older-success-user',
      email: 'older-success@example.com',
      displayName: 'Older Success',
      getIdToken: vi.fn().mockResolvedValue('older-success-token'),
    };
    const newerUser = {
      uid: 'newer-success-user',
      email: 'newer-success@example.com',
      displayName: 'Newer Success',
      getIdToken: vi.fn().mockResolvedValue('newer-success-token'),
    };
    let resolveOlderDoc: ((res: any) => void) | undefined;
    authMock.signInWithEmailAndPassword
      .mockImplementationOnce(async () => {
        authMock.firebaseAuth.currentUser = olderUser;
        return { user: olderUser };
      })
      .mockImplementationOnce(async () => {
        authMock.firebaseAuth.currentUser = newerUser;
        return { user: newerUser };
      });

    vi.spyOn(apiClient, 'get')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOlderDoc = resolve; }))
      .mockResolvedValueOnce({
        user: { id: 'newer-success-user', email: 'newer-success@example.com', displayName: 'Newer Success', role: 'manager', active: true },
      });

    const olderLogin = loginUser('older-success@example.com', 'password');
    await vi.waitFor(() => expect(authMock.signInWithEmailAndPassword).toHaveBeenCalledTimes(1));
    const newerLogin = loginUser('newer-success@example.com', 'password');
    await expect(newerLogin).resolves.toMatchObject({ id: 'newer-success-user', role: 'manager' });

    resolveOlderDoc?.({
      user: { id: 'older-success-user', email: 'older-success@example.com', displayName: 'Older Success', role: 'cashier', active: true },
    });

    await expect(olderLogin).rejects.toThrow('No se pudo completar el inicio de sesión.');
    expect(authMock.firebaseAuth.currentUser).toBe(newerUser);
  });

  it('does not grant configured-mode access from the synchronous cache', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: true },
    });
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'cashier' })));
    expect(hasRole('admin')).toBe(false);
    expect(isAdmin()).toBe(false);
  });
});
