import { Supplier, PurchaseOrder, OrderStatus, OrderItem, Product } from '../firebase/db';
import { mockSuppliers, mockOrders, mockProducts } from './mockData';
import { apiClient, emitDataChange } from './apiClient';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['partial', 'received', 'cancelled'],
  partial: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function mapSupplier(row: any): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name ?? row.contactName ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    category: row.category ?? undefined,
    active: row.active === 1 || row.active === true,
    totalOrders: row.total_orders ?? row.totalOrders ?? 0,
    totalSpentCents: row.total_spent_cents ?? row.totalSpentCents ?? 0,
    lead_time_days: row.lead_time_days ?? row.leadTimeDays ?? undefined,
    createdAt: row.created_at || row.createdAt,
  };
}

function mapOrder(row: any): PurchaseOrder {
  return {
    id: row.id,
    supplierId: row.supplier_id ?? row.supplierId,
    supplierName: row.supplier_name ?? row.supplierName,
    status: row.status,
    total_cents: row.total_cents,
    received_total_cents: row.received_total_cents ?? 0,
    date: row.created_at || row.date || new Date(),
    expectedDate: row.expected_date ?? row.expectedDate ?? undefined,
    receivedDate: row.received_date ?? row.receivedDate ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at || row.createdAt || new Date(),
    items: (row.items || []).map((it: any) => ({
      product_id: it.product_id ?? undefined,
      name: it.name,
      category: it.category ?? undefined,
      quantity: it.quantity,
      received_quantity: it.received_quantity ?? 0,
      unit_cost_cents: it.unit_cost_cents,
      final_cost_cents: it.final_cost_cents ?? undefined,
      isNewProduct: it.is_new_product === 1 || it.is_new_product === true || it.isNewProduct === true,
    })),
  };
}

export async function getSuppliers(): Promise<Supplier[]> {
  if (isMockMode()) {
    return mockSuppliers.map((s) => ({ ...s }));
  }

  try {
    const list = await apiClient.get<any[]>('/suppliers');
    return (list || []).map(mapSupplier);
  } catch {
    console.error('Error getting suppliers from Firebase');
    throw new Error('Error al cargar proveedores');
  }
}

export async function addSupplier(
  data: Omit<Supplier, 'id' | 'totalOrders' | 'totalSpentCents' | 'createdAt'>
): Promise<Supplier> {
  if (isMockMode()) {
    const newSupplier: Supplier = {
      id: `sup-${Date.now()}`,
      ...data,
      totalOrders: 0,
      totalSpentCents: 0,
      createdAt: new Date(),
    };
    mockSuppliers.push(newSupplier);
    return newSupplier;
  }

  try {
    const payload = {
      name: data.name,
      contact_name: data.contactName,
      phone: data.phone,
      email: data.email,
      address: data.address,
      category: data.category,
      lead_time_days: data.lead_time_days,
    };
    const created = await apiClient.post<any>('/suppliers', payload);
    emitDataChange('suppliers');
    return mapSupplier(created);
  } catch {
    console.error('Error adding supplier to Firebase');
    throw new Error('Error al crear proveedor');
  }
}

export async function updateSupplier(
  id: string,
  data: Partial<Supplier>
): Promise<void> {
  if (isMockMode()) {
    const supplier = mockSuppliers.find((s) => s.id === id);
    if (supplier) {
      Object.assign(supplier, data);
    }
    return;
  }

  try {
    const payload: any = { ...data };
    if (data.contactName !== undefined) payload.contact_name = data.contactName;
    await apiClient.put(`/suppliers/${encodeURIComponent(id)}`, payload);
    emitDataChange('suppliers');
  } catch {
    console.error('Error updating supplier in Firebase');
    throw new Error('Error al actualizar proveedor');
  }
}

export async function toggleSupplierActive(
  id: string,
  active: boolean
): Promise<void> {
  await updateSupplier(id, { active });
}

export async function deleteSupplier(id: string): Promise<void> {
  if (isMockMode()) {
    const supplier = mockSuppliers.find((s) => s.id === id);
    if (supplier && supplier.totalOrders > 0) {
      throw new Error('No se puede eliminar: tiene órdenes asociadas');
    }
    for (let i = mockSuppliers.length - 1; i >= 0; i--) {
      if (mockSuppliers[i].id === id) {
        mockSuppliers.splice(i, 1);
      }
    }
    return;
  }

  try {
    await apiClient.delete(`/suppliers/${encodeURIComponent(id)}`);
    emitDataChange('suppliers');
  } catch (error: any) {
    const msg = getErrorMessage(error);
    if (msg.includes('No se puede eliminar: tiene órdenes asociadas') || msg.includes('órdenes asociadas')) {
      throw new Error('No se puede eliminar: tiene órdenes asociadas');
    }
    console.error('Error deleting supplier from Firebase');
    throw new Error('Error al eliminar proveedor');
  }
}

