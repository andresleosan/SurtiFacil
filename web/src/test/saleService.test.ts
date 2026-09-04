import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase/config', () => ({ db: {} }));
const authMock = vi.hoisted(() => ({ currentUser: null as any }));
vi.mock('firebase/auth', () => ({ getAuth: () => authMock }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  count: vi.fn(() => 'count-spec'),
  getAggregateFromServer: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((value: number) => ({ limit: value })),
  orderBy: vi.fn((field: string, direction: string) => ({ orderBy: field, direction })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  serverTimestamp: vi.fn(() => new Date()),
  startAfter: vi.fn((cursor: unknown) => ({ startAfter: cursor })),
  sum: vi.fn((field: string) => ({ sum: field })),
  Timestamp: { fromDate: (date: Date) => ({ toMillis: () => date.getTime() }) },
  where: vi.fn((field: string, op: string, value: unknown) => ({ where: field, op, value })),
  doc: vi.fn(),
}));

import { getAggregateFromServer, getDocs, limit, query, startAfter, where } from 'firebase/firestore';
import { mockProducts } from '../services/mockData';
import {
  createSale,
  getProducts,
  getRecentSales,
  getSales,
  getSalesSince,
  getSalesTotals,
} from '../services/saleService';

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
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('mantiene las ventas mock cuando Firebase no está configurado', async () => {
    await expect(getSales()).resolves.toEqual(expect.any(Array));
    expect(getDocs).not.toHaveBeenCalled();
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
    await expect(getProducts()).rejects.toThrow('Error al cargar productos');
  });

  describe('Firebase configurado', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
      vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
      vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'sender');
      vi.stubEnv('VITE_FIREBASE_APP_ID', 'app-id');
    });

    it('mantiene el resultado de una lectura exitosa de productos en Firestore', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        forEach: (callback: (document: { id: string; data: () => object }) => void) => {
          callback({
            id: 'product-1',
            data: () => ({ name: 'Producto Firebase', price_cents: 500, stock: 8 }),
          });
        },
      } as any);

      await expect(getProducts()).resolves.toEqual([
        { id: 'product-1', name: 'Producto Firebase', price_cents: 500, stock: 8 },
      ]);
    });

    it('rechaza la lectura de productos en vez de devolver datos mock', async () => {
      const secret = 'permission denied token=secret-token';
      vi.mocked(getDocs).mockRejectedValueOnce(new Error(secret));
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(getProducts()).rejects.toThrow('Error al cargar productos');
      expect(errorLog.mock.calls.flat().join(' ')).not.toContain('secret-token');
      expect(errorLog).toHaveBeenCalledWith('Error getting products from Firebase');
    });

    it('rechaza la lectura de ventas en vez de devolver datos mock', async () => {
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission denied'));

      await expect(getSales()).rejects.toThrow('Error al cargar ventas');
    });

    it('mantiene el resultado de una lectura exitosa de ventas en Firestore', async () => {
      const sale = {
        id: 'sale-1',
        date: { toMillis: () => 20 },
        total: 1000,
        payment_method: 'cash' as const,
        items: [],
      };
      vi.mocked(getDocs).mockResolvedValueOnce({
        forEach: (callback: (document: { id: string; data: () => object }) => void) => {
          callback({
            id: sale.id,
            data: () => ({
              date: sale.date,
              total: sale.total,
              payment_method: sale.payment_method,
              items: sale.items,
            }),
          });
        },
      } as any);

      await expect(getSales()).resolves.toEqual([sale]);
    });

    it('envía solo IDs y cantidades al backend con el Firebase ID token', async () => {
      authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
        JSON.stringify({ saleId: 'sale-1' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ));

      await expect(createSale([{
        product_id: 'p1', product_name: 'Cliente', quantity: 2, price_cents: 1, subtotal: 1,
      }], 'cash')).resolves.toBe('sale-1');

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/sales/create'), expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer firebase-id-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ product_id: 'p1', quantity: 2 }], payment_method: 'cash' }),
      }));
    });

    it('rechaza la venta configurada cuando no hay una sesión Firebase activa', async () => {
      await expect(createSale([{
        product_id: 'p1', product_name: 'Producto', quantity: 1, price_cents: 250, subtotal: 250,
      }], 'cash')).rejects.toThrow('Debes iniciar sesión para crear la venta');
    });

    it('preserva el error seguro del backend sin devolver datos mock', async () => {
      authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
        JSON.stringify({ error: 'Demasiadas solicitudes' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ));

      await expect(createSale([{
        product_id: 'p1', product_name: 'Producto', quantity: 1, price_cents: 250, subtotal: 250,
      }], 'cash')).rejects.toThrow('Demasiadas solicitudes');
    });

    it('en modo configurado no crea ventas localmente cuando falla el backend', async () => {
      authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
      const product = mockProducts[0];
      const stockBefore = product.stock;
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('backend unavailable'));

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
        data: () => ({ date: { toMillis: () => value }, total: value * 100, payment_method: 'cash', items: [] }),
      }));
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: documents } as any);

      const firstPage = await getRecentSales(2);

      expect(firstPage.sales.map((sale) => sale.id)).toEqual(['sale-3', 'sale-2']);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.cursor).toBe(documents[1]);
      expect(limit).toHaveBeenCalledWith(3);

      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [documents[2]] } as any);
      const secondPage = await getRecentSales(2, firstPage.cursor);

      expect(startAfter).toHaveBeenCalledWith(documents[1]);
      expect(secondPage.sales.map((sale) => sale.id)).toEqual(['sale-1']);
      expect(secondPage.hasMore).toBe(false);
      expect(secondPage.cursor).toBeNull();
    });

    it('consulta las ventas desde una fecha con un filtro del servidor', async () => {
      const since = new Date('2026-09-01T00:00:00');
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{ id: 'sale-9', data: () => ({ total: 900, payment_method: 'cash', items: [] }) }],
      } as any);

      await expect(getSalesSince(since)).resolves.toEqual([
        expect.objectContaining({ id: 'sale-9', total: 900 }),
      ]);
      expect(where).toHaveBeenCalledWith('date', '>=', expect.objectContaining({ toMillis: expect.any(Function) }));
      expect(query).toHaveBeenCalled();
    });

    it('obtiene los totales históricos con una agregación del servidor', async () => {
      vi.mocked(getAggregateFromServer).mockResolvedValueOnce({ data: () => ({ count: 3, totalCents: 900 }) } as any);

      await expect(getSalesTotals()).resolves.toEqual({ count: 3, totalCents: 900 });
    });

    it('usa mensajes genéricos cuando fallan las consultas acotadas', async () => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission denied token=secret'));
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission denied token=secret'));
      vi.mocked(getAggregateFromServer).mockRejectedValueOnce(new Error('permission denied token=secret'));

      await expect(getRecentSales(10)).rejects.toThrow('Error al cargar ventas');
      await expect(getSalesSince(new Date())).rejects.toThrow('Error al cargar ventas');
      await expect(getSalesTotals()).rejects.toThrow('Error al cargar ventas');
      expect(errorLog.mock.calls.flat().join(' ')).not.toContain('secret');
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
      expect(getDocs).not.toHaveBeenCalled();
    });
  });
});
