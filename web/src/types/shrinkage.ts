export type ShrinkageReason =
  | 'damaged'
  | 'expired'
  | 'spoiled_fruver'
  | 'internal_use'
  | 'other';

export interface InventoryShrinkage {
  id: string;
  negocio_id: string;
  product_id: string;
  product_name: string;
  category?: string;
  unit?: string;
  quantity: number;
  unit_cost_cents: number;
  total_cost_loss_cents: number;
  retail_value_cents: number;
  cost_source: 'purchase' | 'estimated_fallback';
  reason: ShrinkageReason;
  notes?: string;
  created_by_uid: string;
  created_by_name?: string;
  created_at: string;
}

export interface ShrinkageInput {
  product_id: string;
  quantity: number;
  reason: ShrinkageReason;
  notes?: string;
}

export interface ShrinkageResponse extends InventoryShrinkage {
  updated_stock?: number;
}

export interface ShrinkageReasonMeta {
  id: ShrinkageReason;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  placeholder: string;
  badgeClass: string;
}

export const SHRINKAGE_REASONS: ShrinkageReasonMeta[] = [
  {
    id: 'damaged',
    label: 'Avería / Empaque Dañado',
    shortLabel: 'Avería',
    emoji: '📦',
    description: 'Producto roto, golpeado o abierto en bodega/mostrador',
    placeholder: 'Ej: Bolsa rota al desempacar bulto',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    id: 'expired',
    label: 'Producto Vencido',
    shortLabel: 'Vencido',
    emoji: '⏰',
    description: 'Fecha de vencimiento cumplida en lácteos, carnes o empaques',
    placeholder: 'Ej: Lote vencido retirado de nevera',
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
  },
  {
    id: 'spoiled_fruver',
    label: 'Daño Fruver / Maduración',
    shortLabel: 'Fruver',
    emoji: '🥑',
    description: 'Fruta o verdura pasada, magullada o con merma natural',
    placeholder: 'Ej: Aguacate o tomate sobremaduro',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  {
    id: 'internal_use',
    label: 'Consumo Interno / Muestra',
    shortLabel: 'Consumo',
    emoji: '☕',
    description: 'Uso del local, degustación o reposición de cortesía',
    placeholder: 'Ej: Café/insumo de cafetería o muestra a cliente',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    id: 'other',
    label: 'Otra Merma',
    shortLabel: 'Otra',
    emoji: '📉',
    description: 'Faltante físico o ajuste extraordinario de bodega',
    placeholder: 'Ej: Diferencia en conteo físico de pasillo',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
  },
];

export const SHRINKAGE_REASON_IDS = new Set<string>(SHRINKAGE_REASONS.map((r) => r.id));

export function getShrinkageReasonMeta(reason: string): ShrinkageReasonMeta {
  return (
    SHRINKAGE_REASONS.find((item) => item.id === reason) ||
    SHRINKAGE_REASONS[SHRINKAGE_REASONS.length - 1]
  );
}
