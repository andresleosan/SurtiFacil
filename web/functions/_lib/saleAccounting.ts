export type SinglePaymentMethod = 'cash' | 'card' | 'other' | 'credit';
export type PaymentMethod = SinglePaymentMethod | 'mixed';
export type SaleStatus = 'completed' | 'voided';

export interface PaymentBreakdownEntry {
  method: SinglePaymentMethod;
  amount_cents: number;
}

export interface SalePaymentBuckets {
  cash_cents: number;
  card_cents: number;
  transfer_cents: number;
  credit_cents: number;
  is_mixed: boolean;
  breakdown: PaymentBreakdownEntry[];
}

export interface NetProfitStatement {
  period_days: number;
  since_iso: string;
  active_sales_count: number;
  voided_sales_count: number;
  voided_sales_cents: number;
  revenue_cents: number;
  cogs_cents: number;
  gross_profit_cents: number;
  gross_margin_percent: number;
  shrinkage_count: number;
  shrinkage_loss_cents: number;
  expenses_count: number;
  operating_expenses_cents: number;
  expenses_cash_cents: number;
  expenses_transfer_cents: number;
  total_deductions_cents: number;
  net_profit_cents: number;
  net_margin_percent: number;
  payment_totals: {
    cash_cents: number;
    transfer_card_cents: number;
    credit_cents: number;
    mixed_sales_count: number;
  };
}

export type ResolvePaymentBreakdownResult =
  | {
      ok: true;
      breakdown: PaymentBreakdownEntry[];
      is_mixed: boolean;
      effective_payment_method: PaymentMethod;
      db_payment_method: SinglePaymentMethod;
      cash_cents: number;
      card_cents: number;
      transfer_cents: number;
      credit_cents: number;
    }
  | {
      ok: false;
      error: string;
    };

const VALID_SINGLE_METHODS = new Set<SinglePaymentMethod>(['cash', 'card', 'other', 'credit']);
const VALID_PAYMENT_METHODS = new Set<PaymentMethod>(['cash', 'card', 'other', 'credit', 'mixed']);

export function isSinglePaymentMethod(value: unknown): value is SinglePaymentMethod {
  return typeof value === 'string' && VALID_SINGLE_METHODS.has(value as SinglePaymentMethod);
}

export function isSaleVoided(sale: { status?: string | null } | null | undefined): boolean {
  return sale?.status === 'voided';
}

/**
 * Resuelve y valida el desglose de medios de pago de una venta (simple o mixto).
 * Mantiene `db_payment_method` dentro del CHECK legado de D1 ('cash' | 'card' | 'other' | 'credit')
 * para garantizar compatibilidad con tablas creadas previamente en producción.
 */
