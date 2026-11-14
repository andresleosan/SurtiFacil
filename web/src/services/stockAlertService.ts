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

export type ExpirationSeverity = 'expired' | 'urgent' | 'upcoming';

export interface ExpirationAlert {
  productId: string;
  productName: string;
  category?: string;
  stock: number;
  unit?: string;
  expirationDate: string;
  daysUntilExpiry: number;
  severity: ExpirationSeverity;
  estimatedValueAtRiskCents: number;
}

const FRUVER_DAIRY_PATTERN = /fruver|fruta|verdura|l[aá]cteo|lacteo|queso|leche|carne|pollo|panader[ií]a|arepa|huevo/i;

export function isFruverOrDairyCategory(category?: string): boolean {
  return Boolean(category && FRUVER_DAIRY_PATTERN.test(category));
}

function parseIsoDayUtc(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const utc = Date.UTC(year, month, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return utc;
}

function getLocalDayUtc(referenceDate: Date): number {
  return Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
}

export function getDaysUntilExpiration(
  expirationDate?: string | null,
  referenceDate: Date = new Date()
): number | null {
  const expiryUtc = parseIsoDayUtc(expirationDate);
  if (expiryUtc === null) return null;
  const todayUtc = getLocalDayUtc(referenceDate);
  return Math.round((expiryUtc - todayUtc) / 86_400_000);
}

export function checkExpiringProducts(
  products: Product[],
  horizonDays: number = 7,
  referenceDate: Date = new Date()
): ExpirationAlert[] {
  const alerts: ExpirationAlert[] = [];

  for (const product of products) {
    if (!product.expiration_date || product.stock <= 0) continue;
    const daysUntilExpiry = getDaysUntilExpiration(product.expiration_date, referenceDate);
    if (daysUntilExpiry === null || daysUntilExpiry > horizonDays) continue;

    let severity: ExpirationSeverity = 'upcoming';
    if (daysUntilExpiry < 0) {
      severity = 'expired';
    } else if (daysUntilExpiry <= 3) {
      severity = 'urgent';
    }

    const unitCostCents =
      product.last_cost_cents ?? Math.round((product.price_cents || 0) * 0.7);

    alerts.push({
      productId: product.id,
      productName: product.name,
      category: product.category,
      stock: product.stock,
      unit: product.unit,
      expirationDate: product.expiration_date.trim().slice(0, 10),
      daysUntilExpiry,
      severity,
      estimatedValueAtRiskCents: unitCostCents * product.stock,
    });
  }

  return alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export function getExpiringAlertCount(
  products: Product[],
  horizonDays: number = 7,
  referenceDate: Date = new Date()
): number {
  return checkExpiringProducts(products, horizonDays, referenceDate).length;
}

