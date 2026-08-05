import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => {
  const firebaseUser = {
    uid: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Administrador',
    getIdTokenResult: vi.fn(),
    getIdToken: vi.fn(),
  };

  return {
    firebaseUser,
    firebaseAuth: { currentUser: firebaseUser },
    authStateListener: null as ((user: typeof firebaseUser | null) => void) | null,
    userDocumentListener: null as ((snapshot: any) => void) | null,
    userDocumentErrorListener: null as ((error: unknown) => void) | null,
    userSnapshot: null as any,
    onSnapshot: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    unsubscribeUserDocument: vi.fn(),
    getDoc: vi.fn(),
    doc: vi.fn(),
    updateDoc: vi.fn(),
  };
});

vi.mock('../firebase/config', () => ({
  db: {},
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => authMock.firebaseAuth),
  onIdTokenChanged: vi.fn((_auth, listener) => {
    authMock.authStateListener = listener;
    listener(authMock.firebaseUser);
    return vi.fn();
  }),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: authMock.signInWithEmailAndPassword,
  signOut: authMock.signOut,
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDoc: authMock.getDoc,
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: authMock.updateDoc,
  onSnapshot: authMock.onSnapshot,
  deleteDoc: vi.fn(),
  doc: authMock.doc,
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
}));

