import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PettyCashModal from '../components/PettyCashModal';
import {
  clearMockCashExpenses,
  getCashExpenses,
  recordCashExpense,
} from '../services/cashExpenseService';
import { getCashShiftSummary } from '../services/cashClosingService';
import { generateCashClosingReceiptText, generateCashClosingWhatsAppText } from '../utils/receiptGenerator';
import { CashClosing } from '../types/cashClosing';

describe('Módulo de Caja Menor y Gastos del Turno (cashExpense)', () => {
  beforeEach(() => {
    clearMockCashExpenses();
  });

  it('valida concepto y monto mayor a 0 antes de guardar un egreso', async () => {
    await expect(
      recordCashExpense({
        category: 'otro',
        description: '   ',
        amount_cents: 1000000,
      })
    ).rejects.toThrow(/descripción/i);

    await expect(
      recordCashExpense({
        category: 'otro',
        description: 'Bolsas plásticas',
        amount_cents: 0,
      })
    ).rejects.toThrow(/mayor a \$ 0/i);
  });

  it('descuenta únicamente los gastos en efectivo del resumen de arqueo de caja', async () => {
    const baseSummary = await getCashShiftSummary(10000000); // Base $100.000

    await recordCashExpense({
      category: 'proveedor_contado',
      description: 'Pago panadería del día',
      beneficiary: 'Panadería El Trigo',
      amount_cents: 2000000, // $ 20.000 COP en efectivo
      payment_method: 'cash',
    });

    await recordCashExpense({
      category: 'servicios_aseo',
      description: 'Factura internet Nequi',
      amount_cents: 4500000, // $ 45.000 COP por transferencia (no afecta caja física)
      payment_method: 'transfer',
    });

    const updatedSummary = await getCashShiftSummary(10000000);
    expect(updatedSummary.expenses_cash_cents).toBe(2000000);
    expect(updatedSummary.expenses_cash_count).toBe(1);
    expect(updatedSummary.expected_cash_cents).toBe(baseSummary.expected_cash_cents - 2000000);

    const list = await getCashExpenses();
    expect(list).toHaveLength(2);
  });

  it('renderiza PettyCashModal, registra una salida con botón rápido COP y permite anular en 2 toques', async () => {
    const user = userEvent.setup();
    const onExpenseChanged = vi.fn();

    render(
      <PettyCashModal
        isOpen={true}
        onClose={vi.fn()}
        onExpenseChanged={onExpenseChanged}
      />
    );

    const dialog = await screen.findByRole('dialog', { name: /Caja Menor y Gastos del Turno/i });
    expect(dialog).toBeInTheDocument();

    // Verificar categorías paisas
    expect(within(dialog).getByRole('button', { name: /Proveedor Contado/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: /Bolsas e Insumos/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Domicilios \/ Transporte/i })).toBeInTheDocument();

    // Validación visual si se intenta enviar sin monto
    await user.click(within(dialog).getByRole('button', { name: /Registrar Salida de Caja/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/monto válido/i);

    // Seleccionar categoría "Bolsas e Insumos" y botón rápido "$ 20.000"
    await user.click(within(dialog).getByRole('button', { name: /Bolsas e Insumos/i }));
    await user.click(within(dialog).getByRole('button', { name: '$ 20.000' }));

    await user.type(
      within(dialog).getByLabelText(/Concepto \/ Descripción/i),
      'Compra de bolsas y rollos térmicos'
    );
    await user.type(
      within(dialog).getByLabelText(/Proveedor o Beneficiario/i),
      'Plásticos Medellín'
    );

    await user.click(within(dialog).getByRole('button', { name: /Registrar Salida de Caja/i }));

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent(/Salida registrada: \$ 20\.000/i);
    });
    expect(onExpenseChanged).toHaveBeenCalledTimes(1);

    const list = within(dialog).getByRole('list', { name: /Gastos registrados en el turno/i });
    expect(within(list).getByText('Compra de bolsas y rollos térmicos')).toBeInTheDocument();
    expect(within(list).getByText(/Plásticos Medellín/i)).toBeInTheDocument();

    // Anular gasto en 2 toques sin window.confirm
    await user.click(within(list).getByRole('button', { name: /Anular gasto Compra de bolsas y rollos térmicos/i }));
    const confirmBtn = within(list).getByRole('button', { name: /Confirmar anulación/i });
    expect(confirmBtn).toBeInTheDocument();
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(within(dialog).queryByText('Compra de bolsas y rollos térmicos')).not.toBeInTheDocument();
    });
    expect(onExpenseChanged).toHaveBeenCalledTimes(2);
  });

  it('incluye gastos de caja menor descontados en tirilla térmica y mensaje WhatsApp de cierre', () => {
    const closingWithExpenses: CashClosing = {
      id: 'cclose-exp-1',
      negocio_id: 'surtifacil',
      closing_number: 7,
      opened_at: '2026-11-13T07:00:00Z',
      closed_at: '2026-11-13T19:00:00Z',
      closed_by_uid: 'u-1',
      closed_by_name: 'Mateo Cajero',
      initial_cash_cents: 10000000,
      sales_cash_cents: 5000000,
      credit_payments_cash_cents: 0,
      expenses_cash_cents: 1500000,
      expected_cash_cents: 13500000,
      counted_cash_cents: 13500000,
      difference_cents: 0,
      status: 'balanced',
      breakdown: { bills: { '100000': 1, '20000': 1, '10000': 1, '5000': 1 }, coins: {} },
      total_sales_count: 5,
    };

    const receipt = generateCashClosingReceiptText(closingWithExpenses, { nombre: 'SurtiFácil' }, { width: '58mm' });
    expect(receipt).toContain('Gastos Caja Menor (-):');
    expect(receipt).toContain('-$ 15.000');

    const waText = generateCashClosingWhatsAppText(closingWithExpenses, { nombre: 'SurtiFácil' });
    expect(waText).toContain('Gastos Caja Menor (-): -$ 15.000');
  });
});
