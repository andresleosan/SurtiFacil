export interface WholesaleTier {
  min_quantity: number;
  unit_price_cents: number;
}

export interface ProductPricingInput {
  price_cents: number;
  en_oferta?: boolean | number;
  precio_oferta_cents?: number | null;
  wholesale_tiers?: WholesaleTier[] | null;
  wholesale_tiers_json?: string | null;
}

export interface ResolvedProductPricing {
  regular_unit_price_cents: number;
  active_base_unit_price_cents: number;
  unit_price_cents: number;
  regular_subtotal_cents: number;
  subtotal_cents: number;
  wholesale_savings_cents: number;
  total_savings_cents: number;
  applied_tier: WholesaleTier | null;
  next_tier: WholesaleTier | null;
  units_to_next_tier: number;
  tiers: WholesaleTier[];
}

export const MAX_WHOLESALE_TIERS = 5;

/**
 * Normaliza y ordena las escalas de precio mayorista por cantidad mínima ascendente.
 * Acepta tanto arreglos tipados como cadenas JSON almacenadas en Cloudflare D1.
 */
export function parseWholesaleTiers(raw: unknown): WholesaleTier[] {
  if (!raw) return [];

  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(candidate)) return [];

  const deduped = new Map<number, number>();
  for (const entry of candidate) {
    if (!entry || typeof entry !== 'object') continue;
    const minQty = Number((entry as Record<string, unknown>).min_quantity);
    const unitPrice = Number((entry as Record<string, unknown>).unit_price_cents);
    if (
      !Number.isSafeInteger(minQty) ||
      minQty < 2 ||
      !Number.isFinite(unitPrice) ||
      Math.round(unitPrice) <= 0
    ) {
      continue;
    }
    const cleanPrice = Math.round(unitPrice);
    const existing = deduped.get(minQty);
    if (existing === undefined || cleanPrice < existing) {
      deduped.set(minQty, cleanPrice);
    }
  }

  return Array.from(deduped.entries())
    .map(([min_quantity, unit_price_cents]) => ({ min_quantity, unit_price_cents }))
    .sort((a, b) => a.min_quantity - b.min_quantity);
}

/**
 * Serializa de forma determinística las escalas mayoristas para guardar en D1.
 */
export function serializeWholesaleTiers(tiers?: WholesaleTier[] | null): string {
  return JSON.stringify(parseWholesaleTiers(tiers));
}

/**
 * Valida estrictamente las escalas mayoristas ingresadas desde API o formularios.
 */
export function validateWholesaleTiersInput(
  raw: unknown,
  regularPriceCents: number
):
  | { valid: true; tiers: WholesaleTier[]; json: string }
  | { valid: false; error: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { valid: true, tiers: [], json: '[]' };
  }

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { valid: true, tiers: [], json: '[]' };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { valid: false, error: 'Formato JSON inválido para escalas mayoristas.' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { valid: false, error: 'Las escalas mayoristas deben ser una lista válida.' };
  }

  if (parsed.length > MAX_WHOLESALE_TIERS) {
    return {
      valid: false,
      error: `Máximo ${MAX_WHOLESALE_TIERS} escalas mayoristas por producto.`,
    };
  }

  const seenQuantities = new Set<number>();
  const normalized: WholesaleTier[] = [];
  const safeRegular = Math.max(0, Math.round(Number(regularPriceCents) || 0));

  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      return { valid: false, error: 'Cada escala mayorista debe incluir cantidad mínima y precio.' };
    }
    const record = item as Record<string, unknown>;
    const minQty = Number(record.min_quantity);
    const unitPriceRaw = Number(record.unit_price_cents);

    if (!Number.isSafeInteger(minQty) || minQty < 2 || minQty > 999) {
      return {
        valid: false,
        error: 'La cantidad mínima mayorista debe ser un entero entre 2 y 999 unidades.',
      };
    }

    if (!Number.isFinite(unitPriceRaw) || Math.round(unitPriceRaw) <= 0) {
      return {
        valid: false,
        error: 'El precio unitario mayorista debe ser mayor a $0.',
      };
    }

    const unitPrice = Math.round(unitPriceRaw);
    if (safeRegular > 0 && unitPrice >= safeRegular) {
      return {
        valid: false,
        error: 'El precio mayorista debe ser menor al precio normal del producto.',
      };
    }

    if (seenQuantities.has(minQty)) {
      return {
        valid: false,
        error: `No puedes repetir la cantidad mínima de ${minQty} unidades.`,
      };
    }

    seenQuantities.add(minQty);
    normalized.push({ min_quantity: minQty, unit_price_cents: unitPrice });
  }

  normalized.sort((a, b) => a.min_quantity - b.min_quantity);

  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i].unit_price_cents >= normalized[i - 1].unit_price_cents) {
      return {
        valid: false,
        error: 'A mayor cantidad mínima, el precio por unidad debe ser más económico.',
      };
    }
  }

  return {
    valid: true,
    tiers: normalized,
    json: JSON.stringify(normalized),
  };
}

