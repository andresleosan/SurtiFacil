import React, { useEffect, useMemo, useState } from 'react';
import {
  BULK_AMOUNT_PRESETS_COP,
  MIN_FRACTIONAL_QTY,
  calculateWeightFromAmountCents,
  formatQuantityNumber,
  formatQuantityWithUnit,
  formatWeightGramsHint,
  getBulkStep,
  getBulkWeightPresets,
  getUnitShortLabel,
  roundQuantity,
} from '../../utils/bulkWeight';
import { formatCentsCOP } from '../../utils/currency';
import { resolveProductUnitPricing, type WholesaleTier } from '../../utils/wholesalePricing';
import { Modal } from './Modal';
import { ProductImage } from './ProductImage';

export interface BulkCalculableProduct {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
  unit?: string;
  category?: string;
  image_url?: string;
  en_oferta?: boolean | number;
  precio_oferta_cents?: number | null;
  wholesale_tiers?: WholesaleTier[];
  wholesale_tiers_json?: string | null;
  allow_fractional?: boolean | number;
}

export interface BulkWeightCalculatorModalProps {
  open: boolean;
  onClose: () => void;
  product: BulkCalculableProduct | null;
  initialQuantity?: number;
  kioskMode?: boolean;
  onConfirm: (quantity: number) => void;
}

type CalcMode = 'weight' | 'amount';

