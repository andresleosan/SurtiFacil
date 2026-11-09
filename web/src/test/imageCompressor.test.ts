import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateTargetDimensions,
  estimateDataUrlSizeBytes,
  formatSizeKB,
  compressProductImage,
  isWebPSupported,
} from '../utils/imageCompressor';

describe('imageCompressor', () => {
  describe('calculateTargetDimensions', () => {
    it('mantiene las dimensiones originales si la imagen es menor que el máximo permitido', () => {
      const result = calculateTargetDimensions(400, 300, 800);
      expect(result).toEqual({ width: 400, height: 300 });
    });

    it('escala proporcionalmente una imagen ancha reduciendo el ancho a 800px', () => {
      // 1600 x 800 -> escala a 800 x 400
      const result = calculateTargetDimensions(1600, 800, 800);
      expect(result).toEqual({ width: 800, height: 400 });
    });

    it('escala proporcionalmente una imagen vertical reduciendo el alto a 800px', () => {
      // 1200 x 2400 (foto típica de celular) -> escala a 400 x 800
      const result = calculateTargetDimensions(1200, 2400, 800);
      expect(result).toEqual({ width: 400, height: 800 });
    });

    it('escala proporcionalmente una imagen cuadrada', () => {
      const result = calculateTargetDimensions(1500, 1500, 800);
      expect(result).toEqual({ width: 800, height: 800 });
    });

    it('maneja dimensiones inválidas retornando el máximo seguro', () => {
      const result = calculateTargetDimensions(0, 0, 800);
      expect(result).toEqual({ width: 800, height: 800 });
    });
  });

  describe('estimateDataUrlSizeBytes', () => {
    it('calcula correctamente el peso en bytes de un dataURL base64', () => {
      // "data:image/webp;base64,AAAA" -> "AAAA" son 4 caracteres -> 3 bytes
      const testUrl = 'data:image/webp;base64,AAAA';
      const bytes = estimateDataUrlSizeBytes(testUrl);
      expect(bytes).toBe(3);
    });

    it('considera el padding base64 con "=" y "=="', () => {
      const urlWithPadding = 'data:image/webp;base64,AAA=';
      const bytes = estimateDataUrlSizeBytes(urlWithPadding);
      expect(bytes).toBe(2);
    });
  });

  describe('formatSizeKB', () => {
    it('formatea bytes a string en KB con 1 decimal', () => {
      expect(formatSizeKB(1024)).toBe('1.0 KB');
      expect(formatSizeKB(45 * 1024)).toBe('45.0 KB');
      expect(formatSizeKB(78500)).toBe('76.7 KB');
    });
  });

  describe('isWebPSupported', () => {
    it('devuelve booleano en entorno de navegador sin lanzar error', () => {
      const supported = isWebPSupported();
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('compressProductImage', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('rechaza archivos que no sean imágenes', async () => {
      const textBlob = new Blob(['hello text'], { type: 'text/plain' });
      await expect(compressProductImage(textBlob)).rejects.toThrow(
        'El archivo seleccionado no es una imagen válida.'
      );
    });

    it('comprime una imagen y retorna un objeto de resultado válido', async () => {
      class MockImage {
        naturalWidth = 1600;
        naturalHeight = 1200;
        width = 1600;
        height = 1200;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = '';

        set src(value: string) {
          this._src = value;
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }

        get src() {
          return this._src;
        }
      }

      vi.stubGlobal('Image', MockImage);

      const mockCreateObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-image');
      const mockRevokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        drawImage: vi.fn(),
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(mockContext),
            toDataURL: vi.fn().mockReturnValue('data:image/webp;base64,dGVzdC1kYXRh'),
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      });

      const file = new File(['fake image bytes'], 'celular-foto.jpg', { type: 'image/jpeg' });
      const result = await compressProductImage(file, { maxDimension: 800 });

      expect(result.dataUrl).toContain('data:image/');
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.fileName).toBe('celular-foto.jpg');

      mockCreateObjectUrl.mockRestore();
      mockRevokeObjectUrl.mockRestore();
    });
  });
});
