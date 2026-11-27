export const MILLI_FACTOR = 1000;
export const MIN_FRACTIONAL_QTY = 0.05;
export const MAX_FRACTIONAL_QTY = 9999;

/** Presets rápidos en centavos COP ($1.000, $2.000, $3.000, $5.000, $10.000) */
export const BULK_AMOUNT_PRESETS_COP = [100000, 200000, 300000, 500000, 1000000] as const;

export type KardexMovementType =
  | 'initial'
  | 'sale'
  | 'sale_void'
  | 'purchase'
  | 'shrinkage'
  | 'shrinkage_revert'
  | 'adjustment';

export interface BulkWeightPreset {
  quantity: number;
  label: string;
  hint?: string;
}

/**
 * Redondea cantidades de inventario evitando errores de punto flotante (hasta 3 decimales).
 */
export function roundQuantity(qty: number, allowFractional = true): number {
  const numeric = Number(qty);
  if (!Number.isFinite(numeric)) return 0;
  if (!allowFractional) return Math.round(numeric);
  return Math.round(numeric * MILLI_FACTOR) / MILLI_FACTOR;
}

/**
 * Determina si un producto habilita venta a granel / fraccionada.
 */
export function isFractionalProduct(
  product: { allow_fractional?: boolean | number } | null | undefined,
): boolean {
  if (!product) return false;
  return Boolean(product.allow_fractional);
}

/**
 * Determina si la unidad de medida corresponde típicamente a un producto pesable o a granel.
 */
export function isWeighableUnit(unit?: string | null): boolean {
  const norm = String(unit || '').trim().toLowerCase();
  return norm === 'libra' || norm === 'kilo' || norm === 'gramo' || norm === 'litro';
}

/**
 * Valida estrictamente la cantidad solicitada según si el producto permite fracciones.
 */
export function validateItemQuantity(
  quantity: unknown,
  allowFractional: boolean,
): { ok: true; quantity: number } | { ok: false; error: string } {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_FRACTIONAL_QTY) {
    return {
      ok: false,
      error: allowFractional
        ? `La cantidad debe estar entre ${MIN_FRACTIONAL_QTY} y ${MAX_FRACTIONAL_QTY}.`
        : `La cantidad debe ser un entero entre 1 y ${MAX_FRACTIONAL_QTY}.`,
    };
  }

  if (!allowFractional) {
    if (Math.abs(numeric - Math.round(numeric)) >= 1e-6 || Math.round(numeric) < 1) {
      return { ok: false, error: 'Este producto se vende por unidades enteras.' };
    }
    return { ok: true, quantity: Math.round(numeric) };
  }

  const rounded = roundQuantity(numeric, true);
  if (rounded < MIN_FRACTIONAL_QTY) {
    return { ok: false, error: `La cantidad mínima a granel es ${MIN_FRACTIONAL_QTY}.` };
  }
  return { ok: true, quantity: rounded };
}

/**
 * Calcula el subtotal exacto en centavos para cantidades enteras o fraccionadas.
 * Para precios COP en pesos enteros (>= $100), redondea al peso entero más cercano
 * evitando centavos sueltos en mostrador.
 */
export function computeLineSubtotalCents(unitPriceCents: number, quantity: number): number {
  const safePrice = Math.max(0, Math.round(Number(unitPriceCents) || 0));
  const safeQty = Math.max(0, Number(quantity) || 0);
  if (safePrice === 0 || safeQty === 0) return 0;

  if (Math.abs(safeQty - Math.round(safeQty)) < 1e-6) {
    return safePrice * Math.round(safeQty);
  }

  const milliQty = Math.round(safeQty * MILLI_FACTOR);
  const rawCents = (safePrice * milliQty) / MILLI_FACTOR;
  if (safePrice >= 10000 && safePrice % 100 === 0) {
    return Math.round(rawCents / 100) * 100;
  }
  return Math.round(rawCents);
}

/**
 * Convierte un valor en centavos COP ("deme $ 3.000 de papa") al peso equivalente.
 */
