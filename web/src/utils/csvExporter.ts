import { Sale } from '../firebase/db';
import { CashClosing } from '../types/cashClosing';

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
    'Fecha',
    'Hora',
    'Cajero',
    'Cliente Fiado',
    'Método de Pago',
    'Artículos',
    'Total (COP)',
    'Costo Estimado (COP)',
    'Ganancia (COP)',
    'Detalle de Productos',
  ];

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    other: 'Nequi / Bancolombia',
    credit: 'Fiado',
  };

  const rows = sales.map((sale) => {
    const saleDate = sale.date instanceof Date ? sale.date : new Date((sale as any).createdAt || Date.now());
    const dateStr = saleDate.toLocaleDateString('es-CO');
    const timeStr = saleDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    const totalPesos = Math.round(sale.total / 100);
    const costPesos = Math.round((sale.total_cost_cents || 0) / 100);
    const profitPesos = totalPesos - costPesos;

    const itemCount = (sale.items || []).reduce((acc, it) => acc + it.quantity, 0);
    const itemsDetail = (sale.items || [])
      .map((it) => `${it.quantity}x ${it.product_name} ($${Math.round(it.price_cents / 100)})`)
      .join('; ');

    return [
      sale.id,
      dateStr,
      timeStr,
      sale.created_by_role || 'Caja',
      sale.credit_customer_name || 'Venta directa',
      paymentMethodLabels[sale.payment_method] || sale.payment_method,
      String(itemCount),
      String(totalPesos),
      String(costPesos),
      String(profitPesos),
      itemsDetail,
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
    'Cajero Responsable',
    'Base Inicial (COP)',
    'Ventas Efectivo (COP)',
    'Abonos Fiados (COP)',
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
      c.closed_by_name || 'Cajero',
      String(Math.round(c.initial_cash_cents / 100)),
      String(Math.round(c.sales_cash_cents / 100)),
      String(Math.round(c.credit_payments_cash_cents / 100)),
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
