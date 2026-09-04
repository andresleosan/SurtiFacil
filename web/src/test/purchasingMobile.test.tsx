import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseOrder, Supplier } from '../firebase/db';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';

const supplierMock = vi.hoisted(() => ({
  getSuppliers: vi.fn(),
  addSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  toggleSupplierActive: vi.fn(),
  deleteSupplier: vi.fn(),
  getOrders: vi.fn(),
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  receiveOrderItems: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock('../services/supplierService', () => supplierMock);
vi.mock('../services/saleService', () => ({ getProducts: vi.fn().mockResolvedValue([]) }));

import Suppliers from '../components/Suppliers';
import PurchaseOrders from '../components/PurchaseOrders';

const SUPPLIERS: Supplier[] = [
  {
    id: 's1',
    name: 'Distribuidora del Norte',
    contactName: 'Juan Pérez',
    phone: '+503 7777-8888',
    category: 'Abarrotes',
    active: true,
    totalOrders: 2,
    totalSpentCents: 150000,
    lead_time_days: 5,
  },
  {
    id: 's2',
    name: 'Lácteos del Valle',
    active: false,
    totalOrders: 0,
    totalSpentCents: 0,
  },
];

const ORDERS: PurchaseOrder[] = [
  {
    id: 'order-abc123',
    supplierId: 's1',
    supplierName: 'Distribuidora del Norte',
    status: 'ordered',
    items: [
      { product_id: 'p1', name: 'Arroz', quantity: 10, received_quantity: 0, unit_cost_cents: 4000, isNewProduct: false },
    ],
    total_cents: 40000,
    received_total_cents: 0,
    date: new Date('2026-09-01T12:00:00Z'),
  },
  {
    id: 'order-def456',
    supplierId: 's1',
    supplierName: 'Distribuidora del Norte',
    status: 'draft',
    items: [
      { product_id: 'p2', name: 'Leche', quantity: 4, received_quantity: 0, unit_cost_cents: 3000, isNewProduct: false },
    ],
    total_cents: 12000,
    received_total_cents: 0,
    date: new Date('2026-09-02T12:00:00Z'),
  },
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

describe('Purchasing screens on phones and desktop', () => {
  beforeEach(() => {
    supplierMock.getSuppliers.mockReset().mockResolvedValue(SUPPLIERS);
    supplierMock.getOrders.mockReset().mockResolvedValue(ORDERS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Suppliers', () => {
    it('renders cards instead of a table on phones', async () => {
      stubViewport(true);
      render(<Suppliers />);

      const list = await screen.findByRole('list', { name: 'Proveedores' });
      expect(list).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getByText('Distribuidora del Norte')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar Distribuidora del Norte' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desactivar Distribuidora del Norte' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Activar Lácteos del Valle' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar Distribuidora del Norte' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Eliminar Lácteos del Valle' })).toBeEnabled();
    });

    it('renders the table on desktop', async () => {
      stubViewport(false);
      render(<Suppliers />);

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Proveedores' })).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Total Comprado' })).toBeInTheDocument();
      expect(screen.getByText('5 días')).toBeInTheDocument();
      expect(screen.getByText('7 días (default)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agregar Proveedor' })).toBeInTheDocument();
    });
  });

  describe('PurchaseOrders', () => {
    it('renders cards instead of a table on phones', async () => {
      stubViewport(true);
      render(<PurchaseOrders />);

      const list = await screen.findByRole('list', { name: 'Órdenes de compra' });
      expect(list).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getByText('📤 Ordenada')).toBeInTheDocument();
      expect(screen.getByText('✏️ Borrador')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recibir orden order-' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Cancelar orden/ })).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Ordenar orden order-' })).toBeInTheDocument();
    });

    it('renders the table on desktop', async () => {
      stubViewport(false);
      render(<PurchaseOrders />);

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Órdenes de compra' })).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Proveedor' })).toBeInTheDocument();
      expect(screen.getByLabelText('Estado')).toBeInTheDocument();
      expect(screen.getByLabelText('Proveedor')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nueva Orden' })).toBeInTheDocument();
    });
  });
});
