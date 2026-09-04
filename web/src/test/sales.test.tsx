import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sale } from '../firebase/db';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

const saleMock = vi.hoisted(() => ({
  getRecentSales: vi.fn(),
}));

vi.mock('../services/saleService', () => saleMock);

import Sales from '../components/Sales';

function makeSale(id: string, total: number): Sale {
  return {
    id,
    date: new Date('2026-09-01T10:00:00'),
    total,
    payment_method: 'cash',
    items: [
      { product_id: 'p1', product_name: 'Arroz Diana', quantity: 2, price_cents: total / 2, subtotal: total },
    ],
  };
}

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

describe('Sales history', () => {
  beforeEach(() => {
    saleMock.getRecentSales.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the first page and appends the next one on demand', async () => {
    stubViewport(false);
    saleMock.getRecentSales
      .mockResolvedValueOnce({ sales: [makeSale('sale-1', 8400)], cursor: 'cursor-1', hasMore: true })
      .mockResolvedValueOnce({ sales: [makeSale('sale-2', 2000)], cursor: null, hasMore: false });
    const user = userEvent.setup();
    render(<Sales />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(saleMock.getRecentSales).toHaveBeenCalledWith(50);
    await user.click(screen.getByRole('button', { name: 'Cargar más ventas' }));

    await waitFor(() => expect(saleMock.getRecentSales).toHaveBeenLastCalledWith(50, 'cursor-1'));
    expect(await screen.findByText('$20.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más ventas' })).not.toBeInTheDocument();
  });

  it('expands sale details from the desktop table', async () => {
    stubViewport(false);
    saleMock.getRecentSales.mockResolvedValue({ sales: [makeSale('sale-1', 8400)], cursor: null, hasMore: false });
    const user = userEvent.setup();
    render(<Sales />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Ver detalles' }));
    expect(screen.getByText('Detalles de la venta')).toBeInTheDocument();
    expect(screen.getByText('Arroz Diana')).toBeInTheDocument();
  });

  it('renders expandable cards on phones', async () => {
    stubViewport(true);
    saleMock.getRecentSales.mockResolvedValue({ sales: [makeSale('sale-1', 8400)], cursor: null, hasMore: false });
    const user = userEvent.setup();
    render(<Sales />);

    const list = await screen.findByRole('list', { name: 'Ventas' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = within(list).getAllByRole('listitem')[0];
    await user.click(within(card).getByRole('button'));
    expect(within(card).getByText('Detalles de la venta')).toBeInTheDocument();
  });

  it('shows a Spanish error when the first page fails', async () => {
    stubViewport(false);
    saleMock.getRecentSales.mockRejectedValue(new Error('permission-denied'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Sales />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Error al cargar historial de ventas');
    vi.restoreAllMocks();
  });
});
