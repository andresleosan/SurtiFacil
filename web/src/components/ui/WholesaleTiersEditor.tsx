import { MAX_WHOLESALE_TIERS, type WholesaleTier } from '../../utils/wholesalePricing';
import { formatCentsCOP } from '../../utils/currency';
import { Icon } from './Icon';

interface WholesaleTiersEditorProps {
  tiers: WholesaleTier[];
  regularPriceCents: number;
  onChange: (nextTiers: WholesaleTier[]) => void;
  inputScale?: 'pesos' | 'cents';
  idPrefix?: string;
}

const PRESET_QUANTITIES = [3, 6, 12];

export function WholesaleTiersEditor({
  tiers,
  regularPriceCents,
  onChange,
  inputScale = 'pesos',
  idPrefix = 'wholesale',
}: WholesaleTiersEditorProps) {
  const unitFactor = inputScale === 'pesos' ? 100 : 1;
  const priceLabel = inputScale === 'pesos' ? 'Precio c/u ($ COP)' : 'Precio c/u (centavos)';

  const handleAddTier = (suggestedQty?: number) => {
    if (tiers.length >= MAX_WHOLESALE_TIERS) return;
    const existingSet = new Set(tiers.map((t) => t.min_quantity));
    const baseQty =
      suggestedQty && !existingSet.has(suggestedQty)
        ? suggestedQty
        : tiers.length === 0
          ? 3
          : Math.max(...tiers.map((t) => t.min_quantity)) + 3;

    const lowestCurrent =
      tiers.length > 0
        ? Math.min(...tiers.map((t) => t.unit_price_cents))
        : regularPriceCents;
    const safeBasePrice = lowestCurrent > 0 ? lowestCurrent : regularPriceCents;
    const rawSuggested =
      safeBasePrice > 1
        ? Math.max(1, Math.floor(safeBasePrice * 0.9))
        : Math.max(1, safeBasePrice - 1);

    const suggestedPriceCents =
      inputScale === 'pesos'
        ? Math.max(100, Math.floor(rawSuggested / 100) * 100)
        : rawSuggested;

    onChange([
      ...tiers,
      {
        min_quantity: Math.min(999, Math.max(2, baseQty)),
        unit_price_cents: suggestedPriceCents,
      },
    ]);
  };

  const handleQtyChange = (index: number, rawValue: string) => {
    const parsed = Number.parseInt(rawValue.replace(/\D/g, ''), 10);
    const nextQty = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    onChange(
      tiers.map((tier, idx) =>
        idx === index ? { ...tier, min_quantity: nextQty } : tier
      )
    );
  };

  const handlePriceChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/[^\d]/g, '');
    const parsed = cleaned ? Number.parseInt(cleaned, 10) : 0;
    const nextCents = parsed * unitFactor;
    onChange(
      tiers.map((tier, idx) =>
        idx === index ? { ...tier, unit_price_cents: nextCents } : tier
      )
    );
  };

  const handleRemoveTier = (index: number) => {
    onChange(tiers.filter((_, idx) => idx !== index));
  };

  return (
    <section
      aria-label="Precios mayoristas por volumen"
      className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
            <span aria-hidden="true">🏷️</span>
            Precios Mayoristas / Descuento por Volumen
          </p>
          <p className="text-[11px] text-amber-800">
            Ej: Lleva 3+ o 6+ unidades a menor precio en POS, Kiosco y Tienda Web.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleAddTier()}
          disabled={tiers.length >= MAX_WHOLESALE_TIERS}
          className="btn-secondary min-h-[44px] px-3 py-1.5 text-xs font-semibold border-amber-300 bg-white text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          + Agregar escala
        </button>
      </div>

      {/* Accesos rápidos de cantidad mínima */}
      {tiers.length < MAX_WHOLESALE_TIERS && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-amber-900">Atajos rápidos:</span>
          {PRESET_QUANTITIES.filter((q) => !tiers.some((t) => t.min_quantity === q)).map((qty) => (
            <button
              key={qty}
              type="button"
              onClick={() => handleAddTier(qty)}
              className="min-h-[36px] rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
            >
              +{qty} uds
            </button>
          ))}
        </div>
      )}

      {tiers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-amber-200 bg-white/70 px-3 py-2 text-xs text-slate-500">
          Sin escalas mayoristas. Agrega una si vendes más económico desde 3, 6 o 12 unidades.
        </p>
      ) : (
        <div className="space-y-2">
          {tiers.map((tier, index) => {
            const displayPriceValue =
              tier.unit_price_cents > 0
                ? String(Math.round(tier.unit_price_cents / unitFactor))
                : '';
            const discountPct =
              regularPriceCents > 0 && tier.unit_price_cents > 0 && tier.unit_price_cents < regularPriceCents
                ? Math.round(((regularPriceCents - tier.unit_price_cents) / regularPriceCents) * 100)
                : 0;

            return (
              <div
                key={`${idPrefix}-tier-${index}`}
                className="grid grid-cols-12 items-end gap-2 rounded-lg border border-amber-200 bg-white p-2.5"
              >
                <div className="col-span-4">
                  <label
                    htmlFor={`${idPrefix}-min-qty-${index}`}
                    className="mb-1 block text-[11px] font-semibold text-slate-700"
                  >
                    Desde (uds.)
                  </label>
                  <input
                    id={`${idPrefix}-min-qty-${index}`}
                    type="text"
                    inputMode="numeric"
                    value={tier.min_quantity > 0 ? String(tier.min_quantity) : ''}
                    onChange={(e) => handleQtyChange(index, e.target.value)}
                    placeholder="3"
                    className="input min-h-[44px] text-sm font-semibold tabular-nums"
                  />
                </div>

                <div className="col-span-6">
                  <label
                    htmlFor={`${idPrefix}-price-${index}`}
                    className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700"
                  >
                    <span>{priceLabel}</span>
                    {discountPct > 0 && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        -{discountPct}%
                      </span>
                    )}
                  </label>
                  <input
                    id={`${idPrefix}-price-${index}`}
                    type="text"
                    inputMode="numeric"
                    value={displayPriceValue}
                    onChange={(e) => handlePriceChange(index, e.target.value)}
                    placeholder={inputScale === 'pesos' ? '4000' : '400000'}
                    className="input min-h-[44px] text-sm font-semibold tabular-nums"
                  />
                  {tier.unit_price_cents > 0 && (
                    <p className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                      Equivale a {formatCentsCOP(tier.unit_price_cents)} c/u
                    </p>
                  )}
                </div>

                <div className="col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveTier(index)}
                    aria-label={`Eliminar escala desde ${tier.min_quantity} unidades`}
                    className="icon-btn min-h-[44px] min-w-[44px] text-red-600 hover:bg-red-50"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
