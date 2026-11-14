import { apiClient, emitDataChange, getActiveNegocioId, hasAuthSession } from './apiClient';
import { CashExpense, CashExpenseInput } from '../types/cashExpense';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

let mockExpensesStorage: CashExpense[] = [];

function currentTenantId(): string {
  return getActiveNegocioId() || 'surtifacil';
}

/**
 * Limpia el almacenamiento mock en memoria (útil para pruebas unitarias).
 */
export function clearMockCashExpenses(): void {
  mockExpensesStorage = [];
}

/**
 * Calcula el total de gastos en efectivo en memoria desde una fecha ISO dada (para mock/fallback).
 */
export function getMockShiftCashExpenses(sinceIso: string): { count: number; total_cents: number } {
  const tenantId = currentTenantId();
  const threshold = new Date(sinceIso).getTime();
  const matching = mockExpensesStorage.filter((item) => {
    if (item.negocio_id !== tenantId || item.payment_method !== 'cash') return false;
    return new Date(item.created_at).getTime() >= threshold;
  });
  return {
    count: matching.length,
    total_cents: matching.reduce((sum, item) => sum + item.amount_cents, 0),
  };
}

/**
 * Lista los gastos de caja menor desde Cloudflare D1 o memoria en modo mock.
 */
export async function getCashExpenses(options?: { shiftOnly?: boolean; since?: string }): Promise<CashExpense[]> {
  if (isMockMode() || !hasAuthSession()) {
    const tenantId = currentTenantId();
    return mockExpensesStorage
      .filter((item) => {
        if (item.negocio_id !== tenantId) return false;
        if (options?.since) {
          return new Date(item.created_at).getTime() >= new Date(options.since).getTime();
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const params = new URLSearchParams();
  if (options?.shiftOnly) params.set('shift_only', 'true');
  if (options?.since) params.set('since', options.since);
  const query = params.toString();
  const endpoint = query ? `/cash-expenses?${query}` : '/cash-expenses';

  return apiClient.get<CashExpense[]>(endpoint);
}

/**
 * Registra un nuevo gasto de caja menor validando monto y concepto.
 */
export async function recordCashExpense(input: CashExpenseInput): Promise<CashExpense> {
  const description = input.description.trim();
  if (!description) {
    throw new Error('La descripción o concepto del gasto es obligatoria.');
  }

  const amountCents = Math.floor(Number(input.amount_cents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('El monto del gasto debe ser mayor a $ 0.');
  }

  const payload: CashExpenseInput = {
    category: input.category || 'otro',
    description,
    beneficiary: input.beneficiary?.trim() || undefined,
    amount_cents: amountCents,
    payment_method: input.payment_method === 'transfer' ? 'transfer' : 'cash',
  };

  if (!isMockMode() && hasAuthSession()) {
    const created = await apiClient.post<CashExpense>('/cash-expenses', payload);
    emitDataChange('cash-expenses');
    return created;
  }

  const expense: CashExpense = {
    id: `cexp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    negocio_id: currentTenantId(),
    category: payload.category,
    description: payload.description,
    beneficiary: payload.beneficiary || null,
    amount_cents: payload.amount_cents,
    payment_method: payload.payment_method || 'cash',
    created_by_uid: 'mock-cashier-uid',
    created_by_name: 'Cajero de Mostrador',
    created_at: new Date().toISOString(),
  };

  mockExpensesStorage.unshift(expense);
  emitDataChange('cash-expenses');
  return expense;
}

/**
 * Anula un gasto de caja menor registrado en el turno.
 */
export async function deleteCashExpense(id: string): Promise<void> {
  if (!id) throw new Error('ID de gasto inválido.');

  if (!isMockMode() && hasAuthSession()) {
    await apiClient.delete(`/cash-expenses/${encodeURIComponent(id)}`);
    emitDataChange('cash-expenses');
    return;
  }

  const tenantId = currentTenantId();
  mockExpensesStorage = mockExpensesStorage.filter((item) => !(item.id === id && item.negocio_id === tenantId));
  emitDataChange('cash-expenses');
}
