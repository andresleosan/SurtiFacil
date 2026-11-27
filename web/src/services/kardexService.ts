import { Product } from '../firebase/db';
import {
  InventoryKardexEntry,
  KardexAdjustmentInput,
  KardexMovementType,
  ProductKardexResponse,
  getKardexMovementMeta,
} from '../types/kardex';
import {
  computeLineSubtotalCents,
  formatQuantityNumber,
  roundQuantity,
  validateItemQuantity,
} from '../utils/bulkWeight';
import { downloadCSV } from '../utils/csvExporter';
import { apiClient, emitDataChange, getActiveNegocioId, hasAuthSession } from './apiClient';
import { mockProducts } from './mockData';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function currentTenantId(): string {
  return getActiveNegocioId() || 'surtifacil';
}

let mockKardexStorage: InventoryKardexEntry[] = [];

export function clearMockKardex(): void {
  mockKardexStorage = [];
}

export function recordMockKardexEntry(input: {
  negocio_id?: string;
  product_id: string;
  product_name: string;
  unit?: string;
  movement_type: KardexMovementType;
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  unit_cost_cents?: number;
  unit_price_cents?: number;
  total_value_cents?: number;
  reference_id?: string | null;
  notes?: string | null;
  created_by_uid?: string;
  created_by_name?: string | null;
}): InventoryKardexEntry {
  const entry: InventoryKardexEntry = {
    id: `kdx-mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    negocio_id: input.negocio_id || currentTenantId(),
    product_id: input.product_id,
    product_name: input.product_name,
    unit: input.unit || 'unidad',
    movement_type: input.movement_type,
    quantity_delta: roundQuantity(input.quantity_delta, true),
    stock_before: roundQuantity(input.stock_before, true),
    stock_after: roundQuantity(input.stock_after, true),
    unit_cost_cents: Math.max(0, Math.round(Number(input.unit_cost_cents) || 0)),
    unit_price_cents: Math.max(0, Math.round(Number(input.unit_price_cents) || 0)),
    total_value_cents: Math.max(0, Math.round(Number(input.total_value_cents) || 0)),
    reference_id: input.reference_id ?? null,
    notes: input.notes ?? null,
    created_by_uid: input.created_by_uid || 'mock-user',
    created_by_name: input.created_by_name || 'Administrador Local',
    created_at: new Date().toISOString(),
  };
  mockKardexStorage.unshift(entry);
  return entry;
}

export async function getProductKardex(
  productId: string,
  options?: { movement_type?: KardexMovementType | ''; limit?: number; productFallback?: Product },
): Promise<ProductKardexResponse> {
  if (!productId?.trim()) {
    throw new Error('ID de producto inválido.');
  }

  if (!isMockMode() && hasAuthSession()) {
    const params = new URLSearchParams();
    if (options?.movement_type) params.set('movement_type', options.movement_type);
    if (options?.limit) params.set('limit', String(options.limit));
    const q = params.toString();
    const endpoint = q
      ? `/products/${encodeURIComponent(productId)}/kardex?${q}`
      : `/products/${encodeURIComponent(productId)}/kardex`;
    return apiClient.get<ProductKardexResponse>(endpoint);
  }

  const tenantId = currentTenantId();
  const mockProd =
    mockProducts.find((p) => p.id === productId) ||
    options?.productFallback || {
      id: productId,
      name: 'Producto',
      price_cents: 0,
      stock: 0,
      unit: 'unidad',
    };

  const entries = mockKardexStorage
    .filter((entry) => {
      if (entry.negocio_id !== tenantId || entry.product_id !== productId) return false;
      if (options?.movement_type && entry.movement_type !== options.movement_type) return false;
      return true;
    })
    .slice(0, options?.limit || 100);

  let totalIn = 0;
  let totalOut = 0;
  for (const e of entries) {
    if (e.quantity_delta > 0) totalIn += e.quantity_delta;
    else if (e.quantity_delta < 0) totalOut += Math.abs(e.quantity_delta);
  }

  return {
    product: mockProd,
    summary: {
      total_in: roundQuantity(totalIn, true),
      total_out: roundQuantity(totalOut, true),
      net_change: roundQuantity(totalIn - totalOut, true),
      movements_count: entries.length,
    },
    entries,
  };
}

export async function adjustProductStockKardex(
  productId: string,
  input: KardexAdjustmentInput,
  productFallback?: Product,
): Promise<{ success: boolean; product: Product; entry: InventoryKardexEntry }> {
  const cleanId = productId?.trim();
  if (!cleanId) throw new Error('Producto inválido.');

  const reason = input.reason?.trim() || '';
  if (reason.length < 3 || reason.length > 250) {
    throw new Error('Ingresa un motivo válido de al menos 3 caracteres.');
  }

  if (!isMockMode() && hasAuthSession()) {
    const res = await apiClient.post<{
      success: boolean;
      product: Product;
      entry: InventoryKardexEntry;
    }>(`/products/${encodeURIComponent(cleanId)}/kardex/adjust`, {
      mode: input.mode,
      quantity: input.quantity,
      reason,
    });
    emitDataChange('products');
    emitDataChange('kardex');
    return res;
  }

  const mockProd = mockProducts.find((p) => p.id === cleanId) || productFallback;
  if (!mockProd) {
    throw new Error('Producto no encontrado en inventario.');
  }

  const allowFractional = Boolean(mockProd.allow_fractional);
  const rawQty = Number(input.quantity);
  let cleanQty = 0;
  if (input.mode === 'set') {
    if (!Number.isFinite(rawQty) || rawQty < 0) {
      throw new Error('La cantidad final debe ser mayor o igual a 0.');
    }
    if (!allowFractional && Math.abs(rawQty - Math.round(rawQty)) >= 1e-6) {
      throw new Error('Este producto se controla por unidades enteras.');
    }
    cleanQty = roundQuantity(rawQty, allowFractional);
  } else {
    const check = validateItemQuantity(rawQty, allowFractional);
    if (!check.ok) throw new Error(check.error);
    cleanQty = check.quantity;
  }

  const prevStock = roundQuantity(Number(mockProd.stock) || 0, true);
  const nextStock =
    input.mode === 'add'
      ? roundQuantity(prevStock + cleanQty, true)
      : input.mode === 'subtract'
      ? roundQuantity(prevStock - cleanQty, true)
      : cleanQty;

  if (nextStock < 0) {
    throw new Error(`El ajuste dejaría el stock en negativo (disponible: ${prevStock}).`);
  }
  const delta = roundQuantity(nextStock - prevStock, true);
  if (Math.abs(delta) < 1e-6) {
    throw new Error('El stock resultante es igual al actual.');
  }

  mockProd.stock = nextStock;
  const unitCost = mockProd.last_cost_cents ?? Math.round((mockProd.price_cents || 0) * 0.7);
  const entry = recordMockKardexEntry({
    product_id: mockProd.id,
    product_name: mockProd.name,
    unit: mockProd.unit || 'unidad',
    movement_type: 'adjustment',
    quantity_delta: delta,
    stock_before: prevStock,
    stock_after: nextStock,
    unit_cost_cents: unitCost,
    unit_price_cents: mockProd.price_cents || 0,
    total_value_cents: computeLineSubtotalCents(unitCost, Math.abs(delta)),
    notes: reason,
  });

  emitDataChange('products');
  emitDataChange('kardex');
  return { success: true, product: { ...mockProd }, entry };
}

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ');
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaChars.some((ch) => str.startsWith(ch))) {
    return `"'${str}"`;
  }
  return `"${str}"`;
}

export function downloadProductKardexCSV(
  product: Pick<Product, 'id' | 'name' | 'unit'>,
  entries: InventoryKardexEntry[],
): void {
  const headers = [
    'Fecha y Hora',
    'Tipo Movimiento',
    'Variación',
    'Stock Anterior',
    'Stock Posterior',
    'Unidad',
    'Valor (COP)',
    'Referencia',
    'Motivo / Notas',
    'Responsable',
  ];

  const rows = entries.map((e) => {
    const meta = getKardexMovementMeta(e.movement_type);
    const sign = e.quantity_delta > 0 ? '+' : '';
    const dt = e.created_at ? new Date(e.created_at).toLocaleString('es-CO') : '';
    return [
      dt,
      meta.label,
      `${sign}${formatQuantityNumber(e.quantity_delta)}`,
      formatQuantityNumber(e.stock_before),
      formatQuantityNumber(e.stock_after),
      e.unit || product.unit || 'unidad',
      String(Math.round((e.total_value_cents || 0) / 100)),
      e.reference_id || '',
      e.notes || '',
      e.created_by_name || e.created_by_uid || '',
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
  const slugName = (product.name || 'producto')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  downloadCSV(csvContent, `kardex-${slugName}-${new Date().toISOString().split('T')[0]}.csv`);
}
