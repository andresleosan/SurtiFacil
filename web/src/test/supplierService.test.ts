import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase/config', () => ({ db: null }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
}));

import { OrderItem, OrderStatus } from '../firebase/db';
import {
  getSuppliers,
  addSupplier,
  updateSupplier,
  toggleSupplierActive,
  deleteSupplier,
  getOrders,
  createOrder,
  updateOrderStatus,
} from '../services/supplierService';

describe('supplierService - CRUD proveedores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSuppliers retorna lista de proveedores', async () => {
    const suppliers = await getSuppliers();
    expect(Array.isArray(suppliers)).toBe(true);
    expect(suppliers.length).toBeGreaterThan(0);
  });

  it('addSupplier crea proveedor con contadores en 0', async () => {
    const newSupplier = await addSupplier({
      name: 'Nuevo Proveedor',
      contactName: 'Test',
      phone: '555-9999',
      email: 'test@test.com',
      category: 'Test',
      active: true,
    });
    expect(newSupplier.totalOrders).toBe(0);
    expect(newSupplier.totalSpentCents).toBe(0);
    expect(newSupplier.active).toBe(true);
  });

  it('updateSupplier actualiza campos', async () => {
    const suppliers = await getSuppliers();
    await updateSupplier(suppliers[0].id, { name: 'Nombre Actualizado' });
    const updated = await getSuppliers();
    const found = updated.find((s) => s.id === suppliers[0].id);
    expect(found?.name).toBe('Nombre Actualizado');
  });

  it('toggleSupplierActive alterna el estado activo', async () => {
    const suppliers = await getSuppliers();
    const first = suppliers[0];
    await toggleSupplierActive(first.id, !first.active);
    const updated = await getSuppliers();
    const found = updated.find((s) => s.id === first.id);
    expect(found?.active).toBe(!first.active);
  });

  it('deleteSupplier elimina proveedor sin órdenes', async () => {
    const supplier = await addSupplier({
      name: 'Para Eliminar',
      contactName: 'X',
      phone: 'X',
      email: 'x@x.com',
      category: 'X',
      active: true,
    });
    await deleteSupplier(supplier.id);
    const remaining = await getSuppliers();
    expect(remaining.find((s) => s.id === supplier.id)).toBeUndefined();
  });
});

describe('supplierService - Órdenes de compra', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('createOrder crea orden en estado draft con received_quantity en 0', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id,
      supplierName: suppliers[0].name,
      items: [
        { quantity: 10, unit_cost_cents: 1000, received_quantity: 0, isNewProduct: false } as OrderItem,
      ],
    });
    expect(order.status).toBe('draft');
    expect(order.total_cents).toBe(10000);
    expect(order.items[0].received_quantity).toBe(0);
  });

  it('updateOrderStatus permite draft a ordered', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ quantity: 5, unit_cost_cents: 500, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    const orders = await getOrders();
    const updated = orders.find(o => o.id === order.id);
    expect(updated?.status).toBe('ordered');
  });

  it('updateOrderStatus bloquea transicion invalida (received a draft)', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ quantity: 5, unit_cost_cents: 500, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    await expect(updateOrderStatus(order.id, 'draft')).rejects.toThrow('no permitida');
  });

  it('getOrders filtra por estado', async () => {
    const orders = await getOrders({ status: 'draft' });
    expect(orders.every(o => o.status === 'draft')).toBe(true);
  });

  it('getOrders filtra por proveedor', async () => {
    const suppliers = await getSuppliers();
    const orders = await getOrders({ supplierId: suppliers[0].id });
    expect(orders.every(o => o.supplierId === suppliers[0].id)).toBe(true);
  });
});
