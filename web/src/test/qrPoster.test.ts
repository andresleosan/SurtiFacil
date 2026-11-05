import { describe, it, expect, vi } from 'vitest';
import { generateQRMatrix, qrMatrixToSVGPath, drawQRToCanvas } from '../utils/qrCode';
import { generatePosterCanvas, downloadPosterPNG, type PosterOptions } from '../utils/qrPosterGenerator';

describe('Generador QR Autónomo (qrCode.ts)', () => {
  it('genera una matriz cuadrada booleana para una URL pública', () => {
    const url = 'https://surtifacil.pages.dev/#/tienda/surtifacil';
    const matrix = generateQRMatrix(url);

    expect(Array.isArray(matrix)).toBe(true);
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix[0].length).toBe(matrix.length);

    // Los patrones de búsqueda deben tener módulos oscuros en las esquinas (0,0)
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][matrix.length - 1]).toBe(true);
    expect(matrix[matrix.length - 1][0]).toBe(true);
  });

  it('convierte la matriz a datos de path SVG válidos', () => {
    const matrix = generateQRMatrix('https://surtifacil.pages.dev/#/kiosco/surtifacil');
    const { pathData, fullSize } = qrMatrixToSVGPath(matrix, 10, 4);

    expect(typeof pathData).toBe('string');
    expect(pathData.length).toBeGreaterThan(100);
    expect(pathData).toContain('M');
    expect(pathData).toContain('h10v10h-10z');
    expect(fullSize).toBe((matrix.length + 8) * 10);
  });

  it('dibuja la matriz QR sobre un canvas HTML5', () => {
    const matrix = generateQRMatrix('https://surtifacil.pages.dev');
    const canvas = document.createElement('canvas');

    const fillRectMock = vi.fn();
    const ctxMock = {
      fillStyle: '',
      fillRect: fillRectMock,
    };

    vi.spyOn(canvas, 'getContext').mockReturnValue(ctxMock as unknown as CanvasRenderingContext2D);

    drawQRToCanvas(matrix, canvas, { cellSize: 6, margin: 2, fgColor: '#000000', bgColor: '#FFFFFF' });

    expect(canvas.width).toBe((matrix.length + 4) * 6);
    expect(canvas.height).toBe((matrix.length + 4) * 6);
    expect(fillRectMock).toHaveBeenCalled();
  });
});

describe('Generador de Afiches Imprimibles (qrPosterGenerator.ts)', () => {
  const options: PosterOptions = {
    storeName: 'Tienda y Abastos Don Pedro',
    neighborhood: 'Belén Las Playas, Medellín',
    phone: '3001234567',
    address: 'Carrera 76 # 28-10',
    hours: '7:00 AM - 9:00 PM',
    targetUrl: 'https://surtifacil.pages.dev/#/tienda/don-pedro',
    posterType: 'storefront',
  };

  it('genera un canvas con dimensiones de afiche póster (1200x1600 px)', () => {
    const canvas = generatePosterCanvas(options);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1600);
  });

  it('soporta la generación de afiche para Modo Kiosco', () => {
    const kioskOptions: PosterOptions = {
      ...options,
      posterType: 'kiosk',
      targetUrl: 'https://surtifacil.pages.dev/#/kiosco/don-pedro',
    };
    const canvas = generatePosterCanvas(kioskOptions);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1600);
  });

  it('permite descargar el afiche como PNG', async () => {
    const canvas = document.createElement('canvas');
    canvas.toBlob = undefined as any;
    canvas.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,fake');

    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const link = origCreateElement('a');
        link.click = clickSpy;
        return link;
      }
      return origCreateElement(tagName);
    });

    await downloadPosterPNG(canvas, 'test-afiche.png');
    expect(clickSpy).toHaveBeenCalled();
  });
});
