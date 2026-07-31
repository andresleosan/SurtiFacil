import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSalesSummary,
  getDailySales,
  getTopProducts,
  formatCurrency,
  formatNumber,
} from '../services/reportService';
import { Sale } from '../firebase/db';

vi.mock('../services/saleService', () => ({
  getSales: vi.fn(),
}));

import { getSales } from '../services/saleService';

const makeSale = (daysAgo: number, total: number, items: any[]): Sale => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `sale-${daysAgo}-${total}`,
    date: date as any,
    total,
    payment_method: 'cash',
    items,
  };
};

const mockedGetSales = vi.mocked(getSales);

describe('reportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatCurrency', () => {
    it('formatea centavos a moneda', () => {
      expect(formatCurrency(2500)).toBe('$25');
    });

    it('formatea centavos con separador de miles', () => {
      const result = formatCurrency(250000);
      expect(result).toMatch(/^\$2[.,]500$/);
    });

    it('maneja el valor 0', () => {
      expect(formatCurrency(0)).toBe('$0');
    });

    it('maneja valores decimales', () => {
      const result = formatCurrency(150);
      expect(result).toMatch(/^\$1[.,]5$/);
    });
  });

  describe('formatNumber', () => {
    it('formatea números con separadores', () => {
      const result = formatNumber(1500);
      expect(result).toMatch(/^1[.,]500$/);
    });

    it('maneja el valor 0', () => {
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('getSalesSummary', () => {
    it('calcula resumen de ventas correctamente', async () => {
      const sales: Sale[] = [
        makeSale(0, 5000, []),
        makeSale(0, 3000, []),
        makeSale(2, 10000, []),
        makeSale(10, 20000, []),
      ];
      mockedGetSales.mockResolvedValue(sales);

      const summary = await getSalesSummary();

      expect(summary.totalSales).toBe(4);
      expect(summary.totalRevenue).toBe(38000);
      expect(summary.averageSale).toBe(9500);
      expect(summary.today).toBe(8000);
      expect(summary.totalRevenue).toBeGreaterThan(0);
    });

    it('retorna ceros cuando no hay ventas', async () => {
      mockedGetSales.mockResolvedValue([]);
      const summary = await getSalesSummary();
      expect(summary.totalSales).toBe(0);
      expect(summary.totalRevenue).toBe(0);
      expect(summary.averageSale).toBe(0);
    });
  });

  describe('getDailySales', () => {
    it('retorna datos para el número de días especificado', async () => {
      const sales: Sale[] = [
        makeSale(0, 5000, []),
        makeSale(1, 3000, []),
        makeSale(2, 2000, []),
      ];
      mockedGetSales.mockResolvedValue(sales);

      const daily = await getDailySales(7);
      expect(daily).toHaveLength(7);
    });

    it('suma correctamente ventas del mismo día', async () => {
      const sales: Sale[] = [
        makeSale(0, 1000, []),
        makeSale(0, 2000, []),
        makeSale(0, 3000, []),
      ];
      mockedGetSales.mockResolvedValue(sales);

      const daily = await getDailySales(1);
      expect(daily).toHaveLength(1);
      expect(daily[0].total).toBe(6000);
      expect(daily[0].count).toBe(3);
    });

    it('retorna ventas en cero para días sin actividad', async () => {
      mockedGetSales.mockResolvedValue([]);
      const daily = await getDailySales(3);
      expect(daily).toHaveLength(3);
      daily.forEach(d => {
        expect(d.total).toBe(0);
        expect(d.count).toBe(0);
      });
    });
  });

  describe('getTopProducts', () => {
    it('agrega productos vendidos por cantidad', async () => {
      const sales: Sale[] = [
        {
          id: 's1',
          date: new Date() as any,
          total: 1000,
          payment_method: 'cash',
          items: [
            { product_id: 'p1', product_name: 'Producto A', quantity: 3, price_cents: 100, subtotal: 300 },
            { product_id: 'p2', product_name: 'Producto B', quantity: 1, price_cents: 700, subtotal: 700 },
          ],
        },
        {
          id: 's2',
          date: new Date() as any,
          total: 1000,
          payment_method: 'cash',
          items: [
            { product_id: 'p1', product_name: 'Producto A', quantity: 2, price_cents: 100, subtotal: 200 },
          ],
        },
      ];
      mockedGetSales.mockResolvedValue(sales);

      const top = await getTopProducts(10);
      expect(top).toHaveLength(2);
      const productA = top.find(p => p.name === 'Producto A');
      expect(productA?.quantity).toBe(5);
      expect(productA?.revenue).toBe(500);
    });

    it('ordena productos por cantidad descendente', async () => {
      const sales: Sale[] = [
        {
          id: 's1',
          date: new Date() as any,
          total: 0,
          payment_method: 'cash',
          items: [
            { product_id: 'p1', product_name: 'Menos vendido', quantity: 1, price_cents: 100, subtotal: 100 },
            { product_id: 'p2', product_name: 'Más vendido', quantity: 10, price_cents: 100, subtotal: 1000 },
          ],
        },
      ];
      mockedGetSales.mockResolvedValue(sales);

      const top = await getTopProducts(10);
      expect(top[0].name).toBe('Más vendido');
      expect(top[1].name).toBe('Menos vendido');
    });

    it('limita el número de productos retornados', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        product_id: `p${i}`,
        product_name: `Producto ${i}`,
        quantity: i + 1,
        price_cents: 100,
        subtotal: (i + 1) * 100,
      }));
      const sales: Sale[] = [
        { id: 's1', date: new Date() as any, total: 12000, payment_method: 'cash', items },
      ];
      mockedGetSales.mockResolvedValue(sales);

      const top = await getTopProducts(5);
      expect(top).toHaveLength(5);
    });

    it('retorna vacío si no hay ventas', async () => {
      mockedGetSales.mockResolvedValue([]);
      const top = await getTopProducts(10);
      expect(top).toHaveLength(0);
    });
  });
});
