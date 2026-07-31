import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRestockSuggestions } from '../services/restockService';
import { getSales, getProducts } from '../services/saleService';
import { getSuppliers } from '../services/supplierService';
import { Sale, Product, Supplier } from '../firebase/db';

vi.mock('../services/saleService', () => ({
  getSales: vi.fn(),
  getProducts: vi.fn(),
}));
vi.mock('../services/supplierService', () => ({
  getSuppliers: vi.fn(),
}));

const mockGetSales = getSales as unknown as ReturnType<typeof vi.fn>;
const mockGetProducts = getProducts as unknown as ReturnType<typeof vi.fn>;
const mockGetSuppliers = getSuppliers as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date('2026-07-31T12:00:00Z').getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW - n * ONE_DAY_MS);
}

function makeSale(id: string, daysBack: number, items: Array<{ product_id: string; quantity: number }>): Sale {
  return {
    id,
    date: daysAgo(daysBack),
    total: items.reduce((s, it) => s + it.quantity * 100, 0),
    payment_method: 'cash',
    items: items.map((it) => ({
      product_id: it.product_id,
      product_name: it.product_id,
      quantity: it.quantity,
      price_cents: 100,
      subtotal: it.quantity * 100,
    })),
  };
}

function makeProduct(overrides: Partial<Product> & { id: string; name: string }): Product {
  return {
    id: overrides.id,
    name: overrides.name,
    price_cents: overrides.price_cents ?? 1000,
    stock: overrides.stock ?? 0,
    category: overrides.category,
    supplier_id: overrides.supplier_id,
    last_cost_cents: overrides.last_cost_cents,
    last_cost_source: overrides.last_cost_source,
  };
}

