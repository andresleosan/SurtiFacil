import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  getUsers: vi.fn(),
  isAdminAsync: vi.fn(),
  updateUserRole: vi.fn(),
  toggleUserActive: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('../services/authService', () => authMock);
vi.mock('../components/CreateUserModal', () => ({
  default: () => null,
}));

import UserManagement from '../components/UserManagement';

describe('UserManagement load failures', () => {
  beforeEach(() => {
    authMock.getUsers.mockReset().mockRejectedValue(new Error('Firebase: permission-denied token=secret'));
    authMock.isAdminAsync.mockReset().mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the visible Spanish error state without logging raw auth errors', async () => {
    const consoleError = vi.mocked(console.error);
    render(<UserManagement />);

    await waitFor(() => expect(screen.getByText('Error al cargar usuarios')).toBeInTheDocument());
    expect(consoleError).toHaveBeenCalledWith('Error loading users.');
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('permission-denied');
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret');
  });
});