export async function getOrders(filters?: {
  status?: OrderStatus;
  supplierId?: string;
}): Promise<PurchaseOrder[]> {
  if (isMockMode()) {
    let orders = mockOrders.map((o) => ({ ...o }));
    if (filters?.status) {
      orders = orders.filter((o) => o.status === filters.status);
    }
    if (filters?.supplierId) {
      orders = orders.filter((o) => o.supplierId === filters.supplierId);
    }
    return orders;
  }

  try {
    const list = await apiClient.get<any[]>('/orders');
    let orders = (list || []).map(mapOrder);

    if (filters?.status) {
      orders = orders.filter((o) => o.status === filters.status);
    }
    if (filters?.supplierId) {
      orders = orders.filter((o) => o.supplierId === filters.supplierId);
    }
    return orders;
  } catch {
    console.error('Error getting orders from Firebase');
    throw new Error('Error al cargar órdenes de compra');
  }
}

export async function createOrder(data: {
  supplierId: string;
  supplierName: string;
  items: OrderItem[];
  expectedDate?: any;
  notes?: string;
}): Promise<PurchaseOrder> {
  const items = data.items.map((item) => ({
    ...item,
    received_quantity: item.received_quantity ?? 0,
  }));

  const total_cents = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_cost_cents,
    0
  );

  const orderData = {
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    status: 'draft' as OrderStatus,
    items,
    total_cents,
    received_total_cents: 0,
    expectedDate: data.expectedDate,
    notes: data.notes,
  };

  if (isMockMode()) {
    const newOrder: PurchaseOrder = {
      id: `order-${Date.now()}`,
      ...orderData,
      date: new Date(),
      createdAt: new Date(),
    };
    mockOrders.push(newOrder);
    return newOrder;
  }

  try {
    const payload = {
      supplier_id: data.supplierId,
      supplier_name: data.supplierName,
      items: items.map((it) => ({
        product_id: it.product_id,
        name: it.name,
        category: it.category,
        quantity: it.quantity,
        unit_cost_cents: it.unit_cost_cents,
      })),
      expected_date: data.expectedDate,
      notes: data.notes,
    };

    const res = await apiClient.post<any>('/orders', payload);
    emitDataChange('orders');

    return {
      id: res.id,
      ...orderData,
      date: new Date(),
      createdAt: new Date(),
    };
  } catch {
    console.error('Error creating order in Firebase');
    throw new Error('Error al crear orden de compra');
  }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<void> {
  if (isMockMode()) {
    const order = mockOrders.find((o) => o.id === orderId);
    if (!order) {
      throw new Error('Orden no encontrada');
    }
    if (order.status === newStatus) return;
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Transición de estado no permitida: ${order.status} → ${newStatus}`
      );
    }
    order.status = newStatus;
    return;
  }

  try {
    const orders = await getOrders();
    const current = orders.find((o) => o.id === orderId);
    if (!current) {
      throw new Error('Orden no encontrada');
    }

    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Transición de estado no permitida: ${current.status} → ${newStatus}`
      );
    }
    if (current.status === newStatus) return;

    await apiClient.put(`/orders/${encodeURIComponent(orderId)}`, { status: newStatus });
    emitDataChange('orders');
  } catch (error: any) {
    const message = getErrorMessage(error);
    if (message === 'Orden no encontrada' || message.includes('no permitida')) {
      throw error;
    }
    console.error('Error updating order status in Firebase');
    throw new Error('Error al actualizar estado de orden');
  }
}

export interface ReceiveItem {
  index: number;
  received_quantity: number;
  final_cost_cents: number;
}

