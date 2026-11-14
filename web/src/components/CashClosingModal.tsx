import React, { useEffect, useMemo, useState } from 'react';
import {
  CashClosing,
  CashShiftSummary,
  COLOMBIAN_BILLS,
  COLOMBIAN_COINS,
} from '../types/cashClosing';
import {
  calculateCountedCents,
  getCashShiftSummary,
  recordCashClosing,
} from '../services/cashClosingService';
import { getStoreSettings } from '../services/settingsService';
import { formatCentsCOP, formatCOP, parseCOP } from '../utils/currency';
import { exportClosingsToCSV } from '../utils/csvExporter';
import { generateCashClosingWhatsAppText } from '../utils/receiptGenerator';
import { StoreSettings } from '../types/storeSettings';
import { Modal } from './ui/Modal';
import { Icon } from './ui/Icon';
import ThermalReceiptModal from './ThermalReceiptModal';
import PettyCashModal from './PettyCashModal';

interface CashClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClosedSuccess?: (closing: CashClosing) => void;
}

export function CashClosingModal({ isOpen, onClose, onClosedSuccess }: CashClosingModalProps) {
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Base inicial en pesos
  const [initialBasePesos, setInitialBasePesos] = useState('100000'); // $ 100.000 COP por defecto
  const [shiftSummary, setShiftSummary] = useState<CashShiftSummary | null>(null);
  const [storeSettings, setStoreSettings] = useState<Partial<StoreSettings>>({});

  // Conteo de billetes y monedas
  const [billsCount, setBillsCount] = useState<Record<string, number>>({});
  const [coinsCount, setCoinsCount] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  // Resultado tras guardar el acta
  const [savedClosing, setSavedClosing] = useState<CashClosing | null>(null);
  const [thermalModalOpen, setThermalModalOpen] = useState(false);
  const [pettyCashModalOpen, setPettyCashModalOpen] = useState(false);

  const loadShiftSummary = (basePesosStr = initialBasePesos) => {
    const baseCents = parseCOP(basePesosStr) * 100;
    setLoadingSummary(true);
    void Promise.all([
      getCashShiftSummary(baseCents),
      getStoreSettings(),
    ])
      .then(([summary, settings]) => {
        setShiftSummary(summary);
        setStoreSettings(settings);
      })
      .catch((err) => {
        console.error('Error cargando turno de caja:', err);
        setError('No se pudo cargar el resumen de ventas del turno.');
      })
      .finally(() => {
        setLoadingSummary(false);
      });
  };

  // Cargar resumen de turno al abrir
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSavedClosing(null);
      setBillsCount({});
      setCoinsCount({});
      setNotes('');
      loadShiftSummary(initialBasePesos);
    }
  }, [isOpen]);

  // Recalcular resumen si el usuario cambia la base inicial
  const handleBaseChange = (value: string) => {
    setInitialBasePesos(value);
    const baseCents = parseCOP(value) * 100;
    if (shiftSummary) {
      setShiftSummary({
        ...shiftSummary,
        initial_cash_cents: baseCents,
        expected_cash_cents:
          baseCents +
          shiftSummary.sales_cash_cents +
          shiftSummary.credit_payments_cash_cents -
          (shiftSummary.expenses_cash_cents || 0),
      });
    }
  };

  // Manejo de conteo de billetes
  const updateBillCount = (billId: string, delta: number) => {
    setBillsCount((prev) => {
      const current = prev[billId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [billId]: next };
    });
  };

  const setBillDirectCount = (billId: string, val: string) => {
    const parsed = Math.max(0, parseInt(val.replace(/\D/g, ''), 10) || 0);
    setBillsCount((prev) => ({ ...prev, [billId]: parsed }));
  };

  // Manejo de conteo de monedas
  const updateCoinCount = (coinId: string, delta: number) => {
    setCoinsCount((prev) => {
      const current = prev[coinId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [coinId]: next };
    });
  };

  const setCoinDirectCount = (coinId: string, val: string) => {
    const parsed = Math.max(0, parseInt(val.replace(/\D/g, ''), 10) || 0);
    setCoinsCount((prev) => ({ ...prev, [coinId]: parsed }));
  };

  // Cálculos reactivos de efectivo contado vs esperado
  const countedCashCents = useMemo(() => {
    return calculateCountedCents({ bills: billsCount, coins: coinsCount });
  }, [billsCount, coinsCount]);

  const expectedCashCents = shiftSummary?.expected_cash_cents || 0;
  const differenceCents = countedCashCents - expectedCashCents;

  const status = differenceCents === 0 ? 'balanced' : differenceCents > 0 ? 'surplus' : 'shortage';

  // Guardar acta de cierre
  const handleSaveClosing = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const baseCents = parseCOP(initialBasePesos) * 100;
      const created = await recordCashClosing({
        initial_cash_cents: baseCents,
        breakdown: { bills: billsCount, coins: coinsCount },
        notes: notes.trim(),
      });
      setSavedClosing(created);
      if (onClosedSuccess) {
        onClosedSuccess(created);
      }
    } catch (err: unknown) {
      console.error('Error guardando acta de cierre:', err);
      setError(err instanceof Error && err.message ? err.message : 'Error al registrar el cierre de caja.');
    } finally {
      setSubmitting(false);
    }
  };

  // Enviar reporte por WhatsApp
  const handleShareWhatsApp = () => {
    if (!savedClosing) return;
    const text = generateCashClosingWhatsAppText(savedClosing, storeSettings);
    const encoded = encodeURIComponent(text);
    const storePhone = storeSettings.telefono_whatsapp ? storeSettings.telefono_whatsapp.replace(/\D/g, '') : '';
    const url = storePhone ? `https://wa.me/${storePhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleExportCSV = () => {
    if (!savedClosing) return;
    exportClosingsToCSV([savedClosing]);
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        open={isOpen}
        onClose={onClose}
        title={savedClosing ? `✅ Acta de Cierre #${savedClosing.closing_number}` : 'Arqueo y Cierre de Caja (COP)'}
        size="lg"
        footer={
          savedClosing ? (
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <button
                type="button"
                onClick={handleExportCSV}
                className="btn-secondary min-h-[44px] px-3 text-xs"
              >
                📥 Exportar CSV
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="btn-success min-h-[44px] px-3 text-xs"
                >
                  📲 Enviar WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setThermalModalOpen(true)}
                  className="btn-primary min-h-[44px] px-3 text-xs"
                >
                  🖨️ Imprimir Tirilla
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn min-h-[44px] bg-slate-800 text-white hover:bg-slate-900 px-4 text-xs font-semibold"
                >
                  Listo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveClosing}
                disabled={submitting || loadingSummary}
                className="btn-success px-6 font-bold"
              >
                {submitting ? 'Guardando Acta...' : '🔒 Cerrar Caja y Generar Acta'}
              </button>
            </div>
          )
        }
      >
        {savedClosing ? (
          /* =========================================================================
             Vista de Éxito / Acta Generada Inmutable
             ========================================================================= */
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 text-emerald-950">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white text-2xl shadow">
                  ✅
                </span>
                <div>
                  <h3 className="text-base font-bold text-emerald-900">
                    Cierre de Caja Guardado con Éxito
                  </h3>
                  <p className="text-xs text-emerald-800">
                    Acta oficial inmutable registrada en Cloudflare D1. El turno ha quedado archivado.
                  </p>
                </div>
              </div>
            </div>

            {/* Resumen del Acta */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card p-3 bg-white">
                <p className="text-xs text-slate-500">Base Inicial</p>
                <p className="text-base font-bold text-slate-800 tabular-nums">
                  {formatCentsCOP(savedClosing.initial_cash_cents)}
                </p>
              </div>
              <div className="card p-3 bg-white">
                <p className="text-xs text-slate-500">Ventas en Efectivo</p>
                <p className="text-base font-bold text-emerald-700 tabular-nums">
                  {formatCentsCOP(savedClosing.sales_cash_cents)}
                </p>
              </div>
              <div className="card p-3 bg-white">
                <p className="text-xs text-slate-500">Efectivo Contado</p>
                <p className="text-base font-bold text-sf-primary tabular-nums">
                  {formatCentsCOP(savedClosing.counted_cash_cents)}
                </p>
              </div>
              <div className="card p-3 bg-white">
                <p className="text-xs text-slate-500">Diferencia</p>
                <p
                  className={`text-base font-black tabular-nums ${
                    savedClosing.status === 'balanced'
                      ? 'text-emerald-700'
                      : savedClosing.status === 'surplus'
                      ? 'text-blue-700'
                      : 'text-red-700'
                  }`}
                >
                  {savedClosing.difference_cents === 0
                    ? '$ 0 (Cuadrado)'
                    : savedClosing.difference_cents > 0
                    ? `+${formatCentsCOP(savedClosing.difference_cents)}`
                    : `-${formatCentsCOP(Math.abs(savedClosing.difference_cents))}`}
                </p>
              </div>
            </div>

            {(savedClosing.expenses_cash_cents || 0) > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900 flex items-center justify-between">
                <span className="font-semibold">💸 Salidas de Caja Menor descontadas del esperado:</span>
                <span className="font-black tabular-nums">-{formatCentsCOP(savedClosing.expenses_cash_cents || 0)}</span>
              </div>
            )}

            {savedClosing.notes && (
              <div className="card p-3 bg-slate-50 text-xs text-slate-700">
                <strong className="block text-slate-900 mb-0.5">Observaciones:</strong>
                {savedClosing.notes}
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             Formulario Interactivo de Arqueo Físico COP
             ========================================================================= */
          <div className="space-y-4">
            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Tarjeta de Resumen Financiero del Turno */}
            <div className="card p-4 bg-gradient-to-r from-slate-900 to-sf-dark text-white border-none shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>⚡ Resumen del Turno Actual</span>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 border border-emerald-500/30 font-semibold">
                      En Curso
                    </span>
                  </h4>
                  <p className="text-xs text-slate-300">
                    Apertura: {shiftSummary ? new Date(shiftSummary.opened_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Hoy'}
                  </p>
                </div>

                {/* Base inicial editable y acceso a Caja Menor */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPettyCashModalOpen(true)}
                    className="min-h-[44px] rounded-xl border border-rose-400/50 bg-rose-500/20 px-3 text-xs font-bold text-rose-200 transition hover:bg-rose-500/30"
                  >
                    💸 Registrar Gasto
                  </button>
                  <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                    <label htmlFor="base-cash" className="text-xs text-slate-300 font-medium">
                      Base Inicial ($):
                    </label>
                    <input
                      id="base-cash"
                      type="text"
                      inputMode="numeric"
                      value={initialBasePesos}
                      onChange={(e) => handleBaseChange(e.target.value)}
                      className="w-24 bg-slate-900 text-right text-xs font-bold text-emerald-400 px-2 py-1 rounded border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sf-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Métricas clave */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
                <div className="bg-slate-800/60 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Base Caja</span>
                  <span className="text-sm font-bold text-white tabular-nums">
                    {formatCOP(parseCOP(initialBasePesos))}
                  </span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Ventas Efectivo ({shiftSummary?.sales_cash_count || 0})</span>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">
                    {formatCentsCOP(shiftSummary?.sales_cash_cents || 0)}
                  </span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Abonos Fiado ({shiftSummary?.credit_payments_cash_count || 0})</span>
                  <span className="text-sm font-bold text-teal-300 tabular-nums">
                    {formatCentsCOP(shiftSummary?.credit_payments_cash_cents || 0)}
                  </span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Gastos Caja Menor ({shiftSummary?.expenses_cash_count || 0})</span>
                  <span className="text-sm font-bold text-rose-400 tabular-nums">
                    -{formatCentsCOP(shiftSummary?.expenses_cash_cents || 0)}
                  </span>
                </div>
                <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700 col-span-2 sm:col-span-1">
                  <span className="text-slate-300 font-semibold block">Total Esperado</span>
                  <span className="text-base font-black text-amber-300 tabular-nums">
                    {formatCentsCOP(expectedCashCents)}
                  </span>
                </div>
              </div>
            </div>

            {/* Barra Comparadora en Tiempo Real */}
            <div
              className={`rounded-2xl border p-4 shadow-sm transition-all ${
                status === 'balanced'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : status === 'surplus'
                  ? 'bg-blue-50 border-blue-300 text-blue-950'
                  : 'bg-red-50 border-red-300 text-red-950'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs uppercase tracking-wide font-bold opacity-80">
                    Efectivo Físico Contado vs Esperado
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-black tabular-nums">
                      {formatCentsCOP(countedCashCents)}
                    </span>
                    <span className="text-xs opacity-70">
                      de {formatCentsCOP(expectedCashCents)} esperados
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5 ${
                      status === 'balanced'
                        ? 'bg-emerald-600 text-white'
                        : status === 'surplus'
                        ? 'bg-blue-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    <span>
                      {status === 'balanced' ? '✅ Cuadrado ($ 0)' : status === 'surplus' ? '🔵 Sobrante' : '⚠️ Faltante'}
                    </span>
                    {differenceCents !== 0 && (
                      <span className="font-mono">
                        {status === 'surplus' ? `+${formatCentsCOP(differenceCents)}` : `-${formatCentsCOP(Math.abs(differenceCents))}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Billetes Colombianos (6) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span>💵 Billetes de Colombia</span>
                <span className="text-[11px] font-normal text-slate-500">
                  (Toca + / - o escribe la cantidad de cada denominación)
                </span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {COLOMBIAN_BILLS.map((bill) => {
                  const count = billsCount[bill.id] || 0;
                  const subtotalCents = bill.valueCents * count;
                  return (
                    <div
                      key={bill.id}
                      className={`card p-2.5 flex items-center justify-between gap-2 border transition ${
                        count > 0 ? 'border-sf-primary bg-sf-light/50 shadow-sm' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <span>{bill.emoji}</span>
                          <span>{bill.label}</span>
                        </span>
                        <span className="text-[11px] font-semibold text-sf-primary block tabular-nums">
                          {formatCentsCOP(subtotalCents)}
                        </span>
                      </div>

                      {/* Controles táctiles >= 44px */}
                      <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-xs">
                        <button
                          type="button"
                          onClick={() => updateBillCount(bill.id, -1)}
                          aria-label={`Restar billete de ${bill.label}`}
                          className="icon-btn h-11 w-11 text-slate-700 hover:bg-slate-100 active:scale-95"
                        >
                          <Icon name="minus" size={16} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={count === 0 ? '' : count}
                          placeholder="0"
                          onChange={(e) => setBillDirectCount(bill.id, e.target.value)}
                          aria-label={`Cantidad de billetes de ${bill.label}`}
                          className="w-12 text-center text-xs font-bold text-slate-900 border-none p-0 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateBillCount(bill.id, 1)}
                          aria-label={`Sumar billete de ${bill.label}`}
                          className="icon-btn h-11 w-11 text-slate-700 hover:bg-slate-100 active:scale-95"
                        >
                          <Icon name="plus" size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Monedas Colombianas (5) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span>🪙 Monedas de Colombia</span>
                <span className="text-[11px] font-normal text-slate-500">
                  (Conteo físico de monedas en caja)
                </span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {COLOMBIAN_COINS.map((coin) => {
                  const count = coinsCount[coin.id] || 0;
                  const subtotalCents = coin.valueCents * count;
                  return (
                    <div
                      key={coin.id}
                      className={`card p-2.5 flex items-center justify-between gap-2 border transition ${
                        count > 0 ? 'border-sf-primary bg-sf-light/50 shadow-sm' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <span>{coin.emoji}</span>
                          <span>{coin.label}</span>
                        </span>
                        <span className="text-[11px] font-semibold text-sf-primary block tabular-nums">
                          {formatCentsCOP(subtotalCents)}
                        </span>
                      </div>

                      <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-xs">
                        <button
                          type="button"
                          onClick={() => updateCoinCount(coin.id, -1)}
                          aria-label={`Restar moneda de ${coin.label}`}
                          className="icon-btn h-11 w-11 text-slate-700 hover:bg-slate-100 active:scale-95"
                        >
                          <Icon name="minus" size={16} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={count === 0 ? '' : count}
                          placeholder="0"
                          onChange={(e) => setCoinDirectCount(coin.id, e.target.value)}
                          aria-label={`Cantidad de monedas de ${coin.label}`}
                          className="w-12 text-center text-xs font-bold text-slate-900 border-none p-0 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateCoinCount(coin.id, 1)}
                          aria-label={`Sumar moneda de ${coin.label}`}
                          className="icon-btn h-11 w-11 text-slate-700 hover:bg-slate-100 active:scale-95"
                        >
                          <Icon name="plus" size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Observaciones o notas */}
            <div>
              <label htmlFor="closing-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                Observaciones del Cierre (Opcional):
              </label>
              <textarea
                id="closing-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Turno de la tarde cuadrado. Se cancelaron $20.000 de proveedor en efectivo..."
                className="input text-xs min-h-[60px] py-2"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Tirilla Térmica cuando se imprime el Acta */}
      {savedClosing && (
        <ThermalReceiptModal
          isOpen={thermalModalOpen}
          onClose={() => setThermalModalOpen(false)}
          closing={savedClosing}
        />
      )}

      {/* Modal de Caja Menor / Gastos del Turno */}
      <PettyCashModal
        isOpen={pettyCashModalOpen}
        onClose={() => setPettyCashModalOpen(false)}
        onExpenseChanged={() => loadShiftSummary(initialBasePesos)}
      />
    </>
  );
}

export default CashClosingModal;
