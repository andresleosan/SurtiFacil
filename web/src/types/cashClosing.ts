import type { CashShiftLabel, CashWithdrawalDestination } from '../utils/cashShiftAccounting';

export {
  SHIFT_LABELS,
  WITHDRAWAL_DESTINATIONS,
  type CashShiftLabel,
  type CashWithdrawalDestination,
} from '../utils/cashShiftAccounting';

export type CashClosingStatus = 'balanced' | 'surplus' | 'shortage';

export interface CashDenominationBreakdown {
  bills: Record<string, number>;
  coins: Record<string, number>;
}

export interface CashShift {
  id: string;
  negocio_id: string;
  shift_number: number;
  shift_label: CashShiftLabel;
  status: 'open' | 'closed';
  opened_at: string;
  opened_by_uid: string;
  opened_by_name?: string | null;
  opened_by_role?: string | null;
  initial_cash_cents: number;
  opening_notes?: string | null;
  closed_at?: string | null;
  closed_by_uid?: string | null;
  closed_by_name?: string | null;
  closing_id?: string | null;
  expected_cash_cents?: number | null;
  counted_cash_cents?: number | null;
  difference_cents?: number | null;
  closing_status?: CashClosingStatus | null;
  withdrawals_count?: number;
  withdrawals_total_cents?: number;
  created_at?: string;
}

export interface CashWithdrawal {
  id: string;
  negocio_id: string;
  shift_id?: string | null;
  amount_cents: number;
  destination: CashWithdrawalDestination;
  reason: string;
  received_by?: string | null;
  created_by_uid: string;
  created_by_name?: string | null;
  created_by_role?: string | null;
  created_at: string;
}

export interface OpenCashShiftInput {
  initial_cash_cents: number;
  shift_label: CashShiftLabel;
  opening_notes?: string;
}

export interface CashWithdrawalInput {
  amount_cents: number;
  destination: CashWithdrawalDestination;
  reason: string;
  received_by?: string;
}

export interface CashClosing {
  id: string;
  negocio_id: string;
  closing_number: number;
  opened_at: string;
  closed_at: string;
  closed_by_uid: string;
  closed_by_name: string;
  initial_cash_cents: number;
  sales_cash_cents: number;
  credit_payments_cash_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number;
  difference_cents: number;
  status: CashClosingStatus;
  breakdown: CashDenominationBreakdown;
  notes?: string | null;
  total_sales_count: number;
  expenses_cash_cents?: number;
  withdrawals_cash_cents?: number;
  shift_id?: string | null;
  shift_number?: number | null;
  shift_label?: string | null;
  opened_by_uid?: string | null;
  opened_by_name?: string | null;
  created_at?: string;
}

export interface CashShiftSummary {
  opened_at: string;
  initial_cash_cents: number;
  sales_cash_cents: number;
  sales_cash_count: number;
  credit_payments_cash_cents: number;
  credit_payments_cash_count: number;
  expenses_cash_cents?: number;
  expenses_cash_count?: number;
  withdrawals_cash_cents?: number;
  withdrawals_cash_count?: number;
  expected_cash_cents: number;
  other_sales: Array<{ payment_method: string; count: number; total_cents: number }>;
  active_shift?: CashShift | null;
}

export interface ActiveCashShiftResponse {
  active_shift: CashShift | null;
  withdrawals: CashWithdrawal[];
  withdrawals_total_cents: number;
  summary: CashShiftSummary;
}

export interface CashClosingInput {
  initial_cash_cents: number;
  breakdown: CashDenominationBreakdown;
  notes?: string;
}

export interface DenominationItem {
  id: string;
  label: string;
  valueCOP: number;
  valueCents: number;
  emoji: string;
}

export const COLOMBIAN_BILLS: readonly DenominationItem[] = [
  { id: '100000', label: '$ 100.000', valueCOP: 100000, valueCents: 10000000, emoji: '💵' },
  { id: '50000', label: '$ 50.000', valueCOP: 50000, valueCents: 5000000, emoji: '💵' },
  { id: '20000', label: '$ 20.000', valueCOP: 20000, valueCents: 2000000, emoji: '💵' },
  { id: '10000', label: '$ 10.000', valueCOP: 10000, valueCents: 1000000, emoji: '💵' },
  { id: '5000', label: '$ 5.000', valueCOP: 5000, valueCents: 500000, emoji: '💵' },
  { id: '2000', label: '$ 2.000', valueCOP: 2000, valueCents: 200000, emoji: '💵' },
];

export const COLOMBIAN_COINS: readonly DenominationItem[] = [
  { id: '1000', label: '$ 1.000', valueCOP: 1000, valueCents: 100000, emoji: '🪙' },
  { id: '500', label: '$ 500', valueCOP: 500, valueCents: 50000, emoji: '🪙' },
  { id: '200', label: '$ 200', valueCOP: 200, valueCents: 20000, emoji: '🪙' },
  { id: '100', label: '$ 100', valueCOP: 100, valueCents: 10000, emoji: '🪙' },
  { id: '50', label: '$ 50', valueCOP: 50, valueCents: 5000, emoji: '🪙' },
];
