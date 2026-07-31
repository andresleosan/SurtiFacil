import { describe, it, expect } from 'vitest';
import { checkLowStock, getStockAlertCount, getCriticalAlertCount } from '../services/stockAlertService';
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
});
