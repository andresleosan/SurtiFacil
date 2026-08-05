import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Supplier, PurchaseOrder, OrderStatus, OrderItem, Product } from '../firebase/db';
import { mockSuppliers, mockOrders, mockProducts } from './mockData';

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

export async function getSuppliers(): Promise<Supplier[]> {
  if (isMockMode()) {
    return mockSuppliers.map((s) => ({ ...s }));
  }

  try {
    const suppliersRef = collection(db, 'suppliers');
    const snapshot = await getDocs(suppliersRef);
    const suppliers: Supplier[] = [];

    snapshot.forEach((doc) => {
      suppliers.push({
        id: doc.id,
        ...(doc.data() as Omit<Supplier, 'id'>),
      });
    });

    return suppliers;
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
    const docRef = await addDoc(collection(db, 'suppliers'), {
      ...data,
      totalOrders: 0,
      totalSpentCents: 0,
      createdAt: serverTimestamp(),
    });

    return {
      id: docRef.id,
      ...data,
      totalOrders: 0,
      totalSpentCents: 0,
    };
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
    await updateDoc(doc(db, 'suppliers', id), data);
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

  let supplier: Supplier | undefined;

  try {
    const suppliersRef = collection(db, 'suppliers');
    const snapshot = await getDocs(suppliersRef);
    snapshot.forEach((doc) => {
      if (doc.id === id) {
        supplier = { id: doc.id, ...(doc.data() as Omit<Supplier, 'id'>) };
      }
    });

    if (supplier && supplier.totalOrders > 0) {
      throw new Error('No se puede eliminar: tiene órdenes asociadas');
    }

    await deleteDoc(doc(db, 'suppliers', id));
  } catch (error: any) {
    if (getErrorMessage(error) === 'No se puede eliminar: tiene órdenes asociadas') {
      throw error;
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
    const ordersRef = collection(db, 'purchase_orders');
    const snapshot = await getDocs(ordersRef);
    let orders: PurchaseOrder[] = [];

    snapshot.forEach((d) => {
      orders.push({
        id: d.id,
        ...(d.data() as Omit<PurchaseOrder, 'id'>),
      });
    });

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
    const docRef = await addDoc(collection(db, 'purchase_orders'), {
      ...orderData,
      date: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    return {
      id: docRef.id,
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
    let currentStatus: OrderStatus | undefined;
    const ordersRef = collection(db, 'purchase_orders');
    const snapshot = await getDocs(ordersRef);
    snapshot.forEach((d) => {
      if (d.id === orderId) {
        currentStatus = (d.data() as PurchaseOrder).status;
      }
    });

    if (!currentStatus) {
      throw new Error('Orden no encontrada');
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Transición de estado no permitida: ${currentStatus} → ${newStatus}`
      );
    }
    if (currentStatus === newStatus) return;

    await updateDoc(doc(db, 'purchase_orders', orderId), { status: newStatus });
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

  return runTransaction(db, async (transaction) => {
    const orderRef = doc(db, 'purchase_orders', orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Orden no encontrada');
    const order = orderSnap.data() as PurchaseOrder;

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

    const updatedItems: OrderItem[] = order.items.map((item, idx) => {
      const r = receives.find((x) => x.index === idx);
      if (!r || r.received_quantity === 0) return item;
      return {
        ...item,
        received_quantity: item.received_quantity + r.received_quantity,
        final_cost_cents: r.final_cost_cents,
      };
    });

    const createdProducts: { itemIndex: number; productId: string }[] = [];
    for (let idx = 0; idx < updatedItems.length; idx++) {
      const item = updatedItems[idx];
      const r = receives.find((x) => x.index === idx);
      if (!r || r.received_quantity === 0) continue;

      if (item.product_id) {
        const productRef = doc(db, 'products', item.product_id);
        const productSnap = await transaction.get(productRef);
        if (productSnap.exists()) {
          const current = productSnap.data() as Product;
          const updatePayload: Record<string, any> = {
            stock: current.stock + r.received_quantity,
          };
          if (r.final_cost_cents !== undefined && r.final_cost_cents !== null) {
            updatePayload.last_cost_cents = r.final_cost_cents;
            updatePayload.last_cost_source = 'purchase';
            updatePayload.last_cost_updated_at = serverTimestamp();
          }
          transaction.update(productRef, updatePayload);
        }
      } else if (item.isNewProduct && item.name) {
        const newProductRef = doc(collection(db, 'products'));
        transaction.set(newProductRef, {
          name: item.name,
          category: item.category,
          price_cents: r.final_cost_cents * 2,
          stock: r.received_quantity,
          supplier_id: order.supplierId,
          createdAt: serverTimestamp(),
          last_cost_cents: r.final_cost_cents,
          last_cost_source: 'purchase',
          last_cost_updated_at: serverTimestamp(),
        });
        createdProducts.push({ itemIndex: idx, productId: newProductRef.id });
        updatedItems[idx] = { ...item, product_id: newProductRef.id };
      }
    }

    const totalReceived = updatedItems.reduce(
      (s, i) => s + i.received_quantity * (i.final_cost_cents || 0),
      0
    );

    const allReceived = updatedItems.every((i) => i.received_quantity >= i.quantity);
    const somePartial = updatedItems.some(
      (i) => i.received_quantity > 0 && i.received_quantity < i.quantity
    );

    const updatePayload: any = {
      items: updatedItems,
      received_total_cents: totalReceived,
    };

    if (allReceived) {
      updatePayload.status = 'received';
      updatePayload.receivedDate = serverTimestamp();
    } else if (somePartial) {
      updatePayload.status = 'partial';
    }

    transaction.update(orderRef, updatePayload);

    if (allReceived) {
      const supplierRef = doc(db, 'suppliers', order.supplierId);
      const supplierSnap = await transaction.get(supplierRef);
      if (supplierSnap.exists()) {
        const current = supplierSnap.data() as Supplier;
        transaction.update(supplierRef, {
          totalOrders: (current.totalOrders || 0) + 1,
          totalSpentCents: (current.totalSpentCents || 0) + totalReceived,
        });
      }
    }

    return { ...order, ...updatePayload, receivedDate: allReceived ? new Date() : order.receivedDate };
  }).catch((error: any) => {
    const message = getErrorMessage(error);
    if (message === 'Orden no encontrada' ||
      message.includes('Ítem en índice') ||
      message.includes('No se puede recibir más')) {
      throw error;
    }
    console.error('Error receiving order in Firebase');
    throw new Error('Error al recibir orden');
  });
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
    const orderRef = doc(db, 'purchase_orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) throw new Error('Orden no encontrada');
    const order = orderSnap.data() as PurchaseOrder;
    const hasReception = order.items.some((i) => i.received_quantity > 0);
    if (hasReception) {
      throw new Error(
        `No se puede cancelar: ya se recibió stock (${order.items.reduce((s, i) => s + i.received_quantity, 0)} unidades)`
      );
    }
    await updateDoc(orderRef, { status: 'cancelled' });
  } catch (error: any) {
    const message = getErrorMessage(error);
    if (message.includes('No se puede cancelar') || message.includes('no encontrada')) {
      throw error;
    }
    console.error('Error canceling order in Firebase');
    throw new Error('Error al cancelar orden');
  }
}
