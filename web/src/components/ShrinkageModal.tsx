import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Product } from '../firebase/db';
import { onDataChange } from '../services/apiClient';
import {
  computeShrinkageUnitCostCents,
  getShrinkageHistory,
  recordShrinkage,
  revertShrinkageEntry,
} from '../services/shrinkageService';
import {
  checkExpiringProducts,
  getDaysUntilExpiration,
  isFruverOrDairyCategory,
} from '../services/stockAlertService';
import {
  getShrinkageReasonMeta,
  InventoryShrinkage,
  SHRINKAGE_REASONS,
  ShrinkageReason,
} from '../types/shrinkage';
import { formatCentsCOP } from '../utils/currency';
import {
  computeLineSubtotalCents,
  formatQuantityNumber,
  formatQuantityWithUnit,
  MIN_FRACTIONAL_QTY,
  roundQuantity,
} from '../utils/bulkWeight';
import { Modal } from './ui/Modal';

export interface ShrinkageModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialProductId?: string;
  onShrinkageChanged?: () => void;
}

function suggestDefaultReason(product?: Product): ShrinkageReason {
  if (!product) return 'damaged';
  const daysLeft = getDaysUntilExpiration(product.expiration_date);
  if (daysLeft !== null && daysLeft <= 0) {
    return 'expired';
  }
  if (isFruverOrDairyCategory(product.category)) {
    return daysLeft !== null && daysLeft <= 3 ? 'expired' : 'spoiled_fruver';
  }
  return 'damaged';
}

