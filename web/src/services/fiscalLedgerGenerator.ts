/**
 * Generador del Libro Fiscal de Registro de Operaciones Diarias (DIAN Colombia)
 * Diseñado conforme al Artículo 616-1 del Estatuto Tributario para comerciantes
 * minoristas, tiendas de barrio y micronegocios no obligados a expedir factura electrónica
 * o pertenecientes al régimen no responsable de IVA / Régimen Simple.
 */

import type { Sale } from '../firebase/db';
import { formatCOP } from '../utils/currency';

export interface DailyFiscalEntry {
  date: string; // YYYY-MM-DD
  formattedDate: string; // DD/MM/YYYY
  receiptsCount: number;
  cashSalesCents: number;
  transferSalesCents: number;
  creditSalesCents: number;
  totalSalesCents: number;
}

export interface FiscalLedgerSummary {
  storeName: string;
  storeNit?: string;
  storeAddress: string;
  storeNeighborhood: string;
  periodStart: string;
  periodEnd: string;
  entries: DailyFiscalEntry[];
  totalCashSalesCents: number;
  totalTransferSalesCents: number;
  totalCreditSalesCents: number;
  grandTotalCents: number;
  totalReceipts: number;
}

/**
 * Agrupa una lista de ventas en entradas del Libro Fiscal Diario
 */
export function buildFiscalLedger(
  sales: Sale[],
  storeInfo: {
    nombre?: string;
    nit?: string;
    direccion?: string;
    barrio?: string;
  }
): FiscalLedgerSummary {
  const dayMap = new Map<string, DailyFiscalEntry>();

  for (const sale of sales) {
    const saleDate = sale.date instanceof Date ? sale.date : new Date(sale.date);
    const yyyy = saleDate.getFullYear();
    const mm = String(saleDate.getMonth() + 1).padStart(2, '0');
    const dd = String(saleDate.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    const formattedDate = `${dd}/${mm}/${yyyy}`;

    let entry = dayMap.get(key);
    if (!entry) {
      entry = {
        date: key,
        formattedDate,
        receiptsCount: 0,
        cashSalesCents: 0,
        transferSalesCents: 0,
        creditSalesCents: 0,
        totalSalesCents: 0,
      };
      dayMap.set(key, entry);
    }

    const totalCents = Number(sale.total) || 0;
    entry.receiptsCount += 1;
    entry.totalSalesCents += totalCents;

    if (sale.payment_method === 'cash') {
      entry.cashSalesCents += totalCents;
    } else if (sale.payment_method === 'credit') {
      entry.creditSalesCents += totalCents;
    } else {
      // 'card' o 'other' (Nequi, Daviplata, Bancolombia)
      entry.transferSalesCents += totalCents;
    }
  }

  // Ordenar cronológicamente
  const sortedEntries = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const totalCashSalesCents = sortedEntries.reduce((acc, e) => acc + e.cashSalesCents, 0);
  const totalTransferSalesCents = sortedEntries.reduce((acc, e) => acc + e.transferSalesCents, 0);
  const totalCreditSalesCents = sortedEntries.reduce((acc, e) => acc + e.creditSalesCents, 0);
  const grandTotalCents = sortedEntries.reduce((acc, e) => acc + e.totalSalesCents, 0);
  const totalReceipts = sortedEntries.reduce((acc, e) => acc + e.receiptsCount, 0);

  const periodStart = sortedEntries.length > 0 ? sortedEntries[0].formattedDate : 'N/A';
  const periodEnd = sortedEntries.length > 0 ? sortedEntries[sortedEntries.length - 1].formattedDate : 'N/A';

  return {
    storeName: storeInfo.nombre || 'SurtiFácil Abastos Central',
    storeNit: storeInfo.nit || 'Régimen No Responsable de IVA',
    storeAddress: storeInfo.direccion || 'Medellín, Antioquia',
    storeNeighborhood: storeInfo.barrio || 'Medellín',
    periodStart,
    periodEnd,
    entries: sortedEntries,
    totalCashSalesCents,
    totalTransferSalesCents,
    totalCreditSalesCents,
    grandTotalCents,
    totalReceipts,
  };
}

/**
 * Genera el archivo CSV con BOM UTF-8 para apertura inmediata en Microsoft Excel
 */
export function generateFiscalLedgerCSV(summary: FiscalLedgerSummary): string {
  const lines: string[] = [];

  // Encabezado institucional
  lines.push(`"LIBRO FISCAL DE REGISTRO DE OPERACIONES DIARIAS"`);
  lines.push(`"Conforme al Art. 616-1 del Estatuto Tributario - DIAN Colombia"`);
  lines.push(`"Establecimiento:";"${summary.storeName}"`);
  lines.push(`"Identificación / NIT:";"${summary.storeNit}"`);
  lines.push(`"Ubicación:";"${summary.storeAddress} - ${summary.storeNeighborhood}"`);
  lines.push(`"Período auditado:";"${summary.periodStart} al ${summary.periodEnd}"`);
  lines.push(`"Fecha de Emisión:";"${new Date().toLocaleDateString('es-CO')}"`);
  lines.push(``);

  // Columnas contables estándar
  lines.push(
    `"Fecha";"No. Comprobantes";"Ventas Efectivo (COP)";"Ventas Transferencia/Tarjeta (COP)";"Ventas Fiadas/Crédito (COP)";"Total Ingresos Diarios (COP)"`
  );

  for (const entry of summary.entries) {
    const cashStr = Math.round(entry.cashSalesCents / 100);
    const transferStr = Math.round(entry.transferSalesCents / 100);
    const creditStr = Math.round(entry.creditSalesCents / 100);
    const totalStr = Math.round(entry.totalSalesCents / 100);

    lines.push(
      `"${entry.formattedDate}";${entry.receiptsCount};${cashStr};${transferStr};${creditStr};${totalStr}`
    );
  }

  // Totales
  lines.push(``);
  lines.push(
    `"TOTAL CONSOLIDADO:";${summary.totalReceipts};${Math.round(summary.totalCashSalesCents / 100)};${Math.round(
      summary.totalTransferSalesCents / 100
    )};${Math.round(summary.totalCreditSalesCents / 100)};${Math.round(summary.grandTotalCents / 100)}`
  );

  lines.push(``);
  lines.push(`"Firma Responsable:";"__________________________________"`);

  // BOM UTF-8 para Excel
  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Descarga automática del archivo CSV en el navegador
 */
export function downloadFiscalLedgerCSV(summary: FiscalLedgerSummary, fileNamePrefix = 'Libro_Fiscal_DIAN'): void {
  const csvContent = generateFiscalLedgerCSV(summary);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeDate = summary.periodStart.replace(/\//g, '-');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileNamePrefix}_${safeDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
