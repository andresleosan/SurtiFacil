import { describe, it, expect } from 'vitest';
import {
  calculateNetProfitStatement,
  extractSalePaymentBuckets,
  isSaleVoided,
  parsePaymentBreakdown,
  resolveSalePaymentBreakdown,
} from '../utils/saleAccounting';

describe('saleAccounting — Pagos Mixtos, Anulación y Estado de Resultados', () => {
  it('resuelve un pago simple en efectivo o crédito validando cliente fiado', () => {
    const cash = resolveSalePaymentBreakdown({
      totalCents: 1500000,
      paymentMethod: 'cash',
    });
    expect(cash).toEqual({
      ok: true,
      breakdown: [{ method: 'cash', amount_cents: 1500000 }],
      is_mixed: false,
      effective_payment_method: 'cash',
      db_payment_method: 'cash',
      cash_cents: 1500000,
      card_cents: 0,
      transfer_cents: 0,
      credit_cents: 0,
    });

    const missingCustomer = resolveSalePaymentBreakdown({
      totalCents: 1500000,
      paymentMethod: 'credit',
    });
    expect(missingCustomer.ok).toBe(false);
  });

  it('valida estrictamente suma exacta, sin repetidos y db_payment_method compatible con SQLite en pagos mixtos', () => {
    const validMixed = resolveSalePaymentBreakdown({
      totalCents: 1140000,
      paymentMethod: 'mixed',
      creditCustomerId: 'cc-1',
      paymentBreakdown: [
        { method: 'cash', amount_cents: 640000 },
        { method: 'credit', amount_cents: 500000 },
      ],
    });
    expect(validMixed).toMatchObject({
      ok: true,
      is_mixed: true,
      effective_payment_method: 'mixed',
      db_payment_method: 'other',
      cash_cents: 640000,
      credit_cents: 500000,
      transfer_cents: 0,
      card_cents: 0,
    });

    const mismatch = resolveSalePaymentBreakdown({
      totalCents: 1140000,
      paymentMethod: 'mixed',
      paymentBreakdown: [
        { method: 'cash', amount_cents: 600000 },
        { method: 'other', amount_cents: 500000 },
      ],
    });
    expect(mismatch.ok).toBe(false);

    const duplicateMethod = resolveSalePaymentBreakdown({
      totalCents: 1000000,
      paymentMethod: 'mixed',
      paymentBreakdown: [
        { method: 'cash', amount_cents: 500000 },
        { method: 'cash', amount_cents: 500000 },
      ],
    });
    expect(duplicateMethod.ok).toBe(false);

    const singleChannelMarkedMixed = resolveSalePaymentBreakdown({
      totalCents: 1000000,
      paymentMethod: 'mixed',
      paymentBreakdown: [{ method: 'cash', amount_cents: 1000000 }],
    });
    expect(singleChannelMarkedMixed.ok).toBe(false);

    const missingCreditClient = resolveSalePaymentBreakdown({
      totalCents: 1000000,
      paymentMethod: 'mixed',
      paymentBreakdown: [
        { method: 'cash', amount_cents: 500000 },
        { method: 'credit', amount_cents: 500000 },
      ],
    });
    expect(missingCreditClient.ok).toBe(false);
  });

  it('parsea desgloses legados o JSON y pone buckets en 0 cuando la venta está anulada', () => {
    const legacy = parsePaymentBreakdown(null, 'other', 850000);
    expect(legacy).toEqual([{ method: 'other', amount_cents: 850000 }]);

    const mixedBuckets = extractSalePaymentBuckets({
      payment_method: 'other',
      payment_breakdown_json: JSON.stringify([
        { method: 'cash', amount_cents: 400000 },
        { method: 'other', amount_cents: 450000 },
      ]),
      total_cents: 850000,
      status: 'completed',
    });
    expect(mixedBuckets.is_mixed).toBe(true);
    expect(mixedBuckets.cash_cents).toBe(400000);
    expect(mixedBuckets.transfer_cents).toBe(450000);

    const voidedBuckets = extractSalePaymentBuckets({
      payment_method: 'cash',
      total_cents: 850000,
      status: 'voided',
    });
    expect(isSaleVoided({ status: 'voided' })).toBe(true);
    expect(voidedBuckets).toEqual({
      cash_cents: 0,
      card_cents: 0,
      transfer_cents: 0,
      credit_cents: 0,
      is_mixed: false,
      breakdown: [],
    });
  });

  it('calcula el Estado de Resultados descontando CMV, mermas y gastos de caja menor y excluyendo ventas anuladas', () => {
    const now = new Date('2026-11-24T12:00:00Z');
    const statement = calculateNetProfitStatement({
      days: 7,
      now,
      sales: [
        {
          id: 's-1',
          created_at: '2026-11-24T10:00:00Z',
          total_cents: 2000000, // $20.000
          status: 'completed',
          payment_method: 'mixed',
          payment_breakdown: [
            { method: 'cash', amount_cents: 1200000 },
            { method: 'credit', amount_cents: 800000 },
          ],
          items: [
            {
              product_id: 'p1',
              product_name: 'Arroz',
              quantity: 2,
              price_cents: 1000000,
              subtotal: 2000000,
              unit_cost_cents: 650000,
            },
          ],
        },
        {
          id: 's-void',
          created_at: '2026-11-24T09:00:00Z',
          total_cents: 5000000,
          status: 'voided',
          payment_method: 'cash',
          items: [
            { product_id: 'p2', product_name: 'Queso', quantity: 5, price_cents: 1000000, unit_cost_cents: 700000 },
          ],
        },
        {
          id: 's-old',
          created_at: '2026-10-01T09:00:00Z',
          total_cents: 9000000,
          status: 'completed',
          payment_method: 'cash',
          items: [],
        },
      ],
      shrinkageEntries: [
        { created_at: '2026-11-23T15:00:00Z', total_cost_loss_cents: 250000 }, // $2.500
      ],
      cashExpenses: [
        { created_at: '2026-11-24T08:00:00Z', amount_cents: 150000, payment_method: 'cash' }, // $1.500
        { created_at: '2026-11-24T11:00:00Z', amount_cents: 100000, payment_method: 'transfer' }, // $1.000
      ],
    });

    expect(statement.active_sales_count).toBe(1);
    expect(statement.voided_sales_count).toBe(1);
    expect(statement.voided_sales_cents).toBe(5000000);
    expect(statement.revenue_cents).toBe(2000000);
    expect(statement.cogs_cents).toBe(1300000);
    expect(statement.gross_profit_cents).toBe(700000); // $7.000
    expect(statement.shrinkage_loss_cents).toBe(250000); // $2.500
    expect(statement.operating_expenses_cents).toBe(250000); // $2.500
    expect(statement.expenses_cash_cents).toBe(150000);
    expect(statement.expenses_transfer_cents).toBe(100000);
    expect(statement.total_deductions_cents).toBe(500000); // $5.000
    expect(statement.net_profit_cents).toBe(200000); // $2.000
    expect(statement.gross_margin_percent).toBe(35);
    expect(statement.net_margin_percent).toBe(10);
    expect(statement.payment_totals).toEqual({
      cash_cents: 1200000,
      transfer_card_cents: 0,
      credit_cents: 800000,
      mixed_sales_count: 1,
    });
  });
});
