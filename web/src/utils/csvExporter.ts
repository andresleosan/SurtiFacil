import { Sale } from '../firebase/db';
import { CashClosing } from '../types/cashClosing';
import { isSaleVoided, NetProfitStatement, parsePaymentBreakdown } from './saleAccounting';

/**
 * Escapa valores para formato CSV seguro contra inyección de fórmulas (DDE/CSV injection)
 * y comillas dobles.
 */
function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ');
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaChars.some((ch) => str.startsWith(ch))) {
    return `"'${str}"`;
  }
  return `"${str}"`;
}

/**
 * Dispara la descarga de un archivo CSV en el navegador con UTF-8 BOM (\uFEFF)
 * para compatibilidad nativa con Microsoft Excel en español/Windows.
 */
export function downloadCSV(csvText: string, filename: string): void {
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Exporta una lista de ventas a Excel/CSV con todas las columnas financieras.
 */
export function exportSalesToCSV(sales: Sale[], filename?: string): void {
  const headers = [
    'ID Venta',
    'Estado',
    'Fecha',
    'Hora',
    'Cajero',
    'Cliente Fiado',
    'Método de Pago',
    'Desglose Pago',
    'Artículos',
    'Total (COP)',
    'Costo Estimado (COP)',
    'Ganancia (COP)',
    'Detalle de Productos',
    'Motivo Anulación',
  ];

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    other: 'Nequi / Bancolombia',
    credit: 'Fiado',
    mixed: 'Pago Mixto',
  };

  const rows = sales.map((sale) => {
    const saleDate = sale.date instanceof Date ? sale.date : new Date((sale as any).createdAt || Date.now());
    const dateStr = saleDate.toLocaleDateString('es-CO');
    const timeStr = saleDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    const totalPesos = Math.round(sale.total / 100);
    const costPesos = Math.round((sale.total_cost_cents || 0) / 100);
    const profitPesos = totalPesos - costPesos;

    const breakdown = parsePaymentBreakdown(sale.payment_breakdown, sale.payment_method, sale.total);
    const breakdownText = breakdown
      .map((entry) => `${paymentMethodLabels[entry.method] || entry.method}: $${Math.round(entry.amount_cents / 100)}`)
      .join(' + ');

    const itemCount = (sale.items || []).reduce((acc, it) => acc + it.quantity, 0);
    const itemsDetail = (sale.items || [])
      .map((it) => `${it.quantity}x ${it.product_name} ($${Math.round(it.price_cents / 100)})`)
      .join('; ');

    return [
      sale.id,
      isSaleVoided(sale) ? 'Anulada' : 'Vigente',
      dateStr,
      timeStr,
      sale.created_by_role || 'Caja',
      sale.credit_customer_name || 'Venta directa',
      paymentMethodLabels[sale.payment_method] || sale.payment_method,
      breakdownText,
      String(itemCount),
      String(totalPesos),
      String(costPesos),
      String(profitPesos),
      itemsDetail,
      sale.void_reason || '',
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  const defaultFilename = `ventas-surtifacil-${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csvContent, filename || defaultFilename);
}

/**
 * Exporta el historial de Actas de Cierre y Arqueo de Caja a CSV.
 */
export function exportClosingsToCSV(closings: CashClosing[], filename?: string): void {
  const headers = [
    '# Cierre',
    'ID Acta',
    'Fecha Apertura',
    'Fecha Cierre',
    'Abierto Por',
    'Cajero Responsable',
    'Base Inicial (COP)',
    'Ventas Efectivo (COP)',
    'Abonos Fiados (COP)',
    'Gastos Caja Menor (COP)',
    'Sangrías Seguridad (COP)',
    'Esperado (COP)',
    'Contado Físico (COP)',
    'Diferencia (COP)',
    'Estado',
    'Ventas Contadas',
    'Notas',
  ];

  const statusLabels: Record<string, string> = {
    balanced: 'Cuadrado',
    surplus: 'Sobrante',
    shortage: 'Faltante',
  };

  const rows = closings.map((c) => {
    const openedDate = new Date(c.opened_at).toLocaleString('es-CO');
    const closedDate = new Date(c.closed_at).toLocaleString('es-CO');

    return [
      String(c.closing_number),
      c.id,
      openedDate,
      closedDate,
      c.opened_by_name || 'No registrado',
      c.closed_by_name || 'Cajero',
      String(Math.round(c.initial_cash_cents / 100)),
      String(Math.round(c.sales_cash_cents / 100)),
      String(Math.round(c.credit_payments_cash_cents / 100)),
      String(Math.round((c.expenses_cash_cents || 0) / 100)),
      String(Math.round((c.withdrawals_cash_cents || 0) / 100)),
      String(Math.round(c.expected_cash_cents / 100)),
      String(Math.round(c.counted_cash_cents / 100)),
      String(Math.round(c.difference_cents / 100)),
      statusLabels[c.status] || c.status,
      String(c.total_sales_count),
      c.notes || '',
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  const defaultFilename = `cierres-caja-surtifacil-${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csvContent, filename || defaultFilename);
}

/**
 * Exporta el Estado de Resultados de Utilidad Neta Real a CSV compatible con Excel.
 */
export function exportNetProfitStatementToCSV(
  statement: NetProfitStatement,
  filename?: string
): void {
  const rows: string[][] = [
    ['Concepto Contable', 'Detalle / Cantidad', 'Valor (COP)'],
    ['Ingresos Netos por Ventas Vigentes', `${statement.active_sales_count} ventas`, String(Math.round(statement.revenue_cents / 100))],
    ['(-) Costo de Mercancía Vendida (CMV)', 'Costo de adquisición', String(-Math.round(statement.cogs_cents / 100))],
    ['(=) Margen Bruto Comercial', `${statement.gross_margin_percent.toFixed(1)}%`, String(Math.round(statement.gross_profit_cents / 100))],
    ['(-) Mermas, Averías y Vencimientos', `${statement.shrinkage_count} bajas`, String(-Math.round(statement.shrinkage_loss_cents / 100))],
    ['(-) Gastos Operativos Caja Menor', `${statement.expenses_count} egresos`, String(-Math.round(statement.operating_expenses_cents / 100))],
    ['(=) UTILIDAD NETA REAL', `${statement.net_margin_percent.toFixed(1)}%`, String(Math.round(statement.net_profit_cents / 100))],
    ['Ventas Anuladas Excluidas', `${statement.voided_sales_count} anuladas`, String(Math.round(statement.voided_sales_cents / 100))],
  ];

  const csvContent = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  const defaultFilename = `estado-resultados-${statement.period_days}d-${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csvContent, filename || defaultFilename);
}
