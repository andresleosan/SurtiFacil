import { getSales, getProducts } from './saleService';
import { Sale, Product, SaleItem } from '../firebase/db';

export interface MarginBucket {
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  margin_percent: number;
}

export interface MarginSummary {
  today: MarginBucket;
  thisWeek: MarginBucket;
  thisMonth: MarginBucket;
  estimatedCostCount: number;
}

export interface MarginDaily {
  date: string;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  margin_percent: number;
}

export interface ProductMargin {
  product_id: string;
  product_name: string;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  margin_percent: number;
  units_sold: number;
}

export interface CategoryMargin {
  category: string;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  margin_percent: number;
}

export function resolveCost(product: Product): { costCents: number; isEstimated: boolean } {
  if (product.last_cost_cents !== undefined && product.last_cost_cents !== null) {
    return { costCents: product.last_cost_cents, isEstimated: false };
  }
  if (product.price_cents !== undefined) {
    return { costCents: Math.floor(product.price_cents / 2), isEstimated: true };
  }
  return { costCents: 0, isEstimated: false };
}

function getSaleDate(sale: Sale): Date {
  return sale.date?.toDate?.() || new Date(sale.date);
}

function emptyBucket(): MarginBucket {
  return { revenue_cents: 0, cost_cents: 0, margin_cents: 0, margin_percent: 0 };
}

function finalizeBucket(revenue: number, cost: number): MarginBucket {
  const margin = revenue - cost;
  const percent = revenue > 0 ? (margin / revenue) * 100 : 0;
  return {
    revenue_cents: revenue,
    cost_cents: cost,
    margin_cents: margin,
    margin_percent: percent,
  };
}

function itemCost(
  item: SaleItem,
  productsById: Map<string, Product>
): { cost: number; estimated: boolean; product: Product | undefined } {
  const product = productsById.get(item.product_id);
  if (!product) {
    return { cost: 0, estimated: false, product: undefined };
  }
  const { costCents, isEstimated } = resolveCost(product);
  return { cost: costCents * item.quantity, estimated: isEstimated, product };
}

export async function getMarginSummary(): Promise<MarginSummary> {
  const [sales, products] = await Promise.all([getSales(), getProducts()]);
  const productsById = new Map(products.map((p) => [p.id, p]));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let todayRevenue = 0;
  let todayCost = 0;
  let weekRevenue = 0;
  let weekCost = 0;
  let monthRevenue = 0;
  let monthCost = 0;
  let estimatedCostCount = 0;

  for (const sale of sales) {
    const saleDate = getSaleDate(sale);
    const inMonth = saleDate >= startOfMonth;
    const inWeek = saleDate >= startOfWeek;
    const inToday = saleDate >= startOfToday;
    if (!inMonth) continue;

    let saleRevenue = 0;
    let saleCost = 0;
    for (const item of sale.items || []) {
      const { cost, estimated } = itemCost(item, productsById);
      saleRevenue += item.subtotal;
      saleCost += cost;
      if (estimated) estimatedCostCount += 1;
    }

    monthRevenue += saleRevenue;
    monthCost += saleCost;
    if (inWeek) {
      weekRevenue += saleRevenue;
      weekCost += saleCost;
    }
    if (inToday) {
      todayRevenue += saleRevenue;
      todayCost += saleCost;
    }
  }

  return {
    today: finalizeBucket(todayRevenue, todayCost),
    thisWeek: finalizeBucket(weekRevenue, weekCost),
    thisMonth: finalizeBucket(monthRevenue, monthCost),
    estimatedCostCount,
  };
}

export async function getMarginDaily(days: number = 30): Promise<MarginDaily[]> {
  const [sales, products] = await Promise.all([getSales(), getProducts()]);
  const productsById = new Map(products.map((p) => [p.id, p]));
  const result: MarginDaily[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    let revenue = 0;
    let cost = 0;

    for (const sale of sales) {
      const saleDate = getSaleDate(sale);
      if (saleDate >= date && saleDate < nextDate) {
        for (const item of sale.items || []) {
          const { cost: itemC } = itemCost(item, productsById);
          revenue += item.subtotal;
          cost += itemC;
        }
      }
    }

    const margin = revenue - cost;
    const percent = revenue > 0 ? (margin / revenue) * 100 : 0;

    result.push({
      date: date.toISOString().slice(0, 10),
      revenue_cents: revenue,
      cost_cents: cost,
      margin_cents: margin,
      margin_percent: percent,
    });
  }

  return result;
}

export async function getTopProductsByMargin(
  limit: number = 10,
  sortBy: 'absolute' | 'percent' = 'absolute'
): Promise<ProductMargin[]> {
  const [sales, products] = await Promise.all([getSales(), getProducts()]);
  const productsById = new Map(products.map((p) => [p.id, p]));

  const totals = new Map<
    string,
    { revenue: number; cost: number; units: number; name: string }
  >();

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const product = productsById.get(item.product_id);
      if (!product) continue;
      const { cost } = itemCost(item, productsById);
      const existing = totals.get(item.product_id) || {
        revenue: 0,
        cost: 0,
        units: 0,
        name: product.name,
      };
      existing.revenue += item.subtotal;
      existing.cost += cost;
      existing.units += item.quantity;
      totals.set(item.product_id, existing);
    }
  }

  const rows: ProductMargin[] = Array.from(totals.entries()).map(([id, t]) => {
    const margin = t.revenue - t.cost;
    const percent = t.revenue > 0 ? (margin / t.revenue) * 100 : 0;
    return {
      product_id: id,
      product_name: t.name,
      revenue_cents: t.revenue,
      cost_cents: t.cost,
      margin_cents: margin,
      margin_percent: percent,
      units_sold: t.units,
    };
  });

  const filtered = sortBy === 'percent' ? rows.filter((r) => r.revenue_cents >= 1000) : rows;

  filtered.sort((a, b) => {
    if (sortBy === 'percent') {
      return b.margin_percent - a.margin_percent;
    }
    return b.margin_cents - a.margin_cents;
  });

  return filtered.slice(0, limit);
}

export async function getMarginByCategory(): Promise<CategoryMargin[]> {
  const [sales, products] = await Promise.all([getSales(), getProducts()]);
  const productsById = new Map(products.map((p) => [p.id, p]));

  const buckets = new Map<string, { revenue: number; cost: number }>();

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const product = productsById.get(item.product_id);
      if (!product) continue;
      const category = product.category || 'Sin categoría';
      const { cost } = itemCost(item, productsById);
      const existing = buckets.get(category) || { revenue: 0, cost: 0 };
      existing.revenue += item.subtotal;
      existing.cost += cost;
      buckets.set(category, existing);
    }
  }

  return Array.from(buckets.entries())
    .map(([category, t]) => {
      const margin = t.revenue - t.cost;
      const percent = t.revenue > 0 ? (margin / t.revenue) * 100 : 0;
      return {
        category,
        revenue_cents: t.revenue,
        cost_cents: t.cost,
        margin_cents: margin,
        margin_percent: percent,
      };
    })
    .sort((a, b) => b.margin_cents - a.margin_cents);
}
