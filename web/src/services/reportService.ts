import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Sale } from '../firebase/db';
import { getSales } from './saleService';

export interface DailySales {
  date: string;
  total: number;
  count: number;
}

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export interface SalesByCategory {
  category: string;
  total: number;
  percentage: number;
}

export interface SalesSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalSales: number;
  totalRevenue: number;
  averageSale: number;
}

/**
 * Obtiene resumen de ventas
 */
export async function getSalesSummary(): Promise<SalesSummary> {
  const sales = await getSales();
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const salesToday = sales
    .filter(s => {
      const saleDate = s.date?.toDate?.() || new Date(s.date);
      return saleDate >= startOfToday;
    })
    .reduce((sum, s) => sum + s.total, 0);

  const salesWeek = sales
    .filter(s => {
      const saleDate = s.date?.toDate?.() || new Date(s.date);
      return saleDate >= startOfWeek;
    })
    .reduce((sum, s) => sum + s.total, 0);

  const salesMonth = sales
    .filter(s => {
      const saleDate = s.date?.toDate?.() || new Date(s.date);
      return saleDate >= startOfMonth;
    })
    .reduce((sum, s) => sum + s.total, 0);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const averageSale = sales.length > 0 ? totalRevenue / sales.length : 0;

  return {
    today: salesToday,
    thisWeek: salesWeek,
    thisMonth: salesMonth,
    totalSales: sales.length,
    totalRevenue,
    averageSale,
  };
}

/**
 * Obtiene ventas diarias de los últimos N días
 */
export async function getDailySales(days: number = 7): Promise<DailySales[]> {
  const sales = await getSales();
  const result: DailySales[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    const daySales = sales.filter(s => {
      const saleDate = s.date?.toDate?.() || new Date(s.date);
      return saleDate >= date && saleDate < nextDate;
    });

    result.push({
      date: date.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }),
      total: daySales.reduce((sum, s) => sum + s.total, 0),
      count: daySales.length,
    });
  }

  return result;
}

/**
 * Obtiene ventas semanales de las últimas N semanas
 */
export async function getWeeklySales(weeks: number = 4): Promise<DailySales[]> {
  const sales = await getSales();
  const result: DailySales[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (now.getDay() + 7 * i));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const weekSales = sales.filter(s => {
      const saleDate = s.date?.toDate?.() || new Date(s.date);
      return saleDate >= startOfWeek && saleDate < endOfWeek;
    });

    result.push({
      date: `Sem ${weeks - i}`,
      total: weekSales.reduce((sum, s) => sum + s.total, 0),
      count: weekSales.length,
    });
  }

  return result;
}

/**
 * Obtiene los productos más vendidos
 */
export async function getTopProducts(limit: number = 10): Promise<TopProduct[]> {
  const sales = await getSales();
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  sales.forEach(sale => {
    sale.items?.forEach(item => {
      const existing = productMap.get(item.product_id) || {
        name: item.product_name,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += item.subtotal;
      productMap.set(item.product_id, existing);
    });
  });

  return Array.from(productMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

/**
 * Obtiene ventas por categoría
 */
export async function getSalesByCategory(): Promise<SalesByCategory[]> {
  const sales = await getSales();
  const categoryMap = new Map<string, number>();
  let totalRevenue = 0;

  sales.forEach(sale => {
    sale.items?.forEach(item => {
      const category = item.category?.trim() || 'Sin categoría';
      const current = categoryMap.get(category) || 0;
      categoryMap.set(category, current + item.subtotal);
      totalRevenue += item.subtotal;
    });
  });

  return Array.from(categoryMap.entries())
    .map(([category, total]) => ({
      category,
      total,
      percentage: totalRevenue > 0 ? (total / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Formatea centavos a formato de moneda
 */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('es-CO')}`;
}

/**
 * Formatea número con separadores de miles
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('es-CO');
}
