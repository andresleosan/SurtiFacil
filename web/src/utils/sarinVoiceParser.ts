import type { Product, PaymentMethod } from '../firebase/db';
import { formatCentsCOP } from './currency';

export interface ParsedVoiceItem {
  product: Product;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface VoiceSaleCommandResult {
  rawTranscript: string;
  hasSarinWakeWord: boolean;
  intent: 'ADD_ITEMS' | 'CLEAR_CART' | 'FINALIZE_SALE' | 'UNKNOWN';
  items: ParsedVoiceItem[];
  totalCents: number;
  totalCOP: string;
  paymentMethod: PaymentMethod;
  receivedCashCents: number | null;
  receivedCashCOP: string | null;
  changeCents: number | null;
  changeCOP: string | null;
  isCashSufficient: boolean;
  shortageCents: number;
  shortageCOP: string | null;
  creditCustomerName?: string;
  spokenFeedback: string;
  confidenceWarning?: string;
}

/** Mapeo de números en palabras en español */
const SPANISH_NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
  veinticinco: 25,
  treinta: 30,
  medio: 1,
  media: 1,
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Parsea montos de dinero dichos en español (ej: "20 mil", "50 mil", "cinco mil", "10.000", "20000")
 * Retorna el valor en centavos de COP (ej: 20.000 COP -> 2000000 centavos)
 */
export function parseCashAmount(text: string): number | null {
  const norm = normalizeText(text);

  // Patrón "X mil" (ej: "20 mil", "50 mil", "cinco mil", "diez mil", "100 mil")
  const milMatch = norm.match(/(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|cincuenta|cien)\s*mil\b/);
  if (milMatch) {
    const rawNumber = milMatch[1];
    let num = parseInt(rawNumber, 10);
    if (isNaN(num)) {
      if (rawNumber === 'un' || rawNumber === 'uno' || rawNumber === 'una') num = 1;
      else if (rawNumber === 'dos') num = 2;
      else if (rawNumber === 'tres') num = 3;
      else if (rawNumber === 'cuatro') num = 4;
      else if (rawNumber === 'cinco') num = 5;
      else if (rawNumber === 'diez') num = 10;
      else if (rawNumber === 'quince') num = 15;
      else if (rawNumber === 'veinte') num = 20;
      else if (rawNumber === 'cincuenta') num = 50;
      else if (rawNumber === 'cien') num = 100;
      else num = 1;
    }
    const pesos = num * 1000;
    return pesos * 100; // Centavos
  }

  // Patrón número directo (ej: "20000", "50000", "20.000")
  const digitMatch = norm.match(/\b(\d{1,3}(?:\.\d{3})+|\d{4,6})\b/);
  if (digitMatch) {
    const cleanDigits = digitMatch[1].replace(/\./g, '');
    const pesos = parseInt(cleanDigits, 10);
    if (!isNaN(pesos) && pesos > 0) {
      return pesos * 100;
    }
  }

  return null;
}

/**
 * Busca el mejor producto del catálogo que coincida con una frase de voz
 */
export function matchProductInCatalog(phrase: string, catalog: Product[]): Product | null {
  const normPhrase = normalizeText(phrase);
  if (!normPhrase) return null;

  let bestMatch: Product | null = null;
  let highestScore = 0;

  for (const product of catalog) {
    const normName = normalizeText(product.name);
    const normCategory = normalizeText(product.category || '');

    // Coincidencia exacta o contenida
    if (normPhrase === normName) {
      return product;
    }

    let score = 0;
    // Si la frase contiene el nombre completo del producto
    if (normPhrase.includes(normName)) {
      score += normName.length * 2;
    } else {
      // Comparar por palabras clave del producto
      const productWords = normName.split(/\s+/).filter((w) => w.length > 2);
      let matchedWords = 0;
      for (const word of productWords) {
        if (normPhrase.includes(word)) {
          matchedWords++;
          score += word.length;
        }
      }
      if (productWords.length > 0 && matchedWords === productWords.length) {
        score += 15;
      }
    }

    if (normCategory && normPhrase.includes(normCategory)) {
      score += 3;
    }

    if (score > highestScore && score >= 3) {
      highestScore = score;
      bestMatch = product;
    }
  }

  return bestMatch;
}

/**
 * Parsea un comando de venta por voz dictado al POS de SurtiFácil
 */
export function parseSarinSaleCommand(transcript: string, catalog: Product[]): VoiceSaleCommandResult {
  const norm = normalizeText(transcript);
  const hasSarinWakeWord = /\bsarin\b/.test(norm);

  // Remover la palabra de activación 'sarin'
  const commandText = norm.replace(/\bsarin\b[,.:]?\s*/g, '').trim();

  // 1. Detección de intenciones de control
  if (
    norm.includes('limpia el carrito') ||
    norm.includes('borra todo') ||
    norm.includes('vaciar carrito') ||
    norm.includes('cancelar venta')
  ) {
    return {
      rawTranscript: transcript,
      hasSarinWakeWord,
      intent: 'CLEAR_CART',
      items: [],
      totalCents: 0,
      totalCOP: '$ 0',
      paymentMethod: 'cash',
      receivedCashCents: null,
      receivedCashCOP: null,
      changeCents: null,
      changeCOP: null,
      isCashSufficient: true,
      shortageCents: 0,
      shortageCOP: null,
      spokenFeedback: 'Carrito vaciado correctamente.',
    };
  }

  if (
    commandText === 'cobrar' ||
    commandText === 'facturar' ||
    commandText === 'confirmar venta' ||
    commandText === 'despachar' ||
    commandText.includes('cobrar') ||
    commandText.includes('facturar')
  ) {
    return {
      rawTranscript: transcript,
      hasSarinWakeWord,
      intent: 'FINALIZE_SALE',
      items: [],
      totalCents: 0,
      totalCOP: '$ 0',
      paymentMethod: 'cash',
      receivedCashCents: null,
      receivedCashCOP: null,
      changeCents: null,
      changeCOP: null,
      isCashSufficient: true,
      shortageCents: 0,
      shortageCOP: null,
      spokenFeedback: 'Listo para confirmar y cobrar la venta.',
    };
  }

  // 2. Detección de método de pago y monto pagado
  let paymentMethod: PaymentMethod = 'cash';
  let receivedCashCents: number | null = null;
  let creditCustomerName: string | undefined = undefined;

  // Detección de Fiado
  const fiadoMatch = commandText.match(/(?:fiar|fiado|anotar|cuenta|apuntar)\s+(?:a|para|de)?\s*(don|dona|señor|señora)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ]+)/i);
  if (fiadoMatch) {
    paymentMethod = 'credit';
    const honorific = fiadoMatch[1] ? `${fiadoMatch[1]} ` : '';
    const rawName = `${honorific}${fiadoMatch[2]}`.trim();
    // Capitalizar nombre para presentación limpia (ej: "Don Carlos")
    creditCustomerName = rawName
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  } else if (commandText.includes('tarjeta') || commandText.includes('datafono')) {
    paymentMethod = 'card';
  } else if (commandText.includes('nequi') || commandText.includes('bancolombia') || commandText.includes('transferencia')) {
    paymentMethod = 'other';
  }

  // Detección de monto en efectivo ("pagan con X", "recibo X", "me dan X", "con X")
  const payMatch = commandText.match(/(?:pagan|paga|recibo|recibe|pago|con|billete de)\s+(?:con\s+)?(.+)/i);
  if (payMatch && paymentMethod === 'cash') {
    const possibleCash = parseCashAmount(payMatch[1]);
    if (possibleCash) {
      receivedCashCents = possibleCash;
    }
  }

  // Si dice "pago exacto" o "pagan exacto"
  const isExactPayment = commandText.includes('exacto') || commandText.includes('cabal');

  // 3. Extracción de productos y cantidades
  // Separamos cláusulas por "y", ",", "mas", "agrega", "pon"
  const cleanForItems = commandText
    .replace(/(?:pagan|paga|recibo|recibe|con billete de|fiado a|fiar a|con tarjeta|con nequi).*/i, '')
    .replace(/\b(agrega|agregame|pon|ponme|sumale|suma|lleva|llevan)\b/g, '')
    .trim();

  const clauses = cleanForItems
    .split(/(?:\s+y\s+|,|\s+mas\s+)/)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);

  const matchedItems: ParsedVoiceItem[] = [];

  for (const clause of clauses) {
    // Buscar cantidad inicial (ej: "dos leches", "1 libra de arroz", "tres empanadas", "una cerveza")
    const words = clause.split(/\s+/);
    let qty = 1;
    let productSearchText = clause;

    if (words.length > 0) {
      const firstWord = words[0];
      if (/^\d+$/.test(firstWord)) {
        qty = parseInt(firstWord, 10);
        productSearchText = words.slice(1).join(' ');
      } else if (SPANISH_NUMBER_WORDS[firstWord] !== undefined) {
        qty = SPANISH_NUMBER_WORDS[firstWord];
        productSearchText = words.slice(1).join(' ');
      }
    }

    // Remover conectores de presentación como "libras de", "kilos de", "bolsas de", "latas de"
    const cleanedSearch = productSearchText
      .replace(/\b(libras?|kilos?|litros?|bolsas?|paquetes?|latas?|cubetas?|botellas?)\s+(de\s+)?/gi, '')
      .trim();

    const matchedProduct = matchProductInCatalog(cleanedSearch || productSearchText, catalog) ||
      matchProductInCatalog(clause, catalog);

    if (matchedProduct) {
      const unitPriceCents = matchedProduct.price_cents;
      const subtotalCents = unitPriceCents * qty;
      matchedItems.push({
        product: matchedProduct,
        quantity: qty,
        unitPriceCents,
        subtotalCents,
      });
    }
  }

  const totalCents = matchedItems.reduce((acc, item) => acc + item.subtotalCents, 0);
  const totalCOP = formatCentsCOP(totalCents);

  if (isExactPayment && totalCents > 0) {
    receivedCashCents = totalCents;
  }

  // 4. Cálculo de vueltas y validación financiera
  let changeCents: number | null = null;
  let changeCOP: string | null = null;
  let isCashSufficient = true;
  let shortageCents = 0;
  let shortageCOP: string | null = null;

  if (paymentMethod === 'cash' && receivedCashCents !== null) {
    if (receivedCashCents >= totalCents) {
      changeCents = receivedCashCents - totalCents;
      changeCOP = formatCentsCOP(changeCents);
      isCashSufficient = true;
    } else {
      isCashSufficient = false;
      shortageCents = totalCents - receivedCashCents;
      shortageCOP = formatCentsCOP(shortageCents);
    }
  }

  // 5. Generación del mensaje auditivo didáctico
  let spokenFeedback = '';
  if (matchedItems.length === 0) {
    spokenFeedback = 'No logré identificar productos del catálogo en lo que escuché. Intenta diciendo "Sarin, agrega dos leches".';
  } else {
    const itemSummaries = matchedItems.map(
      (i) => `${i.quantity} ${i.product.name}`
    );
    spokenFeedback = `Agregado: ${itemSummaries.join(', ')}. Total: ${totalCOP}.`;

    if (paymentMethod === 'credit') {
      spokenFeedback += ` Registrado como fiado${creditCustomerName ? ` a ${creditCustomerName}` : ''}.`;
    } else if (receivedCashCents !== null) {
      if (isCashSufficient) {
        spokenFeedback += ` Recibes ${formatCentsCOP(receivedCashCents)}, las vueltas son ${changeCOP}.`;
      } else {
        spokenFeedback += ` ¡Atención! Recibes ${formatCentsCOP(receivedCashCents)}, faltan ${shortageCOP} para completar.`;
      }
    }
  }

  return {
    rawTranscript: transcript,
    hasSarinWakeWord,
    intent: matchedItems.length > 0 ? 'ADD_ITEMS' : 'UNKNOWN',
    items: matchedItems,
    totalCents,
    totalCOP,
    paymentMethod,
    receivedCashCents,
    receivedCashCOP: receivedCashCents !== null ? formatCentsCOP(receivedCashCents) : null,
    changeCents,
    changeCOP,
    isCashSufficient,
    shortageCents,
    shortageCOP,
    creditCustomerName,
    spokenFeedback,
  };
}

/**
 * Síntesis de voz didáctica usando Web Speech API nativa (es-CO)
 */
export function speakSarinResponse(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  try {
    window.speechSynthesis.cancel(); // Cancelar locución previa
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-CO';
    utterance.rate = 1.05; // Ritmo ágil para mostrador
    utterance.pitch = 1.0;

    // Buscar voz en español si está disponible
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find((v) => v.lang.startsWith('es-CO')) ||
      voices.find((v) => v.lang.startsWith('es'));
    if (esVoice) {
      utterance.voice = esVoice;
    }

    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = () => onEnd();
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis not available or failed:', err);
    if (onEnd) onEnd();
  }
}
