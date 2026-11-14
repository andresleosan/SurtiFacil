import { describe, it, expect } from 'vitest';
import {
  checkLowStock,
  getStockAlertCount,
  getCriticalAlertCount,
  checkExpiringProducts,
  getExpiringAlertCount,
  getDaysUntilExpiration,
  isFruverOrDairyCategory,
} from '../services/stockAlertService';
import { Product } from '../firebase/db';

const makeProduct = (id: string, name: string, stock: number, category?: string): Product => ({
  id,
  name,
  price_cents: 1000,
  stock,
  category,
});

describe('stockAlertService', () => {
  const products: Product[] = [
    makeProduct('1', 'Producto A', 50, 'Bebidas'),
    makeProduct('2', 'Producto B', 10, 'Abarrotes'),
    makeProduct('3', 'Producto C', 5, 'Limpieza'),
    makeProduct('4', 'Producto D', 0, 'Lácteos'),
    makeProduct('5', 'Producto E', 100),
  ];

  describe('checkLowStock', () => {
    it('detecta productos bajo el umbral por defecto (10)', () => {
      const alerts = checkLowStock(products);
      expect(alerts).toHaveLength(3);
      const names = alerts.map(a => a.productName);
      expect(names).toContain('Producto B');
      expect(names).toContain('Producto C');
      expect(names).toContain('Producto D');
    });

    it('no retorna alertas si todo el stock está por encima del umbral', () => {
      const allGood: Product[] = [
        makeProduct('1', 'Producto X', 100),
        makeProduct('2', 'Producto Y', 50),
      ];
      const alerts = checkLowStock(allGood);
      expect(alerts).toHaveLength(0);
    });

    it('marca como critical cuando stock es 0', () => {
      const alerts = checkLowStock(products);
      const critical = alerts.find(a => a.productId === '4');
      expect(critical).toBeDefined();
      expect(critical?.severity).toBe('critical');
    });

    it('marca como warning cuando stock <= umbral * 0.5', () => {
      const singleProduct = [makeProduct('1', 'Producto W', 5)];
      const alerts = checkLowStock(singleProduct, 10);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('warning');
    });

    it('marca como low cuando stock <= umbral pero > umbral * 0.5', () => {
      const singleProduct = [makeProduct('1', 'Producto L', 8)];
      const alerts = checkLowStock(singleProduct, 10);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('low');
    });

    it('ordena alertas por severidad (critical primero)', () => {
      const alerts = checkLowStock(products);
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[1].severity).toBe('warning');
      expect(alerts[2].severity).toBe('low');
    });

    it('respeta umbral personalizado', () => {
      const singleProduct = [makeProduct('1', 'Producto Z', 20)];
      const alerts = checkLowStock(singleProduct, 25);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].currentStock).toBe(20);
    });

    it('retorna vacío para lista de productos vacía', () => {
      const alerts = checkLowStock([]);
      expect(alerts).toHaveLength(0);
    });
  });

  describe('getStockAlertCount', () => {
    it('cuenta productos bajo el umbral', () => {
      expect(getStockAlertCount(products)).toBe(3);
    });

    it('cuenta con umbral personalizado', () => {
      expect(getStockAlertCount(products, 50)).toBe(4);
    });

    it('retorna 0 si no hay productos', () => {
      expect(getStockAlertCount([])).toBe(0);
    });
  });

  describe('getCriticalAlertCount', () => {
    it('cuenta productos sin stock (0 unidades)', () => {
      const fakeProducts = products.map(p => ({ id: p.id, stock: p.stock } as unknown as Product));
      expect(getCriticalAlertCount(fakeProducts)).toBe(1);
    });

    it('retorna 0 si no hay productos críticos', () => {
      const noCritical: Product[] = [
        makeProduct('1', 'Producto', 10),
        makeProduct('2', 'Producto', 5),
      ];
      expect(getCriticalAlertCount(noCritical)).toBe(0);
    });
  });

  describe('checkExpiringProducts & alertas de vencimiento', () => {
    const refDate = new Date(2026, 10, 10, 14, 0, 0); // 2026-11-10 local

    it('clasifica vencidos, urgentes (<=3d), próximos (<=7d), ignora sin stock o fecha lejana y ordena por urgencia', () => {
      const catalog: Product[] = [
        { ...makeProduct('p-leche', 'Leche Entera 1L', 12, 'Lácteos y Huevos'), price_cents: 450000, last_cost_cents: 340000, expiration_date: '2026-11-12' }, // +2d urgent
        { ...makeProduct('p-aguacate', 'Aguacate Hass', 5, 'Frutas y Verduras'), price_cents: 350000, last_cost_cents: 220000, expiration_date: '2026-11-08' }, // -2d expired
        { ...makeProduct('p-queso', 'Quesito 400g', 4, 'Lácteos'), price_cents: 980000, expiration_date: '2026-11-16' }, // +6d upcoming, no last_cost_cents -> 70%
        { ...makeProduct('p-cero', 'Yogur Vencido Sin Stock', 0, 'Lácteos'), expiration_date: '2026-11-09' }, // ignored stock 0
        { ...makeProduct('p-arroz', 'Arroz Diana', 50, 'Granos'), expiration_date: '2026-12-20' }, // > 7d ignored
        { ...makeProduct('p-invalido', 'Dato Malo', 10, 'Otros'), expiration_date: 'not-a-date' }, // ignored invalid
      ];

      const alerts = checkExpiringProducts(catalog, 7, refDate);
      expect(alerts).toHaveLength(3);

      expect(alerts[0].productId).toBe('p-aguacate');
      expect(alerts[0].severity).toBe('expired');
      expect(alerts[0].daysUntilExpiry).toBe(-2);
      expect(alerts[0].estimatedValueAtRiskCents).toBe(5 * 220000);

      expect(alerts[1].productId).toBe('p-leche');
      expect(alerts[1].severity).toBe('urgent');
      expect(alerts[1].daysUntilExpiry).toBe(2);
      expect(alerts[1].estimatedValueAtRiskCents).toBe(12 * 340000);

      expect(alerts[2].productId).toBe('p-queso');
      expect(alerts[2].severity).toBe('upcoming');
      expect(alerts[2].daysUntilExpiry).toBe(6);
      expect(alerts[2].estimatedValueAtRiskCents).toBe(4 * Math.round(980000 * 0.7));

      expect(getExpiringAlertCount(catalog, 7, refDate)).toBe(3);
    });

    it('calcula días hasta vencimiento exactos y detecta categorías Fruver/Lácteos', () => {
      const refDate = new Date(2026, 10, 10, 23, 55, 0);
      expect(getDaysUntilExpiration('2026-11-10', refDate)).toBe(0);
      expect(getDaysUntilExpiration('2026-11-11', refDate)).toBe(1);
      expect(getDaysUntilExpiration('invalid', refDate)).toBeNull();
      expect(isFruverOrDairyCategory('Frutas y Verduras')).toBe(true);
      expect(isFruverOrDairyCategory('Lácteos y Huevos')).toBe(true);
      expect(isFruverOrDairyCategory('Aseo y Hogar')).toBe(false);
    });
  });
});