import { hasRole, isAdmin, loginUser, logoutUser, subscribeToAuthState } from '../services/authService';

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
    authMock.userDocumentListener = null;
    authMock.userDocumentErrorListener = null;
    authMock.userSnapshot = {
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: true }),
    };
    authMock.signInWithEmailAndPassword.mockReset();
    authMock.signOut.mockReset();
    authMock.unsubscribeUserDocument.mockReset();
    authMock.onSnapshot.mockReset().mockImplementation((_ref: unknown, listener: (snapshot: any) => void, errorListener: (error: unknown) => void) => {
      authMock.userDocumentListener = listener;
      authMock.userDocumentErrorListener = errorListener;
      listener(authMock.userSnapshot);
      return authMock.unsubscribeUserDocument;
    });
    authMock.getDoc.mockReset();
    authMock.doc.mockReset().mockReturnValue({ path: 'users/admin-1' });
    authMock.updateDoc.mockReset();
    authMock.firebaseUser.getIdTokenResult.mockReset();
    authMock.firebaseUser.getIdTokenResult.mockResolvedValue({ claims: { admin: true } });
    authMock.firebaseUser.getIdToken.mockReset();
    authMock.firebaseUser.getIdToken.mockResolvedValue('token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('emits the authenticated user role from the current Firestore user document', async () => {
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
    authMock.onSnapshot.mockImplementationOnce((_ref: unknown, listener: (snapshot: any) => void) => {
      authMock.userDocumentListener = listener;
      return authMock.unsubscribeUserDocument;
    });
    const listener = vi.fn();

    subscribeToAuthState(listener);
    authMock.authStateListener?.(null);
    authMock.userDocumentListener?.({
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'admin', active: true }),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it('emits a null session when the authenticated UID has no user document', async () => {
    authMock.userSnapshot = { exists: () => false };
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));
    expect(listener).not.toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
  });

  it('emits a null session when the authenticated UID document is inactive', async () => {
    authMock.userSnapshot = {
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: false }),
    };
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));
    expect(listener).not.toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
  });

  it('emits an infrastructure error when the live user document fails to load', async () => {
    authMock.signOut.mockImplementation(async () => {
      authMock.firebaseAuth.currentUser = null as any;
    });
    const listener = vi.fn();
    authMock.onSnapshot.mockImplementationOnce((_ref: unknown, _listener: (snapshot: any) => void, errorListener: (error: unknown) => void) => {
      authMock.userDocumentErrorListener = errorListener;
      return authMock.unsubscribeUserDocument;
    });

    subscribeToAuthState(listener);
    authMock.userDocumentErrorListener?.(new Error('permission-denied provider=secret'));

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ code: 'infrastructure' }),
    ));
  });

  it('preserves the infrastructure error when a null auth event follows the snapshot error', async () => {
    const listener = vi.fn();
    authMock.onSnapshot.mockImplementationOnce((_ref: unknown, _listener: (snapshot: any) => void, errorListener: (error: unknown) => void) => {
      authMock.userDocumentErrorListener = errorListener;
      return authMock.unsubscribeUserDocument;
    });
    authMock.signOut.mockImplementation(async () => {
      authMock.firebaseAuth.currentUser = null as any;
      setTimeout(() => authMock.authStateListener?.(null), 0);
    });

    subscribeToAuthState(listener);
    authMock.userDocumentErrorListener?.(new Error('Firestore unavailable provider=secret'));

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

  it('refreshes the ID token before resolving claims after sync', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: authMock.firebaseUser });
    authMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: true }),
    });
    authMock.updateDoc.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const user = await loginUser('admin@example.com', 'password');

    expect(authMock.firebaseUser.getIdToken).toHaveBeenCalledWith(true);
    expect(user.role).toBe('cashier');
  });

    it('rejects login on a non-OK claims sync without exposing response details', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: authMock.firebaseUser });
    authMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: true }),
    });
    authMock.updateDoc.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loginUser('admin@example.com', 'password')).rejects.toThrow(
      'No se pudieron sincronizar custom claims.',
    );

    expect(warning).toHaveBeenCalledWith('No se pudieron sincronizar custom claims.');
    expect(authMock.firebaseUser.getIdToken).not.toHaveBeenCalledWith(true);
    expect(authMock.signOut).toHaveBeenCalled();
    });

  it('rejects login when claims sync is unavailable and clears the session', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: authMock.firebaseUser });
    authMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'cashier', active: true }),
    });
    authMock.updateDoc.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network token=secret')));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loginUser('admin@example.com', 'password')).rejects.toThrow(
      'No se pudieron sincronizar custom claims.',
    );

    expect(warning).toHaveBeenCalledWith('No se pudieron sincronizar custom claims.');
    expect(authMock.signOut).toHaveBeenCalled();
  });

  it('returns an explicit infrastructure auth error when Firestore cannot be read', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: authMock.firebaseUser });
    authMock.getDoc.mockRejectedValue(new Error('permission-denied provider=secret'));

    await expect(loginUser('admin@example.com', 'password')).rejects.toMatchObject({
      code: 'infrastructure',
      message: 'No se pudo verificar la sesión. Inténtalo de nuevo.',
    });
  });

  it('marks missing or inactive user documents as unauthenticated', async () => {
    authMock.signInWithEmailAndPassword.mockResolvedValue({ user: authMock.firebaseUser });
    authMock.getDoc.mockResolvedValue({ exists: () => false });

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

  it('does not sign out a newer Firebase session when an older login flow fails', async () => {
    const olderUser = {
      uid: 'older-user',
      email: 'older@example.com',
      displayName: 'Older',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
      getIdToken: vi.fn().mockResolvedValue('older-token'),
    };
    const newerUser = {
      uid: 'newer-user',
      email: 'newer@example.com',
      displayName: 'Newer',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
      getIdToken: vi.fn().mockResolvedValue('newer-token'),
    };
    authMock.signInWithEmailAndPassword.mockImplementationOnce(async () => {
      authMock.firebaseAuth.currentUser = olderUser;
      return { user: olderUser };
    });
    authMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ email: 'older@example.com', displayName: 'Older', role: 'cashier', active: true }),
    });
    let rejectUpdate: ((error: Error) => void) | undefined;
    authMock.updateDoc.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectUpdate = reject; }),
    );

    const loginPromise = loginUser('older@example.com', 'password');
    const loginRejection = expect(loginPromise).rejects.toThrow(
      'No se pudo verificar la sesión. Inténtalo de nuevo.',
    );
    await vi.waitFor(() => expect(authMock.updateDoc).toHaveBeenCalled());
    authMock.firebaseAuth.currentUser = newerUser;
    rejectUpdate?.(new Error('permission-denied token=secret'));

    await loginRejection;
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  it('does not let an older successful login overwrite a newer session', async () => {
    const olderUser = {
      uid: 'older-success-user',
      email: 'older-success@example.com',
      displayName: 'Older Success',
      getIdTokenResult: vi.fn(),
      getIdToken: vi.fn().mockResolvedValue('older-success-token'),
    };
    const newerUser = {
      uid: 'newer-success-user',
      email: 'newer-success@example.com',
      displayName: 'Newer Success',
      getIdTokenResult: vi.fn(),
      getIdToken: vi.fn().mockResolvedValue('newer-success-token'),
    };
    let resolveOlderDoc: ((snapshot: any) => void) | undefined;
    authMock.signInWithEmailAndPassword
      .mockImplementationOnce(async () => {
        authMock.firebaseAuth.currentUser = olderUser;
        return { user: olderUser };
      })
      .mockImplementationOnce(async () => {
        authMock.firebaseAuth.currentUser = newerUser;
        return { user: newerUser };
      });
    authMock.doc.mockImplementation((_db: unknown, _collection: string, uid: string) => ({ path: `users/${uid}` }));
    authMock.getDoc.mockImplementation((ref: { path: string }) => {
      if (ref.path.endsWith('older-success-user')) {
        return new Promise((resolve) => { resolveOlderDoc = resolve; });
      }
      return Promise.resolve({
        exists: () => true,
        data: () => ({ email: 'newer-success@example.com', displayName: 'Newer Success', role: 'manager', active: true }),
      });
    });
    authMock.updateDoc.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const olderLogin = loginUser('older-success@example.com', 'password');
    await vi.waitFor(() => expect(authMock.signInWithEmailAndPassword).toHaveBeenCalledTimes(1));
    const newerLogin = loginUser('newer-success@example.com', 'password');
    await expect(newerLogin).resolves.toMatchObject({ id: 'newer-success-user', role: 'manager' });

    resolveOlderDoc?.({
      exists: () => true,
      data: () => ({ email: 'older-success@example.com', displayName: 'Older Success', role: 'cashier', active: true }),
    });

    await expect(olderLogin).rejects.toThrow('No se pudo completar el inicio de sesión.');
    expect(authMock.firebaseAuth.currentUser).toBe(newerUser);
  });

  it('does not grant configured-mode access from the synchronous cache', async () => {
    const listener = vi.fn();

    subscribeToAuthState(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'cashier' })));
    expect(hasRole('admin')).toBe(false);
    expect(isAdmin()).toBe(false);
  });

  it('updates the authenticated role when the user document changes', async () => {
    const listener = vi.fn();

    subscribeToAuthState(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'cashier' })));

    await authMock.userDocumentListener?.({
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'manager', active: true }),
    });

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'manager' })));
  });

  it('clears the session when the live user document becomes inactive', async () => {
    const listener = vi.fn();

    subscribeToAuthState(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ active: true })));
    await authMock.userDocumentListener?.({
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'admin', active: false }),
    });

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));
    expect(authMock.signOut).toHaveBeenCalled();
  });

  it('clears the session when the live user document disappears', async () => {
    const listener = vi.fn();

    subscribeToAuthState(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ active: true })));
    await authMock.userDocumentListener?.({ exists: () => false });

    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));
    expect(authMock.signOut).toHaveBeenCalled();
  });

  it('does not emit live user changes after unsubscribe', async () => {
    const listener = vi.fn();

    const unsubscribe = subscribeToAuthState(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'cashier' })));
    unsubscribe();
    await authMock.userDocumentListener?.({
      exists: () => true,
      data: () => ({ email: 'admin@example.com', displayName: 'Administrador', role: 'manager', active: true }),
    });

    expect(authMock.unsubscribeUserDocument).toHaveBeenCalled();
    expect(listener).not.toHaveBeenLastCalledWith(expect.objectContaining({ role: 'manager' }));
  });
});
