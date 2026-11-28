import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUserProvider } from '../auth/CurrentUserContext';
import CashShiftModal from '../components/CashShiftModal';
import { User } from '../firebase/db';
import { clearMockCashExpenses, recordCashExpense } from '../services/cashExpenseService';
import { getCashShiftSummary, recordCashClosing } from '../services/cashClosingService';
import {
  clearMockCashShifts,
  getActiveCashShift,
  getCashShifts,
  openCashShift,
  recordCashWithdrawal,
} from '../services/cashShiftService';
import { CashClosing } from '../types/cashClosing';
import {
  calculateClosingStatus,
  calculateExpectedDrawerCashCents,
  shouldAlertHighCashDrawer,
  validateCashWithdrawalInput,
  validateOpenShiftInput,
} from '../utils/cashShiftAccounting';
import { exportClosingsToCSV } from '../utils/csvExporter';
import { generateCashClosingReceiptText, generateCashClosingWhatsAppText } from '../utils/receiptGenerator';

const ADMIN_USER: User = {
  id: 'admin-test-1',
  email: 'admin@surtifacil.com',
  displayName: 'Don Carlos (Admin)',
  role: 'admin',
  active: true,
  createdAt: new Date(),
};

const CASHIER_USER: User = {
  id: 'cashier-test-1',
  email: 'cajero@surtifacil.com',
  displayName: 'Mateo (Cajero)',
  role: 'cashier',
  active: true,
  createdAt: new Date(),
};

