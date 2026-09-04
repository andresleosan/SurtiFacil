import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, User } from '../firebase/db';
import { CurrentUserProvider } from '../auth/CurrentUserContext';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

const productMock = vi.hoisted(() => ({
  subscribeToProducts: vi.fn(),
  refreshProducts: vi.fn(),
  addProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

vi.mock('../services/productService', () => productMock);
vi.mock('../components/BarcodeScanner', () => ({ default: () => <div>Escáner abierto</div> }));
vi.mock('../components/AddProductModal', () => ({ default: () => null }));

import Inventory from '../components/Inventory';

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Arroz Diana', price_cents: 4200, stock: 20, category: 'Abarrotes', barcode: '770123' },
  { id: 'p2', name: 'Leche Entera', price_cents: 3500, stock: 3, category: 'Lácteos' },
  { id: 'p3', name: 'Jabón', price_cents: 1200, stock: 0, category: 'Limpieza' },
];

const admin: User = { id: 'a1', email: 'admin@example.com', displayName: 'Admin', role: 'admin', active: true };
const manager: User = { ...admin, id: 'm1', role: 'manager' };
const cashier: User = { ...admin, id: 'c1', role: 'cashier' };

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

function renderAs(user: User) {
  return render(
    <CurrentUserProvider value={user}>
      <Inventory />
    </CurrentUserProvider>,
  );
}

describe('Inventory', () => {
  beforeEach(() => {
    productMock.subscribeToProducts.mockImplementation((onData: (products: Product[]) => void) => {
      onData(PRODUCTS);
      return vi.fn();
    });
    productMock.deleteProduct.mockReset().mockResolvedValue(undefined);
    productMock.updateProduct.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the table with stock badges and the alert counter on desktop', async () => {
    stubViewport(false);
    renderAs(admin);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('2 alertas')).toBeInTheDocument();
    expect(screen.getByText('Sin stock')).toBeInTheDocument();
    expect(screen.getByText('Crítico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Arroz Diana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Arroz Diana' })).toBeInTheDocument();
  });

  it('filters by name, category or barcode', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    renderAs(admin);
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: /Buscar/ }), '770123');
    expect(screen.getByText('Arroz Diana')).toBeInTheDocument();
    expect(screen.queryByText('Leche Entera')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: /Buscar/ }));
    await user.type(screen.getByRole('searchbox', { name: /Buscar/ }), 'limpieza');
    expect(screen.getByText('Jabón')).toBeInTheDocument();
    expect(screen.queryByText('Arroz Diana')).not.toBeInTheDocument();
  });

  it('hides edit and delete actions from cashiers and delete from managers', async () => {
    stubViewport(false);
    const { unmount } = renderAs(cashier);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar producto' })).not.toBeInTheDocument();
    unmount();

    renderAs(manager);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Editar Arroz Diana' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    renderAs(admin);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Eliminar Leche Entera' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Eliminar producto' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(productMock.deleteProduct).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Eliminar Leche Entera' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(productMock.deleteProduct).toHaveBeenCalledWith('p2'));
  });

  it('edits a product through the responsive modal', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    renderAs(admin);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Editar Arroz Diana' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar producto' });
    const stock = within(dialog).getByLabelText('Stock');
    await user.clear(stock);
    await user.type(stock, '25');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(productMock.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', stock: 25 })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar producto' })).not.toBeInTheDocument());
  });

  it('renders cards and a floating add button on phones', async () => {
    stubViewport(true);
    renderAs(admin);

    const list = await screen.findByRole('list', { name: 'Productos' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Editar Jabón' })).toBeInTheDocument();
  });

  it('shows the load error in Spanish', async () => {
    stubViewport(false);
    productMock.subscribeToProducts.mockImplementation((_: unknown, onError: (error: Error) => void) => {
      onError(new Error('Error al cargar productos'));
      return vi.fn();
    });
    renderAs(admin);

    expect(await screen.findByRole('alert')).toHaveTextContent('Error al cargar productos');
  });
});
