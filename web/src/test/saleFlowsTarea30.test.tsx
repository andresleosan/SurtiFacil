import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, Sale, User } from '../firebase/db';
import { CurrentUserProvider } from '../auth/CurrentUserContext';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

const productMock = vi.hoisted(() => ({
  products: [] as Product[],
  subscribeToProducts: vi.fn(),
  refreshProducts: vi.fn(),
}));

const saleMock = vi.hoisted(() => ({
  createSale: vi.fn(),
  getRecentSales: vi.fn(),
  voidSale: vi.fn(),
  getSales: vi.fn(),
}));

const creditMock = vi.hoisted(() => ({
  subscribeToCreditCustomers: vi.fn(),
}));

const reportMock = vi.hoisted(() => ({
  getSalesSummary: vi.fn(),
  getDailySales: vi.fn(),
  getTopProducts: vi.fn(),
  formatCurrency: (cents: number) => `$${(cents / 100).toLocaleString('es-CO')}`,
  formatNumber: (n: number) => n.toLocaleString('es-CO'),
}));

const marginMock = vi.hoisted(() => ({
  getMarginSummary: vi.fn(),
  getMarginDaily: vi.fn(),
  getTopProductsByMargin: vi.fn(),
  getMarginByCategory: vi.fn(),
  getNetProfitStatement: vi.fn(),
}));

vi.mock('../services/productService', () => productMock);
vi.mock('../services/saleService', () => saleMock);
vi.mock('../services/creditService', () => creditMock);
vi.mock('../services/reportService', () => reportMock);
vi.mock('../services/marginService', () => marginMock);
vi.mock('../components/BarcodeScanner', () => ({ default: () => <div>Escáner</div> }));

import CreateSale from '../components/CreateSale';
import Sales from '../components/Sales';
import Reports from '../components/Reports';
import MarginReports from '../components/MarginReports';

function stubDesktop() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query !== MOBILE_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

