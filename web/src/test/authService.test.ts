import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase/config', () => ({
  db: null,
  auth: {},
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
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
  logoutUser,
  getUsers,
  updateUserRole,
  toggleUserActive,
  deleteUser,
  isAdmin,
  hasRole,
} from '../services/authService';

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
