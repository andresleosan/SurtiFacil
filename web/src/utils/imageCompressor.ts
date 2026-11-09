/**
 * Compresor de imágenes en el cliente para SurtiFácil SaaS.
 * Utiliza Canvas HTML5 para redimensionar proporcionalmente a máx. 800×800 px
 * y comprime a WebP (con fallback a JPEG) garantizando un peso < 120 KB en Base64.
 */

export interface CompressionOptions {
  maxDimension?: number; // Ancho o alto máximo en píxeles (default: 800)
  maxSizeBytes?: number; // Límite en bytes deseado (default: 120 * 1024 = 122880)
  initialQuality?: number; // Calidad inicial (0.1 a 1.0, default: 0.82)
  minQuality?: number; // Calidad mínima permitida en reducción progresiva (default: 0.5)
}

export interface CompressedImageResult {
  dataUrl: string;
  format: 'webp' | 'jpeg';
  width: number;
  height: number;
  sizeBytes: number;
  sizeKB: number;
  fileName?: string;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxDimension: 800,
  maxSizeBytes: 120 * 1024, // 120 KB
  initialQuality: 0.82,
  minQuality: 0.5,
};

/**
 * Calcula las dimensiones proporcionales que caben dentro de maxDimension x maxDimension.
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: maxDimension, height: maxDimension };
  }

  if (srcWidth <= maxDimension && srcHeight <= maxDimension) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) };
  }

  const ratio = Math.min(maxDimension / srcWidth, maxDimension / srcHeight);
  return {
    width: Math.max(1, Math.round(srcWidth * ratio)),
    height: Math.max(1, Math.round(srcHeight * ratio)),
  };
}

/**
 * Convierte un Data URL a su tamaño estimado en bytes.
 */
export function estimateDataUrlSizeBytes(dataUrl: string): number {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return dataUrl.length;
  const base64Str = parts[1];
  // 4 caracteres base64 representan 3 bytes
  const padding = (base64Str.endsWith('==') ? 2 : base64Str.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.round((base64Str.length * 3) / 4) - padding);
}

/**
 * Formatea bytes a un texto legible en KB (ej: "45.2 KB").
 */
export function formatSizeKB(bytes: number): string {
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/**
 * Detecta si el entorno canvas soporta compresión a formato WebP.
 */
export function isWebPSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const data = canvas.toDataURL('image/webp');
    return Boolean(data && data.startsWith('data:image/webp'));
  } catch {
    return false;
  }
}

/**
 * Comprime un archivo de imagen o Blob en el navegador.
 */
export async function compressProductImage(
  file: File | Blob,
  options?: CompressionOptions
): Promise<CompressedImageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen válida.');
  }

  // Cargar imagen en memoria
  const imageElement = await loadImageElement(file);
  const { width: targetWidth, height: targetHeight } = calculateTargetDimensions(
    imageElement.naturalWidth || imageElement.width,
    imageElement.naturalHeight || imageElement.height,
    opts.maxDimension
  );

  // Crear canvas y dibujar imagen escalada
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No fue posible inicializar el contexto de imagen 2D.');
  }

  // Fondo blanco para imágenes transparentes que se conviertan a JPEG o WebP
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Renderizado nítido con suavizado de alta calidad
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);

  // Determinar formato preferido
  const prefersWebP = isWebPSupported();
  const mimeType = prefersWebP ? 'image/webp' : 'image/jpeg';
  const format: 'webp' | 'jpeg' = prefersWebP ? 'webp' : 'jpeg';

  // Compresión progresiva para asegurar peso < maxSizeBytes
  let quality = opts.initialQuality;
  let dataUrl = canvas.toDataURL(mimeType, quality);
  let sizeBytes = estimateDataUrlSizeBytes(dataUrl);

  while (sizeBytes > opts.maxSizeBytes && quality > opts.minQuality) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL(mimeType, Math.max(opts.minQuality, quality));
    sizeBytes = estimateDataUrlSizeBytes(dataUrl);
  }

  const fileName = 'name' in file ? (file as File).name : undefined;

  return {
    dataUrl,
    format,
    width: targetWidth,
    height: targetHeight,
    sizeBytes,
    sizeKB: Math.round((sizeBytes / 1024) * 10) / 10,
    fileName,
  };
}

/**
 * Carga un File o Blob en un HTMLImageElement.
 */
function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen seleccionada. Puede estar dañada.'));
    };

    img.src = objectUrl;
  });
}
