import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../firebase/db';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

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

const USERS: User[] = [
  { id: 'u1', email: 'ana@example.com', displayName: 'Ana Gómez', role: 'admin', active: true },
  { id: 'u2', email: 'luis@example.com', displayName: 'Luis Pérez', role: 'cashier', active: false },
];

function stubViewport(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === MOBILE_QUERY ? mobile : !mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('UserManagement responsive layout', () => {
  beforeEach(() => {
    authMock.getUsers.mockReset().mockResolvedValue(USERS);
    authMock.isAdminAsync.mockReset().mockResolvedValue(true);
    authMock.deleteUser.mockReset().mockResolvedValue(undefined);
    authMock.toggleUserActive.mockReset().mockResolvedValue(undefined);
    authMock.updateUserRole.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders user cards instead of a table on phones', async () => {
    stubViewport(true);
    render(<UserManagement />);

    const list = await screen.findByRole('list', { name: 'Empleados' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Ana Gómez')).toBeInTheDocument();
    expect(within(list).getByText('luis@example.com')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Eliminar Luis Pérez' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Desactivar Ana Gómez' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Activar Luis Pérez' })).toBeInTheDocument();
  });

  it('renders the table on desktop', async () => {
    stubViewport(false);
    render(<UserManagement />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Empleados' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Ana Gómez' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rol de Ana Gómez' })).toHaveValue('admin');
  });

  it('asks for confirmation before deleting a user', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    render(<UserManagement />);
    await screen.findByRole('list', { name: 'Empleados' });

    await user.click(screen.getByRole('button', { name: 'Eliminar Luis Pérez' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Eliminar usuario' });
    expect(within(dialog).getByText(/¿Estás seguro de eliminar este usuario\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(authMock.deleteUser).not.toHaveBeenCalled();
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Eliminar Luis Pérez' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(authMock.deleteUser).toHaveBeenCalledWith('u2'));
    await waitFor(() => expect(screen.queryByText('Luis Pérez')).not.toBeInTheDocument());
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
  });
});
