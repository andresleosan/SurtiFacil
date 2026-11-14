import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CashExpense,
  CashExpenseCategory,
  CashExpensePaymentMethod,
  EXPENSE_CATEGORIES,
  getExpenseCategoryMeta,
} from '../types/cashExpense';
import {
  deleteCashExpense,
  getCashExpenses,
  recordCashExpense,
} from '../services/cashExpenseService';
import { formatCentsCOP, formatCOP, parseCOP } from '../utils/currency';
import { Modal } from './ui/Modal';

interface PettyCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseChanged?: () => void;
}

const QUICK_AMOUNT_PRESETS = [5000, 10000, 20000, 50000] as const;

export function PettyCashModal({ isOpen, onClose, onExpenseChanged }: PettyCashModalProps) {
  const [expenses, setExpenses] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado del formulario de nuevo egreso
  const [category, setCategory] = useState<CashExpenseCategory>('proveedor_contado');
  const [amountPesos, setAmountPesos] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CashExpensePaymentMethod>('cash');
  const [description, setDescription] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estado de confirmación en 2 toques para anular (sin window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getCashExpenses({ shiftOnly: true });
      setExpenses(list);
    } catch (err: unknown) {
      console.error('Error cargando gastos de caja menor:', err);
      setLoadError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudieron cargar las salidas de caja menor.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setSuccessMsg(null);
      setConfirmDeleteId(null);
      void loadExpenses();
    }
  }, [isOpen, loadExpenses]);

  const totals = useMemo(() => {
    let cashCents = 0;
    let transferCents = 0;
    for (const item of expenses) {
      if (item.payment_method === 'transfer') {
        transferCents += item.amount_cents || 0;
      } else {
        cashCents += item.amount_cents || 0;
      }
    }
    return {
      cashCents,
      transferCents,
      totalCents: cashCents + transferCents,
    };
  }, [expenses]);

  const activeCategoryMeta = useMemo(() => getExpenseCategoryMeta(category), [category]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    const parsedPesos = parseCOP(amountPesos);
    if (parsedPesos <= 0) {
      setFormError('Ingresa un monto válido en pesos mayor a $ 0.');
      return;
    }

    const cleanDescription = description.trim();
    if (!cleanDescription) {
      setFormError('Escribe el concepto o descripción del gasto.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await recordCashExpense({
        category,
        description: cleanDescription,
        beneficiary: beneficiary.trim() || undefined,
        amount_cents: parsedPesos * 100,
        payment_method: paymentMethod,
      });
      setExpenses((prev) => [created, ...prev]);
      setAmountPesos('');
      setDescription('');
      setBeneficiary('');
      setSuccessMsg(
        `Salida registrada: ${formatCentsCOP(created.amount_cents)} (${
          created.payment_method === 'cash' ? 'Descontada de caja en efectivo' : 'Transferencia'
        }).`
      );
      onExpenseChanged?.();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error && err.message ? err.message : 'No se pudo registrar el gasto.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    setFormError(null);
    try {
      await deleteCashExpense(id);
      setExpenses((prev) => prev.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
      setSuccessMsg('Gasto anulado del turno.');
      onExpenseChanged?.();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error && err.message ? err.message : 'No se pudo anular el gasto.'
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
      title="Caja Menor y Gastos del Turno (COP)"
      size="lg"
      footer={
        <div className="flex w-full justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn min-h-[44px] bg-slate-800 px-5 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Listo
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Resumen Superior de Salidas del Turno */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5">
            <span className="block text-xs font-semibold text-rose-700">
              💵 Salidas Efectivo (Descuenta en Arqueo)
            </span>
            <span className="mt-1 block text-xl font-black text-rose-800 tabular-nums">
              {formatCentsCOP(totals.cashCents)}
            </span>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5">
            <span className="block text-xs font-semibold text-sky-700">
              📲 Pagos por Transferencia
            </span>
            <span className="mt-1 block text-xl font-black text-sky-800 tabular-nums">
              {formatCentsCOP(totals.transferCents)}
            </span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-3.5 text-white">
            <span className="block text-xs font-semibold text-slate-300">
              📊 Total Egresos del Turno ({expenses.length})
            </span>
            <span className="mt-1 block text-xl font-black text-amber-300 tabular-nums">
              {formatCentsCOP(totals.totalCents)}
            </span>
          </div>
        </div>

        {/* Mensajes de estado */}
        {formError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {formError}
          </div>
        )}
        {successMsg && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
            ✅ {successMsg}
          </div>
        )}

        {/* Formulario Táctil de Nuevo Egreso */}
        <form onSubmit={handleSubmit} className="card space-y-4 border-slate-200 bg-sf-light/40 p-4">
          <h3 className="text-sm font-bold text-slate-900">Registrar Nueva Salida de Caja</h3>

          {/* Selector táctil de categorías */}
          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-700">
              Categoría del Gasto
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EXPENSE_CATEGORIES.map((cat) => {
                const selected = cat.id === category;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(cat.id)}
                    className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                      selected
                        ? 'border-sf-primary bg-sf-primary text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-sf-primary/60 hover:bg-slate-50'
                    }`}
                  >
                    <span aria-hidden="true" className="text-base">{cat.emoji}</span>
                    <span className="leading-tight">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monto en Pesos COP + Botones rápidos */}
          <div className="space-y-2">
            <label htmlFor="expense-amount-cop" className="block text-xs font-semibold text-slate-700">
              Monto del Gasto (COP) *
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                  $
                </span>
                <input
                  id="expense-amount-cop"
                  type="text"
                  inputMode="numeric"
                  value={amountPesos}
                  onChange={(e) => setAmountPesos(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="Ej: 20000"
                  aria-label="Monto del gasto en pesos"
                  className="input min-h-[44px] w-full pl-7 text-base font-bold tabular-nums text-slate-900"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AMOUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountPesos(String(preset))}
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-sf-primary hover:bg-sf-light active:scale-95 tabular-nums"
                  >
                    {formatCOP(preset)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Medio de salida */}
          <fieldset>
            <legend className="mb-1.5 block text-xs font-semibold text-slate-700">
              Medio de Pago / Origen
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'cash'}
                onClick={() => setPaymentMethod('cash')}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
                  paymentMethod === 'cash'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>💵 Efectivo de Caja (Descuenta en Arqueo)</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'transfer'}
                onClick={() => setPaymentMethod('transfer')}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
                  paymentMethod === 'transfer'
                    ? 'border-sf-primary bg-sf-primary/10 text-sf-primary shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>📲 Transferencia Nequi / Bancolombia</span>
              </button>
            </div>
          </fieldset>

          {/* Concepto y Beneficiario */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="expense-description" className="mb-1 block text-xs font-semibold text-slate-700">
                Concepto / Descripción *
              </label>
              <input
                id="expense-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={activeCategoryMeta.placeholder}
                className="input min-h-[44px] w-full text-base"
              />
            </div>
            <div>
              <label htmlFor="expense-beneficiary" className="mb-1 block text-xs font-semibold text-slate-700">
                Proveedor o Beneficiario (Opcional)
              </label>
              <input
                id="expense-beneficiary"
                type="text"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                placeholder="Ej: Panadería El Trigo / Domiciliario"
                className="input min-h-[44px] w-full text-base"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary min-h-[44px] w-full text-sm font-bold"
          >
            {submitting ? 'Registrando salida...' : '💸 Registrar Salida de Caja'}
          </button>
        </form>

        {/* Historial de Gastos del Turno */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Historial de Salidas del Turno
            </h3>
            <button
              type="button"
              onClick={() => void loadExpenses()}
              disabled={loading}
              className="btn-secondary min-h-[44px] px-3 text-xs font-semibold"
            >
              🔄 Actualizar
            </button>
          </div>

          {loading ? (
            <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Cargando gastos del turno...
            </div>
          ) : loadError ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => void loadExpenses()}
                className="btn-secondary min-h-[44px] px-4 text-xs font-bold"
              >
                Reintentar
              </button>
            </div>
          ) : expenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No hay salidas registradas en este turno. Las salidas en efectivo se descontarán automáticamente del arqueo.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white" aria-label="Gastos registrados en el turno">
              {expenses.map((expense) => {
                const catMeta = getExpenseCategoryMeta(expense.category);
                const isConfirming = confirmDeleteId === expense.id;
                const timeStr = expense.created_at
                  ? new Date(expense.created_at).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

                return (
                  <li key={expense.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          <span aria-hidden="true">{catMeta.emoji}</span>
                          <span>{catMeta.label}</span>
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            expense.payment_method === 'transfer'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {expense.payment_method === 'transfer' ? '📲 Transferencia' : '💵 Efectivo'}
                        </span>
                        {timeStr && <span className="text-[11px] text-slate-400">{timeStr}</span>}
                      </div>

                      <p className="text-sm font-bold text-slate-900">{expense.description}</p>
                      {expense.beneficiary && (
                        <p className="text-xs text-slate-600">Beneficiario: {expense.beneficiary}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-base font-black text-rose-700 tabular-nums">
                        -{formatCentsCOP(expense.amount_cents)}
                      </span>

                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleConfirmDelete(expense.id)}
                            disabled={deletingId === expense.id}
                            aria-label={`Confirmar anulación de ${expense.description}`}
                            className="min-h-[44px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700"
                          >
                            {deletingId === expense.id ? 'Anulando...' : '¿Confirmar?'}
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
                          onClick={() => setConfirmDeleteId(expense.id)}
                          aria-label={`Anular gasto ${expense.description}`}
                          className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        >
                          🗑️ Anular
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default PettyCashModal;
