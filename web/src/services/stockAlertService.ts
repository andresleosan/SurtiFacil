import { Product } from '../firebase/db';

export interface StockAlert {
  productId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  category?: string;
  severity: 'critical' | 'warning' | 'low';
}

const DEFAULT_MIN_STOCK = 10;

export function checkLowStock(products: Product[], threshold: number = DEFAULT_MIN_STOCK): StockAlert[] {
  const alerts: StockAlert[] = [];

  for (const product of products) {
    const minStock = threshold;

    if (product.stock <= minStock) {
      let severity: StockAlert['severity'] = 'low';

      if (product.stock === 0) {
        severity = 'critical';
      } else if (product.stock <= minStock * 0.5) {
        severity = 'warning';
      }

      alerts.push({
        productId: product.id,
        productName: product.name,
        currentStock: product.stock,
        minStock,
        category: product.category,
        severity,
      });
    }
  }

  return alerts.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

export function getStockAlertCount(products: Product[], threshold: number = DEFAULT_MIN_STOCK): number {
  return products.filter(p => p.stock <= threshold).length;
}

export function getCriticalAlertCount(products: Product[]): number {
  return products.filter(p => p.stock === 0).length;
}