export function resolveSalePaymentBreakdown(params: {
  totalCents: number;
  paymentMethod: string;
  paymentBreakdown?: Array<{ method: string; amount_cents: number }> | null;
  creditCustomerId?: string | null;
}): ResolvePaymentBreakdownResult {
  const totalCents = Math.round(Number(params.totalCents));
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    return { ok: false, error: 'El total de la venta es inválido.' };
  }

  const rawMethod = String(params.paymentMethod || '').trim();
  if (!VALID_PAYMENT_METHODS.has(rawMethod as PaymentMethod)) {
    return { ok: false, error: 'Método de pago inválido.' };
  }

  const hasCustomBreakdown = Array.isArray(params.paymentBreakdown) && params.paymentBreakdown.length > 0;

  if (rawMethod === 'mixed' && !hasCustomBreakdown) {
    return { ok: false, error: 'Un pago mixto debe incluir al menos dos medios de pago.' };
  }

  if (hasCustomBreakdown || rawMethod === 'mixed') {
    if (totalCents <= 0) {
      return { ok: false, error: 'El total de una venta con pago mixto debe ser mayor a $ 0.' };
    }

    const rawEntries = params.paymentBreakdown || [];
    const seenMethods = new Set<SinglePaymentMethod>();
    const entries: PaymentBreakdownEntry[] = [];

    for (const entry of rawEntries) {
      if (!entry || !isSinglePaymentMethod(entry.method)) {
        return { ok: false, error: 'Medio de pago inválido en el desglose mixto.' };
      }
      if (seenMethods.has(entry.method)) {
        return { ok: false, error: 'No repitas el mismo medio de pago dentro del desglose mixto.' };
      }
      const amount = Number(entry.amount_cents);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        return { ok: false, error: 'Cada porción del pago mixto debe ser un monto entero mayor a $ 0.' };
      }
      seenMethods.add(entry.method);
      entries.push({ method: entry.method, amount_cents: amount });
    }

    if (rawMethod === 'mixed' && entries.length < 2) {
      return { ok: false, error: 'Un pago mixto debe incluir al menos dos medios de pago.' };
    }

    const sum = entries.reduce((acc, item) => acc + item.amount_cents, 0);
    if (sum !== totalCents) {
      return {
        ok: false,
        error: `La suma del pago mixto (${sum}) no coincide con el total oficial (${totalCents}).`,
      };
    }

    let cash_cents = 0;
    let card_cents = 0;
    let transfer_cents = 0;
    let credit_cents = 0;

    for (const entry of entries) {
      if (entry.method === 'cash') cash_cents += entry.amount_cents;
      else if (entry.method === 'card') card_cents += entry.amount_cents;
      else if (entry.method === 'other') transfer_cents += entry.amount_cents;
      else if (entry.method === 'credit') credit_cents += entry.amount_cents;
    }

    if (credit_cents > 0 && !String(params.creditCustomerId || '').trim()) {
      return { ok: false, error: 'Debe seleccionar un cliente de crédito para la porción fiada.' };
    }

    const is_mixed = entries.length > 1;
    const effective_payment_method: PaymentMethod = is_mixed ? 'mixed' : entries[0].method;
    const db_payment_method: SinglePaymentMethod = is_mixed ? 'other' : entries[0].method;

    return {
      ok: true,
      breakdown: entries,
      is_mixed,
      effective_payment_method,
      db_payment_method,
      cash_cents,
      card_cents,
      transfer_cents,
      credit_cents,
    };
  }

  const singleMethod = rawMethod as SinglePaymentMethod;
  if (singleMethod === 'credit' && !String(params.creditCustomerId || '').trim()) {
    return { ok: false, error: 'Debe seleccionar un cliente de crédito para ventas fiadas.' };
  }

  const breakdown: PaymentBreakdownEntry[] = [{ method: singleMethod, amount_cents: totalCents }];

  return {
    ok: true,
    breakdown,
    is_mixed: false,
    effective_payment_method: singleMethod,
    db_payment_method: singleMethod,
    cash_cents: singleMethod === 'cash' ? totalCents : 0,
    card_cents: singleMethod === 'card' ? totalCents : 0,
    transfer_cents: singleMethod === 'other' ? totalCents : 0,
    credit_cents: singleMethod === 'credit' ? totalCents : 0,
  };
}

/**
 * Parsea `payment_breakdown_json` (o un arreglo ya hidratado) y entrega siempre un desglose válido.
 * Si no existe desglose almacenado (ventas legadas), construye una entrada única usando `fallbackMethod`.
 */
export function parsePaymentBreakdown(
  rawJsonOrArray: unknown,
  fallbackMethod: string,
  totalCents: number
): PaymentBreakdownEntry[] {
  const safeTotal = Math.max(0, Math.round(Number(totalCents) || 0));
  const safeFallback: SinglePaymentMethod = isSinglePaymentMethod(fallbackMethod)
    ? fallbackMethod
    : 'other';

  let candidate: unknown = rawJsonOrArray;
  if (typeof rawJsonOrArray === 'string') {
    const trimmed = rawJsonOrArray.trim();
    if (!trimmed) {
      return [{ method: safeFallback, amount_cents: safeTotal }];
    }
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return [{ method: safeFallback, amount_cents: safeTotal }];
    }
  }

  if (!Array.isArray(candidate) || candidate.length === 0) {
    return [{ method: safeFallback, amount_cents: safeTotal }];
  }

  const aggregated = new Map<SinglePaymentMethod, number>();
  for (const rawEntry of candidate) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const obj = rawEntry as Record<string, unknown>;
    if (!isSinglePaymentMethod(obj.method)) continue;
    const amount = Math.round(Number(obj.amount_cents));
    if (!Number.isSafeInteger(amount) || amount < 0) continue;
    aggregated.set(obj.method, (aggregated.get(obj.method) || 0) + amount);
  }

  const nonZero = Array.from(aggregated.entries())
    .filter(([, amount]) => amount > 0)
    .map(([method, amount_cents]) => ({ method, amount_cents }));

  if (nonZero.length > 0) {
    return nonZero;
  }

  if (safeTotal === 0 && aggregated.size === 1) {
    const [onlyMethod] = Array.from(aggregated.keys());
    return [{ method: onlyMethod, amount_cents: 0 }];
  }

  return [{ method: safeFallback, amount_cents: safeTotal }];
}

