/**
 * Utilidades para manejo de moneda colombiana (COP) según DESIGN.md.
 * Los montos en el frontend se presentan como pesos colombianos sin decimales innecesarios (ej. "$ 12.500").
 */

/**
 * Formatea un valor en Pesos Colombianos (COP).
 * @param pesos Valor en pesos (ej: 12500)
 * @returns Cadena formateada (ej: "$ 12.500")
 */
export function formatCOP(pesos: number): string {
  if (typeof pesos !== 'number' || isNaN(pesos)) {
    return '$ 0';
  }

  const rounded = Math.round(pesos);
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rounded);

  // Normalizar el prefijo a "$ " con espacio regular ASCII (evitar non-breaking space \u00a0 de Intl)
  return formatted
    .replace(/\u00a0/g, ' ')
    .replace(/^COP\s?/, '$ ')
    .replace(/^\$(\S)/, '$ $1');
}

/**
 * Formatea un valor en centavos a COP (dividiendo por 100).
 * Compatible con la estructura histórica de Firestore/D1 donde 1250000 = $12.500 COP o 250 = $2.50 / $250.
 */
export function formatCentsCOP(cents: number): string {
  if (typeof cents !== 'number' || isNaN(cents)) {
    return '$ 0';
  }
  return formatCOP(cents / 100);
}

/**
 * Parsea un texto ingresado por el usuario a número entero de pesos o centavos.
 */
export function parseCOP(value: string): number {
  const clean = value.replace(/[^0-9]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

