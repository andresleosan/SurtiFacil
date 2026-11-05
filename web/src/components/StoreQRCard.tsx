import { useState, useRef, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { generateQRMatrix, qrMatrixToSVGPath } from '../utils/qrCode';
import {
  generatePosterCanvas,
  downloadPosterPNG,
  printPoster,
  type PosterOptions,
} from '../utils/qrPosterGenerator';

export interface StoreQRCardProps {
  storeSlug?: string;
  storeName?: string;
  neighborhood?: string;
  phone?: string;
  address?: string;
  hours?: string;
}

export function StoreQRCard({
  storeSlug = 'surtifacil',
  storeName = 'SurtiFácil Abastos Central',
  neighborhood = 'La Candelaria / Centro, Medellín',
  phone = '+57 300 123 4567',
  address = 'Calle 50 # 50-20, Medellín',
  hours = 'Lunes a Domingo 7:00 AM - 9:00 PM',
}: StoreQRCardProps) {
  const [activeTab, setActiveTab] = useState<'storefront' | 'kiosk'>('storefront');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // URLs canónicas públicas
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://surtifacil.pages.dev';
  const cleanSlug = (storeSlug || 'surtifacil').trim().toLowerCase();

  const targetUrl =
    activeTab === 'storefront'
      ? `${origin}/#/tienda/${cleanSlug}`
      : `${origin}/#/kiosco/${cleanSlug}`;

  // Matriz QR para renderizado SVG rápido en la tarjeta
  const qrMatrix = generateQRMatrix(targetUrl);
  const { pathData, fullSize } = qrMatrixToSVGPath(qrMatrix, 8, 3);

  // Opciones de afiche
  const posterOptions: PosterOptions = {
    storeName,
    neighborhood,
    phone,
    address,
    hours,
    targetUrl,
    posterType: activeTab,
  };

  // Dibuja una vista previa a escala en el mini canvas
  useEffect(() => {
    if (!previewCanvasRef.current) return;
    try {
      const fullCanvas = generatePosterCanvas(posterOptions);
      const previewCanvas = previewCanvasRef.current;
      const previewCtx = previewCanvas.getContext('2d');
      if (previewCtx) {
        previewCanvas.width = 300;
        previewCanvas.height = 400;
        previewCtx.drawImage(fullCanvas, 0, 0, 300, 400);
      }
    } catch (err) {
      console.warn('Error generando miniatura de afiche:', err);
    }
  }, [activeTab, targetUrl, storeName, neighborhood]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const fullCanvas = generatePosterCanvas(posterOptions);
      const filename = `afiche-qr-${activeTab}-${cleanSlug}.png`;
      await downloadPosterPNG(fullCanvas, filename);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    const fullCanvas = generatePosterCanvas(posterOptions);
    printPoster(fullCanvas);
  };

  return (
    <div className="card space-y-6 p-5 md:p-6">
      {/* Cabecera del componente */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-sf-primary/10 p-2 text-sf-primary">
            <Icon name="qr" size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-sf-text">Afiches y Códigos QR para el Mostrador</h2>
            <p className="text-xs text-gray-500">
              Genera carteles listos para imprimir y pegar en la vitrina, el mostrador o el atril del local.
            </p>
          </div>
        </div>

        {/* Selector de tipo de afiche */}
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'storefront'}
            onClick={() => setActiveTab('storefront')}
            className={`min-h-[38px] rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'storefront'
                ? 'bg-white text-sf-primary shadow-sm'
                : 'text-gray-600 hover:text-sf-text'
            }`}
          >
            🛒 Tienda Vecinal Web
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'kiosk'}
            onClick={() => setActiveTab('kiosk')}
            className={`min-h-[38px] rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'kiosk'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-gray-600 hover:text-sf-text'
            }`}
          >
            ⚡ Kiosco de Autoatención
          </button>
        </div>
      </div>

      {/* Contenido en dos columnas: Vista Previa del Afiche + Controles de Acción */}
      <div className="grid gap-6 md:grid-cols-12 items-center">
        {/* Columna Izquierda: Miniatura interactiva del afiche */}
        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="relative group overflow-hidden rounded-2xl shadow-lg border-2 border-slate-200/80 bg-sf-dark transition hover:shadow-xl">
            <canvas
              ref={previewCanvasRef}
              width={300}
              height={400}
              className="block w-full max-w-[260px] h-auto object-contain rounded-xl"
              aria-label={`Vista previa del afiche de ${activeTab === 'storefront' ? 'Tienda Vecinal' : 'Modo Kiosco'}`}
            />
            <div className="absolute inset-0 bg-sf-dark/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center text-white">
              <span className="text-sm font-bold">Afiche de Alta Resolución</span>
              <span className="text-xs text-white/80 mt-1">1200 × 1600 px (Formato Póster)</span>
              <button
                type="button"
                onClick={handlePrint}
                className="mt-3 btn-secondary text-xs min-h-[36px] bg-white text-sf-dark hover:bg-slate-100"
              >
                <Icon name="printer" size={16} />
                <span>Imprimir Ahora</span>
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-500">
            Vista previa a escala • Listo para imprimir en hoja A4 o tamaño póster
          </p>
        </div>

        {/* Columna Derecha: Código QR nítido, enlace y botones de descarga */}
        <div className="md:col-span-7 space-y-4">
          {/* Tarjeta de información del canal */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-start gap-4">
              {/* Código QR SVG nítido */}
              <div className="shrink-0 rounded-lg bg-white p-2 border border-slate-200 shadow-xs">
                <svg
                  viewBox={`0 0 ${fullSize} ${fullSize}`}
                  className="w-24 h-24"
                  role="img"
                  aria-label="Código QR del local"
                >
                  <rect width="100%" height="100%" fill="#FFFFFF" />
                  <path d={pathData} fill="#0D1B2A" />
                </svg>
              </div>

              {/* Explicación del afiche seleccionado */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                      activeTab === 'storefront'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {activeTab === 'storefront' ? '🛵 Domicilios y Mostrador' : '⚡ Autoatención en Entrada'}
                  </span>
                </div>
                <h3 className="mt-1 text-sm font-bold text-sf-text">
                  {activeTab === 'storefront'
                    ? 'Catálogo Digital para Vecinos'
                    : 'Turno de Autoatención Kiosco'}
                </h3>
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                  {activeTab === 'storefront'
                    ? 'Tus clientes escanean este código con su celular para ver productos frescos, pedir a domicilio o recoger en tienda.'
                    : 'Ubica este cartel cerca a la entrada o pedestal para que los clientes armen su pedido y tomen turno sin aglomeraciones.'}
                </p>
              </div>
            </div>

            {/* Input con enlace público y botón copiar */}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={targetUrl}
                aria-label="Enlace público del código QR"
                className="input py-1.5 text-xs text-slate-700 bg-white font-mono"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="btn-secondary min-h-[38px] px-3 text-xs shrink-0"
                aria-label="Copiar enlace al portapapeles"
              >
                <Icon name={copied ? 'check' : 'copy'} size={16} className={copied ? 'text-emerald-600' : ''} />
                <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
              </button>
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary min-h-[38px] px-3 text-xs shrink-0"
                aria-label="Abrir enlace en nueva pestaña"
              >
                <Icon name="external-link" size={16} />
                <span>Abrir</span>
              </a>
            </div>
          </div>

          {/* Botones de acción principales */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              disabled={generating}
              onClick={handleDownload}
              className="btn-primary flex-1 min-h-[44px] text-sm shadow-md"
            >
              <Icon name="download" size={18} />
              <span>{generating ? 'Generando PNG...' : 'Descargar Afiche en PNG (Alta Calidad)'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn-secondary min-h-[44px] px-5 text-sm"
            >
              <Icon name="printer" size={18} />
              <span>Imprimir Afiche</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoreQRCard;
