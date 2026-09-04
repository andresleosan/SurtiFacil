import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const saleMock = vi.hoisted(() => ({
  getSales: vi.fn(),
  getProducts: vi.fn(),
  getSalesSince: vi.fn(),
  getSalesTotals: vi.fn(),
}));

const reportMock = vi.hoisted(() => ({
  getSalesSummary: vi.fn(),
  getDailySales: vi.fn(),
  getTopProducts: vi.fn(),
  formatCurrency: (value: number) => `$${value}`,
  formatNumber: (value: number) => String(value),
}));

vi.mock('../services/saleService', () => saleMock);
vi.mock('../services/reportService', () => reportMock);

import Dashboard from '../components/Dashboard';
import StockAlerts from '../components/StockAlerts';
import Reports from '../components/Reports';

describe('visible data load failures', () => {
  beforeEach(() => {
    saleMock.getSales.mockReset();
    saleMock.getProducts.mockReset();
    saleMock.getSalesSince.mockReset();
    saleMock.getSalesTotals.mockReset();
    reportMock.getSalesSummary.mockReset();
    reportMock.getDailySales.mockReset();
    reportMock.getTopProducts.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a Spanish dashboard error instead of zero metrics after a load failure', async () => {
    saleMock.getSalesSince.mockRejectedValue(new Error('permission-denied'));
    saleMock.getSalesTotals.mockResolvedValue({ count: 0, totalCents: 0 });
    saleMock.getProducts.mockResolvedValue([]);

    render(<Dashboard />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los datos del panel.');
    expect(screen.queryByText('Sin datos')).not.toBeInTheDocument();
  });

  it('shows a Spanish stock error instead of a successful empty state after a load failure', async () => {
    saleMock.getProducts.mockRejectedValue(new Error('permission-denied'));

    render(<StockAlerts />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las alertas de stock.');
    expect(screen.queryByText('Todos los productos tienen stock suficiente')).not.toBeInTheDocument();
  });

  it('shows a Spanish reports error instead of empty report data after a load failure', async () => {
    reportMock.getSalesSummary.mockRejectedValue(new Error('permission-denied'));
    reportMock.getDailySales.mockResolvedValue([]);
    reportMock.getTopProducts.mockResolvedValue([]);

    render(<Reports />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los reportes.');
    expect(screen.queryByText('Sin datos de ventas')).not.toBeInTheDocument();
  });
});
