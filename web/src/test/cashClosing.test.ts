import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateCountedCents,
  getCashShiftSummary,
  recordCashClosing,
  getCashClosings,
} from '../services/cashClosingService';
import { COLOMBIAN_BILLS, COLOMBIAN_COINS } from '../types/cashClosing';

describe('Servicio de Arqueo y Cierre de Caja COP (cashClosingService)', () => {
  it('contiene las 6 denominaciones oficiales de billetes y 5 de monedas colombianas', () => {
    expect(COLOMBIAN_BILLS).toHaveLength(6);
    expect(COLOMBIAN_COINS).toHaveLength(5);

    const billValues = COLOMBIAN_BILLS.map((b) => b.valueCOP);
    expect(billValues).toEqual([100000, 50000, 20000, 10000, 5000, 2000]);

    const coinValues = COLOMBIAN_COINS.map((c) => c.valueCOP);
    expect(coinValues).toEqual([1000, 500, 200, 100, 50]);
  });

  it('calcula la suma física de efectivo a partir del desglose de billetes y monedas', () => {
    // 2 billetes de 100.000 ($200.000)
    // 3 billetes de 50.000 ($150.000)
    // 4 billetes de 20.000 ($80.000)
    // 10 monedas de 1.000 ($10.000)
    // 20 monedas de 500 ($10.000)
    // Total: $450.000 COP = 45.000.000 centavos
    const countedCents = calculateCountedCents({
      bills: {
        '100000': 2,
        '50000': 3,
        '20000': 4,
      },
      coins: {
        '1000': 10,
        '500': 20,
      },
    });

    expect(countedCents).toBe(45000000);
  });

  it('devuelve 0 si el desglose está vacío o con valores nulos/negativos', () => {
    const counted = calculateCountedCents({
      bills: { '100000': -5, '50000': 0 },
      coins: { '1000': -1 },
    });
    expect(counted).toBe(0);
  });

  it('obtiene el resumen del turno activo con base de caja y ventas en efectivo', async () => {
    const summary = await getCashShiftSummary(10000000); // Base $100.000 COP
    expect(summary).toBeDefined();
    expect(summary.initial_cash_cents).toBe(10000000);
    expect(summary.expected_cash_cents).toBeGreaterThanOrEqual(10000000);
    expect(summary.opened_at).toBeDefined();
  });

  it('registra un cierre cuadrado (balanced) cuando el efectivo contado coincide con el esperado', async () => {
    const summary = await getCashShiftSummary(10000000);
    const expected = summary.expected_cash_cents;

    // Calcular cuántos billetes de 50k se necesitan para igualar el esperado (o aproximar)
    const bills50kNeeded = Math.floor(expected / 5000000);
    const remainingCents = expected % 5000000;
    const coins1kNeeded = Math.floor(remainingCents / 100000);

    const closing = await recordCashClosing({
      initial_cash_cents: 10000000,
      breakdown: {
        bills: { '50000': bills50kNeeded },
        coins: { '1000': coins1kNeeded },
      },
      notes: 'Turno cuadrado sin diferencias',
    });

    expect(closing.id).toBeDefined();
    expect(closing.status).toBe('balanced');
    expect(closing.difference_cents).toBe(0);
    expect(closing.notes).toBe('Turno cuadrado sin diferencias');
  });

  it('detecta un sobrante (surplus) cuando se cuenta más efectivo del esperado', async () => {
    const summary = await getCashShiftSummary(10000000);
    const expected = summary.expected_cash_cents;

    // Contar 1 billete extra de 100.000 sobre el esperado
    const bills50kNeeded = Math.floor(expected / 5000000);
    const remainingCents = expected % 5000000;
    const coins1kNeeded = Math.floor(remainingCents / 100000);

    const closing = await recordCashClosing({
      initial_cash_cents: 10000000,
      breakdown: {
        bills: { '100000': 1, '50000': bills50kNeeded },
        coins: { '1000': coins1kNeeded },
      },
      notes: 'Sobrante en propina o caja',
    });

    expect(closing.status).toBe('surplus');
    expect(closing.difference_cents).toBeGreaterThan(0);
  });

  it('detecta un faltante (shortage) cuando el conteo físico es menor al esperado', async () => {
    const closing = await recordCashClosing({
      initial_cash_cents: 10000000,
      breakdown: {
        bills: { '2000': 1 }, // Solo $2.000 contados frente a $100.000+ esperados
        coins: {},
      },
      notes: 'Faltante para investigar',
    });

    expect(closing.status).toBe('shortage');
    expect(closing.difference_cents).toBeLessThan(0);
  });
});
