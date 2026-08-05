import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
}));

import { addDoc, getDoc, getDocs, runTransaction, updateDoc } from 'firebase/firestore';
import { OrderItem, OrderStatus } from '../firebase/db';
import { resetLocalSales } from '../services/mockData';
import {
  getSuppliers,
  addSupplier,
  updateSupplier,
  toggleSupplierActive,
  deleteSupplier,
  getOrders,
  createOrder,
  updateOrderStatus,
  receiveOrderItems,
  cancelOrder,
} from '../services/supplierService';

describe('supplierService - CRUD proveedores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_USE_MOCK_DATA', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getSuppliers retorna lista de proveedores', async () => {
    const suppliers = await getSuppliers();
    expect(Array.isArray(suppliers)).toBe(true);
    expect(suppliers.length).toBeGreaterThan(0);
  });

  it('no usa proveedores mock cuando el flag explícito está desactivado', async () => {
    vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
    await expect(getSuppliers()).rejects.toThrow('Error al cargar proveedores');
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
  beforeEach(() => {
    vi.clearAllMocks();
    resetLocalSales();
    vi.stubEnv('VITE_USE_MOCK_DATA', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

describe('supplierService - Recepcion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLocalSales();
    vi.stubEnv('VITE_USE_MOCK_DATA', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('receiveOrderItems suma stock y deja orden en partial', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: 'p1', name: 'Manzana Roja', quantity: 10, unit_cost_cents: 250, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    const result = await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 5, final_cost_cents: 250 },
    ]);
    expect(result.status).toBe('partial');
    expect(result.items[0].received_quantity).toBe(5);
  });

  it('receiveOrderItems completa orden cuando todo se recibe', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: 'p1', name: 'Manzana Roja', quantity: 10, unit_cost_cents: 250, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    const result = await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 10, final_cost_cents: 250 },
    ]);
    expect(result.status).toBe('received');
    const updatedSuppliers = await getSuppliers();
    const supplier = updatedSuppliers.find(s => s.id === suppliers[0].id);
    expect(supplier?.totalOrders).toBeGreaterThan(0);
  });

  it('receiveOrderItems crea producto nuevo si isNewProduct', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ name: 'Producto Nuevo Test', category: 'Test', quantity: 5, unit_cost_cents: 1000, received_quantity: 0, isNewProduct: true } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    const result = await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 5, final_cost_cents: 1000 },
    ]);
    expect(result.items[0].product_id).toBeDefined();
    expect(result.status).toBe('received');
  });

  it('receiveOrderItems rechaza recibir mas de lo pedido', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: 'p1', name: 'Test', quantity: 5, unit_cost_cents: 100, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    await expect(
      receiveOrderItems(order.id, [{ index: 0, received_quantity: 10, final_cost_cents: 100 }])
    ).rejects.toThrow('No se puede recibir');
  });

  it('cancelOrder bloquea si hay recepcion previa', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: 'p1', name: 'Test', quantity: 10, unit_cost_cents: 100, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    await receiveOrderItems(order.id, [{ index: 0, received_quantity: 5, final_cost_cents: 100 }]);
    await expect(cancelOrder(order.id)).rejects.toThrow('No se puede cancelar');
  });

  it('cancelOrder permite cancelar sin recepcion previa', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ quantity: 5, unit_cost_cents: 100, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    await expect(cancelOrder(order.id)).resolves.not.toThrow();
  });

  it('receiveOrderItems actualiza last_cost_cents del producto existente', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: 'p1', name: 'Manzana Roja', quantity: 10, unit_cost_cents: 250, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 5, final_cost_cents: 320 },
    ]);
    const { mockProducts } = await import('../services/mockData');
    const updatedProduct = mockProducts.find((p) => p.id === 'p1');
    expect(updatedProduct?.last_cost_cents).toBe(320);
    expect(updatedProduct?.last_cost_source).toBe('purchase');
    expect(updatedProduct?.last_cost_updated_at).toBeDefined();
  });

  it('receiveOrderItems conserva last_cost_cents previo cuando final_cost_cents es undefined', async () => {
    const { mockProducts } = await import('../services/mockData');
    const target = mockProducts.find((p) => p.id === 'p1');
    const previousCost = 500;
    if (target) {
      target.last_cost_cents = previousCost;
      target.last_cost_source = 'purchase';
    }

    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: 'p1', name: 'Manzana Roja', quantity: 10, unit_cost_cents: 250, received_quantity: 0, isNewProduct: false } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 3, final_cost_cents: undefined as any },
    ]);

    const updated = mockProducts.find((p) => p.id === 'p1');
    expect(updated?.last_cost_cents).toBe(previousCost);
  });

  it('receiveOrderItems graba last_cost_cents al crear producto nuevo', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ name: 'Producto Costo Test', category: 'Test', quantity: 5, unit_cost_cents: 1000, received_quantity: 0, isNewProduct: true } as OrderItem],
    });
    await updateOrderStatus(order.id, 'ordered');
    const result = await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 5, final_cost_cents: 1234 },
    ]);
    const { mockProducts } = await import('../services/mockData');
    const created = mockProducts.find((p) => p.id === result.items[0].product_id);
    expect(created?.last_cost_cents).toBe(1234);
    expect(created?.last_cost_source).toBe('purchase');
    expect(created?.last_cost_updated_at).toBeDefined();
  });
});