/**
 * Extrae los montos por canal de pago de una venta.
 * Las ventas anuladas (`status === 'voided'`) devuelven todos los montos en 0.
 */
export function extractSalePaymentBuckets(sale: {
  payment_method?: string;
  payment_breakdown?: PaymentBreakdownEntry[] | null;
  payment_breakdown_json?: string | null;
  total_cents?: number;
  total?: number;
  status?: string | null;
}): SalePaymentBuckets {
  if (isSaleVoided(sale)) {
    return {
      cash_cents: 0,
      card_cents: 0,
      transfer_cents: 0,
      credit_cents: 0,
      is_mixed: false,
      breakdown: [],
    };
  }

  const totalCents = Math.max(0, Math.round(Number(sale.total_cents ?? sale.total ?? 0)));
  const rawBreakdown =
    Array.isArray(sale.payment_breakdown) && sale.payment_breakdown.length > 0
      ? sale.payment_breakdown
      : sale.payment_breakdown_json;

  const breakdown = parsePaymentBreakdown(rawBreakdown, sale.payment_method || 'cash', totalCents);

  let cash_cents = 0;
  let card_cents = 0;
  let transfer_cents = 0;
  let credit_cents = 0;

  for (const entry of breakdown) {
    if (entry.method === 'cash') cash_cents += entry.amount_cents;
    else if (entry.method === 'card') card_cents += entry.amount_cents;
    else if (entry.method === 'other') transfer_cents += entry.amount_cents;
    else if (entry.method === 'credit') credit_cents += entry.amount_cents;
  }

  return {
    cash_cents,
    card_cents,
    transfer_cents,
    credit_cents,
    is_mixed: breakdown.length > 1,
    breakdown,
  };
}

