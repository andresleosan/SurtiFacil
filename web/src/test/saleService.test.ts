import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/apiClient';
import { mockProducts } from '../services/mockData';
import {
  createSale,
  getProducts,
  getRecentSales,
  getSales,
  getSalesSince,
  getSalesTotals,
} from '../services/saleService';

const authMock = vi.hoisted(() => ({ currentUser: null as any }));
vi.mock('firebase/auth', () => ({ getAuth: () => authMock }));

describe('saleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_USE_MOCK_DATA', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    authMock.currentUser = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mantiene los productos mock cuando Firebase no está configurado', async () => {
    await expect(getProducts()).resolves.toBe(mockProducts);
  });

  it('mantiene las ventas mock cuando Firebase no está configurado', async () => {
    await expect(getSales()).resolves.toEqual(expect.any(Array));
  });

  it('crea ventas mock con el mismo snapshot financiero v2', async () => {
    const product = mockProducts[0];
    const stockBefore = product.stock;
    try {
      const saleId = await createSale([{
        product_id: product.id,
        product_name: 'forged',
        quantity: 1,
        price_cents: 1,
        subtotal: 1,
      }], 'cash');
      const sale = (await getSales()).find((candidate) => candidate.id === saleId);
      const expectedCost = product.last_cost_cents ?? Math.floor(product.price_cents / 2);

      expect(sale).toMatchObject({
        schema_version: 2,
        created_by_uid: 'mock-user',
        created_by_role: 'cashier',
        total: product.price_cents,
        total_cost_cents: expectedCost,
      });
      expect(sale?.items[0]).toMatchObject({
        product_id: product.id,
        product_name: product.name,
        price_cents: product.price_cents,
        unit_cost_cents: expectedCost,
        cost_subtotal_cents: expectedCost,
      });
    } finally {
      product.stock = stockBefore;
    }
  });

  it('no usa productos mock cuando el flag explícito está desactivado', async () => {
    vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Backend error'));
    await expect(getProducts()).rejects.toThrow('Error al cargar productos');
  });

  describe('Cloudflare D1 configurado', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
      vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
      vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'sender');
      vi.stubEnv('VITE_FIREBASE_APP_ID', 'app-id');
    });

    it('mantiene el resultado de una lectura exitosa de productos en D1', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValueOnce([
        { id: 'product-1', name: 'Producto D1', price_cents: 500, stock: 8 },
      ]);

      await expect(getProducts()).resolves.toEqual([
        expect.objectContaining({ id: 'product-1', name: 'Producto D1', price_cents: 500, stock: 8 }),
      ]);
    });

    it('rechaza la lectura de productos en vez de devolver datos mock', async () => {
      const secret = 'permission denied token=secret-token';
      vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error(secret));
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(getProducts()).rejects.toThrow('Error al cargar productos');
      expect(errorLog.mock.calls.flat().join(' ')).not.toContain('secret-token');
      expect(errorLog).toHaveBeenCalledWith('Error getting products from Firebase');
      errorLog.mockRestore();
    });

    it('rechaza la lectura de ventas en vez de devolver datos mock', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('permission denied'));

      await expect(getSales()).rejects.toThrow('Error al cargar ventas');
    });

    it('mantiene el resultado de una lectura exitosa de ventas en D1', async () => {
      const saleRow = {
        id: 'sale-1',
        total_cents: 1000,
        payment_method: 'cash' as const,
        items: [],
        created_at: new Date(20).toISOString(),
      };
      vi.spyOn(apiClient, 'get').mockResolvedValueOnce([saleRow]);

      const sales = await getSales();
      expect(sales).toHaveLength(1);
      expect(sales[0].id).toBe('sale-1');
      expect(sales[0].total).toBe(1000);
      expect(sales[0].payment_method).toBe('cash');
    });

    it('envía solo IDs y cantidades al backend con el Firebase ID token', async () => {
      authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ id: 'sale-1', saleId: 'sale-1' });

      await expect(createSale([{
        product_id: 'p1', product_name: 'Cliente', quantity: 2, price_cents: 1, subtotal: 1,
      }], 'cash')).resolves.toBe('sale-1');

      expect(postSpy).toHaveBeenCalledWith('/sales', {
        items: [{ product_id: 'p1', quantity: 2 }],
        payment_method: 'cash',
      });
    });

    it('rechaza la venta configurada cuando no hay una sesión Firebase activa', async () => {
      await expect(createSale([{
        product_id: 'p1', product_name: 'Producto', quantity: 1, price_cents: 250, subtotal: 250,
      }], 'cash')).rejects.toThrow('Debes iniciar sesión para crear la venta');
    });

    it('preserva el error seguro del backend sin devolver datos mock', async () => {
      authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('Demasiadas solicitudes'));

      await expect(createSale([{
        product_id: 'p1', product_name: 'Producto', quantity: 1, price_cents: 250, subtotal: 250,
      }], 'cash')).rejects.toThrow('Demasiadas solicitudes');
    });

    it('en modo configurado no crea ventas localmente cuando falla el backend', async () => {
      authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
      const product = mockProducts[0];
      const stockBefore = product.stock;
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('backend unavailable'));

      await expect(createSale([{
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        price_cents: product.price_cents,
        subtotal: product.price_cents,
      }], 'cash')).rejects.toThrow('Error al crear la venta');

      expect(product.stock).toBe(stockBefore);
    });

    it('pagina el historial con un cursor y detecta si hay más páginas', async () => {
      const documents = [3, 2, 1].map((value) => ({
        id: `sale-${value}`,
        total_cents: value * 100,
        payment_method: 'cash',
        items: [],
        created_at: new Date(value).toISOString(),
      }));

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce(documents);

      const firstPage = await getRecentSales(2);

      expect(firstPage.sales.map((sale) => sale.id)).toEqual(['sale-3', 'sale-2']);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.cursor).toBe('sale-2');

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce([documents[2]]);
      const secondPage = await getRecentSales(2, firstPage.cursor);

      expect(secondPage.sales.map((sale) => sale.id)).toEqual(['sale-1']);
      expect(secondPage.hasMore).toBe(false);
      expect(secondPage.cursor).toBeNull();
    });

    it('consulta las ventas desde una fecha con un filtro del servidor', async () => {
      const since = new Date('2026-09-01T00:00:00');
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce([
        { id: 'sale-9', total_cents: 900, payment_method: 'cash', items: [], created_at: since.toISOString() },
      ]);

      const result = await getSalesSince(since);
      expect(result).toEqual([
        expect.objectContaining({ id: 'sale-9', total: 900 }),
      ]);
      expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('/sales?since='));
    });

    it('obtiene los totales históricos con una agregación del servidor', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ count: 3, totalCents: 900 });

      await expect(getSalesTotals()).resolves.toEqual({ count: 3, totalCents: 900 });
    });

    it('usa mensajes genéricos cuando fallan las consultas acotadas', async () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('permission denied token=secret'));

      await expect(getRecentSales(10)).rejects.toThrow('Error al cargar ventas');
      await expect(getSalesSince(new Date())).rejects.toThrow('Error al cargar ventas');
      await expect(getSalesTotals()).rejects.toThrow('Error al cargar ventas');
      expect(errorLog.mock.calls.flat().join(' ')).not.toContain('secret');
      errorLog.mockRestore();
    });
  });

  describe('consultas acotadas en modo mock', () => {
    it('pagina, filtra por fecha y totaliza las ventas locales', async () => {
      const all = await getSales();
      const firstPage = await getRecentSales(1);

      expect(firstPage.sales).toHaveLength(Math.min(1, all.length));
      expect(firstPage.hasMore).toBe(all.length > 1);
      if (firstPage.hasMore) {
        const secondPage = await getRecentSales(1, firstPage.cursor);
        expect(secondPage.sales[0]?.id).toBe(all[1].id);
      }

      await expect(getSalesSince(new Date(0))).resolves.toHaveLength(all.length);
      await expect(getSalesSince(new Date('2999-01-01'))).resolves.toEqual([]);
      await expect(getSalesTotals()).resolves.toEqual({
        count: all.length,
        totalCents: all.reduce((sum, sale) => sum + sale.total, 0),
      });
    });
  });
});
