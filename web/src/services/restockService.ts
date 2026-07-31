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

export async function getRestockSuggestions(
  options?: RestockOptions
): Promise<RestockSuggestion[]> {
  const [sales, products, suppliers] = await Promise.all([
    getSales(),
    getProducts(),
    getSuppliers(),
  ]);
  // Placeholder implementation: full logic comes in Task 2.
  return [];
}