/**
 * Resuelve autoritativamente el precio unitario, subtotal, ahorro y próximo tramo mayorista
 * para una cantidad determinada de un producto.
 */
export function resolveProductUnitPricing(
  product: ProductPricingInput,
  quantity: number
): ResolvedProductPricing {
  const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
  const regularPrice = Math.max(0, Math.round(Number(product.price_cents) || 0));

  const offerRaw =
    product.precio_oferta_cents !== undefined && product.precio_oferta_cents !== null
      ? Math.round(Number(product.precio_oferta_cents))
      : 0;
  const hasActiveOffer =
    Boolean(product.en_oferta) &&
    Number.isFinite(offerRaw) &&
    offerRaw > 0 &&
    (regularPrice === 0 || offerRaw < regularPrice);

  const activeBasePrice = hasActiveOffer ? offerRaw : regularPrice;

  const applicableTiers = parseWholesaleTiers(
    product.wholesale_tiers ?? product.wholesale_tiers_json
  ).filter((tier) => activeBasePrice === 0 || tier.unit_price_cents < activeBasePrice);

  let appliedTier: WholesaleTier | null = null;
  for (let i = applicableTiers.length - 1; i >= 0; i -= 1) {
    if (safeQty >= applicableTiers[i].min_quantity) {
      appliedTier = applicableTiers[i];
      break;
    }
  }

  const nextTier = applicableTiers.find((tier) => tier.min_quantity > safeQty) ?? null;
  const unitPrice = appliedTier ? appliedTier.unit_price_cents : activeBasePrice;
  const subtotal = unitPrice * safeQty;
  const regularSubtotal = regularPrice * safeQty;
  const wholesaleSavings = appliedTier
    ? Math.max(0, (activeBasePrice - unitPrice) * safeQty)
    : 0;
  const totalSavings = Math.max(0, (regularPrice - unitPrice) * safeQty);

  return {
    regular_unit_price_cents: regularPrice,
    active_base_unit_price_cents: activeBasePrice,
    unit_price_cents: unitPrice,
    regular_subtotal_cents: regularSubtotal,
    subtotal_cents: subtotal,
    wholesale_savings_cents: wholesaleSavings,
    total_savings_cents: totalSavings,
    applied_tier: appliedTier,
    next_tier: nextTier,
    units_to_next_tier: nextTier ? Math.max(1, nextTier.min_quantity - safeQty) : 0,
    tiers: applicableTiers,
  };
}

/**
 * Devuelve la primera escala mayorista beneficiosa para mostrar en tarjetas de catálogo.
 */
export function getPrimaryWholesaleTier(product: ProductPricingInput): WholesaleTier | null {
  const pricing = resolveProductUnitPricing(product, 1);
  return pricing.tiers[0] ?? null;
}
