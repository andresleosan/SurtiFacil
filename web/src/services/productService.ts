import { Product } from '../firebase/db';
import { apiClient, emitDataChange, onDataChange } from './apiClient';
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

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    price_cents: row.price_cents,
    stock: row.stock ?? 0,
    category: row.category || undefined,
    barcode: row.barcode || undefined,
    supplier_id: row.supplier_id || undefined,
    createdAt: row.created_at || row.createdAt,
    last_cost_cents: row.last_cost_cents ?? undefined,
    last_cost_source: row.last_cost_source || undefined,
    last_cost_updated_at: row.last_cost_updated_at || undefined,
  };
}

// Suscriptores en modo mock
const mockListeners = new Set<ProductsListener>();

function emitMock() {
  const snapshot = sortByName(mockProducts.map((product) => ({ ...product })));
  mockListeners.forEach((listener) => listener(snapshot));
}

/**
 * Se suscribe al catálogo de productos en tiempo real.
 * En modo D1 consulta /api/products y escucha el bus de eventos de mutaciones.
 * En modo mock emite el estado local en memoria.
 */
export function subscribeToProducts(onData: ProductsListener, onError: ProductsErrorListener): () => void {
  if (isMockMode()) {
    mockListeners.add(onData);
    onData(sortByName(mockProducts.map((product) => ({ ...product }))));
    return () => {
      mockListeners.delete(onData);
    };
  }

  let active = true;

  const fetchAndEmit = async () => {
    try {
      const data = await apiClient.get<any[]>('/products');
      if (!active) return;
      const mapped = (data || []).map(mapProduct);
      onData(sortByName(mapped));
    } catch {
      if (!active) return;
      console.error('Error subscribing to products.');
      onError(new Error(LOAD_ERROR));
    }
  };

  // Carga inicial
  void fetchAndEmit();

  // Escuchar mutaciones locales o refrescos
  const unsubscribeBus = onDataChange('products', () => {
    if (active) void fetchAndEmit();
  });

  return () => {
    active = false;
    unsubscribeBus();
  };
}

/** Reenvía el estado actual o notifica a los suscriptores. */
export function refreshProducts(): void {
  if (isMockMode()) {
    emitMock();
  } else {
    emitDataChange('products');
  }
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
    const created = await apiClient.post<any>('/products', payload);
    emitDataChange('products');
    return mapProduct(created);
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
    await apiClient.put(`/products/${encodeURIComponent(product.id)}`, changes);
    emitDataChange('products');
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
    await apiClient.delete(`/products/${encodeURIComponent(productId)}`);
    emitDataChange('products');
  } catch {
    console.error('Error deleting product.');
    throw new Error('Error al eliminar producto');
  }
}