export const BulkWeightCalculatorModal: React.FC<BulkWeightCalculatorModalProps> = ({
  open,
  onClose,
  product,
  initialQuantity,
  kioskMode = false,
  onConfirm,
}) => {
  const [mode, setMode] = useState<CalcMode>('weight');
  const [weightInput, setWeightInput] = useState('0.5');
  const [amountPesosInput, setAmountPesosInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const basePricing = useMemo(() => {
    if (!product) return null;
    return resolveProductUnitPricing(product, 1);
  }, [product]);

  useEffect(() => {
    if (!open || !product) return;
    const startQty =
      initialQuantity && initialQuantity >= MIN_FRACTIONAL_QTY
        ? roundQuantity(initialQuantity, true)
        : Math.min(1, Math.max(MIN_FRACTIONAL_QTY, roundQuantity(product.stock, true)));
    setMode('weight');
    setWeightInput(formatQuantityNumber(startQty));
    const initPricing = resolveProductUnitPricing(product, startQty);
    setAmountPesosInput(String(Math.round(initPricing.subtotal_cents / 100)));
    setErrorMsg('');
  }, [open, product, initialQuantity]);

  const parsedWeight = useMemo(() => {
    const clean = weightInput.replace(',', '.').trim();
    if (!clean) return 0;
    const num = Number(clean);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return roundQuantity(num, true);
  }, [weightInput]);

  const livePricing = useMemo(() => {
    if (!product || parsedWeight < MIN_FRACTIONAL_QTY) return null;
    return resolveProductUnitPricing({ ...product, allow_fractional: true }, parsedWeight);
  }, [product, parsedWeight]);

  if (!product || !basePricing) return null;

  const maxStock = roundQuantity(Math.max(0, Number(product.stock) || 0), true);
  const unitLabel = product.unit || 'libra';
  const shortUnit = getUnitShortLabel(unitLabel);
  const step = getBulkStep(unitLabel);
  const presets = getBulkWeightPresets(unitLabel);
  const touchClass = kioskMode ? 'min-h-[56px]' : 'min-h-[44px]';

  const handleSelectWeight = (qty: number) => {
    const clean = roundQuantity(qty, true);
    setWeightInput(formatQuantityNumber(clean));
    const p = resolveProductUnitPricing({ ...product, allow_fractional: true }, clean);
    setAmountPesosInput(String(Math.round(p.subtotal_cents / 100)));
    setErrorMsg('');
  };

  const handleWeightTextChange = (raw: string) => {
    setWeightInput(raw);
    setErrorMsg('');
    const num = Number(raw.replace(',', '.').trim());
    if (Number.isFinite(num) && num > 0) {
      const p = resolveProductUnitPricing({ ...product, allow_fractional: true }, roundQuantity(num, true));
      setAmountPesosInput(String(Math.round(p.subtotal_cents / 100)));
    }
  };

  const handleAmountPesosChange = (rawPesos: string) => {
    setAmountPesosInput(rawPesos);
    setErrorMsg('');
    const pesos = Number(rawPesos.replace(/[^\d]/g, ''));
    if (Number.isFinite(pesos) && pesos > 0) {
      const targetCents = Math.round(pesos) * 100;
      const calcQty = calculateWeightFromAmountCents(targetCents, basePricing.unit_price_cents);
      const bounded = Math.max(MIN_FRACTIONAL_QTY, calcQty);
      setWeightInput(formatQuantityNumber(bounded));
    }
  };

  const handleSelectAmountPreset = (cents: number) => {
    const pesos = Math.round(cents / 100);
    setAmountPesosInput(String(pesos));
    const calcQty = calculateWeightFromAmountCents(cents, basePricing.unit_price_cents);
    setWeightInput(formatQuantityNumber(Math.max(MIN_FRACTIONAL_QTY, calcQty)));
    setErrorMsg('');
  };

  const adjustWeight = (delta: number) => {
    const current = parsedWeight > 0 ? parsedWeight : 0;
    const next = roundQuantity(Math.max(MIN_FRACTIONAL_QTY, current + delta), true);
    handleSelectWeight(maxStock > 0 ? Math.min(maxStock, next) : next);
  };

  const exceedsStock = maxStock > 0 ? parsedWeight > maxStock : true;
  const isQtyValid = parsedWeight >= MIN_FRACTIONAL_QTY && !exceedsStock;
  const gramsHint = formatWeightGramsHint(parsedWeight, unitLabel);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedWeight < MIN_FRACTIONAL_QTY) {
      setErrorMsg(`Ingresa un peso mínimo de ${MIN_FRACTIONAL_QTY} ${shortUnit}.`);
      return;
    }
    if (exceedsStock) {
      setErrorMsg(
        `Stock insuficiente: disponible ${formatQuantityWithUnit(maxStock, unitLabel, true)}.`
      );
      return;
    }
    onConfirm(parsedWeight);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Venta a Granel · ${product.name}`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className={`btn-secondary ${touchClass}`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="bulk-weight-form"
            disabled={!isQtyValid}
            className={`btn-success font-bold disabled:opacity-50 ${touchClass}`}
          >
            Agregar {isQtyValid ? formatQuantityWithUnit(parsedWeight, unitLabel, true) : ''}
            {livePricing && isQtyValid ? ` (${formatCentsCOP(livePricing.subtotal_cents)})` : ''}
          </button>
        </>
      }
    >
      <form id="bulk-weight-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Resumen del Producto */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <ProductImage
            src={product.image_url}
            alt={product.name}
            productName={product.name}
            category={product.category}
            showOfferBadge={false}
            containerClassName="h-14 w-14 shrink-0 rounded-xl bg-white p-1 border border-slate-200"
            className="h-full w-full object-contain"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 truncate">{product.name}</h3>
            <p className="text-sm font-bold text-sf-primary tabular-nums">
              {formatCentsCOP(basePricing.unit_price_cents)} / {unitLabel}
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              Disponible en bodega: <strong>{formatQuantityWithUnit(maxStock, unitLabel, true)}</strong>
            </p>
          </div>
        </div>

        {/* Selector de Modo: Por Peso vs Por Valor COP */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Modo de cálculo a granel">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'weight'}
            onClick={() => setMode('weight')}
            className={`${touchClass} rounded-lg px-3 text-xs sm:text-sm font-bold transition ${
              mode === 'weight'
                ? 'bg-white text-sf-primary shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚖️ Por Peso ({shortUnit})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'amount'}
            onClick={() => setMode('amount')}
            className={`${touchClass} rounded-lg px-3 text-xs sm:text-sm font-bold transition ${
              mode === 'amount'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            💵 Por Valor (COP)
          </button>
        </div>

        {mode === 'weight' ? (
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                Fracciones rápidas de báscula
              </p>
              <div className="grid grid-cols-3 gap-2">
                {presets.map((preset) => {
                  const disabled = preset.quantity > maxStock;
                  const active = Math.abs(parsedWeight - preset.quantity) < 1e-4;
                  return (
                    <button
                      key={preset.quantity}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectWeight(preset.quantity)}
                      aria-pressed={active}
                      className={`${touchClass} flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
                        active
                          ? 'border-sf-primary bg-sf-primary text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-sf-primary/60 hover:bg-blue-50/40'
                      }`}
                    >
                      <span className="text-sm">{preset.label}</span>
                      {preset.hint && (
                        <span className={`text-[10px] font-medium ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                          {preset.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="bulk-weight-input" className="mb-1.5 block text-xs font-bold text-slate-700">
                Peso exacto en {unitLabel} ({shortUnit})
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustWeight(-step)}
                  aria-label={`Restar ${step} ${shortUnit}`}
                  className={`${touchClass} min-w-[48px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-700 hover:bg-slate-100`}
                >
                  −{step}
                </button>
                <input
                  id="bulk-weight-input"
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min={MIN_FRACTIONAL_QTY}
                  max={maxStock || undefined}
                  value={weightInput}
                  onChange={(e) => handleWeightTextChange(e.target.value)}
                  className={`${touchClass} input flex-1 text-center text-lg font-black tabular-nums`}
                />
                <button
                  type="button"
                  onClick={() => adjustWeight(step)}
                  aria-label={`Sumar ${step} ${shortUnit}`}
                  className={`${touchClass} min-w-[48px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-700 hover:bg-slate-100`}
                >
                  +{step}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                "Deme tantos pesos de {product.name}"
              </p>
              <div className="grid grid-cols-3 gap-2">
                {BULK_AMOUNT_PRESETS_COP.map((cents) => {
                  const active = Number(amountPesosInput) === Math.round(cents / 100);
                  return (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => handleSelectAmountPreset(cents)}
                      aria-pressed={active}
                      className={`${touchClass} rounded-xl border px-2 text-xs sm:text-sm font-bold tabular-nums transition ${
                        active
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/40'
                      }`}
                    >
                      {formatCentsCOP(cents)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="bulk-amount-cop-input" className="mb-1.5 block text-xs font-bold text-slate-700">
                Valor solicitado en Pesos COP ($)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-bold text-slate-400">
                  $
                </span>
                <input
                  id="bulk-amount-cop-input"
                  type="number"
                  inputMode="numeric"
                  min={100}
                  step={100}
                  value={amountPesosInput}
                  onChange={(e) => handleAmountPesosChange(e.target.value)}
                  placeholder="3000"
                  className={`${touchClass} input pl-8 text-lg font-black tabular-nums`}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tarjeta de Conversión en Vivo */}
        <div
          role="status"
          aria-live="polite"
          className={`rounded-2xl border p-4 space-y-1.5 ${
            exceedsStock
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>Peso calculado en báscula:</span>
            <span className="font-bold tabular-nums">
              {formatQuantityWithUnit(parsedWeight, unitLabel, true)}
              {gramsHint ? ` (${gramsHint})` : ''}
            </span>
          </div>
          {livePricing?.applied_tier && (
            <div className="flex items-center justify-between text-xs font-bold text-amber-800">
              <span>🏷️ Precio mayorista {livePricing.applied_tier.min_quantity}+ aplicado:</span>
              <span className="tabular-nums">{formatCentsCOP(livePricing.unit_price_cents)}/{shortUnit}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1 border-t border-black/10">
            <span className="text-sm font-bold">Total a cobrar:</span>
            <span className="text-2xl font-black tabular-nums">
              {livePricing ? formatCentsCOP(livePricing.subtotal_cents) : '$ 0'}
            </span>
          </div>
          {exceedsStock && (
            <p className="text-xs font-bold text-red-700 pt-1">
              ⚠️ Supera el stock disponible ({formatQuantityWithUnit(maxStock, unitLabel, true)}).
            </p>
          )}
        </div>

        {errorMsg && (
          <p role="alert" className="text-xs font-semibold text-red-600">
            {errorMsg}
          </p>
        )}
      </form>
    </Modal>
  );
};
