import { getSales, getProducts } from './saleService';
import { getSuppliers } from './supplierService';
import { Sale, Product, Supplier } from '../firebase/db';

const DEFAULT_LEAD_TIME_DAYS = 7;
const DEFAULT_VELOCITY_WINDOW_DAYS = 30;
const DEFAULT_SAFETY_BUFFER_DAYS = 7;
const DEFAULT_MIN_VELOCITY_THRESHOLD = 0.1;

export interface RestockOptions {
  velocityWindowDays?: number;
  safetyBufferDays?: number;
  minVelocityThreshold?: number;
}

export type Urgency = 'critical' | 'high' | 'medium' | 'low';
export type DataSource = 'product' | 'category_avg' | 'insufficient';

export interface RestockSuggestion {
  product_id: string;
  product_name: string;
  category: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  current_stock: number;
  velocity_per_day: number;
  days_remaining: number;
  lead_time_days: number;
  suggested_quantity: number;
  estimated_cost_cents: number;
  urgency: Urgency;
  data_source: DataSource;
}

function calculateVelocity(sales: Sale[], productId: string, windowDays: number): number {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  let units = 0;
  for (const sale of sales) {
    const saleDate = toMillis(sale.date);
    if (saleDate >= cutoff) {
      for (const item of sale.items) {
        if (item.product_id === productId) {
          units += item.quantity;
        }
      }
    }
  }
  return units / windowDays;
}

function calculateCategoryAverage(sales: Sale[], products: Product[], category: string): number {
  const productsInCategory = products.filter((p) => p.category === category);
  const velocities: number[] = [];
  for (const p of productsInCategory) {
    const v = calculateVelocity(sales, p.id, DEFAULT_VELOCITY_WINDOW_DAYS);
    if (v > 0) {
      velocities.push(v);
    }
  }
  if (velocities.length === 0) return 0;
  const sum = velocities.reduce((s, v) => s + v, 0);
  return sum / velocities.length;
}

function toMillis(value: any): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  return 0;
}

function classifyUrgency(daysRemaining: number, leadTime: number, safetyBuffer: number): Urgency {
  if (daysRemaining < leadTime) return 'critical';
  if (daysRemaining < leadTime + safetyBuffer) return 'high';
  if (daysRemaining < leadTime * 2 + safetyBuffer) return 'medium';
  return 'low';
}

export async function getRestockSuggestions(
  options?: RestockOptions
): Promise<RestockSuggestion[]> {
  const [sales, products, suppliers] = await Promise.all([
    getSales(),
    getProducts(),
    getSuppliers(),
  ]);

  const velocityWindowDays = options?.velocityWindowDays ?? DEFAULT_VELOCITY_WINDOW_DAYS;
  const safetyBufferDays = options?.safetyBufferDays ?? DEFAULT_SAFETY_BUFFER_DAYS;
  const minVelocityThreshold = options?.minVelocityThreshold ?? DEFAULT_MIN_VELOCITY_THRESHOLD;

  const supplierMap = new Map<string, Supplier>();
  for (const s of suppliers) supplierMap.set(s.id, s);

  const suggestions: RestockSuggestion[] = [];

  for (const product of products) {
    const velocity = calculateVelocity(sales, product.id, velocityWindowDays);
    let dataSource: DataSource;
    let effectiveVelocity = velocity;

    if (velocity >= minVelocityThreshold) {
      dataSource = 'product';
    } else if (product.category) {
      const categoryAvg = calculateCategoryAverage(sales, products, product.category);
      if (categoryAvg >= minVelocityThreshold) {
        effectiveVelocity = categoryAvg;
        dataSource = 'category_avg';
      } else {
        continue;
      }
    } else {
      continue;
    }

    const supplier = product.supplier_id ? supplierMap.get(product.supplier_id) : undefined;
    const supplierName = supplier?.name ?? null;
    const leadTime = supplier?.lead_time_days ?? DEFAULT_LEAD_TIME_DAYS;

    const daysRemaining = effectiveVelocity > 0 ? product.stock / effectiveVelocity : Infinity;

    let urgency: Urgency;
    let suggestedQuantity: number;
    let estimatedCostCents: number;

    if (!product.supplier_id) {
      urgency = 'low';
      suggestedQuantity = 0;
      estimatedCostCents = 0;
    } else {
      suggestedQuantity = Math.ceil(effectiveVelocity * (leadTime + safetyBufferDays));
      const unitCost = product.last_cost_cents ?? Math.floor(product.price_cents / 2);
      estimatedCostCents = suggestedQuantity * unitCost;
      urgency = classifyUrgency(daysRemaining, leadTime, safetyBufferDays);
    }

    suggestions.push({
      product_id: product.id,
      product_name: product.name,
      category: product.category ?? null,
      supplier_id: product.supplier_id ?? null,
      supplier_name: supplierName,
      current_stock: product.stock,
      velocity_per_day: effectiveVelocity,
      days_remaining: daysRemaining,
      lead_time_days: leadTime,
      suggested_quantity: suggestedQuantity,
      estimated_cost_cents: estimatedCostCents,
      urgency,
      data_source: dataSource,
    });
  }

  suggestions.sort((a, b) => {
    if (a.days_remaining === Infinity && b.days_remaining !== Infinity) return 1;
    if (b.days_remaining === Infinity && a.days_remaining !== Infinity) return -1;
    if (a.days_remaining === Infinity && b.days_remaining === Infinity) return 0;
    return a.days_remaining - b.days_remaining;
  });

  return suggestions;
}
