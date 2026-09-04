import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Product } from '../firebase/db';
import { mockProducts } from './mockData';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

export interface NewProductInput {
  name: string;
  price_cents: number;
  stock: number;
  category: string;
  barcode?: string;
}

export type ProductsListener = (products: Product[]) => void;
export type ProductsErrorListener = (error: Error) => void;

const LOAD_ERROR = 'Error al cargar productos';

function sortByName(products: Product[]): Product[] {
  return [...products].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}

// Suscriptores en modo mock: permiten "refrescar" tras una venta local sin Firestore.
const mockListeners = new Set<ProductsListener>();

function emitMock() {
  const snapshot = sortByName(mockProducts.map((product) => ({ ...product })));
  mockListeners.forEach((listener) => listener(snapshot));
}

/**
 * Se suscribe a la colección de productos. En modo configurado usa un listener
 * de Firestore (una lectura inicial y luego solo los documentos que cambian),
 * lo que reemplaza el sondeo periódico anterior. Devuelve la función para cancelar.
 */
export function subscribeToProducts(onData: ProductsListener, onError: ProductsErrorListener): () => void {
  if (isMockMode()) {
    mockListeners.add(onData);
    onData(sortByName(mockProducts.map((product) => ({ ...product }))));
    return () => {
      mockListeners.delete(onData);
    };
  }

  try {
    return onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const products: Product[] = [];
        snapshot.forEach((document) => {
          products.push({ id: document.id, ...(document.data() as Omit<Product, 'id'>) });
        });
        onData(sortByName(products));
      },
      () => {
        console.error('Error subscribing to products.');
        onError(new Error(LOAD_ERROR));
      },
    );
  } catch {
    console.error('Error subscribing to products.');
    onError(new Error(LOAD_ERROR));
    return () => {};
  }
}

/** Reenvía el estado actual a los suscriptores en modo mock; sin efecto con Firestore. */
export function refreshProducts(): void {
  if (isMockMode()) emitMock();
}

export async function addProduct(input: NewProductInput): Promise<Product> {
  const payload = {
    name: input.name,
    price_cents: input.price_cents,
    stock: input.stock,
    category: input.category,
    ...(input.barcode ? { barcode: input.barcode } : {}),
  };

  if (isMockMode()) {
    const product: Product = { id: `prod-${Date.now()}`, ...payload };
    mockProducts.push(product);
    emitMock();
    return product;
  }

  try {
    const reference = await addDoc(collection(db, 'products'), { ...payload, createdAt: serverTimestamp() });
    return { id: reference.id, ...payload };
  } catch {
    console.error('Error adding product.');
    throw new Error('Error al agregar producto');
  }
}

export async function updateProduct(product: Product): Promise<void> {
  const changes = {
    name: product.name,
    price_cents: product.price_cents,
    stock: product.stock,
    category: product.category ?? '',
    barcode: product.barcode?.trim() || null,
  };

  if (isMockMode()) {
    const index = mockProducts.findIndex((candidate) => candidate.id === product.id);
    if (index >= 0) {
      mockProducts[index] = { ...mockProducts[index], ...changes, barcode: changes.barcode ?? undefined };
    }
    emitMock();
    return;
  }

  try {
    await updateDoc(doc(db, 'products', product.id), changes);
  } catch {
    console.error('Error updating product.');
    throw new Error('Error al editar producto');
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  if (isMockMode()) {
    const index = mockProducts.findIndex((candidate) => candidate.id === productId);
    if (index >= 0) mockProducts.splice(index, 1);
    emitMock();
    return;
  }

  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch {
    console.error('Error deleting product.');
    throw new Error('Error al eliminar producto');
  }
}
