import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoreSettings from '../components/StoreSettings';
import { CurrentUserProvider } from '../auth/CurrentUserContext';
import { User } from '../firebase/db';

const settingsMock = vi.hoisted(() => ({
  getStoreSettings: vi.fn(),
  updateStoreSettings: vi.fn(),
}));

vi.mock('../services/settingsService', () => settingsMock);

const adminUser: User = {
  id: 'admin-1',
  email: 'admin@surtifacil.co',
  displayName: 'Don Pedro Admin',
  role: 'admin',
  active: true,
};

const cashierUser: User = {
  ...adminUser,
  id: 'cashier-1',
  role: 'cashier',
  displayName: 'Cajero Juan',
};

const INITIAL_SETTINGS = {
  id: 'surtifacil',
  slug: 'surtifacil',
  nombre: 'SurtiFácil Abastos Central',
  barrio: 'La Candelaria / Centro',
  ciudad: 'Medellín',
  direccion: 'Calle 50 # 50-20',
  telefono_whatsapp: '+573001234567',
  horario: '7am - 9pm',
  costo_domicilio_cents: 350000,
  permite_domicilio: true,
  permite_retiro: true,
  slogan: 'El motor digital de tu barrio',
  datos_pago_offline: 'Nequi: 300 123 4567',
  plan_id: 'enterprise',
  estado: 'activo',
  cuota_ia_total: 999999,
  cuota_ia_usada: 150,
};

describe('StoreSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.getStoreSettings.mockResolvedValue({ ...INITIAL_SETTINGS });
    settingsMock.updateStoreSettings.mockResolvedValue({ ...INITIAL_SETTINGS });
  });

  it('renders store settings and displays current values', async () => {
    render(
      <CurrentUserProvider value={adminUser}>
        <StoreSettings />
      </CurrentUserProvider>
    );

    expect(await screen.findByDisplayValue('SurtiFácil Abastos Central')).toBeInTheDocument();
    expect(screen.getByDisplayValue('La Candelaria / Centro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+573001234567')).toBeInTheDocument();
    expect(screen.getAllByText(/Plan enterprise/i).length).toBeGreaterThanOrEqual(1);
  });

  it('toggles delivery switch and saves changes for administrators', async () => {
    const user = userEvent.setup();
    render(
      <CurrentUserProvider value={adminUser}>
        <StoreSettings />
      </CurrentUserProvider>
    );

    await screen.findByDisplayValue('SurtiFácil Abastos Central');
    const switchDomicilio = screen.getByRole('switch', { name: /Alternar servicio de domicilios/i });
    expect(switchDomicilio).toHaveAttribute('aria-checked', 'true');

    // Tocar switch para pausar domicilios
    await user.click(switchDomicilio);
    expect(switchDomicilio).toHaveAttribute('aria-checked', 'false');

    // Guardar
    const saveBtn = screen.getByRole('button', { name: /Guardar Configuración/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(settingsMock.updateStoreSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          permite_domicilio: false,
          permite_retiro: true,
        })
      );
    });

    expect(await screen.findByText(/Configuración del local guardada exitosamente/i)).toBeInTheDocument();
  });

  it('disables editing inputs for cashier role', async () => {
    render(
      <CurrentUserProvider value={cashierUser}>
        <StoreSettings />
      </CurrentUserProvider>
    );

    const input = await screen.findByDisplayValue('SurtiFácil Abastos Central');
    expect(input).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Guardar Configuración/i })).not.toBeInTheDocument();
  });
});
