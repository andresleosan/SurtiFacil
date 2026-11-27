import { describe, it, expect } from 'vitest';
import {
  calculateWeightFromAmountCents,
  computeLineSubtotalCents,
  formatQuantityNumber,
  formatQuantityWithUnit,
  formatWeightGramsHint,
  isFractionalProduct,
  isWeighableUnit,
  roundQuantity,
  validateItemQuantity,
} from '../utils/bulkWeight';
import { resolveProductUnitPricing } from '../utils/wholesalePricing';
import { parseSarinSaleCommand } from '../utils/sarinVoiceParser';
import { generateSaleReceiptText } from '../utils/receiptGenerator';
import type { Product, Sale } from '../firebase/db';

describe('bulkWeight & venta a granel', () => {
  it('detecta productos pesables y redondea pesos con seguridad de 3 decimales', () => {
    expect(isFractionalProduct({ allow_fractional: 1 })).toBe(true);
    expect(isFractionalProduct({ allow_fractional: 0 })).toBe(false);
    expect(isWeighableUnit('libra')).toBe(true);
    expect(isWeighableUnit('kilo')).toBe(true);
    expect(isWeighableUnit('unidad')).toBe(false);
    expect(roundQuantity(0.1 + 0.2, true)).toBe(0.3);
    expect(roundQuantity(2.75, false)).toBe(3);
  });

  it('valida cantidades fraccionadas vs enteras y rechaza debajo del mínimo', () => {
    const okFrac = validateItemQuantity(0.5, true);
    expect(okFrac.ok).toBe(true);
    if (okFrac.ok) expect(okFrac.quantity).toBe(0.5);

    expect(validateItemQuantity(0.01, true).ok).toBe(false);
    expect(validateItemQuantity(1.5, false).ok).toBe(false);
    expect(validateItemQuantity(2, false).ok).toBe(true);
  });

  it('calcula peso exacto desde valor COP y redondea subtotales a peso COP entero', () => {
    // Papa a $4.000/lb -> $3.000 COP => 0.75 lb
    const qty = calculateWeightFromAmountCents(300000, 400000);
    expect(qty).toBe(0.75);
    expect(computeLineSubtotalCents(400000, qty)).toBe(300000);

    // 0.333 lb a $4.100/lb = $1.365,30 -> redondeo al peso entero más cercano ($1.365 = 136500 cents)
    const sub = computeLineSubtotalCents(410000, 0.333);
    expect(sub % 100).toBe(0);
    expect(sub).toBe(136500);
  });

  it('soporta escalas mayoristas con cantidades fraccionadas', () => {
    const res = resolveProductUnitPricing(
      {
        price_cents: 400000,
        allow_fractional: true,
        wholesale_tiers: [{ min_quantity: 3, unit_price_cents: 350000 }],
      },
      3.5
    );
    expect(res.applied_tier?.unit_price_cents).toBe(350000);
    expect(res.subtotal_cents).toBe(1225000);
    expect(res.wholesale_savings_cents).toBe(175000);
  });

  it('formatea pesos y equivalencias en gramos para UI y tirilla', () => {
    expect(formatQuantityNumber(0.5)).toBe('0.5');
    expect(formatQuantityWithUnit(0.75, 'libra', true)).toBe('0.75 lb');
    expect(formatWeightGramsHint(0.5, 'libra')).toContain('250 g');
    expect(formatWeightGramsHint(0.5, 'kilo')).toContain('500 g');
  });

  it('Sarin interpreta voz fraccionada y compras por valor COP en productos a granel', () => {
    const papa: Product = {
      id: 'p-papa',
      name: 'Papa Criolla',
      price_cents: 400000,
      stock: 30,
      min_stock: 5,
      unit: 'libra',
      category: 'Frutas y Verduras',
      allow_fractional: true,
    };
    const leche: Product = {
      id: 'p-leche',
      name: 'Leche Entera',
      price_cents: 420000,
      stock: 20,
      min_stock: 4,
      unit: 'litro',
      category: 'Lácteos',
      allow_fractional: false,
    };

    const parsedHalf = parseSarinSaleCommand('media libra de papa criolla', [papa, leche]);
    expect(parsedHalf.intent).toBe('ADD_ITEMS');
    expect(parsedHalf.items[0].product.id).toBe('p-papa');
    expect(parsedHalf.items[0].quantity).toBe(0.5);

    const parsedThreeQuarters = parseSarinSaleCommand('tres cuartos de papa criolla', [papa, leche]);
    expect(parsedThreeQuarters.items[0].quantity).toBe(0.75);

    const parsedMoney = parseSarinSaleCommand('3000 de papa criolla', [papa, leche]);
    expect(parsedMoney.intent).toBe('ADD_ITEMS');
    expect(parsedMoney.items[0].quantity).toBe(0.75);
    expect(parsedMoney.items[0].subtotalCents).toBe(300000);
  });

  it('genera tirilla térmica y WhatsApp con formato legible para pesos fraccionados', () => {
    const sale: Sale = {
      id: 'sale-frac-1',
      date: '2026-11-26T15:00:00.000Z',
      total: 1140000,
      payment_method: 'cash',
      items: [
        {
          product_id: 'p-papa',
          product_name: 'Papa Criolla',
          quantity: 0.75,
          price_cents: 400000,
          subtotal: 300000,
          unit: 'libra',
        },
        {
          product_id: 'p-leche',
          product_name: 'Leche Entera',
          quantity: 2,
          price_cents: 420000,
          subtotal: 840000,
          unit: 'litro',
        },
      ],
    };

    const receipt = generateSaleReceiptText(sale, { nombre: 'Tienda La Bendición' });
    expect(receipt).toContain('0.75lb');
    expect(receipt).toContain('2x');
  });
});
