import { useState } from 'react';
import { analyzeProductImage } from '../services/anthropicService';
import { compressProductImage, formatSizeKB } from '../utils/imageCompressor';

interface ImageUploadAIProps {
  onProductData: (data: {
    nombre: string;
    precio_sugerido: number | null;
    categoria: string;
    imageUrl?: string;
  }) => void;
  onError: (error: string) => void;
}

const ImageUploadAI = ({ onProductData, onError }: ImageUploadAIProps) => {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState<string | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar que sea imagen
    if (!file.type.startsWith('image/')) {
      onError('Por favor selecciona una imagen válida');
      return;
    }

    try {
      setLoading(true);
      onError('');

      let base64Image = '';
      let base64Data = '';

      try {
        // Intentar compresión en cliente con Canvas WebP
        const compressed = await compressProductImage(file, {
          maxDimension: 800,
          maxSizeBytes: 120 * 1024,
        });
        base64Image = compressed.dataUrl;
        base64Data = compressed.dataUrl.split(',')[1] || '';
        setCompressedSize(`${compressed.format.toUpperCase()} (${formatSizeKB(compressed.sizeBytes)})`);
      } catch {
        // Fallback estándar en caso de no disponibilidad de canvas
        const rawBase64 = await readFileAsDataUrl(file);
        base64Image = rawBase64;
        base64Data = rawBase64.split(',')[1] || '';
        setCompressedSize(null);
      }

      setImagePreview(base64Image);

      // Analizar imagen con IA
      const result = await analyzeProductImage(base64Data);
      onProductData({
        ...result,
        imageUrl: base64Image,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al analizar imagen';
      onError(errorMessage);
      setImagePreview(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-sf-cyan rounded-lg p-6 text-center hover:border-sf-primary transition">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageChange}
          disabled={loading}
          className="hidden"
          id="image-upload"
          data-testid="image-upload-ai-input"
        />
        <label htmlFor="image-upload" className="cursor-pointer">
          <div className="text-4xl mb-2">📷</div>
          <p className="text-sm font-medium text-sf-text">
            {loading ? 'Comprimiendo y analizando imagen...' : 'Toca para capturar o seleccionar foto con cámara'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Se optimiza automáticamente a WebP &lt; 120 KB</p>
        </label>
      </div>

      {imagePreview && (
        <div className="relative">
          <img src={imagePreview} alt="Preview" className="w-full h-36 object-contain rounded-lg bg-slate-50 border border-slate-200" />
          {compressedSize && (
            <span className="absolute bottom-2 left-2 rounded-md bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5">
              ⚡ {compressedSize}
            </span>
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
              <div className="text-white text-sm font-semibold">Analizando con Sarin IA...</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

export default ImageUploadAI;
