import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Supplier, PurchaseOrder, OrderStatus, OrderItem } from '../firebase/db';
import { mockSuppliers, mockOrders } from './mockData';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['partial', 'received', 'cancelled'],
  partial: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

function isFirebaseConfigured(): boolean {
  return !!(db && typeof db === 'object' && import.meta.env.VITE_FIREBASE_PROJECT_ID);
}

export async function getSuppliers(): Promise<Supplier[]> {
  if (!isFirebaseConfigured()) {
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
  } catch (error) {
    console.error('Error getting suppliers:', error);
    return [];
  }
}

export async function addSupplier(
  data: Omit<Supplier, 'id' | 'totalOrders' | 'totalSpentCents' | 'createdAt'>
): Promise<Supplier> {
  if (!isFirebaseConfigured()) {
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
  } catch (error: any) {
    console.error('Error adding supplier:', error);
    throw new Error(error.message || 'Error al crear proveedor');
  }
}

export async function updateSupplier(
  id: string,
  data: Partial<Supplier>
): Promise<void> {
  if (!isFirebaseConfigured()) {
    const supplier = mockSuppliers.find((s) => s.id === id);
    if (supplier) {
      Object.assign(supplier, data);
    }
    return;
  }

  try {
    await updateDoc(doc(db, 'suppliers', id), data);
  } catch (error: any) {
    console.error('Error updating supplier:', error);
    throw new Error(error.message || 'Error al actualizar proveedor');
  }
}

export async function toggleSupplierActive(
  id: string,
  active: boolean
): Promise<void> {
  await updateSupplier(id, { active });
}

export async function deleteSupplier(id: string): Promise<void> {
  if (!isFirebaseConfigured()) {
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
    console.error('Error deleting supplier:', error);
    if (error.message === 'No se puede eliminar: tiene órdenes asociadas') {
      throw error;
    }
    throw new Error(error.message || 'Error al eliminar proveedor');
  }
}

export async function getOrders(filters?: {
  status?: OrderStatus;
  supplierId?: string;
}): Promise<PurchaseOrder[]> {
  if (!isFirebaseConfigured()) {
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
  } catch (error) {
    console.error('Error getting orders:', error);
    return [];
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

  if (!isFirebaseConfigured()) {
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
  } catch (error: any) {
    console.error('Error creating order:', error);
    throw new Error(error.message || 'Error al crear orden de compra');
  }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<void> {
  if (!isFirebaseConfigured()) {
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
    if (error.message && error.message.includes('no permitida')) {
      throw error;
    }
    console.error('Error updating order status:', error);
    throw new Error(error.message || 'Error al actualizar estado de orden');
  }
}