export function calculateWeightFromAmountCents(
  targetAmountCents: number,
  unitPriceCents: number,
): number {
  const safeTarget = Number(targetAmountCents);
  const safePrice = Number(unitPriceCents);
  if (!Number.isFinite(safeTarget) || !Number.isFinite(safePrice) || safeTarget <= 0 || safePrice <= 0) {
    return 0;
  }
  return roundQuantity(safeTarget / safePrice, true);
}

/**
 * Devuelve la abreviatura corta de la unidad de medida para tirillas y etiquetas compactas.
 */
export function getUnitShortLabel(unit?: string | null): string {
  const norm = String(unit || 'unidad').trim().toLowerCase();
  if (norm === 'libra') return 'lb';
  if (norm === 'kilo') return 'kg';
  if (norm === 'litro') return 'L';
  if (norm === 'gramo') return 'g';
  if (norm === 'paquete') return 'paq';
  if (norm === 'cubeta') return 'cub';
  if (norm === 'combo') return 'combo';
  if (norm === 'unidad') return 'ud';
  return norm;
}

/**
 * Formatea una cantidad eliminando ceros innecesarios a la derecha (0.500 -> "0.5").
 */
export function formatQuantityNumber(qty: number): string {
  const rounded = roundQuantity(qty, true);
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Formatea cantidad + unidad legible (ej. "0.75 lb" o "2 unidad").
 */
export function formatQuantityWithUnit(
  qty: number,
  unit?: string | null,
  short = false,
): string {
  const numStr = formatQuantityNumber(qty);
  const unitLabel = short ? getUnitShortLabel(unit) : String(unit || 'unidad').trim().toLowerCase();
  return `${numStr} ${unitLabel}`;
}

/**
 * Devuelve la equivalencia en gramos o mililitros cuando aplica.
 */
export function formatWeightGramsHint(qty: number, unit?: string | null): string | null {
  const safeQty = roundQuantity(qty, true);
  if (safeQty <= 0) return null;
  const norm = String(unit || '').trim().toLowerCase();
  if (norm === 'libra') {
    return `${Math.round(safeQty * 500)} g`;
  }
  if (norm === 'kilo') {
    return `${Math.round(safeQty * 1000)} g`;
  }
  if (norm === 'litro') {
    return `${Math.round(safeQty * 1000)} ml`;
  }
  return null;
}

/**
 * Devuelve los atajos rápidos de peso según la unidad del producto.
 */
export function getBulkWeightPresets(unit?: string | null): BulkWeightPreset[] {
  const norm = String(unit || '').trim().toLowerCase();
  if (norm === 'libra') {
    return [
      { quantity: 0.25, label: '¼ lb', hint: '125 g' },
      { quantity: 0.5, label: '½ lb', hint: '250 g' },
      { quantity: 0.75, label: '¾ lb', hint: '375 g' },
      { quantity: 1, label: '1 lb', hint: '500 g' },
      { quantity: 1.5, label: '1.5 lb', hint: '750 g' },
      { quantity: 2, label: '2 lb', hint: '1000 g' },
    ];
  }
  if (norm === 'kilo') {
    return [
      { quantity: 0.25, label: '¼ kg', hint: '250 g' },
      { quantity: 0.5, label: '½ kg', hint: '500 g' },
      { quantity: 0.75, label: '¾ kg', hint: '750 g' },
      { quantity: 1, label: '1 kg', hint: '1000 g' },
      { quantity: 1.5, label: '1.5 kg', hint: '1500 g' },
      { quantity: 2, label: '2 kg', hint: '2000 g' },
    ];
  }
  if (norm === 'litro') {
    return [
      { quantity: 0.25, label: '¼ L', hint: '250 ml' },
      { quantity: 0.5, label: '½ L', hint: '500 ml' },
      { quantity: 1, label: '1 L', hint: '1000 ml' },
      { quantity: 2, label: '2 L', hint: '2000 ml' },
    ];
  }
  const short = getUnitShortLabel(unit);
  return [
    { quantity: 0.25, label: `¼ ${short}` },
    { quantity: 0.5, label: `½ ${short}` },
    { quantity: 1, label: `1 ${short}` },
    { quantity: 2, label: `2 ${short}` },
  ];
}

/**
 * Paso estándar táctil (+/-) para productos a granel.
 */
export function getBulkStep(_unit?: string | null): number {
  return 0.25;
}
