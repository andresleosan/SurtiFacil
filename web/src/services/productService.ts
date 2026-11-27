import { Product } from '../firebase/db';
import { apiClient, emitDataChange, onDataChange } from './apiClient';
import { mockProducts } from './mockData';
import {
  cacheProductsForTenant,
  getCachedProductsForTenant,
  isOfflineModeActive,
} from './offlineSyncService';
import { parseWholesaleTiers, type WholesaleTier } from '../utils/wholesalePricing';
import { computeLineSubtotalCents, roundQuantity } from '../utils/bulkWeight';
import { recordMockKardexEntry } from './kardexService';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

export interface NewProductInput {
  name: string;
  price_cents: number;
  stock: number;
  min_stock?: number;
  unit?: string;
  category: string;
  image_url?: string;
  barcode?: string;
  visible_kiosco?: boolean | number;
  visible_tienda?: boolean | number;
  en_oferta?: boolean | number;
  precio_oferta_cents?: number;
  wholesale_tiers?: WholesaleTier[];
  wholesale_tiers_json?: string | null;
  allow_fractional?: boolean | number;
  expiration_date?: string | null;
}

export type ProductsListener = (products: Product[]) => void;
export type ProductsErrorListener = (error: Error) => void;

const LOAD_ERROR = 'Error al cargar productos';

function sortByName(products: Product[]): Product[] {
  return [...products].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}