describe('supplierService - Firebase configurado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'sender');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'app-id');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mantiene el resultado de una lectura exitosa de proveedores en Firestore', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      forEach: (callback: (document: { id: string; data: () => object }) => void) => {
        callback({
          id: 'supplier-1',
          data: () => ({ name: 'Proveedor Firebase', active: true, totalOrders: 2, totalSpentCents: 3000 }),
        });
      },
    } as any);

    await expect(getSuppliers()).resolves.toEqual([
      {
        id: 'supplier-1',
        name: 'Proveedor Firebase',
        active: true,
        totalOrders: 2,
        totalSpentCents: 3000,
      },
    ]);
  });

  it('mantiene los datos y el ID de un proveedor creado exitosamente en Firestore', async () => {
    vi.mocked(addDoc).mockResolvedValueOnce({ id: 'supplier-2' } as any);
    const data = {
      name: 'Proveedor Nuevo',
      contactName: 'Contacto',
      phone: '555-0000',
      email: 'proveedor@test.com',
      category: 'Test',
      active: true,
    };

    await expect(addSupplier(data)).resolves.toEqual({
      id: 'supplier-2',
      ...data,
      totalOrders: 0,
      totalSpentCents: 0,
    });
  });

  it('mantiene el resultado de una lectura exitosa de órdenes en Firestore', async () => {
    const order = {
      id: 'order-1',
      supplierId: 'supplier-1',
      supplierName: 'Proveedor Firebase',
      status: 'draft' as const,
      items: [],
      total_cents: 1000,
      received_total_cents: 0,
      date: new Date('2026-08-04T00:00:00.000Z'),
    };
    vi.mocked(getDocs).mockResolvedValueOnce({
      forEach: (callback: (document: { id: string; data: () => object }) => void) => {
        callback({
          id: order.id,
          data: () => ({
            supplierId: order.supplierId,
            supplierName: order.supplierName,
            status: order.status,
            items: order.items,
            total_cents: order.total_cents,
            received_total_cents: order.received_total_cents,
            date: order.date,
          }),
        });
      },
    } as any);

    await expect(getOrders()).resolves.toEqual([order]);
  });

  it('mantiene la actualización exitosa del estado de una orden en Firestore', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      forEach: (callback: (document: { id: string; data: () => object }) => void) => {
        callback({ id: 'order-1', data: () => ({ status: 'draft' }) });
      },
    } as any);
    vi.mocked(updateDoc).mockResolvedValueOnce(undefined);

    await expect(updateOrderStatus('order-1', 'ordered')).resolves.toBeUndefined();
    expect(updateDoc).toHaveBeenCalled();
  });

  it('rechaza la lectura de proveedores en vez de devolver una lista vacía', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission denied'));

    await expect(getSuppliers()).rejects.toThrow('Error al cargar proveedores');
  });

  it('rechaza la creación de proveedores sin exponer el error de Firebase', async () => {
    vi.mocked(addDoc).mockRejectedValueOnce(new Error('token=secret-token'));

    await expect(
      addSupplier({
        name: 'Proveedor',
        contactName: 'Contacto',
        phone: '555-0000',
        email: 'proveedor@test.com',
        category: 'Test',
        active: true,
      })
    ).rejects.toThrow('Error al crear proveedor');
  });

  it('rechaza la actualización de proveedores sin exponer el error de Firebase', async () => {
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('apiKey=secret-key'));

    await expect(updateSupplier('sup-1', { name: 'Actualizado' })).rejects.toThrow(
      'Error al actualizar proveedor'
    );
  });

  it('rechaza la eliminación de proveedores si falla la lectura en Firebase', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission denied'));

    await expect(deleteSupplier('sup-1')).rejects.toThrow('Error al eliminar proveedor');
  });

  it('sanitiza una eliminación de proveedor que rechaza con un valor no Error', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(null);

    await expect(deleteSupplier('sup-1')).rejects.toThrow('Error al eliminar proveedor');
  });

  it('rechaza la lectura de órdenes en vez de devolver una lista vacía', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission denied'));

    await expect(getOrders()).rejects.toThrow('Error al cargar órdenes de compra');
  });

  it('rechaza la creación de órdenes sin exponer el error de Firebase', async () => {
    vi.mocked(addDoc).mockRejectedValueOnce(new Error('password=secret-password'));

    await expect(
      createOrder({
        supplierId: 'sup-1',
        supplierName: 'Proveedor',
        items: [{ quantity: 1, unit_cost_cents: 100, isNewProduct: false } as OrderItem],
      })
    ).rejects.toThrow('Error al crear orden de compra');
  });

  it('rechaza la actualización de estado si falla Firebase', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission denied'));

    await expect(updateOrderStatus('order-1', 'ordered')).rejects.toThrow(
      'Error al actualizar estado de orden'
    );
  });

  it('preserva el error de orden inexistente en modo Firebase', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      forEach: () => undefined,
    } as any);

    await expect(updateOrderStatus('missing-order', 'ordered')).rejects.toThrow(
      'Orden no encontrada'
    );
  });

  it('preserva el error de transición inválida en modo Firebase', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      forEach: (callback: (document: { id: string; data: () => object }) => void) => {
        callback({ id: 'order-1', data: () => ({ status: 'received' }) });
      },
    } as any);

    await expect(updateOrderStatus('order-1', 'draft')).rejects.toThrow(
      'Transición de estado no permitida: received → draft'
    );
  });

  it('sanitiza una actualización de estado que rechaza con un valor no Error', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(null);

    await expect(updateOrderStatus('order-1', 'ordered')).rejects.toThrow(
      'Error al actualizar estado de orden'
    );
  });

  it('rechaza la recepción si falla la transacción de Firebase', async () => {
    vi.mocked(runTransaction).mockRejectedValueOnce(new Error('token=secret-token'));

    await expect(
      receiveOrderItems('order-1', [{ index: 0, received_quantity: 1, final_cost_cents: 100 }])
    ).rejects.toThrow('Error al recibir orden');
  });

  it('sanitiza una recepción que rechaza con un valor no Error', async () => {
    vi.mocked(runTransaction).mockRejectedValueOnce(null);

    await expect(
      receiveOrderItems('order-1', [{ index: 0, received_quantity: 1, final_cost_cents: 100 }])
    ).rejects.toThrow('Error al recibir orden');
  });

  it('rechaza la cancelación si falla Firebase', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('permission denied'));

    await expect(cancelOrder('order-1')).rejects.toThrow('Error al cancelar orden');
  });

  it('sanitiza una cancelación que rechaza con un valor no Error', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(null);

    await expect(cancelOrder('order-1')).rejects.toThrow('Error al cancelar orden');
  });
});
