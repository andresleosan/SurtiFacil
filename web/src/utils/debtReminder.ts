import { CreditCustomer, CreditEntry } from '../firebase/db';
import { formatCentsCOP } from './currency';

export type DebtReminderTone = 'amigable' | 'quincena' | 'formal';

export interface DebtReminderOptions {
  dueDate?: string;
  tone?: DebtReminderTone;
  customPhone?: string;
  includeRecentEntries?: boolean;
}

export interface PaymentDetailsParsed {
  nequiNumber?: string;
  bancolombiaAccount?: string;
  formattedText: string;
}

/**
 * Analiza el texto de datos_pago_offline para detectar cuentas Nequi y Bancolombia
 * y darles un formato estructurado y amigable para el vecino.
 */
export function parsePaymentDetails(datosPagoOffline?: string): PaymentDetailsParsed {
  const raw = (datosPagoOffline || '').trim();
  if (!raw) {
    return {
      formattedText: '▪ Efectivo en el mostrador del local\n▪ Transferencia Bancolombia / Nequi (solicita el número al tendero)',
    };
  }

  // Detectar número de celular Nequi (10 dígitos que inician con 3)
  const phoneMatch = raw.match(/3\d{2}[-\s]?\d{3}[-\s]?\d{4}/);
  const nequiNumber = phoneMatch ? phoneMatch[0].replace(/[-\s]/g, '') : undefined;

  // Formato ordenado con viñetas
  let formatted = `▪ ${raw}\n▪ Efectivo en mostrador del local`;
  return {
    nequiNumber,
    formattedText: formatted,
  };
}

/**
 * Calcula una sugerencia amigable de fecha de pago según la opción elegida.
 */
export function getSuggestedDueDate(preset: 'week' | 'month_end' | 'fifteenth' | 'none'): string | undefined {
  if (preset === 'none') return undefined;

  const now = new Date();
  if (preset === 'week') {
    // Próximo viernes o sábado
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    const friday = new Date(now.getTime() + daysUntilFriday * 86400000);
    return `Viernes ${friday.getDate()} de ${friday.toLocaleDateString('es-CO', { month: 'long' })}`;
  }

  if (preset === 'month_end') {
    // Último día del mes actual
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `Fin de mes (${lastDay.getDate()} de ${lastDay.toLocaleDateString('es-CO', { month: 'long' })})`;
  }

  if (preset === 'fifteenth') {
    // Próximo corte de quincena (día 15 o día 30/31)
    const currentDay = now.getDate();
    if (currentDay < 15) {
      return `Día 15 de ${now.toLocaleDateString('es-CO', { month: 'long' })}`;
    }
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `Día ${lastDay} de ${now.toLocaleDateString('es-CO', { month: 'long' })} (Corte de mes)`;
  }

  return undefined;
}

/**
 * Genera el mensaje respetuoso y cordial de cobro de fiado para WhatsApp con modismos paisas,
 * saldo actualizado en COP, fecha de vencimiento/compromiso y datos de Nequi/Bancolombia.
 */
export function generateDebtReminderWhatsAppText(
  customer: CreditCustomer,
  entries: CreditEntry[] = [],
  store: { nombre?: string; datos_pago_offline?: string } = {},
  options: DebtReminderOptions = {}
): string {
  const storeName = store.nombre?.trim() || 'SurtiFácil Abastos';
  const customerName = customer.name?.trim() || 'Vecino(a)';
  const tone = options.tone || 'amigable';
  const balanceFormatted = formatCentsCOP(customer.balance_cents);

  let text = '';

  // 1. Saludo inicial según tono paisa
  if (tone === 'quincena') {
    text += `Hola *${customerName}*, esperando que estés muy bien de parte de *${storeName}*. 🛒\n\n`;
    text += `Se acerca el corte de quincena y te compartimos el resumen de tu cuenta de fiado:\n`;
  } else if (tone === 'formal') {
    text += `Estimado(a) *${customerName}*, un atento y cordial saludo de parte de *${storeName}*. 📋\n\n`;
    text += `Nos comunicamos con todo respeto para compartirte el estado de tu cuenta de fiado a la fecha:\n`;
  } else {
    // Amigable (por defecto)
    text += `Hola *${customerName}*, cordial saludo de parte de *${storeName}*. 👋\n\n`;
    text += `Te compartimos el estado de tu cuenta de fiado al día de hoy:\n`;
  }

  // 2. Saldo pendiente
  text += `💰 *Saldo pendiente:* *${balanceFormatted}*\n\n`;

  // 3. Fecha de vencimiento o compromiso de pago (si aplica)
  if (options.dueDate && options.dueDate.trim().length > 0) {
    text += `📅 *Fecha de pago acordada:* ${options.dueDate.trim()}\n\n`;
  }

  // 4. Últimos movimientos (si aplica)
  if (options.includeRecentEntries !== false && entries && entries.length > 0) {
    text += `📋 *Últimos movimientos:*\n`;
    const recent = entries.slice(0, 3);
    for (const e of recent) {
      const typeLabel = e.type === 'debt' ? 'Fiado' : 'Abono';
      const sign = e.type === 'debt' ? '+' : '-';
      const desc = e.description || (e.sale_id ? 'Venta en mostrador' : 'Movimiento');
      text += `▪ ${typeLabel}: ${desc} (${sign}${formatCentsCOP(e.amount_cents)})\n`;
    }
    text += `\n`;
  }

  // 5. Cuentas e instrucciones de pago Nequi / Bancolombia
  if (store.datos_pago_offline && store.datos_pago_offline.trim().length > 0) {
    text += `💳 *Para transferencias o abonos:* ${store.datos_pago_offline.trim()}\n\n`;
  } else {
    text += `💳 *Puedes abonar en efectivo en el mostrador o por transferencia Nequi/Bancolombia.*\n\n`;
  }

  // 6. Cierre paisa
  if (tone === 'formal') {
    text += `Agradecemos mucho tu puntualidad y tu continuo apoyo al comercio del barrio. ¡Feliz día! ✨`;
  } else {
    text += `¡Muchas gracias por tu confianza y preferencia! 🛒✨`;
  }

  return text;
}

/**
 * Normaliza y construye el enlace oficial de WhatsApp click-to-chat.
 */
export function buildWhatsAppClickToChatUrl(phone?: string, text: string = ''): string {
  const digits = (phone || '').replace(/\D/g, '');
  let finalPhone = digits;
  if (finalPhone.length === 10 && finalPhone.startsWith('3')) {
    finalPhone = `57${finalPhone}`;
  }
  const encoded = encodeURIComponent(text);
  return finalPhone ? `https://wa.me/${finalPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/**
 * Abre WhatsApp en una nueva pestaña/ventana con el recordatorio formateado.
 */
export function sendDebtReminderViaWhatsApp(
  customer: CreditCustomer,
  entries: CreditEntry[] = [],
  store: { nombre?: string; datos_pago_offline?: string } = {},
  customPhone?: string,
  options?: DebtReminderOptions
): void {
  const finalOptions: DebtReminderOptions = {
    ...options,
    customPhone: customPhone || customer.phone,
  };
  const text = generateDebtReminderWhatsAppText(customer, entries, store, finalOptions);
  const url = buildWhatsAppClickToChatUrl(finalOptions.customPhone, text);
  window.open(url, '_blank', 'noopener,noreferrer');
}
