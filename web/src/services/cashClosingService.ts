import { apiClient, emitDataChange, hasAuthSession } from './apiClient';
import { getLocalSales } from './mockData';
import { getMockShiftCashExpenses } from './cashExpenseService';
import {
  closeMockActiveShift,
  getMockActiveShift,
  getMockShiftCashWithdrawals,
} from './cashShiftService';
import {
  calculateClosingStatus,
  calculateExpectedDrawerCashCents,
} from '../utils/cashShiftAccounting';
import { extractSalePaymentBuckets, isSaleVoided } from '../utils/saleAccounting';
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
  if (isMockMode() || !hasAuthSession()) {
    const localSales = getLocalSales();
    const activeShift = getMockActiveShift();
    const lastClosing = activeShift ? null : mockClosingsStorage[0];
    const openedAt =
      activeShift?.opened_at ||
      (lastClosing ? lastClosing.closed_at : new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    const resolvedBaseCents = activeShift ? activeShift.initial_cash_cents : initialBaseCents;
    const threshold = new Date(openedAt).getTime();

    const currentShiftSales = localSales.filter((s) => {
      if (isSaleVoided(s)) return false;
      const saleDate = s.date instanceof Date ? s.date.getTime() : new Date((s as any).createdAt || s.date).getTime();
      return saleDate >= threshold;
    });

    let salesCashCents = 0;
    let salesCashCount = 0;
    const otherMethods: Record<string, { count: number; total_cents: number }> = {};

    for (const s of currentShiftSales) {
      const buckets = extractSalePaymentBuckets(s);
      if (buckets.cash_cents > 0) {
        salesCashCents += buckets.cash_cents;
        salesCashCount += 1;
      }
      if (buckets.card_cents > 0) {
        if (!otherMethods.card) otherMethods.card = { count: 0, total_cents: 0 };
        otherMethods.card.count += 1;
        otherMethods.card.total_cents += buckets.card_cents;
      }
      if (buckets.transfer_cents > 0) {
        if (!otherMethods.other) otherMethods.other = { count: 0, total_cents: 0 };
        otherMethods.other.count += 1;
        otherMethods.other.total_cents += buckets.transfer_cents;
      }
      if (buckets.credit_cents > 0) {
        if (!otherMethods.credit) otherMethods.credit = { count: 0, total_cents: 0 };
        otherMethods.credit.count += 1;
        otherMethods.credit.total_cents += buckets.credit_cents;
      }
    }

    const creditPaymentsCashCents = 0; // En mock por defecto
    const creditPaymentsCashCount = 0;

    const shiftExpenses = getMockShiftCashExpenses(openedAt);
    const shiftWithdrawals = getMockShiftCashWithdrawals(openedAt, activeShift?.id || null);

    const otherSales = Object.entries(otherMethods).map(([payment_method, data]) => ({
      payment_method,
      count: data.count,
      total_cents: data.total_cents,
    }));

    return {
      opened_at: openedAt,
      initial_cash_cents: resolvedBaseCents,
      sales_cash_cents: salesCashCents,
      sales_cash_count: salesCashCount,
      credit_payments_cash_cents: creditPaymentsCashCents,
      credit_payments_cash_count: creditPaymentsCashCount,
      expenses_cash_cents: shiftExpenses.total_cents,
      expenses_cash_count: shiftExpenses.count,
      withdrawals_cash_cents: shiftWithdrawals.total_cents,
      withdrawals_cash_count: shiftWithdrawals.count,
      expected_cash_cents: calculateExpectedDrawerCashCents({
        initial_cash_cents: resolvedBaseCents,
        sales_cash_cents: salesCashCents,
        credit_payments_cash_cents: creditPaymentsCashCents,
        expenses_cash_cents: shiftExpenses.total_cents,
        withdrawals_cash_cents: shiftWithdrawals.total_cents,
      }),
      other_sales: otherSales,
      active_shift: activeShift,
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
      expenses_cash_cents: 0,
      expenses_cash_count: 0,
      withdrawals_cash_cents: 0,
      withdrawals_cash_count: 0,
      expected_cash_cents: initialBaseCents,
      other_sales: [],
      active_shift: null,
    };
  }
}

/**
 * Registra un nuevo Arqueo y Cierre de Caja en Cloudflare D1 (o mock fallback).
 */
export async function recordCashClosing(input: CashClosingInput): Promise<CashClosing> {
  const countedCents = calculateCountedCents(input.breakdown);

  if (!isMockMode() && hasAuthSession()) {
    try {
      const result = await apiClient.post<CashClosing>('/cash-closings', input);
      emitDataChange('cash-closings');
      emitDataChange('cash-shifts');
      return result;
    } catch (err) {
      console.warn('Error enviando cash-closing a D1, usando mock fallback:', err);
    }
  }

  // Fallback local en memoria
  const activeShift = getMockActiveShift();
  const resolvedBaseCents = activeShift ? activeShift.initial_cash_cents : input.initial_cash_cents;
  const summary = await getCashShiftSummary(resolvedBaseCents);
  const expectedCents = summary.expected_cash_cents;
  const { difference_cents: diff, status } = calculateClosingStatus(expectedCents, countedCents);
  const closedAt = new Date().toISOString();
  const closingId = `cclose-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const closing: CashClosing = {
    id: closingId,
    negocio_id: activeShift?.negocio_id || 'surtifacil',
    closing_number: mockClosingsStorage.length + 1,
    opened_at: summary.opened_at,
    closed_at: closedAt,
    closed_by_uid: 'mock-cashier-uid',
    closed_by_name: 'Cajero de Mostrador',
    initial_cash_cents: resolvedBaseCents,
    sales_cash_cents: summary.sales_cash_cents,
    credit_payments_cash_cents: summary.credit_payments_cash_cents,
    expected_cash_cents: expectedCents,
    counted_cash_cents: countedCents,
    difference_cents: diff,
    status,
    breakdown: input.breakdown,
    notes: input.notes?.trim() || null,
    total_sales_count: summary.sales_cash_count,
    expenses_cash_cents: summary.expenses_cash_cents || 0,
    withdrawals_cash_cents: summary.withdrawals_cash_cents || 0,
    shift_id: activeShift?.id || null,
    shift_number: activeShift?.shift_number ?? null,
    shift_label: activeShift?.shift_label || null,
    opened_by_uid: activeShift?.opened_by_uid || null,
    opened_by_name: activeShift?.opened_by_name || null,
    created_at: closedAt,
  };

  if (activeShift) {
    closeMockActiveShift({
      closing_id: closingId,
      closed_at: closedAt,
      closed_by_uid: closing.closed_by_uid,
      closed_by_name: closing.closed_by_name,
      expected_cash_cents: expectedCents,
      counted_cash_cents: countedCents,
      difference_cents: diff,
      closing_status: status,
    });
  }

  mockClosingsStorage.unshift(closing);
  emitDataChange('cash-closings');
  emitDataChange('cash-shifts');
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
