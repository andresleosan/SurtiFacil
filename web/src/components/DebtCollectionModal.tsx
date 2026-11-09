import React, { useState, useMemo } from 'react';
import { CreditCustomer, CreditEntry } from '../firebase/db';
import { Modal } from './ui/Modal';
import { Icon } from './ui/Icon';
import {
  DebtReminderTone,
  generateDebtReminderWhatsAppText,
  buildWhatsAppClickToChatUrl,
  getSuggestedDueDate,
} from '../utils/debtReminder';
import { formatCentsCOP } from '../utils/currency';

interface DebtCollectionModalProps {
  open: boolean;
  customer: CreditCustomer | null;
  entries?: CreditEntry[];
  storeSettings?: { nombre?: string; datos_pago_offline?: string };
  onClose: () => void;
}

export const DebtCollectionModal: React.FC<DebtCollectionModalProps> = ({
  open,
  customer,
  entries = [],
  storeSettings = {},
  onClose,
}) => {
  const [tone, setTone] = useState<DebtReminderTone>('amigable');
  const [dueDatePreset, setDueDatePreset] = useState<'none' | 'week' | 'fifteenth' | 'month_end' | 'custom'>('none');
  const [customDueDate, setCustomDueDate] = useState('');
  const [phoneOverride, setPhoneOverride] = useState('');
  const [copied, setCopied] = useState(false);

  // Inicializar teléfono cuando cambia el cliente
  React.useEffect(() => {
    if (customer?.phone) {
      setPhoneOverride(customer.phone);
    } else {
      setPhoneOverride('');
    }
    setCopied(false);
  }, [customer]);

  const effectiveDueDate = useMemo(() => {
    if (dueDatePreset === 'custom') {
      return customDueDate.trim() || undefined;
    }
    return getSuggestedDueDate(dueDatePreset);
  }, [dueDatePreset, customDueDate]);

  const messageText = useMemo(() => {
    if (!customer) return '';
    return generateDebtReminderWhatsAppText(customer, entries, storeSettings, {
      tone,
      dueDate: effectiveDueDate,
      includeRecentEntries: true,
    });
  }, [customer, entries, storeSettings, tone, effectiveDueDate]);

  const effectivePhone = phoneOverride.trim() || customer?.phone || '';
  const whatsAppUrl = useMemo(() => {
    return buildWhatsAppClickToChatUrl(effectivePhone, messageText);
  }, [effectivePhone, messageText]);

  if (!open || !customer) return null;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(messageText);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch {
      // Fallback si no está disponible el portapapeles
    }
  };

  const handleOpenWhatsApp = () => {
    window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📲 Cobranza de Fiados por WhatsApp"
      size="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary min-h-[44px] px-4 w-full sm:w-auto"
          >
            Cerrar
          </button>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopy}
              className="btn-secondary min-h-[44px] px-4 w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-semibold"
              title="Copiar mensaje al portapapeles"
            >
              <Icon name="copy" size={16} />
              <span>{copied ? '¡Copiado! ✅' : 'Copiar Mensaje'}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="btn-success min-h-[44px] px-5 w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <span>📲</span>
              <span>Abrir en WhatsApp</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Resumen del cliente y deuda */}
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">👤</span>
              <h3 className="font-bold text-slate-900 text-base">{customer.name}</h3>
              {!customer.active && (
                <span className="chip bg-gray-200 text-gray-700 text-xs">Inactivo</span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {effectivePhone ? `Teléfono: ${effectivePhone}` : 'Sin teléfono registrado'}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs font-medium text-red-700 uppercase tracking-wide">Deuda Pendiente</span>
            <p className="text-2xl sm:text-3xl font-black text-red-600 tabular-nums">
              {formatCentsCOP(customer.balance_cents)}
            </p>
          </div>
        </div>

        {/* Configuración del mensaje: Tono */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
            Tono del Mensaje Paisa
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Tono del mensaje">
            <button
              type="button"
              role="radio"
              aria-checked={tone === 'amigable'}
              onClick={() => setTone('amigable')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                tone === 'amigable'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
              }`}
            >
              <span className="text-lg">👋</span>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">Amigable</p>
                <p className="text-[11px] text-slate-500">Cercano y cordial</p>
              </div>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={tone === 'quincena'}
              onClick={() => setTone('quincena')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                tone === 'quincena'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
              }`}
            >
              <span className="text-lg">🛒</span>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">Corte Quincena</p>
                <p className="text-[11px] text-slate-500">Fin de mes / 15 o 30</p>
              </div>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={tone === 'formal'}
              onClick={() => setTone('formal')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                tone === 'formal'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
              }`}
            >
              <span className="text-lg">📋</span>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">Recordatorio</p>
                <p className="text-[11px] text-slate-500">Atento con plazo</p>
              </div>
            </button>
          </div>
        </div>

        {/* Configuración del mensaje: Fecha de Vencimiento / Compromiso */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
            Fecha de Pago Acordada o Vencimiento
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <button
              type="button"
              onClick={() => setDueDatePreset('none')}
              className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                dueDatePreset === 'none'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Sin fecha fija
            </button>
            <button
              type="button"
              onClick={() => setDueDatePreset('week')}
              className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                dueDatePreset === 'week'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Esta semana
            </button>
            <button
              type="button"
              onClick={() => setDueDatePreset('fifteenth')}
              className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                dueDatePreset === 'fifteenth'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Quincena (15 / 30)
            </button>
            <button
              type="button"
              onClick={() => setDueDatePreset('month_end')}
              className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                dueDatePreset === 'month_end'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Fin de mes
            </button>
            <button
              type="button"
              onClick={() => setDueDatePreset('custom')}
              className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                dueDatePreset === 'custom'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Personalizada...
            </button>
          </div>

          {dueDatePreset === 'custom' && (
            <div className="mt-2">
              <input
                type="text"
                value={customDueDate}
                onChange={(e) => setCustomDueDate(e.target.value)}
                placeholder="ej: Viernes 20 de Noviembre o Esta tarde"
                className="input min-h-[44px] text-xs"
              />
            </div>
          )}

          {effectiveDueDate && (
            <p className="text-xs text-emerald-800 font-medium mt-1 flex items-center gap-1">
              <span>📅 Se incluirá:</span>
              <strong>{effectiveDueDate}</strong>
            </p>
          )}
        </div>

        {/* Teléfono de envío */}
        <div>
          <label htmlFor="reminder-phone-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
            Número de WhatsApp del Cliente
          </label>
          <div className="relative">
            <input
              id="reminder-phone-input"
              type="tel"
              inputMode="tel"
              value={phoneOverride}
              onChange={(e) => setPhoneOverride(e.target.value)}
              placeholder="300 123 4567"
              className="input pl-9 min-h-[44px]"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
              📞
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Añadimos automáticamente el código de país de Colombia (+57) para abrir WhatsApp directamente.
          </p>
        </div>

        {/* Previsualización en tiempo real (Burbuja WhatsApp) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <span>💬 Vista Previa en WhatsApp</span>
              <span className="chip bg-emerald-100 text-emerald-800 text-[10px]">En Vivo</span>
            </span>
            <span className="text-[11px] text-slate-500">Listo para enviar</span>
          </div>

          <div
            className="rounded-xl border border-emerald-200 bg-[#EFEAE2] p-3 text-xs text-slate-800 font-sans whitespace-pre-wrap leading-relaxed shadow-inner max-h-56 overflow-y-auto"
            aria-label="Previsualización del mensaje de cobro"
          >
            <div className="rounded-lg bg-white p-3 shadow-sm border border-slate-200/80">
              {messageText}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
