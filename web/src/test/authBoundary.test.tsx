import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'cashier';
  active: boolean;
};

const authMock = vi.hoisted(() => ({
  currentUser: null as AuthUser | null,
  authStateListener: null as ((user: AuthUser | null) => void) | null,
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  getSafeAuthErrorMessage: vi.fn((error: unknown, fallback?: string) => error instanceof Error ? error.message : fallback || 'Error de autenticación'),
  subscribeToAuthState: vi.fn(),
  isAdminAsync: vi.fn(async () => false),
  hasRoleAsync: vi.fn(async () => false),
  getUsers: vi.fn(),
  updateUserRole: vi.fn(),
  toggleUserActive: vi.fn(),
  deleteUser: vi.fn(),
  registerUser: vi.fn(),
}));

vi.mock('../services/authService', () => authMock);

vi.mock('../components/Dashboard', () => ({
  default: () => <h2>Panel de Control</h2>,
}));

vi.mock('../components/WhatsAppChat', () => ({
  default: () => <h2>Gestor de WhatsApp montado</h2>,
}));

describe('auth boundary', () => {
  beforeEach(() => {
    authMock.currentUser = null;
    authMock.authStateListener = null;
    authMock.loginUser.mockReset();
    authMock.logoutUser.mockReset();
    authMock.getSafeAuthErrorMessage.mockReset().mockImplementation((error: unknown, fallback?: string) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error instanceof Error) return error.message;
      return fallback || 'No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.';
    });
    authMock.isAdminAsync.mockReset().mockResolvedValue(false);
    authMock.hasRoleAsync.mockReset().mockResolvedValue(false);
    authMock.subscribeToAuthState.mockImplementation((listener: (user: AuthUser | null) => void) => {
      authMock.authStateListener = listener;
      listener(authMock.currentUser);
      return vi.fn();
    });
    authMock.logoutUser.mockImplementation(async () => {
      authMock.currentUser = null;
      authMock.authStateListener?.(null);
    });
  });

  it('renders the Spanish login form when unauthenticated', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.queryByText('Panel de Control')).not.toBeInTheDocument();
  });

  it('shows a generic Spanish error when login fails', async () => {
    authMock.loginUser.mockRejectedValueOnce(new Error('Firebase: Error (auth/invalid-credential).'));
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    await user.type(screen.getByLabelText('Correo electrónico'), 'admin@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'not-a-real-password');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.')).toBeInTheDocument();
    expect(screen.queryByText(/Firebase|invalid-credential/)).not.toBeInTheDocument();
  });

  it('shows a safe infrastructure error instead of the login screen', async () => {
    authMock.subscribeToAuthState.mockImplementation((listener: (user: AuthUser | null, error?: unknown) => void) => {
      authMock.authStateListener = listener;
      listener(null, { code: 'infrastructure', message: 'No se pudo verificar la sesión. Inténtalo de nuevo.' });
      return vi.fn();
    });
    authMock.getSafeAuthErrorMessage.mockReturnValue('No se pudo verificar la sesión. Inténtalo de nuevo.');

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar la sesión. Inténtalo de nuevo.');
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });

  it('renders the existing shell for an authenticated user', async () => {
    authMock.currentUser = {
      id: 'user-1',
      email: 'admin@example.com',
      displayName: 'Administrador',
      role: 'admin',
      active: true,
    };

    render(<App />);

    await waitFor(() => expect(screen.getByText('Panel de Control')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });

  it('refreshes role access when the authenticated user changes', async () => {
    authMock.currentUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Administrador',
      role: 'admin',
      active: true,
    };
    authMock.isAdminAsync.mockResolvedValue(true);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Márgenes' })).toBeInTheDocument();

    authMock.currentUser = {
      id: 'cashier-1',
      email: 'cashier@example.com',
      displayName: 'Cajero',
      role: 'cashier',
      active: true,
    };
    authMock.isAdminAsync.mockResolvedValue(false);
    await act(async () => {
      authMock.authStateListener?.(authMock.currentUser);
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Márgenes' })).not.toBeInTheDocument();
    });
  });

  it('does not expose or mount WhatsApp for cashiers', async () => {
    authMock.currentUser = {
      id: 'cashier-1',
      email: 'cashier@example.com',
      displayName: 'Cajero',
      role: 'cashier',
      active: true,
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: 'whatsapp' }));
    });

    expect(screen.queryByText('Gestor de WhatsApp montado')).not.toBeInTheDocument();
  });

  it('renders Login after logout through the auth listener', async () => {
    authMock.currentUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Administrador',
      role: 'admin',
      active: true,
    };

    render(<App />);

    expect(await screen.findByText('Panel de Control')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(authMock.logoutUser).toHaveBeenCalledOnce();
  });

  it('shows a safe error when logout fails', async () => {
    authMock.currentUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Administrador',
      role: 'admin',
      active: true,
    };
    authMock.logoutUser.mockRejectedValue(new Error('No se pudo cerrar sesión. Inténtalo de nuevo.'));

    render(<App />);
    expect(await screen.findByText('Panel de Control')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar sesión. Inténtalo de nuevo.');
    expect(screen.getByText('Panel de Control')).toBeInTheDocument();
  });

  it('shows the loading state until the auth listener resolves', () => {
    authMock.subscribeToAuthState.mockImplementation((listener: (user: AuthUser | null) => void) => {
      authMock.authStateListener = listener;
      return vi.fn();
    });

    render(<App />);

    expect(screen.getByText('Cargando sesión...')).toBeInTheDocument();
    act(() => {
      authMock.authStateListener?.(null);
    });
  });
});