function resolveRecordDateMs(record: any): number | null {
  if (!record || typeof record !== 'object') return null;
  const candidate = record.date ?? record.created_at ?? record.createdAt;
  if (!candidate) return null;
  if (typeof candidate === 'object') {
    if (typeof candidate.toMillis === 'function') {
      const ms = candidate.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof candidate.toDate === 'function') {
      const ms = candidate.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (candidate instanceof Date) {
      const ms = candidate.getTime();
      return Number.isFinite(ms) ? ms : null;
    }
  }
  const parsed = new Date(candidate).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSaleCogsCents(sale: any): number {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (items.length > 0) {
    let sum = 0;
    for (const item of items) {
      const qty = Math.max(0, Number(item?.quantity) || 0);
      if (Number.isSafeInteger(item?.unit_cost_cents) && item.unit_cost_cents >= 0) {
        sum += item.unit_cost_cents * qty;
      } else if (Number.isSafeInteger(item?.cost_subtotal_cents) && item.cost_subtotal_cents >= 0) {
        sum += item.cost_subtotal_cents;
      } else {
        const price = Math.max(0, Math.round(Number(item?.price_cents) || 0));
        sum += Math.floor(price / 2) * qty;
      }
    }
    return sum;
  }
  const storedTotalCost = Number(sale?.total_cost_cents);
  return Number.isFinite(storedTotalCost) && storedTotalCost >= 0 ? Math.round(storedTotalCost) : 0;
}

/**
 * Calcula el Estado de Resultados de Utilidad Neta Real del negocio para un período en días:
 * Ingresos Vigentes − Costo de Mercancía = Margen Bruto
 * Margen Bruto − Mermas − Gastos Operativos de Caja Menor = Utilidad Neta Real
 */
export function calculateNetProfitStatement(params: {
  sales: any[];
  shrinkageEntries: any[];
  cashExpenses: any[];
  days: number;
  now?: Date;
}): NetProfitStatement {
  const safeDays = Math.min(Math.max(Math.floor(Number(params.days) || 30), 1), 365);
  const nowDate = params.now ? new Date(params.now) : new Date();
  const sinceDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  sinceDate.setDate(sinceDate.getDate() - (safeDays - 1));
  const sinceMs = sinceDate.getTime();
  const sinceIso = sinceDate.toISOString();

  let active_sales_count = 0;
  let voided_sales_count = 0;
  let voided_sales_cents = 0;
  let revenue_cents = 0;
  let cogs_cents = 0;
  let cash_cents = 0;
  let transfer_card_cents = 0;
  let credit_cents = 0;
  let mixed_sales_count = 0;

  for (const sale of params.sales || []) {
    const ms = resolveRecordDateMs(sale);
    if (ms === null || ms < sinceMs) continue;

    const saleTotal = Math.max(0, Math.round(Number(sale.total_cents ?? sale.total ?? 0)));
    if (isSaleVoided(sale)) {
      voided_sales_count += 1;
      voided_sales_cents += saleTotal;
      continue;
    }

    active_sales_count += 1;
    revenue_cents += saleTotal;
    cogs_cents += resolveSaleCogsCents(sale);

    const buckets = extractSalePaymentBuckets(sale);
    cash_cents += buckets.cash_cents;
    transfer_card_cents += buckets.transfer_cents + buckets.card_cents;
    credit_cents += buckets.credit_cents;
    if (buckets.is_mixed) mixed_sales_count += 1;
  }

  let shrinkage_count = 0;
  let shrinkage_loss_cents = 0;
  for (const entry of params.shrinkageEntries || []) {
    const ms = resolveRecordDateMs(entry);
    if (ms === null || ms < sinceMs) continue;
    shrinkage_count += 1;
    shrinkage_loss_cents += Math.max(0, Math.round(Number(entry.total_cost_loss_cents) || 0));
  }

  let expenses_count = 0;
  let operating_expenses_cents = 0;
  let expenses_cash_cents = 0;
  let expenses_transfer_cents = 0;
  for (const expense of params.cashExpenses || []) {
    const ms = resolveRecordDateMs(expense);
    if (ms === null || ms < sinceMs) continue;
    const amount = Math.max(0, Math.round(Number(expense.amount_cents) || 0));
    expenses_count += 1;
    operating_expenses_cents += amount;
    if (expense.payment_method === 'transfer') {
      expenses_transfer_cents += amount;
    } else {
      expenses_cash_cents += amount;
    }
  }

  const gross_profit_cents = revenue_cents - cogs_cents;
  const total_deductions_cents = shrinkage_loss_cents + operating_expenses_cents;
  const net_profit_cents = gross_profit_cents - total_deductions_cents;

  const gross_margin_percent =
    revenue_cents > 0 ? Math.round(((gross_profit_cents / revenue_cents) * 100) * 10) / 10 : 0;
  const net_margin_percent =
    revenue_cents > 0 ? Math.round(((net_profit_cents / revenue_cents) * 100) * 10) / 10 : 0;

  return {
    period_days: safeDays,
    since_iso: sinceIso,
    active_sales_count,
    voided_sales_count,
    voided_sales_cents,
    revenue_cents,
    cogs_cents,
    gross_profit_cents,
    gross_margin_percent,
    shrinkage_count,
    shrinkage_loss_cents,
    expenses_count,
    operating_expenses_cents,
    expenses_cash_cents,
    expenses_transfer_cents,
    total_deductions_cents,
    net_profit_cents,
    net_margin_percent,
    payment_totals: {
      cash_cents,
      transfer_card_cents,
      credit_cents,
      mixed_sales_count,
    },
  };
}
