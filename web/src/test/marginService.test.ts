import { describe, it, expect } from 'vitest';
import { resolveCost } from '../services/marginService';
import { Product } from '../firebase/db';

describe('marginService - resolveCost', () => {
  it('usa last_cost_cents si existe', () => {
    const p: Partial<Product> = { last_cost_cents: 500, price_cents: 1000 };
    const res = resolveCost(p as Product);
    expect(res.costCents).toBe(500);
    expect(res.isEstimated).toBe(false);
  });

  it('usa fallback price_cents/2 si last_cost_cents no existe', () => {
    const p: Partial<Product> = { price_cents: 1000 };
    const res = resolveCost(p as Product);
    expect(res.costCents).toBe(500);
    expect(res.isEstimated).toBe(true);
  });

  it('acepta last_cost_cents = 0 como valor valido', () => {
    const p: Partial<Product> = { last_cost_cents: 0, price_cents: 1000 };
    const res = resolveCost(p as Product);
    expect(res.costCents).toBe(0);
    expect(res.isEstimated).toBe(false);
  });

  it('retorna 0 si no hay costo ni precio', () => {
    const p: Partial<Product> = { };
    const res = resolveCost(p as Product);
    expect(res.costCents).toBe(0);
    expect(res.isEstimated).toBe(false);
  });
});
