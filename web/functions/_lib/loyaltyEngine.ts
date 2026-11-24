/**
 * Motor Isomórfico de Fidelización ("Club de Puntos del Barrio") y Cupones de Descuento.
 * Compartido entre Cloudflare Pages Functions (/api/*) y el Frontend React/Vite.
 * Todos los montos monetarios se expresan como enteros en centavos (100 cents = $ 1 COP).
 */

export interface LoyaltyConfig {
  enabled: boolean;
  /** Centavos gastados para acumular 1 punto (ej. 100000 = $ 1.000 COP) */
  pesos_per_point_cents: number;
  /** Valor en centavos de 1 punto al canjear (ej. 5000 = $ 50 COP) */
  point_value_cents: number;
  /** Puntos mínimos requeridos para redimir en una compra */
  min_redeem_points: number;
  /** Porcentaje máximo (5..100) del subtotal pagable con puntos */
  max_redeem_percent: number;
}

export type CouponDiscountType = 'percentage' | 'fixed_cents';

export interface CouponRecord {
  id: string;
  negocio_id?: string;
  code: string;
  description?: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_purchase_cents: number;
  max_discount_cents?: number | null;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  active: number | boolean;
}

export type CouponValidationOutcome =
  | {
      valid: true;
      discount_cents: number;
      final_subtotal_cents: number;
      normalized_code: string;
    }
  | {
      valid: false;
      error: string;
    };

export interface LoyaltySettlementInput {
  itemsSubtotalCents: number;
  deliveryFeeCents?: number;
  config?: Partial<LoyaltyConfig> | null;
  coupon?: CouponRecord | null;
  couponCodeRequested?: string | null;
  hasValidPhone: boolean;
  accountPointsBalance: number;
  pointsToRedeemRequested?: number;
  nowDate?: Date;
}

export type LoyaltySettlementResult =
  | {
      ok: true;
      items_subtotal_cents: number;
      coupon_code: string | null;
      coupon_discount_cents: number;
      after_coupon_subtotal_cents: number;
      points_redeemed: number;
      points_discount_cents: number;
      paid_merchandise_cents: number;
      delivery_fee_cents: number;
      final_total_cents: number;
      points_earned: number;
      config: LoyaltyConfig;
    }
  | {
      ok: false;
      error: string;
    };

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: true,
  pesos_per_point_cents: 100000, // $ 1.000 COP = 1 punto
  point_value_cents: 5000, // 1 punto = $ 50 COP
  min_redeem_points: 10, // Mínimo 10 pts ($ 500 COP)
  max_redeem_percent: 50, // Máximo 50% del mercado en puntos
};

