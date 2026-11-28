import { apiClient, emitDataChange, getActiveNegocioId, hasAuthSession } from './apiClient';
import { getLocalSales } from './mockData';
import { getMockShiftCashExpenses } from './cashExpenseService';
import {
  calculateExpectedDrawerCashCents,
  validateCashWithdrawalInput,
  validateOpenShiftInput,
} from '../utils/cashShiftAccounting';
import { extractSalePaymentBuckets, isSaleVoided } from '../utils/saleAccounting';
import {
  ActiveCashShiftResponse,
  CashClosingStatus,
  CashShift,
  CashShiftSummary,
  CashWithdrawal,
  CashWithdrawalInput,
  OpenCashShiftInput,
} from '../types/cashClosing';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function currentTenantId(): string {
  return getActiveNegocioId() || 'surtifacil';
}

let mockShiftsStorage: CashShift[] = [];
let mockWithdrawalsStorage: CashWithdrawal[] = [];

export function clearMockCashShifts(): void {
  mockShiftsStorage = [];
  mockWithdrawalsStorage = [];
}

export function getMockActiveShift(): CashShift | null {
  const tenantId = currentTenantId();
  return mockShiftsStorage.find((s) => s.negocio_id === tenantId && s.status === 'open') || null;
}

export function getMockShiftCashWithdrawals(
  sinceIso: string,
  activeShiftId?: string | null
): { count: number; total_cents: number; items: CashWithdrawal[] } {
  const tenantId = currentTenantId();
  const threshold = new Date(sinceIso).getTime();
  const items = mockWithdrawalsStorage
    .filter((w) => {
      if (w.negocio_id !== tenantId) return false;
      if (activeShiftId) {
        return w.shift_id === activeShiftId || (!w.shift_id && new Date(w.created_at).getTime() >= threshold);
      }
      return new Date(w.created_at).getTime() >= threshold;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    count: items.length,
    total_cents: items.reduce((sum, item) => sum + (item.amount_cents || 0), 0),
    items,
  };
}

export function closeMockActiveShift(params: {
  closing_id: string;
  closed_at: string;
  closed_by_uid: string;
  closed_by_name: string;
  expected_cash_cents: number;
  counted_cash_cents: number;
  difference_cents: number;
  closing_status: CashClosingStatus;
}): CashShift | null {
  const active = getMockActiveShift();
  if (!active) return null;
  active.status = 'closed';
  active.closed_at = params.closed_at;
  active.closed_by_uid = params.closed_by_uid;
  active.closed_by_name = params.closed_by_name;
  active.closing_id = params.closing_id;
  active.expected_cash_cents = params.expected_cash_cents;
  active.counted_cash_cents = params.counted_cash_cents;
  active.difference_cents = params.difference_cents;
  active.closing_status = params.closing_status;
  return active;
}

function buildMockActiveShiftResponse(): ActiveCashShiftResponse {
  const activeShift = getMockActiveShift();
  const openedAt = activeShift?.opened_at || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const initialCashCents = activeShift ? activeShift.initial_cash_cents : 10000000;
  const threshold = new Date(openedAt).getTime();

  const localSales = getLocalSales().filter((s) => {
    if (isSaleVoided(s)) return false;
    const saleDate = s.date instanceof Date ? s.date.getTime() : new Date((s as any).createdAt || s.date).getTime();
    return saleDate >= threshold;
  });

  let salesCashCents = 0;
  let salesCashCount = 0;
  const otherMethods: Record<string, { count: number; total_cents: number }> = {};

  for (const s of localSales) {
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

  const shiftExpenses = getMockShiftCashExpenses(openedAt);
  const shiftWithdrawals = getMockShiftCashWithdrawals(openedAt, activeShift?.id || null);

  const expectedCashCents = calculateExpectedDrawerCashCents({
    initial_cash_cents: initialCashCents,
    sales_cash_cents: salesCashCents,
    credit_payments_cash_cents: 0,
    expenses_cash_cents: shiftExpenses.total_cents,
    withdrawals_cash_cents: shiftWithdrawals.total_cents,
  });

  const summary: CashShiftSummary = {
    opened_at: openedAt,
    initial_cash_cents: initialCashCents,
    sales_cash_cents: salesCashCents,
    sales_cash_count: salesCashCount,
    credit_payments_cash_cents: 0,
    credit_payments_cash_count: 0,
    expenses_cash_cents: shiftExpenses.total_cents,
    expenses_cash_count: shiftExpenses.count,
    withdrawals_cash_cents: shiftWithdrawals.total_cents,
    withdrawals_cash_count: shiftWithdrawals.count,
    expected_cash_cents: expectedCashCents,
    other_sales: Object.entries(otherMethods).map(([payment_method, data]) => ({
      payment_method,
      count: data.count,
      total_cents: data.total_cents,
    })),
    active_shift: activeShift,
  };

  return {
    active_shift: activeShift,
    withdrawals: shiftWithdrawals.items,
    withdrawals_total_cents: shiftWithdrawals.total_cents,
    summary,
  };
}

export async function getActiveCashShift(): Promise<ActiveCashShiftResponse> {
  if (isMockMode() || !hasAuthSession()) {
    return buildMockActiveShiftResponse();
  }
  return apiClient.get<ActiveCashShiftResponse>('/cash-shifts/active');
}

export async function openCashShift(input: OpenCashShiftInput): Promise<CashShift> {
  const validated = validateOpenShiftInput(input);
  if (!validated.valid) {
    throw new Error(validated.error);
  }

  if (!isMockMode() && hasAuthSession()) {
    const created = await apiClient.post<CashShift>('/cash-shifts/open', {
      initial_cash_cents: validated.initial_cash_cents,
      shift_label: validated.shift_label,
      opening_notes: validated.opening_notes || undefined,
    });
    emitDataChange('cash-shifts');
    return created;
  }

  const tenantId = currentTenantId();
  if (getMockActiveShift()) {
    throw new Error('Ya existe un turno de caja abierto. Ciérralo antes de abrir uno nuevo.');
  }

  const tenantShifts = mockShiftsStorage.filter((s) => s.negocio_id === tenantId);
  const nextNumber = tenantShifts.reduce((max, s) => Math.max(max, s.shift_number || 0), 0) + 1;
  const nowIso = new Date().toISOString();

  const shift: CashShift = {
    id: `cshift-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    negocio_id: tenantId,
    shift_number: nextNumber,
    shift_label: validated.shift_label,
    status: 'open',
    opened_at: nowIso,
    opened_by_uid: 'mock-cashier-uid',
    opened_by_name: 'Cajero de Mostrador',
    opened_by_role: 'cashier',
    initial_cash_cents: validated.initial_cash_cents,
    opening_notes: validated.opening_notes,
    created_at: nowIso,
  };

  mockShiftsStorage.unshift(shift);
  emitDataChange('cash-shifts');
  return shift;
}

export async function getCashShifts(): Promise<CashShift[]> {
  if (isMockMode() || !hasAuthSession()) {
    const tenantId = currentTenantId();
    return mockShiftsStorage
      .filter((s) => s.negocio_id === tenantId)
      .map((s) => {
        const stats = mockWithdrawalsStorage.filter((w) => w.negocio_id === tenantId && w.shift_id === s.id);
        return {
          ...s,
          withdrawals_count: stats.length,
          withdrawals_total_cents: stats.reduce((sum, w) => sum + (w.amount_cents || 0), 0),
        };
      })
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
  }

  return apiClient.get<CashShift[]>('/cash-shifts');
}

export async function getCashWithdrawals(options?: {
  shiftOnly?: boolean;
  shiftId?: string;
  since?: string;
}): Promise<CashWithdrawal[]> {
  if (isMockMode() || !hasAuthSession()) {
    const tenantId = currentTenantId();
    if (options?.shiftId) {
      return mockWithdrawalsStorage
        .filter((w) => w.negocio_id === tenantId && w.shift_id === options.shiftId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    if (options?.shiftOnly) {
      const activeShift = getMockActiveShift();
      const sinceIso = activeShift?.opened_at || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      return getMockShiftCashWithdrawals(sinceIso, activeShift?.id || null).items;
    }
    return mockWithdrawalsStorage
      .filter((w) => {
        if (w.negocio_id !== tenantId) return false;
        if (options?.since) {
          return new Date(w.created_at).getTime() >= new Date(options.since).getTime();
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const params = new URLSearchParams();
  if (options?.shiftOnly) params.set('shift_only', 'true');
  if (options?.shiftId) params.set('shift_id', options.shiftId);
  if (options?.since) params.set('since', options.since);
  const query = params.toString();
  return apiClient.get<CashWithdrawal[]>(query ? `/cash-withdrawals?${query}` : '/cash-withdrawals');
}

export async function recordCashWithdrawal(input: CashWithdrawalInput): Promise<CashWithdrawal> {
  const validated = validateCashWithdrawalInput(input);
  if (!validated.valid) {
    throw new Error(validated.error);
  }

  if (!isMockMode() && hasAuthSession()) {
    const created = await apiClient.post<CashWithdrawal>('/cash-withdrawals', {
      amount_cents: validated.amount_cents,
      destination: validated.destination,
      reason: validated.reason,
      received_by: validated.received_by || undefined,
    });
    emitDataChange('cash-shifts');
    return created;
  }

  const activeShift = getMockActiveShift();
  const nowIso = new Date().toISOString();
  const withdrawal: CashWithdrawal = {
    id: `cwith-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    negocio_id: currentTenantId(),
    shift_id: activeShift?.id || null,
    amount_cents: validated.amount_cents,
    destination: validated.destination,
    reason: validated.reason,
    received_by: validated.received_by,
    created_by_uid: 'mock-cashier-uid',
    created_by_name: 'Cajero de Mostrador',
    created_by_role: 'cashier',
    created_at: nowIso,
  };

  mockWithdrawalsStorage.unshift(withdrawal);
  emitDataChange('cash-shifts');
  return withdrawal;
}

export async function deleteCashWithdrawal(id: string): Promise<void> {
  if (!id) throw new Error('ID de sangría inválido.');

  if (!isMockMode() && hasAuthSession()) {
    await apiClient.delete(`/cash-withdrawals/${encodeURIComponent(id)}`);
    emitDataChange('cash-shifts');
    return;
  }

  const tenantId = currentTenantId();
  const target = mockWithdrawalsStorage.find((w) => w.id === id && w.negocio_id === tenantId);
  if (target?.shift_id) {
    const parent = mockShiftsStorage.find((s) => s.id === target.shift_id && s.negocio_id === tenantId);
    if (parent && parent.status === 'closed') {
      throw new Error('No se puede anular una sangría de un turno ya cerrado.');
    }
  }
  mockWithdrawalsStorage = mockWithdrawalsStorage.filter((w) => !(w.id === id && w.negocio_id === tenantId));
  emitDataChange('cash-shifts');
}
