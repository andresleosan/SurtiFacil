import { Product } from '../firebase/db';

export function resolveCost(product: Product): { costCents: number; isEstimated: boolean } {
  if (product.last_cost_cents !== undefined && product.last_cost_cents !== null) {
    return { costCents: product.last_cost_cents, isEstimated: false };
  }
  if (product.price_cents !== undefined) {
    return { costCents: Math.floor(product.price_cents / 2), isEstimated: true };
  }
  return { costCents: 0, isEstimated: false };
}
