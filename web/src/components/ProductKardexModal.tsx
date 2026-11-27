import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Product } from '../firebase/db';
import { useHasRole } from '../auth/CurrentUserContext';
import { onDataChange } from '../services/apiClient';
import {
  adjustProductStockKardex,
  downloadProductKardexCSV,
  getProductKardex,
} from '../services/kardexService';
import {
  InventoryKardexEntry,
  KardexMovementType,
  ProductKardexSummary,
  getKardexMovementMeta,
} from '../types/kardex';
import {
  formatQuantityNumber,
  formatQuantityWithUnit,
  roundQuantity,
} from '../utils/bulkWeight';
import { formatCentsCOP } from '../utils/currency';
import { Modal } from './ui/Modal';

export interface ProductKardexModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onStockAdjusted?: () => void;
}

const QUICK_ADJUST_REASONS = [
  'Conteo físico de bodega',
  'Corrección de báscula',
  'Sobrante de bulto',
  'Degustación / Muestra',
];

const MOVEMENT_FILTERS: Array<{ id: '' | KardexMovementType; label: string }> = [
  { id: '', label: 'Todos' },
  { id: 'sale', label: '🛒 Ventas' },
  { id: 'sale_void', label: '↩️ Anulaciones' },
  { id: 'purchase', label: '📦 Compras' },
  { id: 'shrinkage', label: '📉 Mermas' },
  { id: 'adjustment', label: '⚖️ Ajustes' },
  { id: 'initial', label: '🟢 Inicial' },
];

