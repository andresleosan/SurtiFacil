import { useMemo, useState } from 'react';
import type { Sale } from '../firebase/db';
import { Modal } from './ui/Modal';
import { Icon } from './ui/Icon';
import { formatCOP } from '../utils/currency';
import { buildFiscalLedger, downloadFiscalLedgerCSV } from '../services/fiscalLedgerGenerator';

interface FiscalLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  storeName?: string;
  storeAddress?: string;
  storeNeighborhood?: string;
}

export default function FiscalLedgerModal({
  isOpen,
  onClose,
  sales,
  storeName,
  storeAddress,
  storeNeighborhood,
}: FiscalLedgerModalProps) {
  const [filterDays, setFilterDays] = useState<number>(30);

  const filteredSales = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filterDays);
    return sales.filter((s) => {
      const d = s.date instanceof Date ? s.date : new Date(s.date);
      return d >= cutoff;
    });
  }, [sales, filterDays]);

  const ledgerSummary = useMemo(() => {
    return buildFiscalLedger(filteredSales, {
      nombre: storeName,
      direccion: storeAddress,
      barrio: storeNeighborhood,
    });
  }, [filteredSales, storeName, storeAddress, storeNeighborhood]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    downloadFiscalLedgerCSV(ledgerSummary);
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Libro Fiscal de Operaciones Diarias (DIAN)">
      <div className="space-y-4 text-sf-text">
        {/* Cabecera Legal y Filtro */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <span>🏛️ Registro DIAN (Art. 616-1 E.T.)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Obligatorio para comerciantes y tiendas de barrio no responsables de IVA en Colombia.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="fiscal-period-select" className="text-xs font-semibold text-slate-600">
              Período:
            </label>
            <select
              id="fiscal-period-select"
              value={filterDays}
              onChange={(e) => setFilterDays(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs focus:border-sf-primary focus:outline-none"
            >
              <option value={7}>Últimos 7 días</option>
              <option value={15}>Última quincena (15 días)</option>
              <option value={30}>Último mes (30 días)</option>
              <option value={60}>Últimos 60 días</option>
              <option value={365}>Todo el año</option>
            </select>
          </div>
        </div>

        {/* Ficha del Establecimiento */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Establecimiento</span>
            <span className="font-bold text-slate-800">{ledgerSummary.storeName}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Régimen Tributario</span>
            <span className="font-semibold text-emerald-700">No Responsable de IVA (Art. 437 E.T.)</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Ubicación</span>
            <span className="text-slate-700">
              {ledgerSummary.storeAddress} · {ledgerSummary.storeNeighborhood}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Rango de Fechas</span>
            <span className="text-slate-700 font-medium">
              {ledgerSummary.periodStart} al {ledgerSummary.periodEnd} ({ledgerSummary.totalReceipts} ventas)
            </span>
          </div>
        </div>

        {/* Tabla del Libro Fiscal */}
        <div className="max-h-[340px] overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-[11px] font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5 text-center">Ventas</th>
                <th className="px-3 py-2.5 text-right">Efectivo</th>
                <th className="px-3 py-2.5 text-right">Transferencia</th>
                <th className="px-3 py-2.5 text-right">Fiado</th>
                <th className="px-3 py-2.5 text-right bg-slate-200/60">Total Diario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {ledgerSummary.entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 font-sans">
                    No hay ventas registradas en este período.
                  </td>
                </tr>
              ) : (
                ledgerSummary.entries.map((entry) => (
                  <tr key={entry.date} className="hover:bg-slate-50 transition">
                    <td className="px-3 py-2 font-sans font-medium text-slate-800">{entry.formattedDate}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{entry.receiptsCount}</td>
                    <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                      {formatCOP(Math.round(entry.cashSalesCents / 100))}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                      {formatCOP(Math.round(entry.transferSalesCents / 100))}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-700 tabular-nums">
                      {formatCOP(Math.round(entry.creditSalesCents / 100))}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900 bg-slate-50/60 tabular-nums">
                      {formatCOP(Math.round(entry.totalSalesCents / 100))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
              <tr>
                <td className="px-3 py-2.5 font-sans">TOTALES CONSOLIDADOS:</td>
                <td className="px-3 py-2.5 text-center">{ledgerSummary.totalReceipts}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                  {formatCOP(Math.round(ledgerSummary.totalCashSalesCents / 100))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                  {formatCOP(Math.round(ledgerSummary.totalTransferSalesCents / 100))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-amber-800">
                  {formatCOP(Math.round(ledgerSummary.totalCreditSalesCents / 100))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-800 bg-emerald-50">
                  {formatCOP(Math.round(ledgerSummary.grandTotalCents / 100))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-slate-400">
            Documento válido como soporte tributario físico ante visitas de la DIAN.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownload}
              className="btn-success min-h-[44px] flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-bold shadow-2xs"
            >
              <Icon name="download" size={16} />
              <span>Exportar Excel CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="btn-secondary min-h-[44px] flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-bold text-slate-700 shadow-2xs"
            >
              <Icon name="receipt" size={16} />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="btn-primary min-h-[44px] px-4 text-xs font-bold"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