function makeSupplier(overrides: Partial<Supplier> & { id: string; name: string }): Supplier {
  return {
    id: overrides.id,
    name: overrides.name,
    active: overrides.active ?? true,
    totalOrders: overrides.totalOrders ?? 0,
    totalSpentCents: overrides.totalSpentCents ?? 0,
    lead_time_days: overrides.lead_time_days,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

describe('restockService - getRestockSuggestions', () => {
  it('test 1: producto con alta velocidad y stock bajo -> critical', async () => {
    const products: Product[] = [
      makeProduct({ id: 'p1', name: 'Arroz Diana', stock: 2, supplier_id: 's1', category: 'granos', last_cost_cents: 500 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Proveedor X', lead_time_days: 7 }),
    ];
    const sales: Sale[] = [
      makeSale('sale1', 5, [{ product_id: 'p1', quantity: 30 }]),
      makeSale('sale2', 10, [{ product_id: 'p1', quantity: 30 }]),
      makeSale('sale3', 20, [{ product_id: 'p1', quantity: 30 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0].product_id).toBe('p1');
    expect(result[0].urgency).toBe('critical');
    expect(result[0].suggested_quantity).toBeGreaterThan(0);
    expect(result[0].data_source).toBe('product');
  });

  it('test 2: producto estable con stock suficiente -> low urgency', async () => {
    const products: Product[] = [
      makeProduct({ id: 'p2', name: 'Leche Alpina', stock: 100, supplier_id: 's1', category: 'lacteos', last_cost_cents: 300 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Proveedor X', lead_time_days: 7 }),
    ];
    const sales: Sale[] = [
      makeSale('s1', 5, [{ product_id: 'p2', quantity: 10 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0].urgency).toBe('low');
    expect(result[0].days_remaining).toBeGreaterThan(100);
  });

  it('test 3: producto sin ventas (velocity < 0.1) -> excluido', async () => {
    const products: Product[] = [
      makeProduct({ id: 'p3', name: 'Queso raro', stock: 5, supplier_id: 's1', category: 'lacteos', last_cost_cents: 800 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Proveedor X', lead_time_days: 7 }),
    ];
    mockGetSales.mockResolvedValue([]);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result).toHaveLength(0);
  });

  it('test 4: producto nuevo sin historial propio pero con categoria -> usa category_avg', async () => {
    const products: Product[] = [
      makeProduct({ id: 'pA', name: 'Producto A', stock: 5, supplier_id: 's1', category: 'snacks', last_cost_cents: 200 }),
      makeProduct({ id: 'pB', name: 'Producto B', stock: 5, supplier_id: 's1', category: 'snacks', last_cost_cents: 200 }),
      makeProduct({ id: 'pNew', name: 'Snack Nuevo', stock: 5, supplier_id: 's1', category: 'snacks', last_cost_cents: 200 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Proveedor X', lead_time_days: 7 }),
    ];
    const sales: Sale[] = [
      makeSale('sa', 5, [{ product_id: 'pA', quantity: 30 }]),
      makeSale('sb', 5, [{ product_id: 'pB', quantity: 60 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    const newSnack = result.find((r) => r.product_id === 'pNew');
    expect(newSnack).toBeDefined();
    expect(newSnack!.data_source).toBe('category_avg');
    expect(newSnack!.urgency).toBe('critical');
  });

  it('test 5: producto sin datos propios ni categoria -> insufficient, excluido', async () => {
    const products: Product[] = [
      makeProduct({ id: 'pOrphan', name: 'Sin datos', stock: 5, supplier_id: 's1', last_cost_cents: 200 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Proveedor X', lead_time_days: 7 }),
    ];
    mockGetSales.mockResolvedValue([]);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result).toHaveLength(0);
  });

  it('test 6: producto sin supplier_id -> incluido, urgency low, suggested_quantity = 0', async () => {
    const products: Product[] = [
      makeProduct({ id: 'pNoSup', name: 'Sin proveedor', stock: 3, category: 'snacks', last_cost_cents: 200 }),
    ];
    const suppliers: Supplier[] = [];
    const sales: Sale[] = [
      makeSale('s1', 5, [{ product_id: 'pNoSup', quantity: 30 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0].supplier_id).toBeNull();
    expect(result[0].urgency).toBe('low');
    expect(result[0].suggested_quantity).toBe(0);
    expect(result[0].estimated_cost_cents).toBe(0);
  });

  it('test 7: orden por days_remaining ASC, sin-supplier al final', async () => {
    const products: Product[] = [
      makeProduct({ id: 'pCrit', name: 'Critico', stock: 1, supplier_id: 's1', category: 'a', last_cost_cents: 100 }),
      makeProduct({ id: 'pOK', name: 'Estable', stock: 100, supplier_id: 's1', category: 'a', last_cost_cents: 100 }),
      makeProduct({ id: 'pNoSup', name: 'Sin prov', stock: 500, category: 'a', last_cost_cents: 100 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Prov', lead_time_days: 7 }),
    ];
    const sales: Sale[] = [
      makeSale('sCrit', 2, [{ product_id: 'pCrit', quantity: 50 }]),
      makeSale('sOK', 5, [{ product_id: 'pOK', quantity: 10 }]),
      makeSale('sNoSup', 5, [{ product_id: 'pNoSup', quantity: 30 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result.map((r) => r.product_id)).toEqual(['pCrit', 'pOK', 'pNoSup']);
  });

  it('test 8: suggested_quantity usa ceil: velocity=2.3, lead=5, safety=7 -> 28', async () => {
    const products: Product[] = [
      makeProduct({ id: 'pCeil', name: 'Producto ceil', stock: 50, supplier_id: 'sLead5', category: 'a', last_cost_cents: 100 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 'sLead5', name: 'Prov lead5', lead_time_days: 5 }),
    ];
    const sales: Sale[] = [
      makeSale('s1', 0, [{ product_id: 'pCeil', quantity: 23 }]),
      makeSale('s2', 5, [{ product_id: 'pCeil', quantity: 23 }]),
      makeSale('s3', 10, [{ product_id: 'pCeil', quantity: 23 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions({ safetyBufferDays: 7 });

    expect(result).toHaveLength(1);
    expect(result[0].velocity_per_day).toBeCloseTo(2.3, 5);
    expect(result[0].suggested_quantity).toBe(28);
  });

  it('test 9: estimated_cost_cents usa last_cost_cents (sin fallback)', async () => {
    const products: Product[] = [
      makeProduct({ id: 'pCost', name: 'Con costo', stock: 1, supplier_id: 's1', category: 'a', last_cost_cents: 250, price_cents: 1000 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Prov', lead_time_days: 7 }),
    ];
    const sales: Sale[] = [
      makeSale('s1', 1, [{ product_id: 'pCost', quantity: 30 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0].estimated_cost_cents).toBe(result[0].suggested_quantity * 250);
  });

  it('test 10: estimated_cost_cents fallback a price_cents/2 cuando no hay last_cost_cents', async () => {
    const products: Product[] = [
      makeProduct({ id: 'pFb', name: 'Sin last_cost', stock: 1, supplier_id: 's1', category: 'a', price_cents: 1000 }),
    ];
    const suppliers: Supplier[] = [
      makeSupplier({ id: 's1', name: 'Prov', lead_time_days: 7 }),
    ];
    const sales: Sale[] = [
      makeSale('s1', 1, [{ product_id: 'pFb', quantity: 30 }]),
    ];
    mockGetSales.mockResolvedValue(sales);
    mockGetProducts.mockResolvedValue(products);
    mockGetSuppliers.mockResolvedValue(suppliers);

    const result = await getRestockSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0].estimated_cost_cents).toBe(result[0].suggested_quantity * 500);
  });
});
