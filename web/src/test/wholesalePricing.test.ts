import { describe, expect, it } from 'vitest';
import {
  MAX_WHOLESALE_TIERS,
  getPrimaryWholesaleTier,
  parseWholesaleTiers,
  resolveProductUnitPricing,
  serializeWholesaleTiers,
  validateWholesaleTiersInput,
} from '../utils/wholesalePricing';

describe('wholesalePricing (motor isomórfico de escalas mayoristas)', () => {
  it('parseWholesaleTiers normaliza JSON/arreglos, depura inválidos y ordena ascendente', () => {
    const raw = JSON.stringify([
      { min_quantity: 6, unit_price_cents: 380000 },
      { min_quantity: 3, unit_price_cents: 410000 },
      { min_quantity: 3, unit_price_cents: 400000 }, // duplicado -> conserva menor precio
      { min_quantity: 1, unit_price_cents: 350000 }, // min_quantity < 2 -> descartado
      { min_quantity: 12, unit_price_cents: 0 }, // precio <= 0 -> descartado
    ]);

    expect(parseWholesaleTiers(raw)).toEqual([
      { min_quantity: 3, unit_price_cents: 400000 },
      { min_quantity: 6, unit_price_cents: 380000 },
    ]);

    expect(
      serializeWholesaleTiers([
        { min_quantity: 12, unit_price_cents: 350000 },
        { min_quantity: 3, unit_price_cents: 400000 },
      ])
    ).toBe('[{"min_quantity":3,"unit_price_cents":400000},{"min_quantity":12,"unit_price_cents":350000}]');
  });

  it('validateWholesaleTiersInput valida reglas estrictas de negocio', () => {
    expect(validateWholesaleTiersInput([], 450000)).toEqual({
      valid: true,
      tiers: [],
      json: '[]',
    });

    // Cantidad mínima < 2
    const invalidMin = validateWholesaleTiersInput(
      [{ min_quantity: 1, unit_price_cents: 400000 }],
      450000
    );
    expect(invalidMin.valid).toBe(false);

    // Precio >= regular
    const invalidPrice = validateWholesaleTiersInput(
      [{ min_quantity: 3, unit_price_cents: 450000 }],
      450000
    );
    expect(invalidPrice.valid).toBe(false);
    if (!invalidPrice.valid) {
      expect(invalidPrice.error).toMatch(/menor al precio normal/i);
    }

    // Duplicado de min_quantity
    const duplicateQty = validateWholesaleTiersInput(
      [
        { min_quantity: 3, unit_price_cents: 400000 },
        { min_quantity: 3, unit_price_cents: 390000 },
      ],
      450000
    );
    expect(duplicateQty.valid).toBe(false);

    // Escala superior no es más económica
    const nonDescendingPrice = validateWholesaleTiersInput(
      [
        { min_quantity: 3, unit_price_cents: 400000 },
        { min_quantity: 6, unit_price_cents: 400000 },
      ],
      450000
    );
    expect(nonDescendingPrice.valid).toBe(false);
    if (!nonDescendingPrice.valid) {
      expect(nonDescendingPrice.error).toMatch(/más económico/i);
    }

    // Límite máximo de escalas
    const tooMany = validateWholesaleTiersInput(
      Array.from({ length: MAX_WHOLESALE_TIERS + 1 }, (_, i) => ({
        min_quantity: i + 2,
        unit_price_cents: 440000 - i * 10000,
      })),
      450000
    );
    expect(tooMany.valid).toBe(false);

    // Válido en orden arbitrario -> normaliza ordenado
    const ok = validateWholesaleTiersInput(
      [
        { min_quantity: 6, unit_price_cents: 380000 },
        { min_quantity: 3, unit_price_cents: 410000 },
      ],
      450000
    );
    expect(ok.valid).toBe(true);
    if (ok.valid) {
      expect(ok.tiers).toEqual([
        { min_quantity: 3, unit_price_cents: 410000 },
        { min_quantity: 6, unit_price_cents: 380000 },
      ]);
    }
  });

  it('resolveProductUnitPricing aplica y revierte múltiples escalas (3+, 6+) y respeta ofertas activas', () => {
    const milkProduct = {
      price_cents: 450000,
      wholesale_tiers: [
        { min_quantity: 3, unit_price_cents: 400000 },
        { min_quantity: 6, unit_price_cents: 380000 },
      ],
    };

    // 2 unidades -> tarifa normal y nudge hacia 3+
    const qty2 = resolveProductUnitPricing(milkProduct, 2);
    expect(qty2.unit_price_cents).toBe(450000);
    expect(qty2.subtotal_cents).toBe(900000);
    expect(qty2.applied_tier).toBeNull();
    expect(qty2.wholesale_savings_cents).toBe(0);
    expect(qty2.next_tier).toEqual({ min_quantity: 3, unit_price_cents: 400000 });
    expect(qty2.units_to_next_tier).toBe(1);

    // 3 unidades -> activa tramo 3+
    const qty3 = resolveProductUnitPricing(milkProduct, 3);
    expect(qty3.unit_price_cents).toBe(400000);
    expect(qty3.subtotal_cents).toBe(1200000);
    expect(qty3.applied_tier).toEqual({ min_quantity: 3, unit_price_cents: 400000 });
    expect(qty3.wholesale_savings_cents).toBe(150000);
    expect(qty3.next_tier).toEqual({ min_quantity: 6, unit_price_cents: 380000 });
    expect(qty3.units_to_next_tier).toBe(3);

    // 6 unidades -> activa tramo 6+
    const qty6 = resolveProductUnitPricing(milkProduct, 6);
    expect(qty6.unit_price_cents).toBe(380000);
    expect(qty6.subtotal_cents).toBe(2280000);
    expect(qty6.applied_tier).toEqual({ min_quantity: 6, unit_price_cents: 380000 });
    expect(qty6.wholesale_savings_cents).toBe(420000);
    expect(qty6.next_tier).toBeNull();

    // Producto en oferta ($4.100): ignora tramo 3+ de $4.200 (más caro que oferta), pero aplica tramo 6+ de $3.700
    const promoProduct = {
      price_cents: 450000,
      en_oferta: 1,
      precio_oferta_cents: 410000,
      wholesale_tiers: [
        { min_quantity: 3, unit_price_cents: 420000 },
        { min_quantity: 6, unit_price_cents: 370000 },
      ],
    };

    expect(getPrimaryWholesaleTier(promoProduct)).toEqual({
      min_quantity: 6,
      unit_price_cents: 370000,
    });

    const promoQty3 = resolveProductUnitPricing(promoProduct, 3);
    expect(promoQty3.unit_price_cents).toBe(410000);
    expect(promoQty3.applied_tier).toBeNull();

    const promoQty6 = resolveProductUnitPricing(promoProduct, 6);
    expect(promoQty6.unit_price_cents).toBe(370000);
    expect(promoQty6.applied_tier).toEqual({ min_quantity: 6, unit_price_cents: 370000 });
    expect(promoQty6.wholesale_savings_cents).toBe(240000); // (410000 - 370000) * 6
    expect(promoQty6.total_savings_cents).toBe(480000); // (450000 - 370000) * 6
  });
});
