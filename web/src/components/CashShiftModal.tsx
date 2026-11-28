import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHasRole } from '../auth/CurrentUserContext';
import {
  deleteCashWithdrawal,
  getActiveCashShift,
  getCashShifts,
  openCashShift,
  recordCashWithdrawal,
} from '../services/cashShiftService';
import {
  ActiveCashShiftResponse,
  CashShift,
  CashShiftLabel,
  CashWithdrawalDestination,
  SHIFT_LABELS,
  WITHDRAWAL_DESTINATIONS,
} from '../types/cashClosing';
import {
  getShiftLabelMeta,
  getWithdrawalDestinationMeta,
  QUICK_SHIFT_BASE_PRESETS,
  QUICK_WITHDRAWAL_PRESETS,
  shouldAlertHighCashDrawer,
} from '../utils/cashShiftAccounting';
import { formatCentsCOP, formatCOP, parseCOP } from '../utils/currency';
import { Modal } from './ui/Modal';

export type CashShiftModalTab = 'shift' | 'withdrawals' | 'history';

interface CashShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: CashShiftModalTab;
  onShiftChanged?: () => void;
  onRequestCloseShift?: () => void;
}

export function CashShiftModal({
  isOpen,
  onClose,
  initialTab = 'shift',
  onShiftChanged,
  onRequestCloseShift,
}: CashShiftModalProps) {
  const canDeleteWithdrawal = useHasRole(['admin', 'manager']);
  const [activeTab, setActiveTab] = useState<CashShiftModalTab>(initialTab);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<ActiveCashShiftResponse | null>(null);
  const [historyShifts, setHistoryShifts] = useState<CashShift[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Formulario de apertura de turno
  const [shiftLabel, setShiftLabel] = useState<CashShiftLabel>('completo');
  const [initialBasePesos, setInitialBasePesos] = useState('100000');
  const [openingNotes, setOpeningNotes] = useState('');
  const [openingSubmitting, setOpeningSubmitting] = useState(false);

  // Formulario de sangría (retiro de seguridad)
  const [destination, setDestination] = useState<CashWithdrawalDestination>('caja_fuerte');
  const [withdrawalAmountPesos, setWithdrawalAmountPesos] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);

  // Feedback y borrado en 2 toques
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadShiftState = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getActiveCashShift();
      setActiveData(res);
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo consultar el estado actual del turno de caja.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const list = await getCashShifts();
      setHistoryShifts(list);
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo cargar el historial de turnos.'
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setFormError(null);
    setStatusMessage(null);
    setConfirmDeleteId(null);
    void loadShiftState();
    void loadHistory();
  }, [isOpen, initialTab, loadShiftState, loadHistory]);

  const activeShift = activeData?.active_shift || null;
  const summary = activeData?.summary || null;
  const withdrawals = activeData?.withdrawals || [];
  const withdrawalsTotalCents = activeData?.withdrawals_total_cents || 0;
  const highDrawerAlert = useMemo(
    () => shouldAlertHighCashDrawer(summary?.expected_cash_cents || 0),
    [summary?.expected_cash_cents]
  );
  const activeDestMeta = useMemo(() => getWithdrawalDestinationMeta(destination), [destination]);

  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setStatusMessage(null);

    const parsedPesos = parseCOP(initialBasePesos);
    if (!Number.isFinite(parsedPesos) || parsedPesos < 0) {
      setFormError('Ingresa una base inicial válida en pesos colombianos.');
      return;
    }

    setOpeningSubmitting(true);
    try {
      const created = await openCashShift({
        initial_cash_cents: parsedPesos * 100,
        shift_label: shiftLabel,
        opening_notes: openingNotes.trim() || undefined,
      });
      setOpeningNotes('');
      setStatusMessage(
        `Turno #${created.shift_number} abierto con base de ${formatCentsCOP(created.initial_cash_cents)}.`
      );
      await Promise.all([loadShiftState(), loadHistory()]);
      onShiftChanged?.();
    } catch (err: unknown) {
      setFormError(err instanceof Error && err.message ? err.message : 'No se pudo abrir el turno.');
    } finally {
      setOpeningSubmitting(false);
    }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setStatusMessage(null);

    const parsedPesos = parseCOP(withdrawalAmountPesos);
    if (parsedPesos <= 0) {
      setFormError('Ingresa un monto de sangría mayor a $ 0 COP.');
      return;
    }

    const cleanReason = withdrawalReason.trim();
    if (cleanReason.length < 3) {
      setFormError('Escribe el motivo del retiro de seguridad (mínimo 3 caracteres).');
      return;
    }

    setWithdrawalSubmitting(true);
    try {
      const created = await recordCashWithdrawal({
        amount_cents: parsedPesos * 100,
        destination,
        reason: cleanReason,
        received_by: receivedBy.trim() || undefined,
      });
      setWithdrawalAmountPesos('');
      setWithdrawalReason('');
      setReceivedBy('');
      setStatusMessage(
        `Sangría registrada: ${formatCentsCOP(created.amount_cents)} (${getWithdrawalDestinationMeta(created.destination).label}).`
      );
      await Promise.all([loadShiftState(), loadHistory()]);
      onShiftChanged?.();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error && err.message ? err.message : 'No se pudo registrar la sangría.'
      );
    } finally {
      setWithdrawalSubmitting(false);
    }
  };

  const handleConfirmDeleteWithdrawal = async (id: string) => {
    setDeletingId(id);
    setFormError(null);
    setStatusMessage(null);
    try {
      await deleteCashWithdrawal(id);
      setConfirmDeleteId(null);
      setStatusMessage('Sangría de seguridad anulada del turno.');
      await Promise.all([loadShiftState(), loadHistory()]);
      onShiftChanged?.();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error && err.message ? err.message : 'No se pudo anular la sangría.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Turnos de Caja y Sangrías de Seguridad (COP)"
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              void loadShiftState();
              void loadHistory();
            }}
            disabled={loading}
            className="btn-secondary min-h-[44px] px-3 text-xs font-semibold"
          >
            🔄 Actualizar
          </button>
          <div className="flex items-center gap-2">
            {onRequestCloseShift && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestCloseShift();
                }}
                className="btn-success min-h-[44px] px-4 text-xs font-bold"
              >
                🔒 Arqueo y Cerrar Turno
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn min-h-[44px] bg-slate-800 px-5 text-xs font-semibold text-white hover:bg-slate-900"
            >
              Listo
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Navegación por Pestañas */}
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5" role="tablist">
          <button
            type="button"
            aria-pressed={activeTab === 'shift'}
            onClick={() => {
              setActiveTab('shift');
              setFormError(null);
            }}
            className={`min-h-[44px] rounded-xl px-3 text-xs font-bold transition ${
              activeTab === 'shift'
                ? 'bg-sf-dark text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            🔓 Turno Actual
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'withdrawals'}
            onClick={() => {
              setActiveTab('withdrawals');
              setFormError(null);
            }}
            className={`min-h-[44px] rounded-xl px-3 text-xs font-bold transition ${
              activeTab === 'withdrawals'
                ? 'bg-sf-primary text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            🏦 Sangrías ({withdrawals.length})
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'history'}
            onClick={() => {
              setActiveTab('history');
              setFormError(null);
            }}
            className={`min-h-[44px] rounded-xl px-3 text-xs font-bold transition ${
              activeTab === 'history'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            📋 Historial ({historyShifts.length})
          </button>
        </div>

        {/* Alertas de estado / error */}
        {formError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {formError}
          </div>
        )}
        {statusMessage && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
            ✅ {statusMessage}
          </div>
        )}

        {loading && !activeData ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Consultando estado del turno de caja...
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => void loadShiftState()}
              className="btn-secondary min-h-[44px] px-4 text-xs font-bold"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {/* ===============================================================
                PESTAÑA 1: TURNO ACTUAL (APERTURA O MONITOR EN VIVO)
               =============================================================== */}
            {activeTab === 'shift' && (
              <div className="space-y-4">
                {activeShift ? (
                  <>
                    <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-sf-dark p-4 text-white shadow-sm space-y-3">
                      <div className="flex flex-col gap-2 border-b border-slate-700/70 pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                              🟢 Turno #{activeShift.shift_number} Abierto
                            </span>
                            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                              {getShiftLabelMeta(activeShift.shift_label).emoji}{' '}
                              {getShiftLabelMeta(activeShift.shift_label).label}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-300">
                            Abierto por <strong className="text-white">{activeShift.opened_by_name || 'Cajero'}</strong> ·{' '}
                            {new Date(activeShift.opened_at).toLocaleString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {activeShift.opening_notes && (
                            <p className="mt-1 text-xs text-slate-400">Nota: {activeShift.opening_notes}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab('withdrawals')}
                            className="min-h-[44px] rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 text-xs font-bold text-sky-200 transition hover:bg-sky-500/30"
                          >
                            🏦 Registrar Sangría
                          </button>
                          {onRequestCloseShift && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onRequestCloseShift();
                              }}
                              className="min-h-[44px] rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                            >
                              🔒 Ir a Arqueo y Cerrar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                        <div className="rounded-xl bg-slate-800/70 p-2.5">
                          <span className="block text-slate-400">Base Inicial</span>
                          <span className="text-sm font-bold text-white tabular-nums">
                            {formatCentsCOP(summary?.initial_cash_cents ?? activeShift.initial_cash_cents)}
                          </span>
                        </div>
                        <div className="rounded-xl bg-slate-800/70 p-2.5">
                          <span className="block text-slate-400">Ventas Efectivo ({summary?.sales_cash_count || 0})</span>
                          <span className="text-sm font-bold text-emerald-400 tabular-nums">
                            {formatCentsCOP(summary?.sales_cash_cents || 0)}
                          </span>
                        </div>
                        <div className="rounded-xl bg-slate-800/70 p-2.5">
                          <span className="block text-slate-400">Abonos Fiado</span>
                          <span className="text-sm font-bold text-teal-300 tabular-nums">
                            {formatCentsCOP(summary?.credit_payments_cash_cents || 0)}
                          </span>
                        </div>
                        <div className="rounded-xl bg-slate-800/70 p-2.5">
                          <span className="block text-slate-400">Caja Menor ({summary?.expenses_cash_count || 0})</span>
                          <span className="text-sm font-bold text-rose-400 tabular-nums">
                            -{formatCentsCOP(summary?.expenses_cash_cents || 0)}
                          </span>
                        </div>
                        <div className="rounded-xl bg-slate-800/70 p-2.5">
                          <span className="block text-slate-400">Sangrías ({summary?.withdrawals_cash_count || 0})</span>
                          <span className="text-sm font-bold text-sky-300 tabular-nums">
                            -{formatCentsCOP(summary?.withdrawals_cash_cents || 0)}
                          </span>
                        </div>
                        <div className="rounded-xl border border-amber-400/30 bg-slate-800/95 p-2.5">
                          <span className="block font-semibold text-amber-200">Efectivo en Cajón</span>
                          <span className="text-base font-black text-amber-300 tabular-nums">
                            {formatCentsCOP(summary?.expected_cash_cents || activeShift.initial_cash_cents)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {highDrawerAlert && (
                      <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs">
                          <strong className="block text-sm">⚠️ Efectivo alto en cajón (≥ $ 500.000 COP)</strong>
                          <span>
                            Te recomendamos hacer una sangría parcial a caja fuerte o entrega al dueño por seguridad.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('withdrawals')}
                          className="btn-primary min-h-[44px] shrink-0 px-3 text-xs font-bold"
                        >
                          🏦 Hacer Sangría Ahora
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <form onSubmit={handleOpenShiftSubmit} className="card space-y-4 border-slate-200 bg-sf-light/40 p-4">
                    <div className="flex flex-col gap-1 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Abrir Nuevo Turno de Caja</h3>
                        <p className="text-xs text-slate-600">
                          Registra la base inicial en monedas y billetes con la que arrancas el cajón hoy.
                        </p>
                      </div>
                      <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                        Sin turno abierto
                      </span>
                    </div>

                    {/* Selector de jornada */}
                    <div>
                      <span className="mb-2 block text-xs font-semibold text-slate-700">Jornada del Turno</span>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {SHIFT_LABELS.map((item) => {
                          const selected = item.id === shiftLabel;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setShiftLabel(item.id)}
                              className={`flex min-h-[48px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition ${
                                selected
                                  ? 'border-sf-primary bg-sf-primary text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-800 hover:border-sf-primary/60'
                              }`}
                            >
                              <span className="text-xs font-bold">
                                {item.emoji} {item.label}
                              </span>
                              <span className={`text-[10px] ${selected ? 'text-white/80' : 'text-slate-500'}`}>
                                {item.scheduleHint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Base inicial COP + Presets */}
                    <div className="space-y-2">
                      <label htmlFor="open-shift-base-cop" className="block text-xs font-semibold text-slate-700">
                        Base Inicial de Caja (COP) *
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                            $
                          </span>
                          <input
                            id="open-shift-base-cop"
                            type="text"
                            inputMode="numeric"
                            value={initialBasePesos}
                            onChange={(e) => setInitialBasePesos(e.target.value.replace(/[^\d.,]/g, ''))}
                            placeholder="100000"
                            aria-label="Base inicial de caja en pesos"
                            className="input min-h-[44px] w-full pl-7 text-base font-bold tabular-nums text-slate-900"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_SHIFT_BASE_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setInitialBasePesos(String(preset))}
                              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-sf-primary hover:bg-sf-light active:scale-95 tabular-nums"
                            >
                              {formatCOP(preset)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="open-shift-notes" className="mb-1 block text-xs font-semibold text-slate-700">
                        Observaciones de Apertura (Opcional)
                      </label>
                      <input
                        id="open-shift-notes"
                        type="text"
                        value={openingNotes}
                        onChange={(e) => setOpeningNotes(e.target.value)}
                        placeholder="Ej: Base en sencillo de monedas y billetes de $2.000 y $5.000"
                        className="input min-h-[44px] w-full text-base"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={openingSubmitting}
                      className="btn-success min-h-[48px] w-full text-sm font-bold"
                    >
                      {openingSubmitting
                        ? 'Abriendo Turno...'
                        : `🔓 Abrir Turno de Caja (${formatCOP(parseCOP(initialBasePesos))})`}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* ===============================================================
                PESTAÑA 2: SANGRÍAS DE SEGURIDAD (RETIROS PARCIALES)
               =============================================================== */}
            {activeTab === 'withdrawals' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3.5">
                    <span className="block text-xs font-semibold text-sky-800">
                      🏦 Total Retirado en Sangrías ({withdrawals.length})
                    </span>
                    <span className="mt-1 block text-xl font-black text-sky-900 tabular-nums">
                      {formatCentsCOP(withdrawalsTotalCents)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
                    <span className="block text-xs font-semibold text-slate-600">
                      💵 Efectivo Estimado Actual en Cajón
                    </span>
                    <span className="mt-1 block text-xl font-black text-slate-900 tabular-nums">
                      {formatCentsCOP(summary?.expected_cash_cents || 0)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-900 p-3.5 text-white">
                    <span className="block text-xs font-semibold text-slate-300">📌 Turno Vinculado</span>
                    <span className="mt-1 block text-sm font-bold text-emerald-300">
                      {activeShift ? `Turno #${activeShift.shift_number} (${getShiftLabelMeta(activeShift.shift_label).label})` : 'Turno del Día (Sin apertura manual)'}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleWithdrawalSubmit} className="card space-y-4 border-slate-200 bg-sf-light/40 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Registrar Retiro Parcial de Seguridad (Sangría)</h3>

                  {/* Destinos táctiles */}
                  <div>
                    <span className="mb-2 block text-xs font-semibold text-slate-700">Destino del Efectivo</span>
                    <div className="grid grid-cols-2 gap-2">
                      {WITHDRAWAL_DESTINATIONS.map((dest) => {
                        const selected = dest.id === destination;
                        return (
                          <button
                            key={dest.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setDestination(dest.id)}
                            className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                              selected
                                ? 'border-sf-primary bg-sf-primary text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-sf-primary/60'
                            }`}
                          >
                            <span aria-hidden="true" className="text-base">{dest.emoji}</span>
                            <span className="leading-tight">{dest.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Monto + presets */}
                  <div className="space-y-2">
                    <label htmlFor="withdrawal-amount-cop" className="block text-xs font-semibold text-slate-700">
                      Monto Retirado de Caja (COP) *
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                          $
                        </span>
                        <input
                          id="withdrawal-amount-cop"
                          type="text"
                          inputMode="numeric"
                          value={withdrawalAmountPesos}
                          onChange={(e) => setWithdrawalAmountPesos(e.target.value.replace(/[^\d.,]/g, ''))}
                          placeholder="Ej: 50000"
                          aria-label="Monto de la sangría en pesos"
                          className="input min-h-[44px] w-full pl-7 text-base font-bold tabular-nums text-slate-900"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_WITHDRAWAL_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setWithdrawalAmountPesos(String(preset))}
                            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-sf-primary hover:bg-sf-light active:scale-95 tabular-nums"
                          >
                            {formatCOP(preset)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="withdrawal-reason" className="mb-1 block text-xs font-semibold text-slate-700">
                        Motivo / Concepto *
                      </label>
                      <input
                        id="withdrawal-reason"
                        type="text"
                        value={withdrawalReason}
                        onChange={(e) => setWithdrawalReason(e.target.value)}
                        placeholder={activeDestMeta.placeholder}
                        className="input min-h-[44px] w-full text-base"
                      />
                    </div>
                    <div>
                      <label htmlFor="withdrawal-received-by" className="mb-1 block text-xs font-semibold text-slate-700">
                        Recibido por / Custodia (Opcional)
                      </label>
                      <input
                        id="withdrawal-received-by"
                        type="text"
                        value={receivedBy}
                        onChange={(e) => setReceivedBy(e.target.value)}
                        placeholder="Ej: Don Carlos (Dueño) / Caja Fuerte"
                        className="input min-h-[44px] w-full text-base"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={withdrawalSubmitting}
                    className="btn-primary min-h-[44px] w-full text-sm font-bold"
                  >
                    {withdrawalSubmitting ? 'Registrando sangría...' : '🏦 Registrar Sangría de Seguridad'}
                  </button>
                </form>

                {/* Lista de sangrías del turno */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Sangrías del Turno Actual</h3>
                    {!canDeleteWithdrawal && withdrawals.length > 0 && (
                      <span className="text-[11px] font-medium text-slate-500">
                        Solo Admin o Gerente puede anular sangrías
                      </span>
                    )}
                  </div>

                  {withdrawals.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">
                      No hay retiros parciales registrados en este turno. Las sangrías no afectan tus utilidades, solo resguardan efectivo del cajón.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white" aria-label="Sangrías registradas en el turno">
                      {withdrawals.map((w) => {
                        const destMeta = getWithdrawalDestinationMeta(w.destination);
                        const isConfirming = confirmDeleteId === w.id;
                        const timeStr = w.created_at
                          ? new Date(w.created_at).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '';
                        return (
                          <li key={w.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-900">
                                  <span>{destMeta.emoji}</span>
                                  <span>{destMeta.label}</span>
                                </span>
                                {timeStr && <span className="text-[11px] text-slate-400">{timeStr}</span>}
                                {w.created_by_name && (
                                  <span className="text-[11px] text-slate-500">· Por {w.created_by_name}</span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-slate-900">{w.reason}</p>
                              {w.received_by && (
                                <p className="text-xs text-slate-600">Custodia: {w.received_by}</p>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                              <span className="text-base font-black text-sky-800 tabular-nums">
                                -{formatCentsCOP(w.amount_cents)}
                              </span>
                              {canDeleteWithdrawal && (
                                isConfirming ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleConfirmDeleteWithdrawal(w.id)}
                                      disabled={deletingId === w.id}
                                      aria-label={`Confirmar anulación de sangría ${w.reason}`}
                                      className="min-h-[44px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700"
                                    >
                                      {deletingId === w.id ? 'Anulando...' : '¿Confirmar?'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="btn-secondary min-h-[44px] px-2.5 text-xs font-semibold"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(w.id)}
                                    aria-label={`Anular sangría ${w.reason}`}
                                    className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                  >
                                    🗑️ Anular
                                  </button>
                                )
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* ===============================================================
                PESTAÑA 3: HISTORIAL DE TURNOS POR CAJERO
               =============================================================== */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                {loadingHistory ? (
                  <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                    Cargando historial de turnos...
                  </div>
                ) : historyShifts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Aún no hay turnos registrados. Abre el primer turno en la pestaña "Turno Actual".
                  </div>
                ) : (
                  <ul className="space-y-2.5" aria-label="Historial de turnos de caja">
                    {historyShifts.map((shift) => {
                      const labelMeta = getShiftLabelMeta(shift.shift_label);
                      const isOpenShift = shift.status === 'open';
                      const diff = Number(shift.difference_cents || 0);
                      return (
                        <li
                          key={shift.id}
                          className="card border border-slate-200 bg-white p-3.5 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-slate-900">
                                Turno #{shift.shift_number}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                {labelMeta.emoji} {labelMeta.label}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                  isOpenShift
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : shift.closing_status === 'shortage'
                                    ? 'bg-red-100 text-red-800'
                                    : shift.closing_status === 'surplus'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-200 text-slate-800'
                                }`}
                              >
                                {isOpenShift
                                  ? '🟢 Abierto'
                                  : shift.closing_status === 'shortage'
                                  ? `⚠️ Faltante (-${formatCentsCOP(Math.abs(diff))})`
                                  : shift.closing_status === 'surplus'
                                  ? `🔵 Sobrante (+${formatCentsCOP(diff)})`
                                  : '✅ Cerrado Cuadrado'}
                              </span>
                            </div>

                            <span className="text-xs font-bold text-slate-700 tabular-nums">
                              Base: {formatCentsCOP(shift.initial_cash_cents)}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
                            <div>
                              <span className="font-semibold text-slate-800">Apertura:</span>{' '}
                              {shift.opened_by_name || 'Cajero'} ·{' '}
                              {new Date(shift.opened_at).toLocaleString('es-CO', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <div>
                              {shift.closed_at ? (
                                <>
                                  <span className="font-semibold text-slate-800">Cierre:</span>{' '}
                                  {shift.closed_by_name || 'Cajero'} ·{' '}
                                  {new Date(shift.closed_at).toLocaleString('es-CO', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </>
                              ) : (
                                <span className="font-semibold text-emerald-700">Turno actualmente en operación</span>
                              )}
                            </div>
                          </div>

                          {(shift.withdrawals_total_cents || 0) > 0 && (
                            <div className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-900">
                              🏦 Sangrías realizadas ({shift.withdrawals_count || 0}):{' '}
                              <span className="tabular-nums">{formatCentsCOP(shift.withdrawals_total_cents || 0)}</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default CashShiftModal;
