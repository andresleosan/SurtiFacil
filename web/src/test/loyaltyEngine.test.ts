import { describe, expect, it } from 'vitest';
import {
  calculateMaxRedeemablePoints,
  calculatePointsEarned,
  DEFAULT_LOYALTY_CONFIG,
  formatLoyaltyPhone,
  isValidCouponCode,
  isValidLoyaltyPhone,
  maskPublicCustomerName,
  normalizeCouponCode,
  normalizeLoyaltyConfig,
  normalizeLoyaltyPhone,
  settleOrderLoyaltyAndCoupon,
  validateCouponForSubtotal,
  type CouponRecord,
} from '../utils/loyaltyEngine';

describe('loyaltyEngine (Club de Puntos y Cupones)', () => {
  it('normaliza celulares colombianos (+57 / espacios) y valida longitudes', () => {
    expect(normalizeLoyaltyPhone('+57 300 456 7890')).toBe('3004567890');
    expect(normalizeLoyaltyPhone('573112345678')).toBe('3112345678');
    expect(normalizeLoyaltyPhone('300-111-2233')).toBe('3001112233');
    expect(isValidLoyaltyPhone('3004567890')).toBe(true);
    expect(isValidLoyaltyPhone('12345')).toBe(false);
    expect(formatLoyaltyPhone('573004567890')).toBe('300 456 7890');
  });

  it('enmascara apellidos para consultas públicas en Kiosco y Tienda Vecinal', () => {
    expect(maskPublicCustomerName('Don Carlos Restrepo')).toBe('Don Carlos R.');
    expect(maskPublicCustomerName('Ana María López')).toBe('Ana María L.');
    expect(maskPublicCustomerName('Carlos')).toBe('Carlos');
    expect(maskPublicCustomerName('   ')).toBe('Vecino del Club');
  });

  it('normaliza códigos de cupón y valida formato permitido', () => {
    expect(normalizeCouponCode('  vecino 10 ')).toBe('VECINO10');
    expect(isValidCouponCode('VECINO10')).toBe(true);
    expect(isValidCouponCode('AB')).toBe(false);
    expect(isValidCouponCode('A$%!')).toBe(false);
  });

  it('aplica clamp seguro a la configuración de reglas del Club', () => {
    const normalized = normalizeLoyaltyConfig({
      enabled: true,
      pesos_per_point_cents: 500, // debajo del mínimo 10.000
      point_value_cents: 5000,
      min_redeem_points: 0, // debajo del mínimo 1
      max_redeem_percent: 150, // encima de 100
    });
    expect(normalized.pesos_per_point_cents).toBe(10000);
    expect(normalized.min_redeem_points).toBe(1);
    expect(normalized.max_redeem_percent).toBe(100);
  });

  it('valida cupones porcentuales con tope máximo, fijos COP, vencidos, agotados y compra mínima', () => {
    const pctCoupon: CouponRecord = {
      id: 'c1',
      code: 'VECINO10',
      discount_type: 'percentage',
      discount_value: 20,
      min_purchase_cents: 1000000, // $ 10.000
      max_discount_cents: 500000, // tope $ 5.000
      max_uses: 10,
      used_count: 2,
      expires_at: '2026-12-31',
      active: 1,
    };

    // Subtotales por debajo de compra mínima
    const tooLow = validateCouponForSubtotal(pctCoupon, 800000, new Date('2026-11-24T12:00:00Z'));
    expect(tooLow.valid).toBe(false);

    // Subtotal $ 40.000 -> 20% = $ 8.000, limitado al tope de $ 5.000
    const capped = validateCouponForSubtotal(pctCoupon, 4000000, new Date('2026-11-24T12:00:00Z'));
    expect(capped).toEqual({
      valid: true,
      discount_cents: 500000,
      final_subtotal_cents: 3500000,
      normalized_code: 'VECINO10',
    });

    // Vencido
    const expired = validateCouponForSubtotal(pctCoupon, 2000000, new Date('2027-01-02T00:00:00Z'));
    expect(expired.valid).toBe(false);

    // Agotado
    const maxedOut = validateCouponForSubtotal(
      { ...pctCoupon, used_count: 10 },
      2000000,
      new Date('2026-11-24T12:00:00Z')
    );
    expect(maxedOut.valid).toBe(false);

    // Cupón fijo mayor al subtotal se ajusta sin quedar total negativo
    const fixedCoupon: CouponRecord = {
      id: 'c2',
      code: 'REGALO5000',
      discount_type: 'fixed_cents',
      discount_value: 500000,
      min_purchase_cents: 0,
      used_count: 0,
      active: 1,
    };
    const fixedOutcome = validateCouponForSubtotal(fixedCoupon, 350000);
    expect(fixedOutcome).toEqual({
      valid: true,
      discount_cents: 350000,
      final_subtotal_cents: 0,
      normalized_code: 'REGALO5000',
    });
  });

  it('calcula tope de canje en puntos y acumula únicamente sobre mercancía pagada (sin envío ni descuentos)', () => {
    // Compra $ 20.000 -> cupón 10% (-$ 2.000) -> queda $ 18.000 mercancía.
    // Tope 50% de $ 18.000 = $ 9.000 -> máx 180 pts (a $ 50 c/u).
    const maxPolicy = calculateMaxRedeemablePoints(500, 1800000, DEFAULT_LOYALTY_CONFIG);
    expect(maxPolicy).toEqual({
      can_redeem: true,
      max_points: 180,
      max_discount_cents: 900000,
    });

    // Si tiene menos del mínimo (10 pts), no puede canjear
    expect(calculateMaxRedeemablePoints(9, 1800000, DEFAULT_LOYALTY_CONFIG).can_redeem).toBe(false);

    // Liquidación completa con cupón + canje 80 pts ($ 4.000) + domicilio $ 3.500:
    // Mercancía pagada = 20.000 - 2.000 - 4.000 = $ 14.000 -> gana 14 pts (no cuenta envío $ 3.500).
    // Total final = $ 14.000 + $ 3.500 = $ 17.500 (1750000 cents).
    const coupon: CouponRecord = {
      id: 'c1',
      code: 'VECINO10',
      discount_type: 'percentage',
      discount_value: 10,
      min_purchase_cents: 1000000,
      used_count: 0,
      active: 1,
    };
    const settled = settleOrderLoyaltyAndCoupon({
      itemsSubtotalCents: 2000000,
      deliveryFeeCents: 350000,
      config: DEFAULT_LOYALTY_CONFIG,
      coupon,
      couponCodeRequested: 'VECINO10',
      hasValidPhone: true,
      accountPointsBalance: 120,
      pointsToRedeemRequested: 80,
    });

    expect(settled.ok).toBe(true);
    if (settled.ok) {
      expect(settled.coupon_discount_cents).toBe(200000);
      expect(settled.points_redeemed).toBe(80);
      expect(settled.points_discount_cents).toBe(400000);
      expect(settled.paid_merchandise_cents).toBe(1400000);
      expect(settled.final_total_cents).toBe(1750000);
      expect(settled.points_earned).toBe(14);
    }

    // Rechaza intento de sobre-canje sobre el tope % o saldo
    const overRedeem = settleOrderLoyaltyAndCoupon({
      itemsSubtotalCents: 1000000,
      deliveryFeeCents: 0,
      config: DEFAULT_LOYALTY_CONFIG,
      hasValidPhone: true,
      accountPointsBalance: 500,
      pointsToRedeemRequested: 150, // $ 7.500 > 50% de $ 10.000 ($ 5.000 = 100 pts)
    });
    expect(overRedeem.ok).toBe(false);
    expect(calculatePointsEarned(149900, DEFAULT_LOYALTY_CONFIG)).toBe(1);
  });
});