describe('Tarea 30 — UI Pagos Mixtos, Anulación RBAC y Estado de Resultados', () => {
  beforeEach(() => {
    stubDesktop();
    vi.clearAllMocks();
    productMock.subscribeToProducts.mockImplementation((onData: (list: Product[]) => void) => {
      onData([
        { id: 'p-leche', name: 'Leche Colanta 1L', price_cents: 450000, stock: 20, category: 'Lácteos' },
      ]);
      return vi.fn();
    });
    creditMock.subscribeToCreditCustomers.mockImplementation((onData: (list: unknown[]) => void) => {
      onData([{ id: 'cc-1', name: 'Doña Marta', balance_cents: 1000000, active: true }]);
      return vi.fn();
    });
    saleMock.createSale.mockResolvedValue('sale-mixed-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('permite pago mixto Efectivo + Fiado en CreateSale y dividir un faltante en efectivo a Nequi', async () => {
    const user = userEvent.setup();
    render(<CreateSale />);

    const catalog = await screen.findByRole('list', { name: 'Productos disponibles' });
    // Agregar 2 leches = $ 9.000 COP (900000 cents)
    const addBtn = within(catalog).getByRole('button', { name: 'Agregar Leche Colanta 1L' });
    await user.click(addBtn);
    await user.click(addBtn);

    // Probar atajo de faltante en efectivo: digita 4000 ($4.000) -> pasa faltante ($5.000) a Nequi
    const cashInput = screen.getByLabelText('Efectivo recibido en pesos');
    await user.clear(cashInput);
    await user.type(cashInput, '4000');

    const splitNequiBtn = await screen.findByRole('button', { name: /Faltante a Nequi/i });
    await user.click(splitNequiBtn);

    const mixedRegion = await screen.findByRole('region', { name: 'Desglose de pago mixto' });
    expect(mixedRegion).toHaveTextContent('✅ Cuadre exacto');

    // Cambiar preset a Efectivo + Fiado y editar efectivo a 6000 ($6.000) -> $3.000 fiado
    await user.click(within(mixedRegion).getByRole('button', { name: /Efectivo \+ 📒 Fiado/i }));
    const mixedCashInput = within(mixedRegion).getByLabelText(/Efectivo \(COP\)/i);
    await user.clear(mixedCashInput);
    await user.type(mixedCashInput, '6000');

    // Debe exigir seleccionar cliente de fiado
    const confirmBtn = screen.getByRole('button', { name: /Confirmar venta/i });
    expect(confirmBtn).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Cliente al que se le fía'), 'cc-1');
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);

    await waitFor(() => expect(saleMock.createSale).toHaveBeenCalledOnce());
    expect(saleMock.createSale.mock.calls[0][1]).toBe('mixed');
    expect(saleMock.createSale.mock.calls[0][2]).toBe('cc-1');
    expect(saleMock.createSale.mock.calls[0][4]).toEqual([
      { method: 'cash', amount_cents: 600000 },
      { method: 'credit', amount_cents: 300000 },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('🔀 Pago Mixto');
  });

  it('muestra botón de anulación solo a Admin/Manager, ejecuta voidSale y actualiza auditoría en Sales', async () => {
    const sampleSale: Sale = {
      id: 'sale-audit-1',
      date: new Date('2026-11-24T10:00:00Z'),
      total: 900000,
      payment_method: 'mixed',
      payment_breakdown: [
        { method: 'cash', amount_cents: 400000 },
        { method: 'credit', amount_cents: 500000 },
      ],
      credit_customer_id: 'cc-1',
      credit_customer_name: 'Doña Marta',
      status: 'completed',
      items: [{ product_id: 'p-leche', product_name: 'Leche Colanta 1L', quantity: 2, price_cents: 450000, subtotal: 900000 }],
    };

    saleMock.getRecentSales.mockResolvedValue({ sales: [sampleSale], cursor: null, hasMore: false });
    saleMock.voidSale.mockResolvedValue({
      success: true,
      sale: {
        ...sampleSale,
        status: 'voided',
        void_reason: 'Devolución del cliente',
        voided_by_name: 'Don Carlos',
        voided_at: '2026-11-24T11:00:00Z',
      },
      restocked_units: 2,
      credit_reversed_cents: 500000,
      loyalty_points_delta: 0,
    });

    // 1. Cajero NO ve botón de anular
    const cashierUser: User = { id: 'u-cash', email: 'c@sf.com', displayName: 'Cajero', role: 'cashier', active: true };
    const { unmount } = render(
      <CurrentUserProvider value={cashierUser}>
        <Sales />
      </CurrentUserProvider>
    );
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ver detalles' }));
    expect(screen.getByText('🔀 Desglose de Pago Mixto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular \/ Devolver Venta/i })).not.toBeInTheDocument();
    unmount();

    // 2. Admin SÍ ve botón, abre modal y anula con motivo
    const adminUser: User = { id: 'u-adm', email: 'a@sf.com', displayName: 'Don Carlos', role: 'admin', active: true };
    render(
      <CurrentUserProvider value={adminUser}>
        <Sales />
      </CurrentUserProvider>
    );
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Ver detalles' }));
    await user.click(screen.getByRole('button', { name: /Anular \/ Devolver Venta/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Devolución del cliente' }));
    await user.click(within(dialog).getByRole('button', { name: /Confirmar Anulación/i }));

    await waitFor(() => expect(saleMock.voidSale).toHaveBeenCalledWith('sale-audit-1', 'Devolución del cliente'));
    expect(await screen.findByText(/anulada\. Se reintegraron 2 unidades/i)).toBeInTheDocument();
    expect(screen.getAllByText(/🚫 Anulada/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza el Estado de Resultados de Utilidad Neta Real en Reports y MarginReports', async () => {
    const samplePnl = {
      period_days: 7,
      since_iso: new Date().toISOString(),
      active_sales_count: 5,
      voided_sales_count: 1,
      voided_sales_cents: 450000,
      revenue_cents: 5000000, // $ 50.000
      cogs_cents: 3200000, // $ 32.000
      gross_profit_cents: 1800000, // $ 18.000
      gross_margin_percent: 36,
      shrinkage_count: 1,
      shrinkage_loss_cents: 300000, // $ 3.000
      expenses_count: 2,
      operating_expenses_cents: 500000, // $ 5.000
      expenses_cash_cents: 500000,
      expenses_transfer_cents: 0,
      total_deductions_cents: 800000, // $ 8.000
      net_profit_cents: 1000000, // $ 10.000
      net_margin_percent: 20,
      payment_totals: {
        cash_cents: 3000000,
        transfer_card_cents: 1500000,
        credit_cents: 500000,
        mixed_sales_count: 1,
      },
    };

    reportMock.getSalesSummary.mockResolvedValue({
      today: 5000000,
      thisWeek: 5000000,
      thisMonth: 5000000,
      totalSales: 5,
      totalRevenue: 5000000,
      averageSale: 1000000,
    });
    reportMock.getDailySales.mockResolvedValue([]);
    reportMock.getTopProducts.mockResolvedValue([]);
    saleMock.getSales.mockResolvedValue([]);
    marginMock.getNetProfitStatement.mockResolvedValue(samplePnl);

    const { unmount } = render(<Reports />);
    const pnlSection = await screen.findByRole('region', { name: 'Estado de Resultados de Utilidad Neta Real' });
    expect(pnlSection).toHaveTextContent('$ 50.000');
    expect(pnlSection).toHaveTextContent('$ 18.000');
    expect(pnlSection).toHaveTextContent('-$ 8.000');
    expect(pnlSection).toHaveTextContent('$ 10.000');
    expect(pnlSection).toHaveTextContent('1 anulada excluida');
    unmount();

    marginMock.getMarginSummary.mockResolvedValue({
      today: { revenue_cents: 5000000, cost_cents: 3200000, margin_cents: 1800000, margin_percent: 36 },
      thisWeek: { revenue_cents: 5000000, cost_cents: 3200000, margin_cents: 1800000, margin_percent: 36 },
      thisMonth: { revenue_cents: 5000000, cost_cents: 3200000, margin_cents: 1800000, margin_percent: 36 },
      estimatedCostCount: 0,
    });
    marginMock.getMarginDaily.mockResolvedValue([]);
    marginMock.getTopProductsByMargin.mockResolvedValue([]);
    marginMock.getMarginByCategory.mockResolvedValue([]);

    render(<MarginReports />);
    const pnlMarginSection = await screen.findByRole('region', {
      name: 'Estado de Resultados de Utilidad Neta Real',
    });
    expect(pnlMarginSection).toHaveTextContent('$ 10.000');
  });
});
