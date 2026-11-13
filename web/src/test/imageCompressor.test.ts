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

    it('reduce la calidad progresivamente cuando el archivo inicial supera maxSizeBytes', async () => {
      class MockImage {
        naturalWidth = 1000;
        naturalHeight = 1000;
        width = 1000;
        height = 1000;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      }
      vi.stubGlobal('Image', MockImage);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:large-image');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        drawImage: vi.fn(),
      };

      const bigBase64 = 'A'.repeat(2000); // ~1500 bytes
      const smallBase64 = 'A'.repeat(200); // ~150 bytes
      const toDataURLMock = vi.fn((mime: string, quality?: number) => {
        if (quality === undefined) return 'data:image/webp;base64,AAAA';
        if (quality > 0.65) return `data:${mime};base64,${bigBase64}`;
        return `data:${mime};base64,${smallBase64}`;
      });

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(mockContext),
            toDataURL: toDataURLMock,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      });

      const file = new File(['large image'], 'grande.jpg', { type: 'image/jpeg' });
      const result = await compressProductImage(file, {
        maxDimension: 800,
        maxSizeBytes: 500,
        initialQuality: 0.82,
        minQuality: 0.5,
      });

      // Llamada de soporte WebP + al menos 3 intentos (0.82 -> 0.72 -> 0.62)
      const compressionCalls = toDataURLMock.mock.calls.filter((c) => c[1] !== undefined);
      expect(compressionCalls.length).toBeGreaterThanOrEqual(3);
      expect(compressionCalls[0][1]).toBeCloseTo(0.82, 2);
      expect(compressionCalls[1][1]).toBeCloseTo(0.72, 2);
      expect(compressionCalls[2][1]).toBeCloseTo(0.62, 2);
      expect(result.sizeBytes).toBeLessThanOrEqual(500);
      expect(result.format).toBe('webp');
    });

    it('hace fallback automático a JPEG cuando el navegador no soporta WebP', async () => {
      class MockImage {
        naturalWidth = 600;
        naturalHeight = 600;
        width = 600;
        height = 600;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      }
      vi.stubGlobal('Image', MockImage);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:no-webp');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const mockContext = {
        fillStyle: '',
        fillRect: vi.fn(),
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        drawImage: vi.fn(),
      };

      const toDataURLMock = vi.fn((mime: string) => {
        if (mime === 'image/webp') return 'data:image/png;base64,iVBORw0KGgo=';
        return 'data:image/jpeg;base64,dGVzdC1qcGVn';
      });

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(mockContext),
            toDataURL: toDataURLMock,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      });

      const file = new File(['png bytes'], 'empaque.png', { type: 'image/png' });
      const result = await compressProductImage(file);

      expect(result.format).toBe('jpeg');
      expect(result.dataUrl).toContain('data:image/jpeg;base64,');
      expect(toDataURLMock).toHaveBeenCalledWith('image/jpeg', 0.82);
    });

    it('lanza error descriptivo cuando la imagen está dañada o falla Image.onerror', async () => {
      class BrokenMockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }
      }
      vi.stubGlobal('Image', BrokenMockImage);
      const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:broken-image');
      const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const corruptedFile = new File(['corrupt'], 'corrupta.jpg', { type: 'image/jpeg' });
      await expect(compressProductImage(corruptedFile)).rejects.toThrow(
        'No se pudo leer la imagen seleccionada. Puede estar dañada.'
      );

      expect(createUrlSpy).toHaveBeenCalled();
      expect(revokeUrlSpy).toHaveBeenCalledWith('blob:broken-image');
    });
  });
});