function formatDateTimeCo(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString('es-CO', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

export const ShrinkageModal: React.FC<ShrinkageModalProps> = ({
  isOpen,
  onClose,
  products,
  initialProductId,
  onShrinkageChanged,
}) => {
  const [entries, setEntries] = useState<InventoryShrinkage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [reason, setReason] = useState<ShrinkageReason>('damaged');
  const [quantityInput, setQuantityInput] = useState('1');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | ShrinkageReason>('all');

  const [confirmRevertId, setConfirmRevertId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const expiringAlerts = useMemo(() => checkExpiringProducts(products, 7), [products]);

  const sortedSelectableProducts = useMemo(() => {
    const expiringMap = new Map(expiringAlerts.map((a) => [a.productId, a.daysUntilExpiry]));
    return [...products].sort((a, b) => {
      const aExp = expiringMap.get(a.id);
      const bExp = expiringMap.get(b.id);
      if (aExp !== undefined && bExp === undefined) return -1;
      if (aExp === undefined && bExp !== undefined) return 1;
      if (aExp !== undefined && bExp !== undefined && aExp !== bExp) return aExp - bExp;
      if (a.stock > 0 && b.stock <= 0) return -1;
      if (a.stock <= 0 && b.stock > 0) return 1;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }, [products, expiringAlerts]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const loadHistory = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getShrinkageHistory();
      setEntries(data || []);
    } catch (err: any) {
      setLoadError(err?.message || 'No se pudo cargar el historial de mermas.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setSuccessMsg(null);
    setConfirmRevertId(null);

    const targetProduct =
      (initialProductId && products.find((p) => p.id === initialProductId)) ||
      sortedSelectableProducts.find((p) => p.stock > 0) ||
      sortedSelectableProducts[0];

    if (targetProduct) {
      setSelectedProductId(targetProduct.id);
      setReason(suggestDefaultReason(targetProduct));
    } else {
      setSelectedProductId('');
      setReason('damaged');
    }
    setQuantityInput('1');
    setNotes('');

    void loadHistory();
    const unsubscribe = onDataChange('shrinkage', () => {
      void loadHistory();
    });
    return () => unsubscribe();
  }, [isOpen, initialProductId, loadHistory]);

  const handleSelectProduct = (nextProductId: string) => {
    setSelectedProductId(nextProductId);
    setFormError(null);
    setSuccessMsg(null);
    const prod = products.find((p) => p.id === nextProductId);
    if (prod) {
      setReason(suggestDefaultReason(prod));
      const parsedQty = Math.floor(Number(quantityInput));
      if (!Number.isFinite(parsedQty) || parsedQty < 1) {
        setQuantityInput('1');
      } else if (prod.stock > 0 && parsedQty > prod.stock) {
        setQuantityInput(String(prod.stock));
      }
    }
  };

  const parsedQuantity = useMemo(() => {
    const n = Number(String(quantityInput).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0;
    const allowFrac = Boolean(selectedProduct?.allow_fractional);
    if (!allowFrac && !Number.isInteger(n)) return 0;
    const rounded = roundQuantity(n, allowFrac);
    if (allowFrac && rounded < MIN_FRACTIONAL_QTY) return 0;
    return rounded;
  }, [quantityInput, selectedProduct?.allow_fractional]);

  const costEstimate = useMemo(() => {
    if (!selectedProduct || parsedQuantity <= 0) {
      return {
        unitCostCents: 0,
        totalCostLossCents: 0,
        retailValueCents: 0,
        costSource: 'purchase' as const,
      };
    }
    const { unitCostCents, costSource } = computeShrinkageUnitCostCents(selectedProduct);
    return {
      unitCostCents,
      totalCostLossCents: computeLineSubtotalCents(unitCostCents, parsedQuantity),
      retailValueCents: computeLineSubtotalCents(
        Math.max(0, Math.round(selectedProduct.price_cents || 0)),
        parsedQuantity
      ),
      costSource,
    };
  }, [selectedProduct, parsedQuantity]);

  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.totalUnits += Number(entry.quantity || 0);
        acc.totalCostLossCents += Number(entry.total_cost_loss_cents || 0);
        acc.totalRetailValueCents += Number(entry.retail_value_cents || 0);
        return acc;
      },
      { totalUnits: 0, totalCostLossCents: 0, totalRetailValueCents: 0 }
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (historyFilter === 'all') return entries;
    return entries.filter((entry) => entry.reason === historyFilter);
  }, [entries, historyFilter]);

  const activeReasonMeta = getShrinkageReasonMeta(reason);

  const adjustQuantity = (delta: number) => {
    const allowFrac = Boolean(selectedProduct?.allow_fractional);
    const maxStock = roundQuantity(selectedProduct?.stock ?? 9999, true);
    const current = parsedQuantity || 0;
    const minVal = allowFrac ? 0.25 : 1;
    const stepDelta = allowFrac ? delta * 0.25 : delta;
    const next = roundQuantity(
      Math.max(minVal, Math.min(maxStock > 0 ? maxStock : minVal, current + stepDelta)),
      allowFrac
    );
    setQuantityInput(formatQuantityNumber(next));
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!selectedProduct) {
      setFormError('Selecciona un producto del inventario para dar de baja.');
      return;
    }

    if (selectedProduct.stock <= 0) {
      setFormError(`"${selectedProduct.name}" no tiene stock disponible para dar de baja.`);
      return;
    }

    const allowFrac = Boolean(selectedProduct.allow_fractional);
    const rawNum = Number(String(quantityInput).replace(',', '.'));
    if (!Number.isFinite(rawNum) || rawNum <= 0 || (!allowFrac && !Number.isInteger(rawNum))) {
      setFormError(
        allowFrac
          ? 'Ingresa una cantidad válida mayor a 0.'
          : 'Ingresa una cantidad entera válida mayor a 0.'
      );
      return;
    }
    const cleanQty = roundQuantity(rawNum, allowFrac);
    if (allowFrac && cleanQty < MIN_FRACTIONAL_QTY) {
      setFormError(`La cantidad mínima a granel es ${MIN_FRACTIONAL_QTY}.`);
      return;
    }

    if (cleanQty > selectedProduct.stock) {
      setFormError(
        `No puedes dar de baja ${formatQuantityWithUnit(cleanQty, selectedProduct.unit, true)} porque solo quedan ${formatQuantityWithUnit(selectedProduct.stock, selectedProduct.unit, true)} disponibles.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await recordShrinkage(
        {
          product_id: selectedProduct.id,
          quantity: cleanQty,
          reason,
          notes,
        },
        selectedProduct
      );

      setQuantityInput('1');
      setNotes('');
      setSuccessMsg(
        `Baja registrada: -${created.quantity} ${created.unit || 'uds'} de ${created.product_name} (pérdida al costo ${formatCentsCOP(created.total_cost_loss_cents)}).`
      );
      await loadHistory();
      onShrinkageChanged?.();
    } catch (err: any) {
      setFormError(err?.message || 'Error al registrar la merma de inventario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevertEntry = async (shrinkageId: string) => {
    setRevertingId(shrinkageId);
    setFormError(null);
    setSuccessMsg(null);
    try {
      const target = entries.find((e) => e.id === shrinkageId);
      await revertShrinkageEntry(shrinkageId);
      setConfirmRevertId(null);
      setSuccessMsg(
        target
          ? `Merma revertida: +${target.quantity} devueltos al stock de ${target.product_name}.`
          : 'Merma revertida y stock restaurado.'
      );
      await loadHistory();
      onShrinkageChanged?.();
    } catch (err: any) {
      setFormError(err?.message || 'No se pudo revertir la merma.');
    } finally {
      setRevertingId(null);
    }
  };

  const totalAtRiskCents = useMemo(
    () => expiringAlerts.reduce((acc, alert) => acc + alert.estimatedValueAtRiskCents, 0),
    [expiringAlerts]
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Control de Mermas, Averías y Vencimientos"
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary min-h-[44px] w-full sm:w-auto"
        >
          Cerrar
        </button>
      }
    >
      <div className="space-y-5">
        {/* Resumen Ejecutivo */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-red-700">
              Pérdida Acumulada al Costo
            </p>
            <p className="mt-1 font-heading text-xl font-bold text-red-900 tabular-nums">
              {formatCentsCOP(summary.totalCostLossCents)}
            </p>
            <p className="mt-0.5 text-xs text-red-700/90 tabular-nums">
              {entries.length} bajas · {summary.totalUnits} unidades
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Perecederos en Riesgo (≤ 7d)
            </p>
            <p className="mt-1 font-heading text-xl font-bold text-amber-950 tabular-nums">
              {expiringAlerts.length} productos
            </p>
            <p className="mt-0.5 text-xs text-amber-800/90 tabular-nums">
              Capital en riesgo: {formatCentsCOP(totalAtRiskCents)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
              Valor Venta No Percibido
            </p>
            <p className="mt-1 font-heading text-xl font-bold text-sf-dark tabular-nums">
              {formatCentsCOP(summary.totalRetailValueCents)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Impacto estimado a PVP en vitrina
            </p>
          </div>
        </div>

        {/* Selección rápida de productos vencidos o próximos a vencer */}
        {expiringAlerts.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-xs font-semibold text-amber-900 mb-2">
              ⏰ Atención rápida en Fruver / Lácteos / Vencimientos:
            </p>
            <div className="flex flex-wrap gap-2">
              {expiringAlerts.slice(0, 6).map((alert) => {
                const isSelected = alert.productId === selectedProductId;
                const label =
                  alert.daysUntilExpiry < 0
                    ? `Vencido hace ${Math.abs(alert.daysUntilExpiry)}d`
                    : alert.daysUntilExpiry === 0
                    ? 'Vence hoy'
                    : `Vence en ${alert.daysUntilExpiry}d`;
                return (
                  <button
                    key={alert.productId}
                    type="button"
                    onClick={() => handleSelectProduct(alert.productId)}
                    className={`min-h-[44px] rounded-full border px-3 py-1 text-xs font-medium transition ${
                      isSelected
                        ? 'border-sf-primary bg-sf-primary text-white shadow-sm'
                        : alert.severity === 'expired'
                        ? 'border-red-300 bg-white text-red-800 hover:bg-red-50'
                        : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    {alert.productName} · {label} ({alert.stock})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Alertas de estado del formulario */}
        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
          >
            {formError}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800"
          >
            {successMsg}
          </div>
        )}

        {/* Formulario de Registro */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-sf-dark">
              Registrar Baja de Inventario / Merma
            </h3>
            {selectedProduct && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums">
                Stock actual: {selectedProduct.stock} {selectedProduct.unit || 'uds'}
              </span>
            )}
          </div>

          {/* Selector de producto */}
          <div>
            <label
              htmlFor="shrinkage-product"
              className="mb-1.5 block text-xs font-semibold text-slate-700"
            >
              Producto afectado
            </label>
            <select
              id="shrinkage-product"
              value={selectedProductId}
              onChange={(e) => handleSelectProduct(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 focus:border-sf-primary focus:outline-none focus:ring-2 focus:ring-sf-primary/20"
              disabled={products.length === 0 || submitting}
            >
              {products.length === 0 ? (
                <option value="">No hay productos disponibles</option>
              ) : (
                sortedSelectableProducts.map((p) => {
                  const daysLeft = getDaysUntilExpiration(p.expiration_date);
                  const expiryTag =
                    daysLeft !== null && daysLeft <= 7
                      ? daysLeft < 0
                        ? ` · VENCIDO`
                        : daysLeft === 0
                        ? ` · VENCE HOY`
                        : ` · Vence ${daysLeft}d`
                      : '';
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.stock} {p.unit || 'uds'} disp.){expiryTag}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          {/* Motivos táctiles */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700">Motivo de la merma</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SHRINKAGE_REASONS.map((item) => {
                const active = reason === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setReason(item.id)}
                    className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                      active
                        ? 'border-sf-primary bg-sf-primary/10 text-sf-primary ring-1 ring-sf-primary'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base leading-none">{item.emoji}</span>
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cantidad + Notas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="shrinkage-quantity"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Cantidad a dar de baja ({selectedProduct?.unit || 'unidades'})
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Disminuir cantidad"
                  onClick={() => adjustQuantity(-1)}
                  disabled={submitting || !selectedProduct || selectedProduct.stock <= 0}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  −
                </button>
                <input
                  id="shrinkage-quantity"
                  type="number"
                  min={selectedProduct?.allow_fractional ? MIN_FRACTIONAL_QTY : 1}
                  max={selectedProduct?.stock || undefined}
                  step={selectedProduct?.allow_fractional ? 0.25 : 1}
                  inputMode={selectedProduct?.allow_fractional ? 'decimal' : 'numeric'}
                  value={quantityInput}
                  onChange={(e) => {
                    setQuantityInput(e.target.value);
                    setFormError(null);
                  }}
                  disabled={submitting}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-base font-bold text-sf-dark tabular-nums focus:border-sf-primary focus:outline-none focus:ring-2 focus:ring-sf-primary/20"
                />
                <button
                  type="button"
                  aria-label="Aumentar cantidad"
                  onClick={() => adjustQuantity(1)}
                  disabled={submitting || !selectedProduct || selectedProduct.stock <= 0}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  +
                </button>
              </div>
              {selectedProduct && selectedProduct.stock > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(selectedProduct.allow_fractional ? [0.5, 1, 2] : [1, 2, 5]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={preset > selectedProduct.stock || submitting}
                      onClick={() => setQuantityInput(String(preset))}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 tabular-nums"
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setQuantityInput(String(selectedProduct.stock))}
                    className="min-h-[44px] rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 tabular-nums"
                  >
                    Todo ({selectedProduct.stock})
                  </button>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="shrinkage-notes"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Observación / Detalle (opcional)
              </label>
              <input
                id="shrinkage-notes"
                type="text"
                maxLength={250}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={activeReasonMeta.placeholder}
                disabled={submitting}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sf-primary focus:outline-none focus:ring-2 focus:ring-sf-primary/20"
              />
              {selectedProduct && (
                <p className="mt-1.5 text-xs text-slate-500">
                  {activeReasonMeta.description}
                </p>
              )}
            </div>
          </div>

          {/* Vista previa de impacto contable y stock */}
          {selectedProduct && parsedQuantity > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              <div className="space-y-0.5">
                <span className="font-medium text-slate-600">Nuevo stock tras la baja: </span>
                <span
                  className={`font-bold tabular-nums ${
                    parsedQuantity > selectedProduct.stock ? 'text-red-600' : 'text-sf-dark'
                  }`}
                >
                  {selectedProduct.stock} → {Math.max(0, selectedProduct.stock - parsedQuantity)}{' '}
                  {selectedProduct.unit || 'uds'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 tabular-nums">
                <div>
                  <span className="text-slate-500">Costo perdido </span>
                  <span className="text-[11px] text-slate-400">
                    ({costEstimate.costSource === 'purchase' ? 'compra' : 'est. 70%'}):{' '}
                  </span>
                  <strong className="text-red-700">
                    {formatCentsCOP(costEstimate.totalCostLossCents)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">PVP: </span>
                  <strong className="text-slate-800">
                    {formatCentsCOP(costEstimate.retailValueCents)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                submitting ||
                !selectedProduct ||
                selectedProduct.stock <= 0 ||
                parsedQuantity <= 0 ||
                parsedQuantity > selectedProduct.stock
              }
              className="btn-primary min-h-[44px] w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Registrando baja...' : '📉 Registrar Baja de Inventario'}
            </button>
          </div>
        </form>

        {/* Historial de Mermas */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-sf-dark">
              Historial de Mermas y Bajas ({filteredEntries.length})
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHistoryFilter('all')}
                className={`min-h-[44px] rounded-full px-3 text-xs font-semibold transition ${
                  historyFilter === 'all'
                    ? 'bg-sf-primary text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todas
              </button>
              {SHRINKAGE_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setHistoryFilter(r.id)}
                  className={`min-h-[44px] rounded-full px-3 text-xs font-medium transition ${
                    historyFilter === r.id
                      ? 'bg-sf-primary text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r.emoji} {r.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Cargando historial de mermas...
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void loadHistory()}
                className="btn-secondary min-h-[44px] border-red-300 text-red-800"
              >
                Reintentar
              </button>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
              {entries.length === 0
                ? 'Aún no hay bajas por merma, avería o vencimiento registradas.'
                : 'No hay mermas registradas con el motivo seleccionado.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {filteredEntries.map((entry) => {
                const meta = getShrinkageReasonMeta(entry.reason);
                const isConfirming = confirmRevertId === entry.id;
                const isReverting = revertingId === entry.id;
                return (
                  <li
                    key={entry.id}
                    className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                        >
                          {meta.emoji} {meta.shortLabel}
                        </span>
                        <span className="font-semibold text-sm text-sf-dark truncate">
                          {entry.product_name}
                        </span>
                        <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700 tabular-nums">
                          -{entry.quantity} {entry.unit || 'uds'}
                        </span>
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-slate-600">“{entry.notes}”</p>
                      )}
                      <p className="text-[11px] text-slate-400">
                        {formatDateTimeCo(entry.created_at)}
                        {entry.created_by_name ? ` · ${entry.created_by_name}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right tabular-nums">
                        <p className="text-sm font-bold text-red-700">
                          −{formatCentsCOP(entry.total_cost_loss_cents)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          PVP: {formatCentsCOP(entry.retail_value_cents)}
                        </p>
                      </div>

                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isReverting}
                            onClick={() => void handleRevertEntry(entry.id)}
                            className="min-h-[44px] rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {isReverting ? 'Revirtiendo...' : `Devolver +${entry.quantity}`}
                          </button>
                          <button
                            type="button"
                            disabled={isReverting}
                            onClick={() => setConfirmRevertId(null)}
                            className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRevertId(entry.id)}
                          aria-label={`Revertir merma de ${entry.product_name}`}
                          className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-sf-dark"
                        >
                          ↩️ Revertir
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
};
