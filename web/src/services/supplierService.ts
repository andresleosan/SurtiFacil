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