export function mapProductRow(row: any): Product {
  const wholesaleTiers = parseWholesaleTiers(row.wholesale_tiers ?? row.wholesale_tiers_json);
  return {
    id: row.id,
    name: row.name,
    price_cents: row.price_cents,
    stock: roundQuantity(row.stock ?? 0, true),
    min_stock: row.min_stock ?? 5,
    unit: row.unit || 'unidad',
    category: row.category || undefined,
    image_url: row.image_url || undefined,
    barcode: row.barcode || undefined,
    visible_kiosco: row.visible_kiosco !== undefined ? Boolean(row.visible_kiosco) : true,
    visible_tienda: row.visible_tienda !== undefined ? Boolean(row.visible_tienda) : true,
    en_oferta: row.en_oferta !== undefined ? Boolean(row.en_oferta) : false,
    precio_oferta_cents: row.precio_oferta_cents ?? undefined,
    wholesale_tiers: wholesaleTiers,
    wholesale_tiers_json:
      typeof row.wholesale_tiers_json === 'string'
        ? row.wholesale_tiers_json
        : JSON.stringify(wholesaleTiers),
    allow_fractional: Boolean(row.allow_fractional),
    supplier_id: row.supplier_id || undefined,
    createdAt: row.created_at || row.createdAt,
    last_cost_cents: row.last_cost_cents ?? undefined,
    last_cost_source: row.last_cost_source || undefined,
    last_cost_updated_at: row.last_cost_updated_at || undefined,
    expiration_date: row.expiration_date || undefined,
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
    if (isOfflineModeActive()) {
      const cached = await getCachedProductsForTenant();
      if (!active) return;
      if (cached.length > 0) {
        onData(sortByName(cached));
        return;
      }
    }
    try {
      const data = await apiClient.get<any[]>('/products');
      if (!active) return;
      const mapped = (data || []).map(mapProductRow);
      const sorted = sortByName(mapped);
      void cacheProductsForTenant(sorted);
      onData(sorted);
    } catch {
      if (!active) return;
      if (isOfflineModeActive()) {
        const cached = await getCachedProductsForTenant();
        if (!active) return;
        if (cached.length > 0) {
          onData(sortByName(cached));
          return;
        }
      }
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
  const wholesaleTiers = parseWholesaleTiers(input.wholesale_tiers ?? input.wholesale_tiers_json);
  const allowFractional = Boolean(input.allow_fractional);
  const cleanStock = roundQuantity(input.stock, allowFractional);
  const payload = {
    name: input.name,
    price_cents: input.price_cents,
    stock: cleanStock,
    min_stock: input.min_stock ?? 5,
    unit: input.unit || 'unidad',
    category: input.category,
    image_url: input.image_url ?? null,
    visible_kiosco: input.visible_kiosco !== undefined ? (input.visible_kiosco ? 1 : 0) : 1,
    visible_tienda: input.visible_tienda !== undefined ? (input.visible_tienda ? 1 : 0) : 1,
    en_oferta: input.en_oferta ? 1 : 0,
    precio_oferta_cents: input.precio_oferta_cents ?? null,
    wholesale_tiers: wholesaleTiers,
    wholesale_tiers_json: JSON.stringify(wholesaleTiers),
    allow_fractional: allowFractional ? 1 : 0,
    expiration_date: input.expiration_date?.trim() || null,
    ...(input.barcode ? { barcode: input.barcode } : {}),
  };

  if (isMockMode()) {
    const product: Product = {
      id: `prod-${Date.now()}`,
      ...payload,
      allow_fractional: allowFractional,
      barcode: payload.barcode ?? undefined,
      image_url: payload.image_url ?? undefined,
      expiration_date: payload.expiration_date ?? undefined,
    };
    mockProducts.push(product);
    if (cleanStock > 0) {
      const unitCost = Math.round(input.price_cents * 0.7);
      recordMockKardexEntry({
        product_id: product.id,
        product_name: product.name,
        unit: product.unit,
        movement_type: 'initial',
        quantity_delta: cleanStock,
        stock_before: 0,
        stock_after: cleanStock,
        unit_cost_cents: unitCost,
        unit_price_cents: input.price_cents,
        total_value_cents: computeLineSubtotalCents(unitCost, cleanStock),
        notes: 'Alta inicial de producto en catálogo',
      });
    }
    emitMock();
    return product;
  }

  try {
    const created = await apiClient.post<any>('/products', payload);
    emitDataChange('products');
    emitDataChange('kardex');
    return mapProductRow(created);
  } catch {
    console.error('Error adding product.');
    throw new Error('Error al agregar producto');
  }
}

export async function updateProduct(product: Product, adjustmentReason?: string): Promise<void> {
  const hasWholesaleUpdate =
    product.wholesale_tiers !== undefined || product.wholesale_tiers_json !== undefined;
  const parsedTiers = hasWholesaleUpdate
    ? parseWholesaleTiers(product.wholesale_tiers ?? product.wholesale_tiers_json)
    : undefined;
  const allowFractional =
    product.allow_fractional !== undefined ? Boolean(product.allow_fractional) : undefined;
  const cleanStock = roundQuantity(product.stock, allowFractional ?? true);
  const changes = {
    name: product.name,
    price_cents: product.price_cents,
    stock: cleanStock,
    min_stock: product.min_stock ?? 5,
    unit: product.unit || 'unidad',
    category: product.category ?? '',
    barcode: product.barcode?.trim() || null,
    image_url: product.image_url ?? null,
    visible_kiosco: product.visible_kiosco !== undefined ? (product.visible_kiosco ? 1 : 0) : 1,
    visible_tienda: product.visible_tienda !== undefined ? (product.visible_tienda ? 1 : 0) : 1,
    en_oferta: product.en_oferta !== undefined ? (product.en_oferta ? 1 : 0) : 0,
    precio_oferta_cents: product.precio_oferta_cents ?? null,
    ...(allowFractional !== undefined ? { allow_fractional: allowFractional ? 1 : 0 } : {}),
    ...(adjustmentReason?.trim() ? { adjustment_reason: adjustmentReason.trim() } : {}),
    ...(hasWholesaleUpdate
      ? {
          wholesale_tiers: parsedTiers,
          wholesale_tiers_json: JSON.stringify(parsedTiers),
        }
      : {}),
    ...(product.expiration_date !== undefined
      ? { expiration_date: product.expiration_date?.trim() || null }
      : {}),
  };

  if (isMockMode()) {
    const index = mockProducts.findIndex((candidate) => candidate.id === product.id);
    if (index >= 0) {
      const prevStock = roundQuantity(mockProducts[index].stock, true);
      mockProducts[index] = {
        ...mockProducts[index],
        ...changes,
        allow_fractional: allowFractional ?? mockProducts[index].allow_fractional,
        barcode: changes.barcode ?? undefined,
        image_url: changes.image_url ?? undefined,
        ...(product.expiration_date !== undefined
          ? { expiration_date: changes.expiration_date ?? undefined }
          : {}),
      };
      const delta = roundQuantity(cleanStock - prevStock, true);
      if (Math.abs(delta) >= 1e-6) {
        const unitCost = mockProducts[index].last_cost_cents ?? Math.round(product.price_cents * 0.7);
        recordMockKardexEntry({
          product_id: product.id,
          product_name: product.name,
          unit: changes.unit,
          movement_type: 'adjustment',
          quantity_delta: delta,
          stock_before: prevStock,
          stock_after: cleanStock,
          unit_cost_cents: unitCost,
          unit_price_cents: product.price_cents,
          total_value_cents: computeLineSubtotalCents(unitCost, Math.abs(delta)),
          notes: adjustmentReason?.trim() || 'Ajuste manual en catálogo',
        });
      }
    }
    emitMock();
    return;
  }

  try {
    await apiClient.put(`/products/${encodeURIComponent(product.id)}`, changes);
    emitDataChange('products');
    emitDataChange('kardex');
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
