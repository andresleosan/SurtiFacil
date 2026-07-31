import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveCost,
  getMarginSummary,
  getMarginDaily,
  getTopProductsByMargin,
  getMarginByCategory,
} from '../services/marginService';
import { Product, Sale } from '../firebase/db';

vi.mock('../services/saleService', () => ({
  getSales: vi.fn(),
  getProducts: vi.fn(),
}));

import { getSales, getProducts } from '../services/saleService';

const mockedGetSales = vi.mocked(getSales);
const mockedGetProducts = vi.mocked(getProducts);

const makeSale = (daysAgo: number, total: number, items: any[]): Sale => {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `sale-${daysAgo}-${total}`,
    date: date as any,
    total,
    payment_method: 'cash',
    items,
  };
};

const makeProduct = (id: string, price: number, cost?: number): Product => ({
  id,
  name: `Product ${id}`,
  price_cents: price,
  stock: 100,
  last_cost_cents: cost,
});

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
    const p: Partial<Product> = {};
    const res = resolveCost(p as Product);
    expect(res.costCents).toBe(0);
    expect(res.isEstimated).toBe(false);
  });
});

describe('marginService - getMarginSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('agrega ventas correctamente por rango (hoy/semana/mes)', async () => {
    const products = [makeProduct('p1', 1000, 400), makeProduct('p2', 500, 200)];
    const items = [
      { product_id: 'p1', product_name: 'P1', quantity: 2, price_cents: 1000, subtotal: 2000 },
      { product_id: 'p2', product_name: 'P2', quantity: 3, price_cents: 500, subtotal: 1500 },
    ];
    const sales: Sale[] = [
      makeSale(0, 3500, items),
      makeSale(2, 3500, items),
      makeSale(60, 3500, items),
    ];
    mockedGetSales.mockResolvedValue(sales);
    mockedGetProducts.mockResolvedValue(products);

    const summary = await getMarginSummary();

    const expectedItemCost = 2 * 400 + 3 * 200;
    expect(summary.today.revenue_cents).toBe(3500);
    expect(summary.today.cost_cents).toBe(expectedItemCost);
    expect(summary.today.margin_cents).toBe(3500 - expectedItemCost);
    expect(summary.thisWeek.revenue_cents).toBe(7000);
    expect(summary.thisWeek.cost_cents).toBe(expectedItemCost * 2);
    expect(summary.thisMonth.revenue_cents).toBe(7000);
    expect(summary.estimatedCostCount).toBe(0);
  });

  it('retorna ceros cuando no hay ventas', async () => {
    mockedGetSales.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);

    const summary = await getMarginSummary();

    expect(summary.today.revenue_cents).toBe(0);
    expect(summary.today.cost_cents).toBe(0);
    expect(summary.today.margin_cents).toBe(0);
    expect(summary.today.margin_percent).toBe(0);
    expect(summary.thisWeek.revenue_cents).toBe(0);
    expect(summary.thisMonth.revenue_cents).toBe(0);
    expect(summary.estimatedCostCount).toBe(0);
  });

  it('cuenta productos que usan fallback price_cents/2', async () => {
    const products = [makeProduct('p1', 1000), makeProduct('p2', 500, 200)];
    const items = [
      { product_id: 'p1', product_name: 'P1', quantity: 1, price_cents: 1000, subtotal: 1000 },
      { product_id: 'p2', product_name: 'P2', quantity: 1, price_cents: 500, subtotal: 500 },
    ];
    mockedGetSales.mockResolvedValue([makeSale(0, 1500, items)]);
    mockedGetProducts.mockResolvedValue(products);

    const summary = await getMarginSummary();

    expect(summary.estimatedCostCount).toBe(1);
    expect(summary.today.cost_cents).toBe(500 + 200);
  });
});

describe('marginService - getMarginDaily', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 7 puntos en orden ascendente cuando days=7', async () => {
    mockedGetSales.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);

    const daily = await getMarginDaily(7);

    expect(daily).toHaveLength(7);
    expect(daily[0].date < daily[6].date).toBe(true);
  });

  it('retorna 30 puntos cuando days=30', async () => {
    mockedGetSales.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);

    const daily = await getMarginDaily(30);

    expect(daily).toHaveLength(30);
  });

  it('retorna 30 puntos por defecto', async () => {
    mockedGetSales.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);

    const daily = await getMarginDaily();

    expect(daily).toHaveLength(30);
  });

  it('calcula margen diario correctamente', async () => {
    const products = [makeProduct('p1', 1000, 400)];
    const items = [
      { product_id: 'p1', product_name: 'P1', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    mockedGetSales.mockResolvedValue([makeSale(0, 5000, items)]);
    mockedGetProducts.mockResolvedValue(products);

    const daily = await getMarginDaily(7);

    expect(daily[6].revenue_cents).toBe(5000);
    expect(daily[6].cost_cents).toBe(5 * 400);
    expect(daily[6].margin_cents).toBe(5000 - 5 * 400);
  });
});