export async function receiveOrderItems(
  orderId: string,
  receives: ReceiveItem[]
): Promise<PurchaseOrder> {
  if (isMockMode()) {
    const order = mockOrders.find((o) => o.id === orderId);
    if (!order) throw new Error('Orden no encontrada');

    for (const r of receives) {
      const item = order.items[r.index];
      if (!item) throw new Error(`Ítem en índice ${r.index} no existe`);
      const cumulative = item.received_quantity + r.received_quantity;
      if (cumulative > item.quantity) {
        throw new Error(
          `No se puede recibir más de lo pedido en "${item.name || item.product_id}". Pedido: ${item.quantity}, ya recibido: ${item.received_quantity}, intento: ${r.received_quantity}`
        );
      }
    }

    for (const r of receives) {
      const item = order.items[r.index];
      item.received_quantity += r.received_quantity;
      item.final_cost_cents = r.final_cost_cents;

      if (r.received_quantity > 0) {
        if (item.product_id) {
          const product = mockProducts.find((p) => p.id === item.product_id);
          if (product) {
            product.stock += r.received_quantity;
            if (r.final_cost_cents !== undefined && r.final_cost_cents !== null) {
              product.last_cost_cents = r.final_cost_cents;
              product.last_cost_source = 'purchase';
              product.last_cost_updated_at = new Date();
            }
          }
        } else if (item.isNewProduct && item.name) {
          const newProduct: Product = {
            id: `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: item.name,
            category: item.category,
            price_cents: r.final_cost_cents * 2,
            stock: r.received_quantity,
            supplier_id: order.supplierId,
            createdAt: new Date(),
            last_cost_cents: r.final_cost_cents,
            last_cost_source: 'purchase',
            last_cost_updated_at: new Date(),
          };
          mockProducts.push(newProduct);
          item.product_id = newProduct.id;
        }
      }
    }

    const totalReceived = order.items.reduce((s, i) => s + i.received_quantity * (i.final_cost_cents || 0), 0);
    order.received_total_cents = totalReceived;

    const allReceived = order.items.every((i) => i.received_quantity >= i.quantity);
    const somePartial = order.items.some((i) => i.received_quantity > 0 && i.received_quantity < i.quantity);

    if (allReceived) {
      order.status = 'received';
      order.receivedDate = new Date();
      const supplier = mockSuppliers.find((s) => s.id === order.supplierId);
      if (supplier) {
        supplier.totalOrders += 1;
        supplier.totalSpentCents += totalReceived;
      }
    } else if (somePartial) {
      order.status = 'partial';
    }

    return order;
  }

  try {
    const orders = await getOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Orden no encontrada');

    for (const r of receives) {
      const item = order.items[r.index];
      if (!item) throw new Error(`Ítem en índice ${r.index} no existe`);
      const cumulative = item.received_quantity + r.received_quantity;
      if (cumulative > item.quantity) {
        throw new Error(
          `No se puede recibir más de lo pedido en "${item.name || item.product_id}". Pedido: ${item.quantity}, ya recibido: ${item.received_quantity}, intento: ${r.received_quantity}`
        );
      }
    }

    await apiClient.put(`/orders/${encodeURIComponent(orderId)}`, { receives });
    emitDataChange('orders');
    emitDataChange('products');
    emitDataChange('suppliers');

    const updatedOrders = await getOrders();
    const updated = updatedOrders.find((o) => o.id === orderId);
    return updated || order;
  } catch (error: any) {
    const message = getErrorMessage(error);
    if (
      message === 'Orden no encontrada' ||
      message.includes('Ítem en índice') ||
      message.includes('No se puede recibir más')
    ) {
      throw error;
    }
    console.error('Error receiving order in Firebase');
    throw new Error('Error al recibir orden');
  }
}

export async function cancelOrder(orderId: string): Promise<void> {
  if (isMockMode()) {
    const order = mockOrders.find((o) => o.id === orderId);
    if (!order) throw new Error('Orden no encontrada');
    const hasReception = order.items.some((i) => i.received_quantity > 0);
    if (hasReception) {
      throw new Error(
        `No se puede cancelar: ya se recibió stock (${order.items.reduce((s, i) => s + i.received_quantity, 0)} unidades)`
      );
    }
    order.status = 'cancelled';
    return;
  }

  try {
    const orders = await getOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Orden no encontrada');

    const hasReception = order.items.some((i) => i.received_quantity > 0);
    if (hasReception) {
      throw new Error(
        `No se puede cancelar: ya se recibió stock (${order.items.reduce((s, i) => s + i.received_quantity, 0)} unidades)`
      );
    }

    await apiClient.put(`/orders/${encodeURIComponent(orderId)}`, { status: 'cancelled' });
    emitDataChange('orders');
  } catch (error: any) {
    const message = getErrorMessage(error);
    if (message.includes('No se puede cancelar') || message.includes('no encontrada')) {
      throw error;
    }
    console.error('Error canceling order in Firebase');
    throw new Error('Error al cancelar orden');
  }
}
