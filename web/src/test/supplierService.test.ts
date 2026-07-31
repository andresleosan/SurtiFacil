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

import {
  getSuppliers,
  addSupplier,
  updateSupplier,
  toggleSupplierActive,
  deleteSupplier,
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
