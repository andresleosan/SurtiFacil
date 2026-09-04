import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase/config', () => ({ db: {} }));
const firestoreMock = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-time'),
  updateDoc: vi.fn(),
}));
vi.mock('firebase/firestore', () => firestoreMock);

import { mockProducts } from '../services/mockData';
import { addProduct, deleteProduct, subscribeToProducts, updateProduct } from '../services/productService';

describe('productService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('modo mock explícito', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCK_DATA', 'true');
    });

    it('emite los productos ordenados y vuelve a emitir tras cada mutación', async () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToProducts(listener, () => {});
      expect(listener).toHaveBeenCalledTimes(1);
      const names = listener.mock.calls[0][0].map((product: { name: string }) => product.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));

      const created = await addProduct({ name: 'Zumo', price_cents: 100, stock: 4, category: 'Bebidas' });
      expect(listener).toHaveBeenCalledTimes(2);
      expect(mockProducts.find((product) => product.id === created.id)).toBeDefined();

      await updateProduct({ ...created, stock: 9, barcode: ' 123 ' });
      expect(mockProducts.find((product) => product.id === created.id)).toMatchObject({ stock: 9, barcode: '123' });
      expect(listener).toHaveBeenCalledTimes(3);

      await deleteProduct(created.id);
      expect(mockProducts.find((product) => product.id === created.id)).toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(4);

      unsubscribe();
      await addProduct({ name: 'Otro', price_cents: 1, stock: 1, category: 'Otros' }).then((product) => deleteProduct(product.id));
      expect(listener).toHaveBeenCalledTimes(4);
      expect(firestoreMock.addDoc).not.toHaveBeenCalled();
    });
  });

  describe('Firebase configurado', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
    });

    it('reporta un error seguro cuando el listener falla', () => {
      firestoreMock.onSnapshot.mockImplementation((_ref: unknown, _next: unknown, error: (err: Error) => void) => {
        error(new Error('permission-denied token=secret'));
        return vi.fn();
      });
      const onError = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      subscribeToProducts(() => {}, onError);

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Error al cargar productos' }));
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret');
      consoleError.mockRestore();
    });

    it('mapea los documentos del snapshot y cancela con la función devuelta', () => {
      const unsubscribe = vi.fn();
      firestoreMock.onSnapshot.mockImplementation((_ref: unknown, next: (snapshot: unknown) => void) => {
        next({
          forEach: (callback: (document: { id: string; data: () => unknown }) => void) => {
            callback({ id: 'b', data: () => ({ name: 'Pan', price_cents: 1, stock: 1 }) });
            callback({ id: 'a', data: () => ({ name: 'Arroz', price_cents: 2, stock: 2 }) });
          },
        });
        return unsubscribe;
      });
      const listener = vi.fn();

      const stop = subscribeToProducts(listener, () => {});

      expect(listener).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'a', name: 'Arroz' }),
        expect.objectContaining({ id: 'b', name: 'Pan' }),
      ]);
      stop();
      expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it('usa mensajes genéricos cuando fallan las escrituras', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      firestoreMock.addDoc.mockRejectedValue(new Error('permission-denied'));
      firestoreMock.updateDoc.mockRejectedValue(new Error('permission-denied'));
      firestoreMock.deleteDoc.mockRejectedValue(new Error('permission-denied'));

      await expect(addProduct({ name: 'X', price_cents: 1, stock: 1, category: 'Otros' })).rejects.toThrow('Error al agregar producto');
      await expect(updateProduct({ id: 'x', name: 'X', price_cents: 1, stock: 1 })).rejects.toThrow('Error al editar producto');
      await expect(deleteProduct('x')).rejects.toThrow('Error al eliminar producto');
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('permission-denied');
      consoleError.mockRestore();
    });
  });
});