describe('marginService - getTopProductsByMargin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ordena por margin_cents desc cuando sortBy="absolute"', async () => {
    const products = [
      makeProduct('p1', 1000, 200),
      makeProduct('p2', 2000, 800),
      makeProduct('p3', 500, 100),
    ];
    const itemsA = [
      { product_id: 'p1', product_name: 'P1', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    const itemsB = [
      { product_id: 'p2', product_name: 'P2', quantity: 5, price_cents: 2000, subtotal: 10000 },
    ];
    const itemsC = [
      { product_id: 'p3', product_name: 'P3', quantity: 5, price_cents: 500, subtotal: 2500 },
    ];
    mockedGetSales.mockResolvedValue([
      makeSale(0, 5000, itemsA),
      makeSale(1, 10000, itemsB),
      makeSale(2, 2500, itemsC),
    ]);
    mockedGetProducts.mockResolvedValue(products);

    const top = await getTopProductsByMargin(10, 'absolute');

    expect(top[0].product_id).toBe('p2');
    expect(top[1].product_id).toBe('p1');
    expect(top[2].product_id).toBe('p3');
    expect(top[0].margin_cents).toBeGreaterThanOrEqual(top[1].margin_cents);
    expect(top[1].margin_cents).toBeGreaterThanOrEqual(top[2].margin_cents);
  });

  it('filtra productos con revenue_cents < 1000 cuando sortBy="percent"', async () => {
    const products = [
      makeProduct('p1', 1000, 100),
      makeProduct('p2', 1000, 100),
      makeProduct('p3', 1000, 100),
    ];
    const itemsBig = [
      { product_id: 'p1', product_name: 'P1', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    const itemsTinyA = [
      { product_id: 'p2', product_name: 'P2', quantity: 1, price_cents: 1000, subtotal: 500 },
    ];
    const itemsTinyB = [
      { product_id: 'p3', product_name: 'P3', quantity: 1, price_cents: 1000, subtotal: 500 },
    ];
    mockedGetSales.mockResolvedValue([
      makeSale(0, 5000, itemsBig),
      makeSale(1, 500, itemsTinyA),
      makeSale(2, 500, itemsTinyB),
    ]);
    mockedGetProducts.mockResolvedValue(products);

    const top = await getTopProductsByMargin(10, 'percent');

    const ids = top.map((p) => p.product_id);
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p3');
    expect(ids).toContain('p1');
    expect(top).toHaveLength(1);
  });

  it('respeta el parametro limit', async () => {
    const products = [
      makeProduct('p1', 1000, 100),
      makeProduct('p2', 1000, 200),
      makeProduct('p3', 1000, 300),
    ];
    const items = [
      { product_id: 'p1', product_name: 'P1', quantity: 5, price_cents: 1000, subtotal: 5000 },
      { product_id: 'p2', product_name: 'P2', quantity: 5, price_cents: 1000, subtotal: 5000 },
      { product_id: 'p3', product_name: 'P3', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    mockedGetSales.mockResolvedValue([makeSale(0, 15000, items)]);
    mockedGetProducts.mockResolvedValue(products);

    const top = await getTopProductsByMargin(2, 'absolute');

    expect(top).toHaveLength(2);
  });

  it('reporta margen negativo correctamente', async () => {
    const products = [makeProduct('p1', 1000, 2000)];
    const items = [
      { product_id: 'p1', product_name: 'P1', quantity: 2, price_cents: 1000, subtotal: 2000 },
    ];
    mockedGetSales.mockResolvedValue([makeSale(0, 2000, items)]);
    mockedGetProducts.mockResolvedValue(products);

    const top = await getTopProductsByMargin(10, 'absolute');

    expect(top[0].margin_cents).toBe(2000 - 2 * 2000);
    expect(top[0].margin_cents).toBe(-2000);
    expect(top[0].margin_percent).toBeLessThan(0);
  });
});

describe('marginService - getMarginByCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('agrupa productos por categoria correctamente', async () => {
    const products = [
      { ...makeProduct('p1', 1000, 200), category: 'Abarrotes' },
      { ...makeProduct('p2', 1000, 300), category: 'Bebidas' },
      { ...makeProduct('p3', 1000, 400), category: 'Abarrotes' },
    ];
    const itemsA = [
      { product_id: 'p1', product_name: 'P1', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    const itemsB = [
      { product_id: 'p2', product_name: 'P2', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    const itemsC = [
      { product_id: 'p3', product_name: 'P3', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    mockedGetSales.mockResolvedValue([
      makeSale(0, 5000, itemsA),
      makeSale(1, 5000, itemsB),
      makeSale(2, 5000, itemsC),
    ]);
    mockedGetProducts.mockResolvedValue(products);

    const byCategory = await getMarginByCategory();

    const abarrotes = byCategory.find((c) => c.category === 'Abarrotes');
    const bebidas = byCategory.find((c) => c.category === 'Bebidas');
    expect(abarrotes).toBeDefined();
    expect(abarrotes!.revenue_cents).toBe(10000);
    expect(abarrotes!.cost_cents).toBe(5 * 200 + 5 * 400);
    expect(abarrotes!.margin_cents).toBe(10000 - (5 * 200 + 5 * 400));
    expect(bebidas).toBeDefined();
    expect(bebidas!.revenue_cents).toBe(5000);
  });

  it('usa "Sin categoría" cuando el producto no tiene categoria', async () => {
    const products = [
      makeProduct('p1', 1000, 200),
      { ...makeProduct('p2', 1000, 300), category: 'Abarrotes' },
    ];
    const itemsA = [
      { product_id: 'p1', product_name: 'P1', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    const itemsB = [
      { product_id: 'p2', product_name: 'P2', quantity: 5, price_cents: 1000, subtotal: 5000 },
    ];
    mockedGetSales.mockResolvedValue([
      makeSale(0, 5000, itemsA),
      makeSale(1, 5000, itemsB),
    ]);
    mockedGetProducts.mockResolvedValue(products);

    const byCategory = await getMarginByCategory();

    const sinCat = byCategory.find((c) => c.category === 'Sin categoría');
    expect(sinCat).toBeDefined();
    expect(sinCat!.revenue_cents).toBe(5000);
  });

  it('retorna lista vacia cuando no hay ventas', async () => {
    mockedGetSales.mockResolvedValue([]);
    mockedGetProducts.mockResolvedValue([]);

    const byCategory = await getMarginByCategory();

    expect(byCategory).toEqual([]);
  });
});
