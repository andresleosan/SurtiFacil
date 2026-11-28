export type CashShiftLabel = 'manana' | 'tarde' | 'completo' | 'fin_semana';

export type CashWithdrawalDestination =
  | 'caja_fuerte'
  | 'entrega_dueno'
  | 'consignacion_banco'
  | 'cambio_sencillo';

export interface ShiftLabelMeta {
  id: CashShiftLabel;
  label: string;
  emoji: string;
  scheduleHint: string;
}

export interface WithdrawalDestinationMeta {
  id: CashWithdrawalDestination;
  label: string;
  emoji: string;
  placeholder: string;
}

export const SHIFT_LABELS: readonly ShiftLabelMeta[] = [
  { id: 'manana', label: 'Turno Mañana', emoji: '🌅', scheduleHint: '6:00 AM - 2:00 PM' },
  { id: 'tarde', label: 'Turno Tarde', emoji: '🌇', scheduleHint: '2:00 PM - 10:00 PM' },
  { id: 'completo', label: 'Turno Completo', emoji: '☀️', scheduleHint: 'Jornada Continua' },
  { id: 'fin_semana', label: 'Fin de Semana', emoji: '📅', scheduleHint: 'Sábado / Domingo / Festivo' },
];

export const WITHDRAWAL_DESTINATIONS: readonly WithdrawalDestinationMeta[] = [
  {
    id: 'caja_fuerte',
    label: 'Caja Fuerte / Bodega',
    emoji: '🔐',
    placeholder: 'Ej: Resguardo de billetes altos en caja fuerte',
  },
  {
    id: 'entrega_dueno',
    label: 'Entrega al Dueño',
    emoji: '🤝',
    placeholder: 'Ej: Entrega parcial de efectivo a Don Carlos',
  },
  {
    id: 'consignacion_banco',
    label: 'Consignación Banco / Nequi',
    emoji: '🏦',
    placeholder: 'Ej: Consignación en corresponsal Bancolombia / Nequi',
  },
  {
    id: 'cambio_sencillo',
    label: 'Cambio de Sencillo',
    emoji: '🪙',
    placeholder: 'Ej: Retiro para cambiar billetes grandes por monedas',
  },
];

export const QUICK_SHIFT_BASE_PRESETS = [50000, 100000, 150000, 200000] as const;
export const QUICK_WITHDRAWAL_PRESETS = [50000, 100000, 200000, 500000] as const;
export const HIGH_DRAWER_CASH_ALERT_CENTS = 50000000; // $ 500.000 COP
export const MAX_SHIFT_BASE_CENTS = 5000000000; // $ 50.000.000 COP

export function getShiftLabelMeta(label: string): ShiftLabelMeta {
  return SHIFT_LABELS.find((item) => item.id === label) || SHIFT_LABELS[2];
}

export function getWithdrawalDestinationMeta(dest: string): WithdrawalDestinationMeta {
  return WITHDRAWAL_DESTINATIONS.find((item) => item.id === dest) || WITHDRAWAL_DESTINATIONS[0];
}

export function calculateExpectedDrawerCashCents(params: {
  initial_cash_cents: number;
  sales_cash_cents: number;
  credit_payments_cash_cents: number;
  expenses_cash_cents?: number;
  withdrawals_cash_cents?: number;
}): number {
  const initial = Math.max(0, Math.round(Number(params.initial_cash_cents) || 0));
  const sales = Math.max(0, Math.round(Number(params.sales_cash_cents) || 0));
  const creditPayments = Math.max(0, Math.round(Number(params.credit_payments_cash_cents) || 0));
  const expenses = Math.max(0, Math.round(Number(params.expenses_cash_cents) || 0));
  const withdrawals = Math.max(0, Math.round(Number(params.withdrawals_cash_cents) || 0));
  return initial + sales + creditPayments - expenses - withdrawals;
}

export function calculateClosingStatus(
  expectedCents: number,
  countedCents: number
): { difference_cents: number; status: 'balanced' | 'surplus' | 'shortage' } {
  const expected = Math.round(Number(expectedCents) || 0);
  const counted = Math.round(Number(countedCents) || 0);
  const difference_cents = counted - expected;
  const status = difference_cents === 0 ? 'balanced' : difference_cents > 0 ? 'surplus' : 'shortage';
  return { difference_cents, status };
}

export function validateOpenShiftInput(input: {
  initial_cash_cents?: unknown;
  shift_label?: unknown;
  opening_notes?: unknown;
}):
  | {
      valid: true;
      initial_cash_cents: number;
      shift_label: CashShiftLabel;
      opening_notes: string | null;
    }
  | { valid: false; error: string } {
  const rawBase = Number(input.initial_cash_cents);
  if (!Number.isFinite(rawBase) || rawBase < 0) {
    return { valid: false, error: 'La base inicial de caja debe ser un valor entero igual o mayor a $ 0.' };
  }
  const initial_cash_cents = Math.floor(rawBase);
  if (initial_cash_cents > MAX_SHIFT_BASE_CENTS) {
    return { valid: false, error: 'La base inicial supera el límite máximo permitido ($ 50.000.000 COP).' };
  }

  const rawLabel = typeof input.shift_label === 'string' ? input.shift_label.trim() : '';
  const validLabel = SHIFT_LABELS.find((item) => item.id === rawLabel)?.id || 'completo';

  const rawNotes = typeof input.opening_notes === 'string' ? input.opening_notes.trim() : '';
  const opening_notes = rawNotes.length > 0 ? rawNotes.slice(0, 300) : null;

  return {
    valid: true,
    initial_cash_cents,
    shift_label: validLabel,
    opening_notes,
  };
}

export function validateCashWithdrawalInput(input: {
  amount_cents?: unknown;
  destination?: unknown;
  reason?: unknown;
  received_by?: unknown;
}):
  | {
      valid: true;
      amount_cents: number;
      destination: CashWithdrawalDestination;
      reason: string;
      received_by: string | null;
    }
  | { valid: false; error: string } {
  const rawAmount = Number(input.amount_cents);
  const amount_cents = Math.floor(rawAmount);
  if (!Number.isFinite(rawAmount) || amount_cents <= 0) {
    return { valid: false, error: 'El monto del retiro de seguridad debe ser mayor a $ 0.' };
  }

  const rawReason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (rawReason.length < 3) {
    return { valid: false, error: 'Escribe el motivo de la sangría (mínimo 3 caracteres).' };
  }

  const rawDest = typeof input.destination === 'string' ? input.destination.trim() : '';
  const destination =
    WITHDRAWAL_DESTINATIONS.find((item) => item.id === rawDest)?.id || 'caja_fuerte';

  const rawReceivedBy = typeof input.received_by === 'string' ? input.received_by.trim() : '';
  const received_by = rawReceivedBy.length > 0 ? rawReceivedBy.slice(0, 120) : null;

  return {
    valid: true,
    amount_cents,
    destination,
    reason: rawReason.slice(0, 300),
    received_by,
  };
}

export function shouldAlertHighCashDrawer(
  expectedCashCents: number,
  thresholdCents: number = HIGH_DRAWER_CASH_ALERT_CENTS
): boolean {
  return Number(expectedCashCents || 0) >= thresholdCents;
}
