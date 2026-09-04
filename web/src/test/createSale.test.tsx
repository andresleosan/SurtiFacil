import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../firebase/db';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

const productMock = vi.hoisted(() => ({
  products: [] as Product[],
  subscribeToProducts: vi.fn(),
  refreshProducts: vi.fn(),
}));

const saleMock = vi.hoisted(() => ({
  createSale: vi.fn(),
}));

const creditMock = vi.hoisted(() => ({
  subscribeToCreditCustomers: vi.fn(),
}));

vi.mock('../services/productService', () => productMock);
vi.mock('../services/saleService', () => saleMock);
vi.mock('../services/creditService', () => creditMock);
vi.mock('../components/BarcodeScanner', () => ({ default: () => <div>Escáner abierto</div> }));

import CreateSale from '../components/CreateSale';

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Arroz Diana', price_cents: 4200, stock: 2, category: 'Abarrotes', barcode: '7701234567890' },
  { id: 'p2', name: 'Leche Entera', price_cents: 3500, stock: 10, category: 'Lácteos' },
  { id: 'p3', name: 'Agotado', price_cents: 100, stock: 0 },
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

describe('CreateSale', () => {
  beforeEach(() => {
    productMock.subscribeToProducts.mockImplementation((onData: (products: Product[]) => void) => {
      onData(PRODUCTS);
      return vi.fn();
    });
    saleMock.createSale.mockReset().mockResolvedValue('sale-1');
    creditMock.subscribeToCreditCustomers.mockImplementation((onData: (customers: unknown[]) => void) => {
      onData([
        { id: 'cc1', name: 'Doña Rosa', balance_cents: 1550, active: true },
        { id: 'cc2', name: 'Inactivo', balance_cents: 0, active: false },
      ]);
      return vi.fn();
    });
  });

  it('sells on credit only after choosing an active customer', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    render(<CreateSale />);

    const list = await screen.findByRole('list', { name: 'Productos disponibles' });
    await user.click(within(list).getByRole('button', { name: 'Agregar Leche Entera' }));
    await user.click(screen.getByRole('radio', { name: /Fiado/ }));

    const confirm = screen.getByRole('button', { name: /Confirmar venta/ });
    expect(confirm).toBeDisabled();
    const select = screen.getByLabelText('Cliente al que se le fía');
    expect(within(select).queryByRole('option', { name: /Inactivo/ })).not.toBeInTheDocument();
    await user.selectOptions(select, 'cc1');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(saleMock.createSale).toHaveBeenCalledOnce());
    expect(saleMock.createSale.mock.calls[0][1]).toBe('credit');
    expect(saleMock.createSale.mock.calls[0][2]).toBe('cc1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds products by tapping, adjusts quantities and confirms the sale', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    render(<CreateSale />);

    const list = await screen.findByRole('list', { name: 'Productos disponibles' });
    expect(within(list).queryByText('Agotado')).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Agregar Arroz Diana' }));
    await user.click(within(list).getByRole('button', { name: 'Agregar Leche Entera' }));

    const cart = screen.getByRole('list', { name: 'Artículos en el carrito' });
    expect(within(cart).getAllByRole('listitem')).toHaveLength(2);
    await user.click(within(cart).getByRole('button', { name: 'Agregar uno de Leche Entera' }));
    expect(within(cart).getByRole('group', { name: 'Cantidad de Leche Entera' })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Confirmar venta/ })).toHaveTextContent('$112.00');

    await user.click(screen.getByRole('radio', { name: /Tarjeta/ }));
    await user.click(screen.getByRole('button', { name: /Confirmar venta/ }));

    await waitFor(() => expect(saleMock.createSale).toHaveBeenCalledOnce());
    expect(saleMock.createSale.mock.calls[0][0]).toEqual([
      expect.objectContaining({ product_id: 'p1', quantity: 1, subtotal: 4200 }),
      expect.objectContaining({ product_id: 'p2', quantity: 2, subtotal: 7000 }),
    ]);
    expect(saleMock.createSale.mock.calls[0][1]).toBe('card');
    expect(await screen.findByRole('status')).toHaveTextContent('Venta registrada exitosamente');
    expect(screen.getByText('El carrito está vacío')).toBeInTheDocument();
  });

  it('blocks quantities above the available stock', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    render(<CreateSale />);

    const list = await screen.findByRole('list', { name: 'Productos disponibles' });
    const add = within(list).getByRole('button', { name: 'Agregar Arroz Diana' });
    await user.click(add);
    await user.click(add);
    await user.click(add);

    expect(screen.getByRole('alert')).toHaveTextContent('Stock insuficiente para Arroz Diana. Disponible: 2');
    expect(screen.getByRole('group', { name: 'Cantidad de Arroz Diana' })).toHaveTextContent('2');
  });

  it('adds a product by typing its barcode in the search box', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    render(<CreateSale />);
    await screen.findByRole('list', { name: 'Productos disponibles' });

    await user.type(screen.getByRole('searchbox', { name: 'Buscar producto o código' }), '7701234567890{Enter}');

    const cart = screen.getByRole('list', { name: 'Artículos en el carrito' });
    expect(within(cart).getByText('Arroz Diana')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar producto o código' })).toHaveValue('');
  });

  it('keeps the cart in a bottom sheet on phones', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    render(<CreateSale />);

    const list = await screen.findByRole('list', { name: 'Productos disponibles' });
    const openCart = screen.getByRole('button', { name: /Ver carrito/ });
    expect(openCart).toBeDisabled();

    await user.click(within(list).getByRole('button', { name: 'Agregar Leche Entera' }));
    expect(screen.getByRole('button', { name: 'Ver carrito, 1 artículos, total $35.00' })).toBeEnabled();
    expect(screen.queryByRole('list', { name: 'Artículos en el carrito' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver carrito/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Carrito (1)' });
    expect(within(sheet).getByRole('list', { name: 'Artículos en el carrito' })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: /Confirmar venta/ }));
    await waitFor(() => expect(saleMock.createSale).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Carrito/ })).not.toBeInTheDocument());
  });

  it('shows the backend error message without clearing the cart', async () => {
    stubViewport(false);
    saleMock.createSale.mockRejectedValue(new Error('Demasiadas solicitudes'));
    const user = userEvent.setup();
    render(<CreateSale />);

    const list = await screen.findByRole('list', { name: 'Productos disponibles' });
    await user.click(within(list).getByRole('button', { name: 'Agregar Leche Entera' }));
    await user.click(screen.getByRole('button', { name: /Confirmar venta/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas solicitudes');
    expect(within(screen.getByRole('list', { name: 'Artículos en el carrito' })).getByText('Leche Entera')).toBeInTheDocument();
  });
});
