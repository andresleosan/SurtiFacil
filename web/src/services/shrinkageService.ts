import { apiClient, emitDataChange, getActiveNegocioId, hasAuthSession } from './apiClient';
import { mockProducts } from './mockData';
import { refreshProducts } from './productService';
import { Product } from '../firebase/db';
import {
  InventoryShrinkage,
  SHRINKAGE_REASON_IDS,
  ShrinkageInput,
  ShrinkageResponse,
} from '../types/shrinkage';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function currentTenantId(): string {
  return getActiveNegocioId() || 'surtifacil';
}

let mockShrinkageStorage: InventoryShrinkage[] = [];

/**
 * Limpia el historial mock de mermas en memoria (útil para pruebas).
 */
export function clearMockShrinkage(): void {
  mockShrinkageStorage = [];
}

/**
 * Calcula el costo unitario estimado de pérdida por merma (last_cost_cents o 70% PVP).
 */
export function computeShrinkageUnitCostCents(product: Pick<Product, 'price_cents' | 'last_cost_cents'>): {
  unitCostCents: number;
  costSource: 'purchase' | 'estimated_fallback';
} {
  const hasPurchaseCost =
    typeof product.last_cost_cents === 'number' && product.last_cost_cents > 0;
  const priceCents = Math.max(0, Math.round(Number(product.price_cents || 0)));
  return {
    unitCostCents: hasPurchaseCost
      ? Math.round(product.last_cost_cents as number)
      : Math.round(priceCents * 0.7),
    costSource: hasPurchaseCost ? 'purchase' : 'estimated_fallback',
  };
}

/**
 * Consulta el historial de mermas, averías y vencimientos del negocio activo.
 */
export async function getShrinkageHistory(options?: {
  reason?: string;
  productId?: string;
  since?: string;
}): Promise<InventoryShrinkage[]> {
  if (isMockMode() || !hasAuthSession()) {
    const tenantId = currentTenantId();
    return mockShrinkageStorage
      .filter((entry) => {
        if (entry.negocio_id !== tenantId) return false;
        if (options?.reason && entry.reason !== options.reason) return false;
        if (options?.productId && entry.product_id !== options.productId) return false;
        if (options?.since) {
          return new Date(entry.created_at).getTime() >= new Date(options.since).getTime();
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const params = new URLSearchParams();
  if (options?.reason) params.set('reason', options.reason);
  if (options?.productId) params.set('product_id', options.productId);
  if (options?.since) params.set('since', options.since);
  const query = params.toString();
  const endpoint = query ? `/shrinkage?${query}` : '/shrinkage';

  return apiClient.get<InventoryShrinkage[]>(endpoint);
}

/**
 * Registra una merma / baja de inventario con descuento atómico de stock.
 */
export async function recordShrinkage(
  input: ShrinkageInput,
  productFallback?: Product
): Promise<ShrinkageResponse> {
  const productId = input.product_id?.trim();
  if (!productId) {
    throw new Error('Debes seleccionar un producto válido para dar de baja.');
  }

  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    throw new Error('La cantidad a dar de baja debe ser un número entero mayor a 0.');
  }

  if (!SHRINKAGE_REASON_IDS.has(input.reason)) {
    throw new Error('Selecciona un motivo de merma válido.');
  }

  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 250) : undefined;
  const payload: ShrinkageInput = {
    product_id: productId,
    quantity: qty,
    reason: input.reason,
    ...(notes ? { notes } : {}),
  };

  if (!isMockMode() && hasAuthSession()) {
    const created = await apiClient.post<ShrinkageResponse>('/shrinkage', payload);
    emitDataChange('shrinkage');
    emitDataChange('products');
    return created;
  }

  const mockProduct = mockProducts.find((item) => item.id === productId);
  const target = mockProduct || productFallback;
  if (!target) {
    throw new Error('Producto no encontrado en inventario.');
  }

  const available = Number(target.stock || 0);
  if (qty > available) {
    throw new Error(`Stock insuficiente para "${target.name}": disponible ${available}, solicitado ${qty}.`);
  }

  const { unitCostCents, costSource } = computeShrinkageUnitCostCents(target);
  const priceCents = Math.max(0, Math.round(Number(target.price_cents || 0)));

  if (mockProduct) {
    mockProduct.stock = available - qty;
  }

  const entry: ShrinkageResponse = {
    id: `shk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    negocio_id: currentTenantId(),
    product_id: target.id,
    product_name: target.name,
    category: target.category || 'General',
    unit: target.unit || 'unidad',
    quantity: qty,
    unit_cost_cents: unitCostCents,
    total_cost_loss_cents: unitCostCents * qty,
    retail_value_cents: priceCents * qty,
    cost_source: costSource,
    reason: input.reason,
    notes,
    created_by_uid: 'mock-admin-uid',
    created_by_name: 'Administrador Local',
    created_at: new Date().toISOString(),
    updated_stock: available - qty,
  };

  mockShrinkageStorage.unshift(entry);
  emitDataChange('shrinkage');
  refreshProducts?.();
  return entry;
}

/**
 * Revierte una merma registrada por error y devuelve las unidades al inventario.
 */
export async function revertShrinkageEntry(shrinkageId: string): Promise<void> {
  if (!shrinkageId) {
    throw new Error('ID de merma inválido.');
  }

  if (!isMockMode() && hasAuthSession()) {
    await apiClient.delete(`/shrinkage/${encodeURIComponent(shrinkageId)}`);
    emitDataChange('shrinkage');
    emitDataChange('products');
    return;
  }

  const tenantId = currentTenantId();
  const existing = mockShrinkageStorage.find(
    (item) => item.id === shrinkageId && item.negocio_id === tenantId
  );

  if (existing) {
    const mockProduct = mockProducts.find((item) => item.id === existing.product_id);
    if (mockProduct) {
      mockProduct.stock += existing.quantity;
    }
    mockShrinkageStorage = mockShrinkageStorage.filter((item) => item.id !== shrinkageId);
  }

  emitDataChange('shrinkage');
  refreshProducts?.();
}
