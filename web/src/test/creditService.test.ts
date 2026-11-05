import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/apiClient';
import { mockCreditCustomers } from '../services/mockData';
import {
  addCreditCustomer,
  addCreditEntry,
  getCreditEntries,
  parseAmountToCents,
  subscribeToCreditCustomers,
  updateCreditCustomer,
} from '../services/creditService';

const actor = { uid: 'cashier-1', role: 'cashier' as const };

describe('creditService', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  describe('parseAmountToCents', () => {
    it('acepta pesos enteros, miles con punto y decimales con coma', () => {
      expect(parseAmountToCents('12500')).toBe(1250000);
      expect(parseAmountToCents('12.500')).toBe(1250000);
      expect(parseAmountToCents('12.500,50')).toBe(1250050);
      expect(parseAmountToCents('99.99')).toBe(9999);
    });

    it('rechaza montos vacíos, negativos o no numéricos', () => {
      expect(parseAmountToCents('')).toBeNull();
      expect(parseAmountToCents('0')).toBeNull();
      expect(parseAmountToCents('-5')).toBeNull();
      expect(parseAmountToCents('abc')).toBeNull();
    });
  });

  describe('modo mock', () => {
    beforeEach(() => vi.stubEnv('VITE_USE_MOCK_DATA', 'true'));

    it('crea clientes, anota deudas y abonos manteniendo el saldo', async () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToCreditCustomers(listener, () => {});
      expect(listener).toHaveBeenCalledTimes(1);

      const customer = await addCreditCustomer({ name: '  Marta  ', phone: '300' });
      expect(customer).toMatchObject({ name: 'Marta', balance_cents: 0, active: true });
      expect(listener).toHaveBeenCalledTimes(2);

      const debt = await addCreditEntry(customer.id, { type: 'debt', amount_cents: 5000, description: 'Pan' }, actor);
      expect(debt).toMatchObject({ type: 'debt', amount_cents: 5000, created_by_uid: 'cashier-1' });
      expect(mockCreditCustomers.find((candidate) => candidate.id === customer.id)?.balance_cents).toBe(5000);

      await expect(addCreditEntry(customer.id, { type: 'payment', amount_cents: 6000, description: '' }, actor))
        .rejects.toThrow('El abono supera la deuda pendiente');

      await addCreditEntry(customer.id, { type: 'payment', amount_cents: 2000, description: 'Abono' }, actor);
      expect(mockCreditCustomers.find((candidate) => candidate.id === customer.id)?.balance_cents).toBe(3000);

      const entries = await getCreditEntries(customer.id);
      expect(entries.map((entry) => entry.type)).toEqual(['payment', 'debt']);

      await updateCreditCustomer(customer.id, { name: 'Marta P.', active: false });
      expect(mockCreditCustomers.find((candidate) => candidate.id === customer.id)).toMatchObject({ name: 'Marta P.', active: false });

      unsubscribe();
    });

    it('valida nombre y montos', async () => {
      await expect(addCreditCustomer({ name: '   ' })).rejects.toThrow('El nombre del cliente es requerido');
      await expect(addCreditEntry('cc1', { type: 'debt', amount_cents: 0, description: '' }, actor)).rejects.toThrow('El monto debe ser mayor a 0');
      await expect(addCreditEntry('cc1', { type: 'debt', amount_cents: 12.5, description: '' }, actor)).rejects.toThrow('El monto debe ser mayor a 0');
    });
  });

  describe('Cloudflare D1 configurado', () => {
    beforeEach(() => vi.stubEnv('VITE_USE_MOCK_DATA', 'false'));

    it('registra el movimiento y el saldo en una transacción', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
        id: 'centry-1',
        customer_id: 'cc9',
        type: 'payment',
        amount_cents: 400,
        description: 'Abono',
      });

      const entry = await addCreditEntry('cc9', { type: 'payment', amount_cents: 400, description: 'Abono' }, actor);

      expect(entry).toMatchObject({ customer_id: 'cc9', type: 'payment', amount_cents: 400 });
      expect(postSpy).toHaveBeenCalledWith('/credits/entries', {
        customer_id: 'cc9',
        type: 'payment',
        amount_cents: 400,
        description: 'Abono',
      });
    });

    it('rechaza abonos mayores a la deuda dentro de la transacción y no expone errores crudos', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('El abono supera la deuda pendiente'));

      await expect(addCreditEntry('cc9', { type: 'payment', amount_cents: 400, description: '' }, actor))
        .rejects.toThrow('El abono supera la deuda pendiente');

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('permission-denied token=secret'));

      await expect(addCreditEntry('cc9', { type: 'debt', amount_cents: 400, description: '' }, actor))
        .rejects.toThrow('Error al registrar el movimiento');
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret');
      consoleError.mockRestore();
    });

    it('mapea los clientes del listener y reporta un error seguro', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValueOnce([
        { id: 'b', name: 'Zoe', balance_cents: 10, active: 1 },
        { id: 'a', name: 'Ana', active: 0, balance_cents: 0 },
      ]);
      const listener = vi.fn();
      subscribeToCreditCustomers(listener, () => {});
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'a', name: 'Ana', balance_cents: 0, active: false }),
        expect.objectContaining({ id: 'b', name: 'Zoe', balance_cents: 10, active: true }),
      ]);

      vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('permission-denied'));
      const onError = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      subscribeToCreditCustomers(() => {}, onError);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Error al cargar los fiados' }));
      consoleError.mockRestore();
    });
  });
});