function formatDateTimeCo(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleString('es-CO', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

export const ProductKardexModal: React.FC<ProductKardexModalProps> = ({
  isOpen,
  onClose,
  product,
  onStockAdjusted,
}) => {
  const canEdit = useHasRole(['admin', 'manager']);

  const [entries, setEntries] = useState<InventoryKardexEntry[]>([]);
  const [liveProduct, setLiveProduct] = useState<Product | null>(product);
  const [summary, setSummary] = useState<ProductKardexSummary>({
    total_in: 0,
    total_out: 0,
    net_change: 0,
    movements_count: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'' | KardexMovementType>('');

  // Formulario de ajuste manual auditable
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  const activeProduct = liveProduct || product;

  const loadKardex = useCallback(async () => {
    if (!isOpen || !product) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getProductKardex(product.id, {
        movement_type: filterType,
        productFallback: product,
      });
      setLiveProduct(res.product || product);
      setEntries(res.entries || []);
      setSummary(
        res.summary || {
          total_in: 0,
          total_out: 0,
          net_change: 0,
          movements_count: (res.entries || []).length,
        }
      );
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el Kardex del producto.');
    } finally {
      setLoading(false);
    }
  }, [isOpen, product, filterType]);

  useEffect(() => {
    if (!isOpen || !product) return;
    setLiveProduct(product);
    setFilterType('');
    setAdjustOpen(false);
    setAdjustMode('add');
    setAdjustQty(product.allow_fractional ? '0.5' : '1');
    setAdjustReason('');
    setAdjustError(null);
    setAdjustSuccess(null);
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!isOpen || !product) return;
    void loadKardex();
    const unsub = onDataChange('kardex', () => {
      void loadKardex();
    });
    return () => unsub();
  }, [isOpen, product?.id, loadKardex]);

  const parsedQty = useMemo(() => {
    const n = Number(adjustQty.replace(',', '.'));
    if (!Number.isFinite(n)) return NaN;
    return roundQuantity(n, Boolean(activeProduct?.allow_fractional));
  }, [adjustQty, activeProduct?.allow_fractional]);

  const previewNextStock = useMemo(() => {
    if (!activeProduct || !Number.isFinite(parsedQty)) return null;
    const prev = roundQuantity(activeProduct.stock, true);
    if (adjustMode === 'add') return roundQuantity(prev + parsedQty, true);
    if (adjustMode === 'subtract') return roundQuantity(prev - parsedQty, true);
    return roundQuantity(parsedQty, true);
  }, [activeProduct, adjustMode, parsedQty]);

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;
    setAdjustError(null);
    setAdjustSuccess(null);

    if (!Number.isFinite(parsedQty) || (adjustMode === 'set' ? parsedQty < 0 : parsedQty <= 0)) {
      setAdjustError('Ingresa una cantidad válida para el ajuste.');
      return;
    }
    if (adjustReason.trim().length < 3) {
      setAdjustError('Escribe un motivo de al menos 3 caracteres.');
      return;
    }

    try {
      setAdjustSubmitting(true);
      const res = await adjustProductStockKardex(
        activeProduct.id,
        {
          mode: adjustMode,
          quantity: parsedQty,
          reason: adjustReason.trim(),
        },
        activeProduct
      );
      setLiveProduct(res.product);
      setAdjustSuccess(
        `Ajuste registrado en Kardex: stock actualizado a ${formatQuantityWithUnit(
          res.product.stock,
          res.product.unit,
          true
        )}.`
      );
      setAdjustReason('');
      setAdjustOpen(false);
      await loadKardex();
      onStockAdjusted?.();
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : 'No se pudo aplicar el ajuste.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  if (!activeProduct) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Kardex de Inventario"
      size="xl"
      headerActions={
        <button
          type="button"
          onClick={() => downloadProductKardexCSV(activeProduct, entries)}
          disabled={entries.length === 0}
          className="btn-secondary min-h-[44px] px-3 text-xs font-semibold disabled:opacity-40"
        >
          📥 Exportar Excel CSV
        </button>
      }
      footer={
        <button type="button" onClick={onClose} className="btn-secondary min-h-[44px] w-full sm:w-auto">
          Cerrar
        </button>
      }
    >
      <div className="space-y-4">
        {/* Cabecera del producto */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {activeProduct.name}
              </h3>
              {Boolean(activeProduct.allow_fractional) && (
                <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  ⚖️ Venta a Granel
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Unidad: <strong className="capitalize">{activeProduct.unit || 'unidad'}</strong> · PVP:{' '}
              <strong className="tabular-nums">{formatCentsCOP(activeProduct.price_cents)}</strong>
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setAdjustOpen((prev) => !prev);
                setAdjustError(null);
              }}
              className="btn-primary min-h-[44px] px-4 text-xs font-bold"
            >
              {adjustOpen ? 'Cerrar Ajuste' : '⚖️ Ajuste Manual de Stock'}
            </button>
          )}
        </div>

        {/* 3 Tarjetas KPI */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Stock Actual</p>
            <p className="mt-1 text-xl font-black text-sf-primary tabular-nums">
              {formatQuantityWithUnit(activeProduct.stock, activeProduct.unit, true)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Total Entradas</p>
            <p className="mt-1 text-xl font-black text-emerald-700 tabular-nums">
              +{formatQuantityWithUnit(summary.total_in, activeProduct.unit, true)}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">Total Salidas</p>
            <p className="mt-1 text-xl font-black text-rose-700 tabular-nums">
              -{formatQuantityWithUnit(summary.total_out, activeProduct.unit, true)}
            </p>
          </div>
        </div>

        {adjustSuccess && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900">
            {adjustSuccess}
          </div>
        )}

        {/* Panel de Ajuste Manual */}
        {adjustOpen && canEdit && (
          <form
            onSubmit={handleApplyAdjustment}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
          >
            <h4 className="text-sm font-bold text-slate-900">Registrar Ajuste Manual Auditable</h4>
            {adjustError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {adjustError}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'add' as const, label: '➕ Sumar' },
                  { id: 'subtract' as const, label: '➖ Restar' },
                  { id: 'set' as const, label: '📌 Fijar Total' },
                ]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={adjustMode === m.id}
                  onClick={() => setAdjustMode(m.id)}
                  className={`min-h-[44px] rounded-xl border text-xs font-bold transition ${
                    adjustMode === m.id
                      ? 'border-sf-primary bg-sf-primary text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="kardex-adjust-qty" className="mb-1 block text-xs font-semibold text-slate-700">
                  Cantidad ({activeProduct.unit || 'unidad'})
                </label>
                <input
                  id="kardex-adjust-qty"
                  type="number"
                  inputMode="decimal"
                  step={activeProduct.allow_fractional ? '0.05' : '1'}
                  min={adjustMode === 'set' ? '0' : activeProduct.allow_fractional ? '0.05' : '1'}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="input min-h-[44px] text-base font-bold tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="kardex-adjust-reason" className="mb-1 block text-xs font-semibold text-slate-700">
                  Motivo del ajuste *
                </label>
                <input
                  id="kardex-adjust-reason"
                  type="text"
                  maxLength={250}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ej: Conteo físico de báscula"
                  className="input min-h-[44px] text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_ADJUST_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAdjustReason(r)}
                  className="min-h-[44px] rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-600 tabular-nums">
                Stock resultante:{' '}
                <strong className={previewNextStock !== null && previewNextStock < 0 ? 'text-red-600' : 'text-slate-900'}>
                  {formatQuantityNumber(activeProduct.stock)} ➔{' '}
                  {previewNextStock !== null ? formatQuantityNumber(previewNextStock) : '—'}{' '}
                  {activeProduct.unit || 'uds'}
                </strong>
              </div>
              <button
                type="submit"
                disabled={adjustSubmitting || previewNextStock === null || previewNextStock < 0}
                className="btn-success min-h-[44px] px-4 text-xs font-bold disabled:opacity-50"
              >
                {adjustSubmitting ? 'Guardando...' : 'Guardar Ajuste en Kardex'}
              </button>
            </div>
          </form>
        )}

        {/* Filtros por tipo */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar movimientos de Kardex">
          {MOVEMENT_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              type="button"
              aria-pressed={filterType === f.id}
              onClick={() => setFilterType(f.id)}
              className={`min-h-[44px] rounded-full px-3 text-xs font-semibold transition ${
                filterType === f.id
                  ? 'bg-sf-primary text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Historial cronológico */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Cargando movimientos del Kardex...
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void loadKardex()}
              className="btn-secondary min-h-[44px] border-red-300 text-red-800"
            >
              Reintentar
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
            No hay movimientos registrados para este filtro todavía.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {entries.map((entry) => {
              const meta = getKardexMovementMeta(entry.movement_type);
              const isPositive = entry.quantity_delta >= 0;
              return (
                <li
                  key={entry.id}
                  className="flex flex-col justify-between gap-2 p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                      >
                        {meta.emoji} {meta.shortLabel}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                          isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {formatQuantityWithUnit(entry.quantity_delta, entry.unit, true)}
                      </span>
                      <span className="text-xs font-semibold text-slate-600 tabular-nums">
                        Stock: {formatQuantityNumber(entry.stock_before)} ➔{' '}
                        <strong className="text-slate-900">{formatQuantityNumber(entry.stock_after)}</strong>
                      </span>
                    </div>
                    {entry.notes && <p className="text-xs text-slate-700">{entry.notes}</p>}
                    <p className="text-[11px] text-slate-400">
                      {formatDateTimeCo(entry.created_at)}
                      {entry.created_by_name ? ` · ${entry.created_by_name}` : ''}
                      {entry.reference_id ? ` · Ref: ${entry.reference_id.slice(0, 12)}` : ''}
                    </p>
                  </div>

                  <div className="text-right tabular-nums shrink-0">
                    {entry.total_value_cents > 0 && (
                      <p className="text-sm font-bold text-slate-800">
                        {formatCentsCOP(entry.total_value_cents)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
};
