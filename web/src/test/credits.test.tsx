import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditCustomer, CreditEntry, User } from '../firebase/db';
import { CurrentUserProvider } from '../auth/CurrentUserContext';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

const creditMock = vi.hoisted(() => ({
  subscribeToCreditCustomers: vi.fn(),
  addCreditCustomer: vi.fn(),
  updateCreditCustomer: vi.fn(),
  getCreditEntries: vi.fn(),
  addCreditEntry: vi.fn(),
  parseAmountToCents: (value: string) => {
    const cents = Math.round(Number.parseFloat(value.replace(',', '.')) * 100);
    return Number.isFinite(cents) && cents > 0 ? cents : null;
  },
}));

vi.mock('../services/creditService', () => creditMock);

import Credits from '../components/Credits';

const CUSTOMERS: CreditCustomer[] = [
  { id: 'cc1', name: 'Doña Rosa', phone: '300111', balance_cents: 155000, active: true },
  { id: 'cc2', name: 'Don Carlos', balance_cents: 0, active: true },
  { id: 'cc3', name: 'Cerrado', balance_cents: 900, active: false },
];

const ENTRIES: CreditEntry[] = [
  { id: 'e1', customer_id: 'cc1', type: 'debt', amount_cents: 255000, description: 'Mercado', created_by_uid: 'u1', createdAt: new Date('2026-09-01T09:00:00') },
  { id: 'e2', customer_id: 'cc1', type: 'payment', amount_cents: 100000, description: 'Abono', created_by_uid: 'u1', createdAt: new Date('2026-09-03T17:30:00') },
];

const admin: User = { id: 'a1', email: 'admin@example.com', displayName: 'Admin', role: 'admin', active: true };
const cashier: User = { ...admin, id: 'c1', role: 'cashier' };

function stubViewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === MOBILE_QUERY ? mobile : !mobile,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

function renderAs(user: User) {
  return render(
    <CurrentUserProvider value={user}>
      <Credits />
    </CurrentUserProvider>,
  );
}

describe('Credits (Fiados)', () => {
  beforeEach(() => {
    creditMock.subscribeToCreditCustomers.mockImplementation((onData: (customers: CreditCustomer[]) => void) => {
      onData(CUSTOMERS);
      return vi.fn();
    });
    creditMock.getCreditEntries.mockReset().mockResolvedValue(ENTRIES);
    creditMock.addCreditEntry.mockReset();
    creditMock.addCreditCustomer.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lists active debtors with the total owed and hides inactive ones by default', async () => {
    stubViewport(false);
    renderAs(admin);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('1 con deuda')).toBeInTheDocument();
    expect(screen.getByText(/Deuda total pendiente: \$1\.550/)).toBeInTheDocument();
    expect(screen.getByText('Doña Rosa')).toBeInTheDocument();
    expect(screen.queryByText('Cerrado')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo cliente' })).toBeInTheDocument();
  });

  it('opens the customer ledger and records a payment', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    creditMock.addCreditEntry.mockResolvedValue({ id: 'e3', customer_id: 'cc1', type: 'payment', amount_cents: 50000, description: 'Abono', created_by_uid: 'a1', createdAt: new Date() });
    renderAs(admin);
    await screen.findByRole('table');

    await user.click(screen.getAllByRole('button', { name: 'Ver movimientos' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Doña Rosa' });
    expect(within(dialog).getByText('Deuda pendiente')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('list', { name: 'Movimientos' })).toBeInTheDocument());
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);

    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await user.type(within(dialog).getByLabelText('Monto ($)'), '500');
    await user.type(within(dialog).getByLabelText('Descripción'), 'Abono');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar abono' }));

    await waitFor(() => expect(creditMock.addCreditEntry).toHaveBeenCalledWith(
      'cc1',
      { type: 'payment', amount_cents: 50000, description: 'Abono' },
      { uid: 'a1', role: 'admin' },
    ));
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
  });

  it('blocks payments above the pending balance before calling the service', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    renderAs(cashier);
    await screen.findByRole('table');

    await user.click(screen.getAllByRole('button', { name: 'Ver movimientos' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Doña Rosa' });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await user.type(within(dialog).getByLabelText('Monto ($)'), '9999');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar abono' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El abono supera la deuda pendiente');
    expect(creditMock.addCreditEntry).not.toHaveBeenCalled();
  });

  it('hides customer management from cashiers but lets them record debts', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    renderAs(cashier);

    const list = await screen.findByRole('list', { name: 'Clientes de fiado' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo cliente' })).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Ver Don Carlos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Don Carlos' });
    expect(within(dialog).queryByRole('button', { name: 'Editar Don Carlos' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Anotar fiado' })).toBeEnabled();
  });

  it('creates a customer from the form', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    creditMock.addCreditCustomer.mockResolvedValue({ id: 'cc4', name: 'Nueva', balance_cents: 0, active: true });
    renderAs(admin);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo cliente de fiado' });
    await user.type(within(dialog).getByLabelText('Nombre *'), 'Nueva');
    await user.type(within(dialog).getByLabelText('Teléfono'), '3110000000');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(creditMock.addCreditCustomer).toHaveBeenCalledWith({ name: 'Nueva', phone: '3110000000', notes: '' }));
  });
});
