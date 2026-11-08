import { apiClient, emitDataChange, getStoredAuthToken } from './apiClient';
import { getLocalSales } from './mockData';
import {
  CashClosing,
  CashClosingInput,
  CashShiftSummary,
  COLOMBIAN_BILLS,
  COLOMBIAN_COINS,
} from '../types/cashClosing';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

const mockClosingsStorage: CashClosing[] = [];

/**
 * Calcula la suma total contada en centavos a partir del desglose de denominaciones.
 */
export function calculateCountedCents(breakdown: {
  bills?: Record<string, number>;
  coins?: Record<string, number>;
}): number {
  let totalCents = 0;

  if (breakdown.bills) {
    for (const bill of COLOMBIAN_BILLS) {
      const qty = Math.max(0, Math.floor(Number(breakdown.bills[bill.id]) || 0));
      totalCents += bill.valueCents * qty;
    }
  }

  if (breakdown.coins) {
    for (const coin of COLOMBIAN_COINS) {
      const qty = Math.max(0, Math.floor(Number(breakdown.coins[coin.id]) || 0));
      totalCents += coin.valueCents * qty;
    }
  }

  return totalCents;
}

/**
 * Consulta el resumen financiero del turno actual desde Cloudflare D1 o Mock.
 */
export async function getCashShiftSummary(initialBaseCents = 10000000): Promise<CashShiftSummary> {
  if (isMockMode() || !getStoredAuthToken()) {
    const localSales = getLocalSales();
    const lastClosing = mockClosingsStorage[0];
    const openedAt = lastClosing ? lastClosing.closed_at : new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const threshold = new Date(openedAt).getTime();

    const currentShiftSales = localSales.filter((s) => {
      const saleDate = s.date instanceof Date ? s.date.getTime() : new Date((s as any).createdAt || s.date).getTime();
      return saleDate >= threshold;
    });

    const cashSales = currentShiftSales.filter((s) => s.payment_method === 'cash');
    const salesCashCents = cashSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const salesCashCount = cashSales.length;

    const creditPaymentsCashCents = 0; // En mock por defecto
    const creditPaymentsCashCount = 0;

    const otherMethods: Record<string, { count: number; total_cents: number }> = {};
    for (const s of currentShiftSales) {
      if (s.payment_method !== 'cash') {
        const method = s.payment_method || 'other';
        if (!otherMethods[method]) otherMethods[method] = { count: 0, total_cents: 0 };
        otherMethods[method].count += 1;
        otherMethods[method].total_cents += s.total || 0;
      }
    }

    const otherSales = Object.entries(otherMethods).map(([payment_method, data]) => ({
      payment_method,
      count: data.count,
      total_cents: data.total_cents,
    }));

    return {
      opened_at: openedAt,
      initial_cash_cents: initialBaseCents,
      sales_cash_cents: salesCashCents,
      sales_cash_count: salesCashCount,
      credit_payments_cash_cents: creditPaymentsCashCents,
      credit_payments_cash_count: creditPaymentsCashCount,
      expected_cash_cents: initialBaseCents + salesCashCents + creditPaymentsCashCents,
      other_sales: otherSales,
    };
  }

  try {
    return await apiClient.get<CashShiftSummary>(`/cash-closings/summary?initial_base_cents=${initialBaseCents}`);
  } catch (err) {
    console.warn('Error fetching cash shift summary from API, using fallback:', err);
    return {
      opened_at: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      initial_cash_cents: initialBaseCents,
      sales_cash_cents: 0,
      sales_cash_count: 0,
      credit_payments_cash_cents: 0,
      credit_payments_cash_count: 0,
      expected_cash_cents: initialBaseCents,
      other_sales: [],
    };
  }
}

/**
 * Registra un nuevo Arqueo y Cierre de Caja en Cloudflare D1 (o mock fallback).
 */
export async function recordCashClosing(input: CashClosingInput): Promise<CashClosing> {
  const countedCents = calculateCountedCents(input.breakdown);

  if (!isMockMode() && getStoredAuthToken()) {
    try {
      const result = await apiClient.post<CashClosing>('/cash-closings', input);
      emitDataChange('cash-closings');
      return result;
    } catch (err) {
      console.warn('Error enviando cash-closing a D1, usando mock fallback:', err);
    }
  }

  // Fallback local en memoria
  const summary = await getCashShiftSummary(input.initial_cash_cents);
  const expectedCents = summary.expected_cash_cents;
  const diff = countedCents - expectedCents;
  const status = diff === 0 ? 'balanced' : diff > 0 ? 'surplus' : 'shortage';

  const closing: CashClosing = {
    id: `cclose-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    negocio_id: 'surtifacil',
    closing_number: mockClosingsStorage.length + 1,
    opened_at: summary.opened_at,
    closed_at: new Date().toISOString(),
    closed_by_uid: 'mock-cashier-uid',
    closed_by_name: 'Cajero de Mostrador',
    initial_cash_cents: input.initial_cash_cents,
    sales_cash_cents: summary.sales_cash_cents,
    credit_payments_cash_cents: summary.credit_payments_cash_cents,
    expected_cash_cents: expectedCents,
    counted_cash_cents: countedCents,
    difference_cents: diff,
    status,
    breakdown: input.breakdown,
    notes: input.notes?.trim() || null,
    total_sales_count: summary.sales_cash_count,
    created_at: new Date().toISOString(),
  };

  mockClosingsStorage.unshift(closing);
  emitDataChange('cash-closings');
  return closing;
}

/**
 * Obtiene el historial de actas de cierre registradas.
 */
export async function getCashClosings(): Promise<CashClosing[]> {
  if (isMockMode()) {
    return [...mockClosingsStorage];
  }

  try {
    return await apiClient.get<CashClosing[]>('/cash-closings');
  } catch (err) {
    console.warn('Error fetching cash closings from API:', err);
    return [...mockClosingsStorage];
  }
}

/**
 * Obtiene el detalle de un cierre específico por ID.
 */
export async function getCashClosingById(id: string): Promise<CashClosing | null> {
  if (isMockMode()) {
    return mockClosingsStorage.find((c) => c.id === id) || null;
  }

  try {
    return await apiClient.get<CashClosing>(`/cash-closings/${id}`);
  } catch (err) {
    console.warn(`Error fetching cash closing ${id}:`, err);
    return null;
  }
}
