import React, { useState, useRef } from 'react';
import { ProductImage } from './ProductImage';
import { compressProductImage, formatSizeKB, estimateDataUrlSizeBytes } from '../../utils/imageCompressor';
import { Icon } from './Icon';

export interface ProductPhotoUploaderProps {
  imageUrl?: string;
  productName?: string;
  barcode?: string;
  category?: string;
  onChange: (newImageUrl: string) => void;
  onRemove?: () => void;
  label?: string;
  helperText?: string;
  compact?: boolean;
}

export const ProductPhotoUploader: React.FC<ProductPhotoUploaderProps> = ({
  imageUrl = '',
  productName = '',
  barcode = '',
  category = '',
  onChange,
  onRemove,
  label = 'Foto del Producto en Mostrador',
  helperText = 'Toma una foto con la cámara trasera de tu celular o selecciona un archivo. Se comprime automáticamente a WebP (<120 KB).',
  compact = false,
}) => {
  const [compressing, setCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{
    format: string;
    sizeKB: string;
    width: number;
    height: number;
  } | null>(() => {
    if (imageUrl && imageUrl.startsWith('data:image/')) {
      const bytes = estimateDataUrlSizeBytes(imageUrl);
      const isWebP = imageUrl.startsWith('data:image/webp');
      return {
        format: isWebP ? 'WebP' : 'JPEG',
        sizeKB: formatSizeKB(bytes),
        width: 800,
        height: 800,
      };
    }
    return null;
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Por favor selecciona un archivo de imagen válido (JPG, PNG o WebP).');
      return;
    }

    try {
      setCompressing(true);
      setErrorMessage('');

      const result = await compressProductImage(file, {
        maxDimension: 800,
        maxSizeBytes: 120 * 1024,
        initialQuality: 0.82,
      });

      setCompressionInfo({
        format: result.format.toUpperCase(),
        sizeKB: formatSizeKB(result.sizeBytes),
        width: result.width,
        height: result.height,
      });

      onChange(result.dataUrl);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al procesar y comprimir la fotografía.'
      );
    } finally {
      setCompressing(false);
      // Limpiar inputs para permitir re-selección del mismo archivo
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleProcessFile(file);
    }
  };

  const handleClearPhoto = () => {
    onChange('');
    setCompressionInfo(null);
    setErrorMessage('');
    if (onRemove) onRemove();
  };

  const isBase64 = imageUrl.startsWith('data:image/');

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
      {/* Cabecera y Título */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <label className="block text-sm font-bold text-slate-800">
            {label}
          </label>
          {helperText && !compact && (
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {helperText}
            </p>
          )}
        </div>
        {imageUrl && (
          <button
            type="button"
            onClick={handleClearPhoto}
            aria-label="Quitar foto del producto"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition min-h-[32px]"
          >
            <Icon name="trash" size={14} />
            <span>Quitar</span>
          </button>
        )}
      </div>

      {/* Inputs ocultos de archivo y cámara */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        id="camera-photo-input"
        data-testid="camera-photo-input"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        id="gallery-photo-input"
        data-testid="gallery-photo-input"
      />

      {/* Mensaje de Error */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-700 flex items-center justify-between"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-rose-500 hover:text-rose-700 font-bold ml-2 text-sm"
            aria-label="Cerrar alerta de error"
          >
            ×
          </button>
        </div>
      )}

      {/* Contenedor de Vista Previa y Acciones Rápidas */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Vista Previa de la Imagen */}
        <div className="relative h-24 w-24 shrink-0 rounded-2xl bg-white p-2 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shadow-xs">
          {compressing ? (
            <div className="flex flex-col items-center justify-center text-center p-1">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-sf-primary border-t-transparent mb-1" />
              <span className="text-[10px] font-bold text-sf-primary">Comprimiendo</span>
            </div>
          ) : (
            <ProductImage
              src={imageUrl || undefined}
              alt={productName || 'Foto del producto'}
              productName={productName}
              barcode={barcode}
              category={category}
              showOfferBadge={false}
              containerClassName="h-full w-full"
              className="h-full w-full object-contain"
            />
          )}

          {isBase64 && !compressing && (
            <span
              title="Foto comprimida en cliente"
              className="absolute bottom-1 right-1 rounded-md bg-emerald-600 px-1 py-0.5 text-[9px] font-black text-white shadow-xs"
            >
              WebP
            </span>
          )}
        </div>

        {/* Botones de Acción Táctil (≥44px) */}
        <div className="flex-1 w-full space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={compressing}
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sf-primary px-3 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition disabled:opacity-50"
            >
              <span className="text-base">📸</span>
              <span>Tomar con Celular</span>
            </button>

            <button
              type="button"
              disabled={compressing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition disabled:opacity-50"
            >
              <span className="text-base">🖼️</span>
              <span>Subir de Galería</span>
            </button>
          </div>

          {/* Badges de Información de Compresión */}
          {compressionInfo && (
            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <span className="text-emerald-700 font-bold">⚡ Optimizado {compressionInfo.format}:</span>
              <span>{compressionInfo.sizeKB}</span>
              <span className="text-slate-400">•</span>
              <span>Máx {compressionInfo.width}×{compressionInfo.height} px</span>
            </div>
          )}

          {/* Alternar URL de imagen / preset manual */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="text-[11px] font-medium text-sf-primary hover:underline inline-flex items-center gap-1"
            >
              <span>{showUrlInput ? '▼ Ocultar URL manual' : '▶ O escribir / pegar URL web de la foto'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Campo opcional de URL directa */}
      {showUrlInput && (
        <div className="pt-2 border-t border-slate-200">
          <label htmlFor="product-photo-url-input" className="block text-xs font-semibold text-slate-600 mb-1">
            URL directa de imagen o ruta SVG local:
          </label>
          <input
            id="product-photo-url-input"
            type="text"
            value={imageUrl}
            onChange={(e) => {
              setCompressionInfo(null);
              onChange(e.target.value);
            }}
            placeholder="/images/products/leche-colanta-1l.svg o https://..."
            className="input text-xs"
          />
        </div>
      )}
    </div>
  );
};

export default ProductPhotoUploader;
