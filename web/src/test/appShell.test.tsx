import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'cashier';
  active: boolean;
};

const authMock = vi.hoisted(() => ({
  currentUser: null as AuthUser | null,
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  getSafeAuthErrorMessage: vi.fn((_: unknown, fallback?: string) => fallback || 'Error'),
  subscribeToAuthState: vi.fn(),
}));

vi.mock('../services/authService', () => authMock);
vi.mock('../components/Dashboard', () => ({ default: () => <h2>Panel de Control</h2> }));
vi.mock('../components/Reports', () => ({ default: () => <h2>Reportes montado</h2> }));
vi.mock('../components/CreateSale', () => ({ default: () => <h2>POS montado</h2> }));

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

const admin: AuthUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Administrador',
  role: 'admin',
  active: true,
};

describe('AppShell navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#/dashboard');
    window.localStorage.clear();
    authMock.currentUser = admin;
    authMock.subscribeToAuthState.mockImplementation((listener: (user: AuthUser | null) => void) => {
      listener(authMock.currentUser);
      return vi.fn();
    });
    authMock.logoutUser.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the sidebar with every allowed section once on desktop', async () => {
    stubViewport(false);
    render(<App />);

    expect(await screen.findByText('Panel de Control')).toBeInTheDocument();
    const sidebar = screen.getByRole('complementary', { name: 'Menú principal' });
    expect(within(sidebar).getByRole('button', { name: 'Márgenes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cerrar sesión' })).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();
  });

  it('collapses the sidebar and keeps accessible names', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Panel de Control');

    await user.click(screen.getByRole('button', { name: 'Contraer menú' }));

    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inventario' })).toBeInTheDocument();
    expect(window.localStorage.getItem('surtifacil.sidebar.collapsed')).toBe('true');
  });

  it('shows the bottom tab bar and the "Más" sheet on phones', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Panel de Control');

    const tabBar = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(tabBar).getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabBar).getByRole('button', { name: 'Vender' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Menú principal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();

    await user.click(within(tabBar).getByRole('button', { name: 'Más' }));

    const sheet = await screen.findByRole('dialog', { name: 'Más opciones' });
    expect(within(sheet).getByRole('button', { name: 'Márgenes' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Reportes' }));

    expect(await screen.findByText('Reportes montado')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/reports');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument());
  });

  it('navigates from the tab bar and logs out from the sheet', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Panel de Control');

    const tabBar = screen.getByRole('navigation', { name: 'Navegación principal' });
    await user.click(within(tabBar).getByRole('button', { name: 'Vender' }));
    expect(await screen.findByText('POS montado')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/create-sale');

    await user.click(within(tabBar).getByRole('button', { name: 'Más' }));
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(authMock.logoutUser).toHaveBeenCalledOnce();
  });

  it('hides manager-only sections from cashiers in the sheet', async () => {
    stubViewport(true);
    authMock.currentUser = { ...admin, id: 'cashier-1', role: 'cashier', displayName: 'Cajero' };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Panel de Control');

    await user.click(screen.getByRole('button', { name: 'Más' }));
    const sheet = await screen.findByRole('dialog', { name: 'Más opciones' });
    expect(within(sheet).getByRole('button', { name: 'Reportes' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Márgenes' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Empleados' })).not.toBeInTheDocument();
  });
});
