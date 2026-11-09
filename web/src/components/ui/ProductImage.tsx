import React, { useState, useEffect } from 'react';
import { findColombianProductImage, DEFAULT_PRODUCT_IMAGE } from '../../data/colombianCatalog';

export interface ProductImageProps {
  src?: string | null;
  alt: string;
  productName?: string;
  barcode?: string;
  category?: string;
  isOffer?: boolean | number;
  offerBadgeText?: string;
  className?: string;
  containerClassName?: string;
  loading?: 'lazy' | 'eager';
  showOfferBadge?: boolean;
  fallbackSrc?: string;
  onClick?: () => void;
  onError?: () => void;
}

/**
 * Componente transversal para imágenes de productos de la canasta familiar colombiana.
 * Garantiza carga diferida (lazy loading), resolución predictiva contra el banco de empaques,
 * detector automático de fallos sin iconos de imagen rota, y badge accesible de oferta.
 */
export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  productName,
  barcode,
  isOffer,
  offerBadgeText = '🔥 Oferta',
  className = 'h-full w-full object-contain',
  containerClassName = '',
  loading = 'lazy',
  showOfferBadge = true,
  fallbackSrc = DEFAULT_PRODUCT_IMAGE,
  onClick,
  onError,
}) => {
  // Resuelve la URL inicial de imagen
  const resolveInitialSrc = (): string => {
    if (src && src.trim().length > 0) {
      return src.trim();
    }
    const predicted = findColombianProductImage(productName || alt || '', barcode);
    return predicted || fallbackSrc;
  };

  const [imageSrc, setImageSrc] = useState<string>(resolveInitialSrc);
  const [hasError, setHasError] = useState<boolean>(false);
  const [attemptedFallback, setAttemptedFallback] = useState<boolean>(false);

  // Sincronizar si las props cambian
  useEffect(() => {
    setImageSrc(resolveInitialSrc());
    setHasError(false);
    setAttemptedFallback(false);
  }, [src, productName, barcode]);

  const handleImageError = () => {
    if (!attemptedFallback) {
      setAttemptedFallback(true);
      // Intentar predicción por nombre si el src original era inválido o roto
      const predicted = findColombianProductImage(productName || alt || '', barcode);
      if (predicted && predicted !== imageSrc) {
        setImageSrc(predicted);
        return;
      }
      // Si ya era el predicho o no hubo predicción, usar fallback estándar
      if (imageSrc !== fallbackSrc) {
        setImageSrc(fallbackSrc);
        return;
      }
    }

    setHasError(true);
    if (onError) {
      onError();
    }
  };

  const hasActiveOffer = Boolean(isOffer);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${containerClassName}`}
      onClick={onClick}
    >
      {/* Badge de Oferta Ergonómico */}
      {showOfferBadge && hasActiveOffer && (
        <span
          className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] sm:text-xs font-black text-white shadow-xs tracking-wide uppercase"
          aria-label="Producto en oferta"
        >
          {offerBadgeText}
        </span>
      )}

      {!hasError ? (
        <img
          src={imageSrc}
          alt={alt || productName || 'Producto'}
          loading={loading}
          decoding="async"
          onError={handleImageError}
          className={className}
        />
      ) : (
        /* Fallback visual estilizado sin imágenes rotas */
        <div
          className="flex h-full w-full flex-col items-center justify-center bg-slate-100/90 text-slate-400 p-2 select-none"
          role="img"
          aria-label={alt || productName || 'Producto'}
        >
          <svg
            className="h-8 w-8 text-slate-400 mb-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center line-clamp-1">
            {productName || alt || 'Abastos'}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProductImage;
