import { formatCentsCOP } from '../utils/currency';
import { exportNetProfitStatementToCSV } from '../utils/csvExporter';
import type { NetProfitStatement } from '../utils/saleAccounting';

export interface NetProfitStatementCardProps {
  statement: NetProfitStatement;
  dateRangeDays: number;
}

export function NetProfitStatementCard({ statement, dateRangeDays }: NetProfitStatementCardProps) {
  const isPositiveNet = statement.net_profit_cents >= 0;

  return (
    <section
      aria-label="Estado de Resultados de Utilidad Neta Real"
      className="card border border-slate-200 bg-white p-4 md:p-5 space-y-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base md:text-lg font-bold text-slate-900">
              📊 Estado de Resultados — Utilidad Neta Real
            </h3>
            {statement.voided_sales_count > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                🚫 {statement.voided_sales_count}{' '}
                {statement.voided_sales_count === 1 ? 'anulada excluida' : 'anuladas excluidas'} (
                {formatCentsCOP(statement.voided_sales_cents)})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Últimos {dateRangeDays} días · {statement.active_sales_count}{' '}
            {statement.active_sales_count === 1 ? 'venta vigente' : 'ventas vigentes'} · Descuenta costo de mercancía,
            mermas y caja menor
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportNetProfitStatementToCSV(statement)}
          className="btn-secondary min-h-[44px] px-3 text-xs font-bold text-slate-800 shrink-0"
        >
          📥 Exportar Estado P&amp;G
        </button>
      </div>

      {/* 4 Tarjetas Ejecutivas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-xs font-medium text-slate-600">Ingresos Netos</p>
          <p className="mt-1 text-lg md:text-xl font-bold text-sf-primary tabular-nums">
            {formatCentsCOP(statement.revenue_cents)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {statement.active_sales_count} ventas vigentes
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-xs font-medium text-slate-600">Margen Bruto</p>
          <p className="mt-1 text-lg md:text-xl font-bold text-slate-900 tabular-nums">
            {formatCentsCOP(statement.gross_profit_cents)}
          </p>
          <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
            {statement.gross_margin_percent.toFixed(1)}% sobre ventas
          </p>
        </article>

        <article className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
          <p className="text-xs font-medium text-rose-800">Deducciones Operativas (−)</p>
          <p className="mt-1 text-lg md:text-xl font-bold text-rose-700 tabular-nums">
            -{formatCentsCOP(statement.total_deductions_cents)}
          </p>
          <p className="text-[11px] text-rose-700/80 mt-0.5">
            Mermas {formatCentsCOP(statement.shrinkage_loss_cents)} + Gastos{' '}
            {formatCentsCOP(statement.operating_expenses_cents)}
          </p>
        </article>

        <article
          className={`rounded-xl border p-3 ${
            isPositiveNet
              ? 'border-emerald-300 bg-emerald-50/80 text-emerald-950'
              : 'border-rose-300 bg-rose-50 text-rose-950'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide opacity-80">Utilidad Neta Real</p>
          <p
            className={`mt-1 text-lg md:text-xl font-black tabular-nums ${
              isPositiveNet ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {statement.net_profit_cents < 0
              ? `-${formatCentsCOP(Math.abs(statement.net_profit_cents))}`
              : formatCentsCOP(statement.net_profit_cents)}
          </p>
          <p className="text-[11px] font-semibold opacity-80 mt-0.5">
            Margen neto: {statement.net_margin_percent.toFixed(1)}%
          </p>
        </article>
      </div>

      {/* Cascada Contable Paso a Paso */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-3.5 py-2.5 text-left font-bold text-slate-700">
                Concepto Contable
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-left font-bold text-slate-600 hidden sm:table-cell">
                Soporte
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-right font-bold text-slate-700">
                Valor (COP)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr>
              <td className="px-3.5 py-2 font-medium text-slate-900">(+) Ingresos por Ventas Vigentes</td>
              <td className="px-3.5 py-2 text-slate-500 hidden sm:table-cell">
                {statement.active_sales_count} ventas activas
              </td>
              <td className="px-3.5 py-2 text-right font-semibold text-slate-900 tabular-nums">
                {formatCentsCOP(statement.revenue_cents)}
              </td>
            </tr>
            <tr>
              <td className="px-3.5 py-2 text-slate-700">(-) Costo de Mercancía Vendida (CMV)</td>
              <td className="px-3.5 py-2 text-slate-500 hidden sm:table-cell">Costo unitario histórico</td>
              <td className="px-3.5 py-2 text-right font-medium text-rose-700 tabular-nums">
                -{formatCentsCOP(statement.cogs_cents)}
              </td>
            </tr>
            <tr className="bg-slate-50/80">
              <td className="px-3.5 py-2 font-bold text-slate-900">(=) Margen Bruto Comercial</td>
              <td className="px-3.5 py-2 text-slate-600 hidden sm:table-cell">
                {statement.gross_margin_percent.toFixed(1)}%
              </td>
              <td className="px-3.5 py-2 text-right font-bold text-slate-900 tabular-nums">
                {formatCentsCOP(statement.gross_profit_cents)}
              </td>
            </tr>
            <tr>
              <td className="px-3.5 py-2 text-slate-700">(-) Mermas, Averías y Vencimientos</td>
              <td className="px-3.5 py-2 text-slate-500 hidden sm:table-cell">
                {statement.shrinkage_count} {statement.shrinkage_count === 1 ? 'registro' : 'registros'} al costo
              </td>
              <td className="px-3.5 py-2 text-right font-medium text-rose-700 tabular-nums">
                -{formatCentsCOP(statement.shrinkage_loss_cents)}
              </td>
            </tr>
            <tr>
              <td className="px-3.5 py-2 text-slate-700">(-) Gastos Operativos de Caja Menor</td>
              <td className="px-3.5 py-2 text-slate-500 hidden sm:table-cell">
                {statement.expenses_count} {statement.expenses_count === 1 ? 'egreso' : 'egresos'} (Efec:{' '}
                {formatCentsCOP(statement.expenses_cash_cents)} · Transf:{' '}
                {formatCentsCOP(statement.expenses_transfer_cents)})
              </td>
              <td className="px-3.5 py-2 text-right font-medium text-rose-700 tabular-nums">
                -{formatCentsCOP(statement.operating_expenses_cents)}
              </td>
            </tr>
            <tr className={isPositiveNet ? 'bg-emerald-50/90' : 'bg-rose-50/90'}>
              <td className="px-3.5 py-2.5 font-black text-slate-950">(=) UTILIDAD NETA REAL</td>
              <td className="px-3.5 py-2.5 font-semibold text-slate-700 hidden sm:table-cell">
                Margen neto {statement.net_margin_percent.toFixed(1)}%
              </td>
              <td
                className={`px-3.5 py-2.5 text-right font-black tabular-nums ${
                  isPositiveNet ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {statement.net_profit_cents < 0
                  ? `-${formatCentsCOP(Math.abs(statement.net_profit_cents))}`
                  : formatCentsCOP(statement.net_profit_cents)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Franja de Recaudo por Medio de Pago */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-slate-700 mr-1">Recaudo Real:</span>
        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-900 tabular-nums">
          💵 Efectivo: {formatCentsCOP(statement.payment_totals.cash_cents)}
        </span>
        <span className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-900 tabular-nums">
          📱 Transf. / Tarjeta: {formatCentsCOP(statement.payment_totals.transfer_card_cents)}
        </span>
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 tabular-nums">
          📒 Fiado: {formatCentsCOP(statement.payment_totals.credit_cents)}
        </span>
        {statement.payment_totals.mixed_sales_count > 0 && (
          <span className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 font-semibold text-purple-900">
            🔀 {statement.payment_totals.mixed_sales_count} con pago mixto
          </span>
        )}
      </div>
    </section>
  );
}

export default NetProfitStatementCard;