describe('Turnos de Caja, Base Inicial COP y Sangrías de Seguridad (Tarea 33)', () => {
  beforeEach(() => {
    clearMockCashShifts();
    clearMockCashExpenses();
  });

  it('valida reglas puras de apertura, sangrías, cálculo esperado y alerta de exceso en cajón', () => {
    expect(validateOpenShiftInput({ initial_cash_cents: -100 }).valid).toBe(false);
    expect(validateOpenShiftInput({ initial_cash_cents: 6000000000 }).valid).toBe(false);
    const validOpen = validateOpenShiftInput({
      initial_cash_cents: 15000000,
      shift_label: 'manana',
      opening_notes: '  Base en sencillo  ',
    });
    expect(validOpen).toEqual({
      valid: true,
      initial_cash_cents: 15000000,
      shift_label: 'manana',
      opening_notes: 'Base en sencillo',
    });

    expect(validateCashWithdrawalInput({ amount_cents: 0, reason: 'Caja fuerte' }).valid).toBe(false);
    expect(validateCashWithdrawalInput({ amount_cents: 5000000, reason: 'ab' }).valid).toBe(false);
    const validWithdrawal = validateCashWithdrawalInput({
      amount_cents: 5000000,
      destination: 'entrega_dueno',
      reason: 'Entrega parcial al dueño',
      received_by: 'Don Carlos',
    });
    expect(validWithdrawal).toEqual({
      valid: true,
      amount_cents: 5000000,
      destination: 'entrega_dueno',
      reason: 'Entrega parcial al dueño',
      received_by: 'Don Carlos',
    });

    const expected = calculateExpectedDrawerCashCents({
      initial_cash_cents: 15000000, // $ 150.000
      sales_cash_cents: 22000000, // $ 220.000
      credit_payments_cash_cents: 3000000, // $ 30.000
      expenses_cash_cents: 2000000, // $ 20.000
      withdrawals_cash_cents: 8000000, // $ 80.000
    });
    expect(expected).toBe(30000000); // $ 300.000 COP

    expect(calculateClosingStatus(30000000, 30000000)).toEqual({
      difference_cents: 0,
      status: 'balanced',
    });
    expect(calculateClosingStatus(30000000, 30500000)).toEqual({
      difference_cents: 500000,
      status: 'surplus',
    });
    expect(calculateClosingStatus(30000000, 29000000)).toEqual({
      difference_cents: -1000000,
      status: 'shortage',
    });

    expect(shouldAlertHighCashDrawer(49999900)).toBe(false);
    expect(shouldAlertHighCashDrawer(50000000)).toBe(true);
  });

  it('abre turno, impide doble apertura, descuenta sangrías y gastos en arqueo y cierra el turno', async () => {
    const shift = await openCashShift({
      initial_cash_cents: 15000000, // $ 150.000 COP
      shift_label: 'manana',
      opening_notes: 'Apertura turno mañana',
    });
    expect(shift.shift_number).toBe(1);
    expect(shift.status).toBe('open');

    await expect(
      openCashShift({
        initial_cash_cents: 10000000,
        shift_label: 'tarde',
      })
    ).rejects.toThrow(/Ya existe un turno de caja abierto/i);

    await recordCashExpense({
      category: 'insumos_bolsas',
      description: 'Bolsas de mercado',
      amount_cents: 1000000, // $ 10.000
      payment_method: 'cash',
    });

    await recordCashWithdrawal({
      amount_cents: 5000000, // $ 50.000
      destination: 'caja_fuerte',
      reason: 'Resguardo preventivo billetes de 50',
      received_by: 'Caja fuerte bodega',
    });

    const activeState = await getActiveCashShift();
    expect(activeState.active_shift?.id).toBe(shift.id);
    expect(activeState.withdrawals).toHaveLength(1);
    expect(activeState.withdrawals_total_cents).toBe(5000000);

    const summary = await getCashShiftSummary(10000000);
    // La base autoritativa del turno ($ 150.000) prevalece sobre el parámetro por defecto ($ 100.000)
    expect(summary.initial_cash_cents).toBe(15000000);
    expect(summary.expenses_cash_cents).toBe(1000000);
    expect(summary.withdrawals_cash_cents).toBe(5000000);
    expect(summary.expected_cash_cents).toBe(
      15000000 + summary.sales_cash_cents - 1000000 - 5000000
    );

    const closing = await recordCashClosing({
      initial_cash_cents: 15000000,
      breakdown: { bills: { '50000': 1, '20000': 2 }, coins: {} },
      notes: 'Cierre de prueba con sangría',
    });
    expect(closing.shift_id).toBe(shift.id);
    expect(closing.withdrawals_cash_cents).toBe(5000000);

    const afterClose = await getActiveCashShift();
    expect(afterClose.active_shift).toBeNull();

    const history = await getCashShifts();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('closed');
    expect(history[0].withdrawals_total_cents).toBe(5000000);
  });

  it('CashShiftModal permite abrir turno, registrar sangría y aplica RBAC en anulación', async () => {
    const user = userEvent.setup();
    const onShiftChanged = vi.fn();

    const { rerender } = render(
      <CurrentUserProvider value={CASHIER_USER}>
        <CashShiftModal
          isOpen={true}
          onClose={vi.fn()}
          onShiftChanged={onShiftChanged}
        />
      </CurrentUserProvider>
    );

    const dialog = await screen.findByRole('dialog', {
      name: /Turnos de Caja y Sangrías de Seguridad/i,
    });
    expect(dialog).toBeInTheDocument();

    // Seleccionar Turno Mañana y preset $ 150.000
    await user.click(within(dialog).getByRole('button', { name: /Turno Mañana/i }));
    await user.click(within(dialog).getByRole('button', { name: '$ 150.000' }));
    await user.click(within(dialog).getByRole('button', { name: /Abrir Turno de Caja/i }));

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent(/Turno #1 abierto con base de \$ 150\.000/i);
    });
    expect(within(dialog).getByText('🟢 Turno #1 Abierto')).toBeInTheDocument();
    expect(onShiftChanged).toHaveBeenCalledTimes(1);

    // Ir a pestaña Sangrías y registrar retiro de $ 50.000
    await user.click(within(dialog).getByRole('button', { name: /Sangrías/i }));
    await user.click(within(dialog).getByRole('button', { name: /Entrega al Dueño/i }));
    await user.click(within(dialog).getByRole('button', { name: '$ 50.000' }));
    await user.type(within(dialog).getByLabelText(/Motivo \/ Concepto/i), 'Entrega de efectivo a Don Carlos');
    await user.type(within(dialog).getByLabelText(/Recibido por \/ Custodia/i), 'Don Carlos');
    await user.click(within(dialog).getByRole('button', { name: /Registrar Sangría de Seguridad/i }));

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent(/Sangría registrada: \$ 50\.000/i);
    });

    // Como cajero NO debe ver el botón Anular
    expect(
      within(dialog).queryByRole('button', { name: /Anular sangría Entrega de efectivo a Don Carlos/i })
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Solo Admin o Gerente puede anular sangrías/i)).toBeInTheDocument();

    // Al re-renderizar como Admin, sí puede anular en 2 toques
    rerender(
      <CurrentUserProvider value={ADMIN_USER}>
        <CashShiftModal
          isOpen={true}
          onClose={vi.fn()}
          initialTab="withdrawals"
          onShiftChanged={onShiftChanged}
        />
      </CurrentUserProvider>
    );

    const adminList = await within(dialog).findByRole('list', { name: /Sangrías registradas en el turno/i });
    await user.click(
      within(adminList).getByRole('button', { name: /Anular sangría Entrega de efectivo a Don Carlos/i })
    );
    await user.click(
      within(adminList).getByRole('button', { name: /Confirmar anulación de sangría Entrega de efectivo a Don Carlos/i })
    );

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent(/Sangría de seguridad anulada/i);
    });

    // Consultar historial de turnos
    await user.click(within(dialog).getByRole('button', { name: /Historial/i }));
    const historyList = await within(dialog).findByRole('list', { name: /Historial de turnos de caja/i });
    expect(within(historyList).getByText(/Turno #1/i)).toBeInTheDocument();
  }, 20000);

  it('incluye trazabilidad de apertura y sangrías en tirilla térmica, WhatsApp y exportación CSV', () => {
    const closingWithShift: CashClosing = {
      id: 'cclose-shift-1',
      negocio_id: 'surtifacil',
      closing_number: 12,
      opened_at: '2026-11-28T07:00:00Z',
      closed_at: '2026-11-28T15:00:00Z',
      closed_by_uid: 'u-admin',
      closed_by_name: 'Don Carlos',
      opened_by_uid: 'u-cashier',
      opened_by_name: 'Mateo Restrepo',
      initial_cash_cents: 15000000,
      sales_cash_cents: 12000000,
      credit_payments_cash_cents: 0,
      expenses_cash_cents: 1000000,
      withdrawals_cash_cents: 5000000,
      expected_cash_cents: 21000000,
      counted_cash_cents: 21000000,
      difference_cents: 0,
      status: 'balanced',
      breakdown: { bills: { '100000': 2, '10000': 1 }, coins: {} },
      total_sales_count: 14,
    };

    const thermal = generateCashClosingReceiptText(closingWithShift, { nombre: 'SurtiFácil' }, { width: '58mm' });
    expect(thermal).toContain('Apertura:');
    expect(thermal).toContain('Mateo Restrepo');
    expect(thermal).toContain('Sangrías Caja (-):');
    expect(thermal).toContain('-$ 50.000');

    const wa = generateCashClosingWhatsAppText(closingWithShift, { nombre: 'SurtiFácil' });
    expect(wa).toContain('Apertura: Mateo Restrepo');
    expect(wa).toContain('Sangrías Seguridad (-): -$ 50.000');

    expect(() => exportClosingsToCSV([closingWithShift])).not.toThrow();
  });
});
