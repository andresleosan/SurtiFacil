import { useId } from 'react';
import { COLOMBIAN_BILLS } from '../types/cashClosing';
import { Icon } from './ui/Icon';

export interface CashChangeCalculatorProps {
  totalCents: number;
  receivedCashCents: number | null;
  onReceivedCashChange: (cents: number | null) => void;
  formatPrice?: (cents: number) => string;
  className?: string;
}

export function CashChangeCalculator({
  totalCents,
  receivedCashCents,
  onReceivedCashChange,
  formatPrice = (c) => `$${(c / 100).toFixed(2)}`,
  className = '',
}: CashChangeCalculatorProps) {
  const inputId = useId();

  // Cálculo de vueltas y validación de suficiencia
  const hasCash = receivedCashCents !== null && receivedCashCents > 0;
  const isExact = receivedCashCents === totalCents;
  const isSufficient = receivedCashCents !== null ? receivedCashCents >= totalCents : true;
  const changeCents = receivedCashCents !== null && receivedCashCents >= totalCents
    ? receivedCashCents - totalCents
    : 0;
  const shortageCents = receivedCashCents !== null && receivedCashCents < totalCents
    ? totalCents - receivedCashCents
    : 0;

  // Botones de denominaciones prioritarias según requerimientos COP
  // Exacto, $10.000, $20.000, $50.000, $100.000 (más $2.000 y $5.000)
  const quickBills = [
    ...COLOMBIAN_BILLS.slice().reverse(), // $2k, $5k, $10k, $20k, $50k, $100k
  ];

  const handleSelectBill = (valueCents: number) => {
    onReceivedCashChange(valueCents);
  };

  const handleExact = () => {
    onReceivedCashChange(totalCents);
  };

  const handleClear = () => {
    onReceivedCashChange(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    if (!raw) {
      onReceivedCashChange(null);
      return;
    }
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0) {
      onReceivedCashChange(null);
      return;
    }
    // Si contiene punto decimal, se interpreta como unidades monetarias exactas
    // De lo contrario, se convierte a centavos estándar
    const cents = Math.round(parsed * 100);
    onReceivedCashChange(cents);
  };

  // Valor textual para el input
  const inputValue = receivedCashCents !== null
    ? (receivedCashCents / 100).toString()
    : '';

  return (
    <div
      role="region"
      aria-label="Calculadora de efectivo y vueltas COP"
      className={`rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base" aria-hidden="true">💵</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Cobro en Efectivo COP
          </span>
        </div>
        {hasCash && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 transition"
            aria-label="Limpiar efectivo recibido"
          >
            <Icon name="close" size={14} />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* Teclado Táctil de Billetes COP */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">
          Denominaciones rápidas del cliente:
        </p>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="group" aria-label="Billetes colombianos">
          {/* Botón Pago Exacto */}
          <button
            type="button"
            onClick={handleExact}
            aria-pressed={isExact}
            aria-label={`Pago exacto de ${formatPrice(totalCents)}`}
            className={`flex min-h-[44px] col-span-3 sm:col-span-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition shadow-xs ${
              isExact
                ? 'border-emerald-500 bg-emerald-600 text-white shadow-emerald-200'
                : 'border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <span>⚡ Exacto</span>
            <span className="text-[11px] opacity-90">({formatPrice(totalCents)})</span>
          </button>

          {/* Billetes Colombianos */}
          {quickBills.map((bill) => {
            const isSelected = receivedCashCents === bill.valueCents;
            return (
              <button
                key={bill.id}
                type="button"
                onClick={() => handleSelectBill(bill.valueCents)}
                aria-pressed={isSelected}
                aria-label={`Paga con billete de ${bill.label}`}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-xs font-bold transition ${
                  isSelected
                    ? 'border-sf-primary bg-sf-primary text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white active:scale-95'
                }`}
              >
                <span>{bill.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Input de monto personalizado */}
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-slate-600 shrink-0">
          O digita valor:
        </label>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-bold text-slate-400">
            $
          </span>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={totalCents > 0 ? (totalCents / 100).toString() : '0'}
            aria-label="Efectivo recibido en pesos"
            className="input min-h-[40px] pl-6 text-sm font-semibold tabular-nums text-slate-800"
          />
        </div>
      </div>

      {/* Calculadora Visual de Vueltas (Verde Gigante / Alerta de Insuficiencia) */}
      {hasCash ? (
        isSufficient ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/90 p-3 text-center text-emerald-950 shadow-xs animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <span aria-hidden="true">🪙</span>
              <span>Vueltas a Entregar</span>
            </div>
            <div className="mt-0.5 text-2xl font-black text-emerald-600 sm:text-3xl tabular-nums">
              {formatPrice(changeCents)}
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-emerald-800/80">
              {changeCents === 0 ? (
                'Pago exacto · No requiere entregar cambio'
              ) : (
                <>Recibe: <span className="font-bold">{formatPrice(receivedCashCents)}</span> · Total: <span className="font-bold">{formatPrice(totalCents)}</span></>
              )}
            </p>
          </div>
        ) : (
          <div
            role="alert"
            className="rounded-2xl border-2 border-rose-400 bg-rose-50 p-3 text-center text-rose-950 shadow-xs animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-800">
              <span aria-hidden="true">⚠️</span>
              <span>Dinero Insuficiente</span>
            </div>
            <div className="mt-0.5 text-xl font-black text-rose-600 sm:text-2xl tabular-nums">
              Faltan {formatPrice(shortageCents)}
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-rose-800/80">
              Recibe: <span className="font-bold">{formatPrice(receivedCashCents)}</span> de <span className="font-bold">{formatPrice(totalCents)}</span> requeridos
            </p>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-2.5 text-center text-xs text-slate-500">
          💡 Toca <span className="font-bold text-slate-700">[Exacto]</span> o un billete para calcular las vueltas automáticamente.
        </div>
      )}
    </div>
  );
}

export default CashChangeCalculator;