function formatCentsSimpleCOP(cents: number): string {
  const pesos = Math.round(Math.max(0, cents) / 100);
  const formatted = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${formatted}`;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return Math.max(min, Math.min(max, rounded));
}

export function normalizeLoyaltyConfig(raw?: Partial<LoyaltyConfig> | null): LoyaltyConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LOYALTY_CONFIG };
  }
  return {
    enabled: raw.enabled === undefined ? DEFAULT_LOYALTY_CONFIG.enabled : Boolean(raw.enabled),
    pesos_per_point_cents: clampInt(
      raw.pesos_per_point_cents,
      DEFAULT_LOYALTY_CONFIG.pesos_per_point_cents,
      10000,
      10000000
    ),
    point_value_cents: clampInt(
      raw.point_value_cents,
      DEFAULT_LOYALTY_CONFIG.point_value_cents,
      100,
      100000
    ),
    min_redeem_points: clampInt(
      raw.min_redeem_points,
      DEFAULT_LOYALTY_CONFIG.min_redeem_points,
      1,
      10000
    ),
    max_redeem_percent: clampInt(
      raw.max_redeem_percent,
      DEFAULT_LOYALTY_CONFIG.max_redeem_percent,
      5,
      100
    ),
  };
}

/**
 * Normaliza un número celular colombiano: conserva únicamente dígitos y si inicia en 573 (12 dígitos)
 * recorta el prefijo de país 57 a 10 dígitos (ej. 3004567890).
 */
export function normalizeLoyaltyPhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('573')) {
    return digits.slice(2);
  }
  return digits;
}

export function isValidLoyaltyPhone(normalizedPhone: string): boolean {
  return /^\d{7,15}$/.test(normalizedPhone);
}

export function formatLoyaltyPhone(raw: string): string {
  const normalized = normalizeLoyaltyPhone(raw);
  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
  }
  return normalized || String(raw || '').trim();
}

/**
 * Enmascara el apellido para consultas públicas de saldo en Kiosco iPad / Tienda Web.
 */
export function maskPublicCustomerName(fullName: string): string {
  const cleaned = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Vecino del Club';
  const parts = cleaned.split(' ');
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const prefix = parts.slice(0, -1).join(' ');
  return `${prefix} ${last.charAt(0).toUpperCase()}.`;
}

export function normalizeCouponCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isValidCouponCode(code: string): boolean {
  return /^[A-Z0-9_-]{3,24}$/.test(code);
}

export function validateCouponForSubtotal(
  coupon: CouponRecord | null | undefined,
  itemsSubtotalCents: number,
  nowDate: Date = new Date()
): CouponValidationOutcome {
  if (!coupon) {
    return { valid: false, error: 'Cupón no encontrado o no pertenece a este local.' };
  }

  const isActive = coupon.active === true || coupon.active === 1;
  if (!isActive) {
    return { valid: false, error: 'Este cupón está pausado o inactivo.' };
  }

  if (coupon.expires_at && String(coupon.expires_at).trim().length > 0) {
    const trimmedExp = String(coupon.expires_at).trim();
    const expMs = /^\d{4}-\d{2}-\d{2}$/.test(trimmedExp)
      ? Date.parse(`${trimmedExp}T23:59:59.999Z`)
      : Date.parse(trimmedExp);
    if (!Number.isNaN(expMs) && nowDate.getTime() > expMs) {
      return { valid: false, error: 'Este cupón ya venció.' };
    }
  }

  if (
    coupon.max_uses !== null &&
    coupon.max_uses !== undefined &&
    Number(coupon.max_uses) > 0 &&
    Number(coupon.used_count || 0) >= Number(coupon.max_uses)
  ) {
    return { valid: false, error: 'Este cupón alcanzó el límite máximo de usos.' };
  }

  const safeSubtotal = Math.max(0, Math.round(itemsSubtotalCents));
  if (safeSubtotal <= 0) {
    return { valid: false, error: 'Agrega productos antes de aplicar un cupón.' };
  }

  const minPurchase = Math.max(0, Math.round(Number(coupon.min_purchase_cents) || 0));
  if (minPurchase > 0 && safeSubtotal < minPurchase) {
    return {
      valid: false,
      error: `Este cupón requiere una compra mínima de ${formatCentsSimpleCOP(minPurchase)} COP.`,
    };
  }

  let rawDiscount = 0;
  if (coupon.discount_type === 'percentage') {
    const pct = Math.max(0, Math.min(100, Number(coupon.discount_value) || 0));
    rawDiscount = Math.round((safeSubtotal * pct) / 100);
    const maxDisc =
      coupon.max_discount_cents !== null && coupon.max_discount_cents !== undefined
        ? Math.round(Number(coupon.max_discount_cents))
        : 0;
    if (maxDisc > 0) {
      rawDiscount = Math.min(rawDiscount, maxDisc);
    }
  } else {
    rawDiscount = Math.round(Number(coupon.discount_value) || 0);
  }

  const discountCents = Math.max(0, Math.min(safeSubtotal, rawDiscount));
  return {
    valid: true,
    discount_cents: discountCents,
    final_subtotal_cents: safeSubtotal - discountCents,
    normalized_code: normalizeCouponCode(coupon.code),
  };
}

export function calculateMaxRedeemablePoints(
  pointsBalance: number,
  afterCouponSubtotalCents: number,
  configInput?: Partial<LoyaltyConfig> | null
): { max_points: number; max_discount_cents: number; can_redeem: boolean } {
  const config = normalizeLoyaltyConfig(configInput);
  const safeBalance = Math.max(0, Math.floor(Number(pointsBalance) || 0));
  const safeSubtotal = Math.max(0, Math.round(Number(afterCouponSubtotalCents) || 0));

  if (!config.enabled || safeBalance < config.min_redeem_points || safeSubtotal <= 0) {
    return { max_points: 0, max_discount_cents: 0, can_redeem: false };
  }

  const maxByPolicyCents = Math.floor((safeSubtotal * config.max_redeem_percent) / 100);
  const maxByPolicyPoints = Math.floor(maxByPolicyCents / config.point_value_cents);
  const maxPoints = Math.min(safeBalance, maxByPolicyPoints);

  if (maxPoints < config.min_redeem_points) {
    return { max_points: 0, max_discount_cents: 0, can_redeem: false };
  }

  return {
    max_points: maxPoints,
    max_discount_cents: maxPoints * config.point_value_cents,
    can_redeem: true,
  };
}

export function calculatePointsEarned(
  paidMerchandiseCents: number,
  configInput?: Partial<LoyaltyConfig> | null
): number {
  const config = normalizeLoyaltyConfig(configInput);
  const safePaid = Math.max(0, Math.round(Number(paidMerchandiseCents) || 0));
  if (!config.enabled || safePaid <= 0) return 0;
  return Math.floor(safePaid / config.pesos_per_point_cents);
}

/**
 * Liquida autoritativamente cupones, canje de puntos y puntos ganados en orden estricto:
 * 1) Cupón sobre subtotal de mercancía.
 * 2) Canje de puntos sobre el subtotal restante (respetando mínimo, saldo y tope %).
 * 3) Puntos ganados únicamente sobre la mercancía pagada en dinero (excluye envío y descuentos).
 */
export function settleOrderLoyaltyAndCoupon(input: LoyaltySettlementInput): LoyaltySettlementResult {
  const config = normalizeLoyaltyConfig(input.config);
  const itemsSubtotalCents = Math.max(0, Math.round(Number(input.itemsSubtotalCents) || 0));
  const deliveryFeeCents = Math.max(0, Math.round(Number(input.deliveryFeeCents) || 0));
  const nowDate = input.nowDate || new Date();

  let appliedCouponCode: string | null = null;
  let couponDiscountCents = 0;
  const requestedCode = normalizeCouponCode(input.couponCodeRequested || '');

  if (requestedCode) {
    const validation = validateCouponForSubtotal(input.coupon, itemsSubtotalCents, nowDate);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }
    appliedCouponCode = validation.normalized_code;
    couponDiscountCents = validation.discount_cents;
  }

  const afterCouponSubtotalCents = Math.max(0, itemsSubtotalCents - couponDiscountCents);
  const requestedPointsRaw = Number(input.pointsToRedeemRequested || 0);

  if (!Number.isFinite(requestedPointsRaw) || requestedPointsRaw < 0 || !Number.isInteger(requestedPointsRaw)) {
    return { ok: false, error: 'La cantidad de puntos a canjear debe ser un entero positivo.' };
  }

  const pointsRedeemed = requestedPointsRaw;
  let pointsDiscountCents = 0;

  if (pointsRedeemed > 0) {
    if (!config.enabled) {
      return { ok: false, error: 'El Club de Puntos está desactivado en este comercio.' };
    }
    if (!input.hasValidPhone) {
      return { ok: false, error: 'Ingresa un número celular válido para canjear puntos.' };
    }
    const safeBalance = Math.max(0, Math.floor(Number(input.accountPointsBalance) || 0));
    if (pointsRedeemed > safeBalance) {
      return { ok: false, error: `Saldo insuficiente de puntos. Disponible: ${safeBalance} pts.` };
    }
    if (pointsRedeemed < config.min_redeem_points) {
      return {
        ok: false,
        error: `El canje mínimo es de ${config.min_redeem_points} puntos.`,
      };
    }

    const policy = calculateMaxRedeemablePoints(safeBalance, afterCouponSubtotalCents, config);
    if (!policy.can_redeem || pointsRedeemed > policy.max_points) {
      return {
        ok: false,
        error: `Puedes canjear máximo ${policy.max_points} puntos (${config.max_redeem_percent}% de la compra).`,
      };
    }

    pointsDiscountCents = pointsRedeemed * config.point_value_cents;
  }

  const paidMerchandiseCents = Math.max(0, afterCouponSubtotalCents - pointsDiscountCents);
  const finalTotalCents = paidMerchandiseCents + deliveryFeeCents;
  const pointsEarned =
    input.hasValidPhone && config.enabled
      ? calculatePointsEarned(paidMerchandiseCents, config)
      : 0;

  return {
    ok: true,
    items_subtotal_cents: itemsSubtotalCents,
    coupon_code: appliedCouponCode,
    coupon_discount_cents: couponDiscountCents,
    after_coupon_subtotal_cents: afterCouponSubtotalCents,
    points_redeemed: pointsRedeemed,
    points_discount_cents: pointsDiscountCents,
    paid_merchandise_cents: paidMerchandiseCents,
    delivery_fee_cents: deliveryFeeCents,
    final_total_cents: finalTotalCents,
    points_earned: pointsEarned,
    config,
  };
}
