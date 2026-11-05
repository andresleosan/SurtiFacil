/**
 * Generador autónomo y ligero de Códigos QR en TypeScript puro para SurtiFácil SaaS.
 * Basado en las especificaciones ISO/IEC 18004 para modo Byte (UTF-8) y corrección de error M.
 * Cero dependencias externas, 100% offline y compatible con Node, jsdom y Canvas.
 */

export interface QROptions {
  cellSize?: number;
  margin?: number;
  fgColor?: string;
  bgColor?: string;
}

// Tablas estándar de capacidades de datos (modo Byte, ECC Nivel M)
const CAPACITY_ECC_M = [
  0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362,
];

// Cantidad de palabras código totales por versión
const TOTAL_CODEWORDS = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581,
];

// Cantidad de palabras código de corrección de error por versión (Nivel M)
const ECC_CODEWORDS_M = [
  0, 10, 16, 26, 36, 48, 64, 72, 88, 110, 130, 150, 176, 198, 216,
];

// Posiciones de los patrones de alineación por versión
const ALIGNMENT_PATTERN_POSITIONS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// Campo de Galois GF(256) con polinomio primitivo 0x11D
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  LOG_TABLE[0] = 0;
})();

function gMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function calculateReedSolomon(data: Uint8Array, eccCount: number): Uint8Array {
  // Generar polinomio generador de grado eccCount
  let generator = new Uint8Array([1]);
  for (let i = 0; i < eccCount; i++) {
    const nextPoly = new Uint8Array(generator.length + 1);
    for (let j = 0; j < generator.length; j++) {
      nextPoly[j] ^= gMultiply(generator[j], EXP_TABLE[i]);
      nextPoly[j + 1] ^= generator[j];
    }
    generator = nextPoly;
  }

  // División polinomial para calcular el residuo (palabras ECC)
  const result = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[eccCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < eccCount; j++) {
        result[j] ^= gMultiply(generator[j], factor);
      }
    }
  }
  return result;
}

/**
 * Determina la versión mínima de QR (1 a 10) que soporta el texto.
 */
function selectQRVersion(byteLength: number): number {
  for (let v = 1; v < CAPACITY_ECC_M.length; v++) {
    if (byteLength <= CAPACITY_ECC_M[v]) {
      return v;
    }
  }
  return 10;
}

/**
 * Codifica una cadena de texto en bytes UTF-8 con cabecera de modo Byte y padding.
 */
function encodeData(text: string, version: number): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const dataCodewordsCount = TOTAL_CODEWORDS[version] - ECC_CODEWORDS_M[version];

  const bits: number[] = [];
  const pushBits = (val: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Modo Byte (0100)
  pushBits(0b0100, 4);

  // Contador de caracteres (8 bits para versiones 1-9, 16 bits para 10+)
  const charCountBits = version < 10 ? 8 : 16;
  pushBits(textBytes.length, charCountBits);

  // Datos
  for (let i = 0; i < textBytes.length; i++) {
    pushBits(textBytes[i], 8);
  }

  // Terminador (hasta 4 ceros)
  const totalDataBits = dataCodewordsCount * 8;
  const terminatorLength = Math.min(4, totalDataBits - bits.length);
  for (let i = 0; i < terminatorLength; i++) {
    bits.push(0);
  }

  // Relleno a múltiplo de 8 bits
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Convertir a bytes
  const bytes = new Uint8Array(dataCodewordsCount);
  let byteIndex = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i + j];
    }
    bytes[byteIndex++] = b;
  }

  // Bytes de relleno alternados 0xEC y 0x11
  let padByte = 0xec;
  while (byteIndex < dataCodewordsCount) {
    bytes[byteIndex++] = padByte;
    padByte = padByte === 0xec ? 0x11 : 0xec;
  }

  return bytes;
}

/**
 * Genera la matriz booleana 2D de un código QR para el texto dado.
 * Devuelve una cuadrícula de tamaño N×N (donde N = 17 + 4*version).
 */
