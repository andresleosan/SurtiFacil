import { useEffect, useMemo, useState } from 'react';
import { Sale } from '../firebase/db';
import { StoreSettings } from '../types/storeSettings';
import { CashClosing } from '../types/cashClosing';
import { getStoreSettings } from '../services/settingsService';
import {
  generateSaleReceiptText,
  generateSaleWhatsAppText,
  generateCashClosingReceiptText,
  generateCashClosingWhatsAppText,
  generateCreditPaymentReceiptText,
  generateCreditPaymentWhatsAppText,
  CreditPaymentReceipt,
  ThermalWidth,
} from '../utils/receiptGenerator';
import { generateQRMatrix, qrMatrixToSVGPath } from '../utils/qrCode';
import { Modal } from './ui/Modal';
import { Icon } from './ui/Icon';

export interface ThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale?: Sale | null;
  closing?: CashClosing | null;
  creditPayment?: CreditPaymentReceipt | null;
}

export function ThermalReceiptModal({
  isOpen,
  onClose,
  sale,
  closing,
  creditPayment,
}: ThermalReceiptModalProps) {
  const [width, setWidth] = useState<ThermalWidth>('58mm');
  const [showQR, setShowQR] = useState(true);
  const [storeSettings, setStoreSettings] = useState<Partial<StoreSettings>>({});
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void getStoreSettings().then(setStoreSettings);
      setCopied(false);
      setShowPhonePrompt(false);
    }
  }, [isOpen]);

  // Si no está abierto o no hay entidad activa, no renderizar
  if (!isOpen || (!sale && !closing && !creditPayment)) {
    return null;
  }

  const receiptText = sale
    ? generateSaleReceiptText(sale, storeSettings, { width })
    : closing
    ? generateCashClosingReceiptText(closing, storeSettings, { width })
    : creditPayment
    ? generateCreditPaymentReceiptText(creditPayment, storeSettings, { width })
    : '';

  const whatsAppText = sale
    ? generateSaleWhatsAppText(sale, storeSettings)
    : closing
    ? generateCashClosingWhatsAppText(closing, storeSettings)
    : creditPayment
    ? generateCreditPaymentWhatsAppText(creditPayment, storeSettings)
    : '';

  // Determinar la URL del código QR para verificación vecinal o catálogo
  const qrUrl = (() => {
    if (sale?.customer_order_token) {
      return `https://surtifacil.pages.dev/#/pedido/${sale.customer_order_token}`;
    }
    const slug = storeSettings.slug || 'surtifacil';
    if (sale || creditPayment) {
      return `https://surtifacil.pages.dev/#/tienda/${slug}`;
    }
    if (closing) {
      return 'https://surtifacil.pages.dev/#/sales';
    }
    return `https://surtifacil.pages.dev/#/tienda/${slug}`;
  })();

  const qrData = (() => {
    if (!showQR) return null;
    try {
      const matrix = generateQRMatrix(qrUrl);
      return qrMatrixToSVGPath(matrix, 4, 1);
    } catch {
      return null;
    }
  })();

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleSendWhatsApp = (phone?: string) => {
    const targetPhone = phone || whatsappPhone;
    const cleanPhone = targetPhone.replace(/\D/g, '');
    let finalPhone = cleanPhone;

    // Si es un número colombiano de 10 dígitos (ej. 3001234567), anteponer código de país 57
    if (finalPhone.length === 10 && finalPhone.startsWith('3')) {
      finalPhone = `57${finalPhone}`;
    }

    const encoded = encodeURIComponent(whatsAppText);
    const url = finalPhone ? `https://wa.me/${finalPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowPhonePrompt(false);
  };

  const title = sale
    ? `Tirilla de Venta #${(sale.id || '').slice(0, 8)}`
    : closing
    ? `Acta de Cierre #${closing?.closing_number || ''}`
    : `Comprobante de Abono #${(creditPayment?.receipt_number || '').slice(0, 8)}`;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full no-print">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setWidth('58mm')}
              className={`min-h-[36px] px-3 text-xs font-semibold rounded-md transition ${
                width === '58mm' ? 'bg-white text-sf-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              58mm (Estándar)
            </button>
            <button
              type="button"
              onClick={() => setWidth('80mm')}
              className={`min-h-[36px] px-3 text-xs font-semibold rounded-md transition ${
                width === '80mm' ? 'bg-white text-sf-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              80mm (Ancho)
            </button>
            <button
              type="button"
              onClick={() => setShowQR((prev) => !prev)}
              className={`min-h-[36px] px-2.5 text-xs font-semibold rounded-md transition ${
                showQR ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'text-slate-500 hover:text-slate-900'
              }`}
              aria-pressed={showQR}
              aria-label="Alternar código QR en la tirilla"
              title="Alternar código QR en la tirilla"
            >
              <span>{showQR ? '📷 Con QR' : 'Sin QR'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPhonePrompt((prev) => !prev)}
              className="btn-success min-h-[40px] px-3 text-xs"
            >
              <span>📲 WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn-primary min-h-[40px] px-3 text-xs"
            >
              <Icon name="receipt" size={16} />
              <span>🖨️ Imprimir</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Panel para ingresar número de WhatsApp si desea especificar destino */}
        {showPhonePrompt && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm no-print space-y-2">
            <p className="font-semibold text-emerald-900">
              Enviar {sale ? 'tirilla al cliente' : creditPayment ? 'recibo de abono al cliente' : 'reporte al administrador'} por WhatsApp
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="Ej: 300 123 4567 (o dejar vacío para elegir contacto)"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="input text-sm flex-1"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleSendWhatsApp(whatsappPhone)}
                className="btn-success min-h-[44px] px-4 text-xs shrink-0"
              >
                Enviar
              </button>
            </div>
          </div>
        )}

        {/* Barra de herramientas rápida */}
        <div className="flex items-center justify-between text-xs text-slate-500 no-print">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Vista previa térmica ({width}) {showQR && '· QR Vecinal'}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-sf-primary text-slate-600 font-medium"
          >
            <span>{copied ? '✅ ¡Copiado!' : '📋 Copiar texto'}</span>
          </button>
        </div>

        {/* Contenedor imprimible de la tirilla térmica */}
        <div className="flex justify-center bg-slate-100 p-3 rounded-xl overflow-x-auto">
          <div
            className={`thermal-receipt-printable bg-white p-4 text-slate-900 shadow-sm border border-slate-200 rounded-lg transition-all ${
              width === '58mm' ? 'thermal-58mm max-w-[280px]' : 'thermal-80mm max-w-[380px]'
            }`}
          >
            <pre className="font-mono text-xs whitespace-pre-wrap leading-tight select-all">
              {receiptText}
            </pre>

            {/* Código QR de Verificación y Pedido Vecinal */}
            {showQR && qrData && (
              <div className="receipt-qr-section flex flex-col items-center justify-center mt-3 pt-2 border-t border-dashed border-slate-300 text-center">
                <svg
                  viewBox={`0 0 ${qrData.fullSize} ${qrData.fullSize}`}
                  className={`receipt-qr mx-auto transition-all ${
                    width === '58mm' ? 'w-[96px] h-[96px]' : 'w-[124px] h-[124px]'
                  }`}
                  aria-label="Código QR de verificación vecinal y pedidos"
                  shapeRendering="crispEdges"
                >
                  <path d={qrData.pathData} fill="#000000" />
                </svg>
                <p className="font-mono text-[9px] tracking-tight mt-1 text-slate-700 uppercase">
                  [ Escanea para pedir o verificar ]
                </p>
                <p className="font-mono text-[8px] text-slate-500">
                  surtifacil.pages.dev
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ThermalReceiptModal;
