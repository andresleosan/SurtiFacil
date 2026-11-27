import { apiClient, emitDataChange, getActiveNegocioId, hasAuthSession } from './apiClient';
import { mockProducts } from './mockData';
import { refreshProducts } from './productService';
import { recordMockKardexEntry } from './kardexService';
import { computeLineSubtotalCents, roundQuantity, validateItemQuantity } from '../utils/bulkWeight';
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

  const mockProduct = mockProducts.find((item) => item.id === productId);
  const targetForValidation = mockProduct || productFallback;
  const rawQty = Number(input.quantity);
  const allowFrac = targetForValidation ? Boolean(targetForValidation.allow_fractional) : false;

  if (targetForValidation || Number.isInteger(rawQty)) {
    const qtyCheck = validateItemQuantity(rawQty, allowFrac);
    if (!qtyCheck.ok) {
      throw new Error(
        allowFrac
          ? qtyCheck.error
          : 'La cantidad a dar de baja debe ser un número entero mayor a 0.'
      );
    }
  } else if (!Number.isFinite(rawQty) || rawQty <= 0) {
    throw new Error('La cantidad a dar de baja debe ser mayor a 0.');
  }
  const qty = roundQuantity(rawQty, true);

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
    emitDataChange('kardex');
    return created;
  }

  const target = mockProduct || productFallback;
  if (!target) {
    throw new Error('Producto no encontrado en inventario.');
  }

  const available = roundQuantity(Number(target.stock || 0), true);
  if (qty > available) {
    throw new Error(`Stock insuficiente para "${target.name}": disponible ${available}, solicitado ${qty}.`);
  }

  const { unitCostCents, costSource } = computeShrinkageUnitCostCents(target);
  const priceCents = Math.max(0, Math.round(Number(target.price_cents || 0)));
  const totalCostLossCents = computeLineSubtotalCents(unitCostCents, qty);
  const retailValueCents = computeLineSubtotalCents(priceCents, qty);
  const nextStock = roundQuantity(available - qty, true);

  if (mockProduct) {
    mockProduct.stock = nextStock;
  }

  const shrinkageId = `shk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const entry: ShrinkageResponse = {
    id: shrinkageId,
    negocio_id: currentTenantId(),
    product_id: target.id,
    product_name: target.name,
    category: target.category || 'General',
    unit: target.unit || 'unidad',
    quantity: qty,
    unit_cost_cents: unitCostCents,
    total_cost_loss_cents: totalCostLossCents,
    retail_value_cents: retailValueCents,
    cost_source: costSource,
    reason: input.reason,
    notes,
    created_by_uid: 'mock-admin-uid',
    created_by_name: 'Administrador Local',
    created_at: new Date().toISOString(),
    updated_stock: nextStock,
  };

  recordMockKardexEntry({
    product_id: target.id,
    product_name: target.name,
    unit: target.unit || 'unidad',
    movement_type: 'shrinkage',
    quantity_delta: -qty,
    stock_before: available,
    stock_after: nextStock,
    unit_cost_cents: unitCostCents,
    unit_price_cents: priceCents,
    total_value_cents: totalCostLossCents,
    reference_id: shrinkageId,
    notes: notes || `Merma (${input.reason})`,
  });

  mockShrinkageStorage.unshift(entry);
  emitDataChange('shrinkage');
  emitDataChange('kardex');
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
    emitDataChange('kardex');
    return;
  }

  const tenantId = currentTenantId();
  const existing = mockShrinkageStorage.find(
    (item) => item.id === shrinkageId && item.negocio_id === tenantId
  );

  if (existing) {
    const mockProduct = mockProducts.find((item) => item.id === existing.product_id);
    if (mockProduct) {
      const before = roundQuantity(mockProduct.stock, true);
      const after = roundQuantity(before + existing.quantity, true);
      mockProduct.stock = after;
      recordMockKardexEntry({
        product_id: mockProduct.id,
        product_name: mockProduct.name,
        unit: mockProduct.unit || 'unidad',
        movement_type: 'shrinkage_revert',
        quantity_delta: existing.quantity,
        stock_before: before,
        stock_after: after,
        unit_cost_cents: existing.unit_cost_cents,
        unit_price_cents: mockProduct.price_cents,
        total_value_cents: existing.total_cost_loss_cents,
        reference_id: shrinkageId,
        notes: 'Reversión de baja / merma',
      });
    }
    mockShrinkageStorage = mockShrinkageStorage.filter((item) => item.id !== shrinkageId);
  }

  emitDataChange('shrinkage');
  emitDataChange('kardex');
  refreshProducts?.();
}