export function generateQRMatrix(text: string): boolean[][] {
  const cleanText = text || 'https://surtifacil.pages.dev';
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(cleanText);
  const version = selectQRVersion(rawBytes.length);
  const size = 17 + 4 * version;

  const dataBytes = encodeData(cleanText, version);
  const eccCount = ECC_CODEWORDS_M[version];
  const eccBytes = calculateReedSolomon(dataBytes, eccCount);

  // Concatenar datos y corrección de error
  const finalCodewords = new Uint8Array(dataBytes.length + eccBytes.length);
  finalCodewords.set(dataBytes);
  finalCodewords.set(eccBytes, dataBytes.length);

  // Inicializar matriz: null = libre, boolean = fijo
  const matrix: Array<Array<boolean | null>> = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  // 1. Patrones de búsqueda (Finder Patterns) 7x7 en las 3 esquinas
  const placeFinder = (r: number, c: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const nr = r + y;
        const nc = c + x;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (y >= 0 && y <= 6 && x >= 0 && x <= 6) {
            const isBorder = y === 0 || y === 6 || x === 0 || x === 6;
            const isCenter = y >= 2 && y <= 4 && x >= 2 && x <= 4;
            matrix[nr][nc] = isBorder || isCenter;
          } else {
            matrix[nr][nc] = false; // Separador
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. Patrones de temporización (Timing patterns en fila 6 y columna 6)
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = val;
    if (matrix[i][6] === null) matrix[i][6] = val;
  }

  // 3. Patrones de alineación
  const alignCoords = ALIGNMENT_PATTERN_POSITIONS[version] || [];
  for (let i = 0; i < alignCoords.length; i++) {
    for (let j = 0; j < alignCoords.length; j++) {
      const r = alignCoords[i];
      const c = alignCoords[j];
      // Ignorar si coincide con un patrón de búsqueda
      if (matrix[r][c] !== null) continue;

      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const isBorder = Math.abs(y) === 2 || Math.abs(x) === 2;
          const isCenter = y === 0 && x === 0;
          matrix[r + y][c + x] = isBorder || isCenter;
        }
      }
    }
  }

  // 4. Módulo oscuro fijo
  matrix[size - 8][8] = true;

  // 5. Reserva de bits de información de formato
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // 6. Colocación de palabras código (zigzag desde la derecha)
  let bitIndex = 0;
  const totalBits = finalCodewords.length * 8;
  let upwards = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Saltar columna de temporización
    const left = right - 1;

    for (let count = 0; count < size; count++) {
      const row = upwards ? size - 1 - count : count;

      for (const col of [right, left]) {
        if (matrix[row][col] === null) {
          let bit = false;
          if (bitIndex < totalBits) {
            const byte = finalCodewords[Math.floor(bitIndex / 8)];
            bit = ((byte >>> (7 - (bitIndex % 8))) & 1) === 1;
            bitIndex++;
          }
          // Aplicar máscara estándar 0: (row + col) % 2 === 0
          const mask = (row + col) % 2 === 0;
          matrix[row][col] = mask ? !bit : bit;
        }
      }
    }
    upwards = !upwards;
  }

  // 7. Escribir bits de formato (ECC Nivel M = 00, Máscara 000 = 00000 -> Formato = 0x5412 XOR 0x4B3A)
  const formatInfo = 0x5412; // Valor precalculado con BCH y máscara para ECC M + Mask 0
  const formatBits: boolean[] = [];
  for (let i = 14; i >= 0; i--) {
    formatBits.push(((formatInfo >>> i) & 1) === 1);
  }

  // Formato superior izquierdo
  for (let i = 0; i <= 5; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i <= 14; i++) matrix[14 - i][8] = formatBits[i];

  // Formato inferior / derecho
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = formatBits[i];
  for (let i = 7; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i];

  // Matriz final garantizada como boolean[][]
  return matrix.map((row) => row.map((cell) => cell === true));
}

/**
 * Convierte una matriz QR a un elemento SVG o string SVG nítido.
 */
export function qrMatrixToSVGPath(
  matrix: boolean[][],
  cellSize = 10,
  margin = 4
): { pathData: string; fullSize: number } {
  const moduleCount = matrix.length;
  const fullSize = (moduleCount + margin * 2) * cellSize;
  let pathData = '';

  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        pathData += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `;
      }
    }
  }

  return { pathData, fullSize };
}

/**
 * Dibuja la matriz QR en un canvas HTML5 de forma nítida.
 */
export function drawQRToCanvas(
  matrix: boolean[][],
  canvas: HTMLCanvasElement,
  options?: QROptions
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cellSize = options?.cellSize || 8;
  const margin = options?.margin !== undefined ? options.margin : 4;
  const fgColor = options?.fgColor || '#0D1B2A';
  const bgColor = options?.bgColor || '#FFFFFF';

  const moduleCount = matrix.length;
  const totalModules = moduleCount + margin * 2;
  const fullSize = totalModules * cellSize;

  canvas.width = fullSize;
  canvas.height = fullSize;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, fullSize, fullSize);

  ctx.fillStyle = fgColor;
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }
}
