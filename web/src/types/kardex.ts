import type { Product } from '../firebase/db';
import type { KardexMovementType } from '../utils/bulkWeight';

export type { KardexMovementType };

export interface InventoryKardexEntry {
  id: string;
  negocio_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  movement_type: KardexMovementType;
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  unit_cost_cents: number;
  unit_price_cents: number;
  total_value_cents: number;
  reference_id?: string | null;
  notes?: string | null;
  created_by_uid: string;
  created_by_name?: string | null;
  created_at: string;
}

export interface ProductKardexSummary {
  total_in: number;
  total_out: number;
  net_change: number;
  movements_count: number;
}

export interface ProductKardexResponse {
  product: Product;
  summary: ProductKardexSummary;
  entries: InventoryKardexEntry[];
}

export interface KardexAdjustmentInput {
  mode: 'add' | 'subtract' | 'set';
  quantity: number;
  reason: string;
}

export const KARDEX_MOVEMENT_META: Record<
  KardexMovementType,
  {
    label: string;
    shortLabel: string;
    emoji: string;
    badgeClass: string;
  }
> = {
  initial: {
    label: 'Inventario Inicial',
    shortLabel: 'Inicial',
    emoji: '🟢',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  sale: {
    label: 'Venta en Mostrador',
    shortLabel: 'Venta',
    emoji: '🛒',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  sale_void: {
    label: 'Anulación / Devolución',
    shortLabel: 'Anulación',
    emoji: '↩️',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  purchase: {
    label: 'Compra a Proveedor',
    shortLabel: 'Compra',
    emoji: '📦',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  shrinkage: {
    label: 'Merma / Avería',
    shortLabel: 'Merma',
    emoji: '📉',
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
  },
  shrinkage_revert: {
    label: 'Reversión de Merma',
    shortLabel: 'Rev. Merma',
    emoji: '♻️',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  adjustment: {
    label: 'Ajuste Manual',
    shortLabel: 'Ajuste',
    emoji: '⚖️',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
  },
};

export function getKardexMovementMeta(type: KardexMovementType | string) {
  return (
    KARDEX_MOVEMENT_META[type as KardexMovementType] || {
      label: 'Movimiento',
      shortLabel: 'Otro',
      emoji: '📋',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    }
  );
}
