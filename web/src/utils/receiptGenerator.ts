import { Sale } from '../firebase/db';
import { StoreSettings } from '../types/storeSettings';
import { CashClosing, COLOMBIAN_BILLS, COLOMBIAN_COINS } from '../types/cashClosing';
import { formatCentsCOP } from './currency';

export type ThermalWidth = '58mm' | '80mm';

export interface CreditPaymentReceipt {
  id?: string;
  receipt_number: string;
  customer_name: string;
  customer_phone?: string;
  amount_cents: number;
  balance_before_cents?: number;
  balance_after_cents?: number;
  payment_method?: 'cash' | 'transfer' | string;
  date: Date | string;
  description?: string;
  received_by_name?: string;
}

/**
 * Centra un texto dentro de un ancho determinado rellenando con espacios.
 * Si el texto excede el ancho, lo envuelve en múltiples líneas centradas sin truncar palabras.
 */
function centerText(text: string, width: number): string {
  if (text.length <= width) {
    const leftPadding = Math.floor((width - text.length) / 2);
    const rightPadding = width - text.length - leftPadding;
    return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
  }
  const words = text.split(' ');
  const wrappedLines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= width) {
      current += ' ' + w;
    } else {
      const leftPad = Math.floor((width - current.length) / 2);
      const rightPad = width - current.length - leftPad;
      wrappedLines.push(' '.repeat(Math.max(0, leftPad)) + current + ' '.repeat(Math.max(0, rightPad)));
      current = w;
    }
  }
  if (current) {
    const leftPad = Math.floor((width - current.length) / 2);
    const rightPad = width - current.length - leftPad;
    wrappedLines.push(' '.repeat(Math.max(0, leftPad)) + current + ' '.repeat(Math.max(0, rightPad)));
  }
  return wrappedLines.join('\n');
}

/**
 * Formatea una línea con texto a la izquierda y valor a la derecha.
 */
function formatTwoColumns(left: string, right: string, width: number): string {
  const availableSpace = width - right.length;
  if (availableSpace <= 0) return (left + ' ' + right).slice(0, width);
  const truncatedLeft = left.length > availableSpace - 1 ? left.slice(0, availableSpace - 1) : left;
  const padding = width - truncatedLeft.length - right.length;
  return truncatedLeft + ' '.repeat(Math.max(1, padding)) + right;
}

/**
 * Genera el texto plano para impresión térmica de una venta (58mm o 80mm).
 */
export function generateSaleReceiptText(
  sale: Sale,
  store: Partial<StoreSettings>,
  options: { width: ThermalWidth } = { width: '58mm' }
): string {
  const colWidth = options.width === '58mm' ? 32 : 48;
  const divider = '-'.repeat(colWidth);
  const doubleDivider = '='.repeat(colWidth);

  const lines: string[] = [];

  // Cabecera de la tienda en mayúsculas
  lines.push(centerText((store.nombre || 'SURTIFÁCIL ABASTOS').toUpperCase(), colWidth));
  if (store.barrio || store.ciudad) {
    lines.push(centerText(`${store.barrio || ''} - ${store.ciudad || 'Medellín'}`, colWidth));
  }
  if (store.direccion) {
    lines.push(centerText(store.direccion, colWidth));
  }
  if (store.telefono_whatsapp) {
    lines.push(centerText(`Tel / WhatsApp: ${store.telefono_whatsapp}`, colWidth));
  }
  lines.push(doubleDivider);

  // Información de la venta
  const saleDate = sale.date instanceof Date ? sale.date : new Date((sale as any).createdAt || Date.now());
  lines.push(formatTwoColumns(`Venta #${(sale.id || '').slice(0, 8)}`, saleDate.toLocaleDateString('es-CO'), colWidth));
  lines.push(formatTwoColumns(`Hora: ${saleDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`, `Cajero: ${sale.created_by_role || 'Caja'}`, colWidth));

  if (sale.credit_customer_name) {
    lines.push(formatTwoColumns('Cliente Fiado:', sale.credit_customer_name, colWidth));
  }

  lines.push(divider);

  // Encabezado de columnas
  if (options.width === '58mm') {
    lines.push(formatTwoColumns('Cant  Descripción', 'Total', colWidth));
  } else {
    lines.push(formatTwoColumns('Cant  Descripción               P.Unit', 'Subtotal', colWidth));
  }
  lines.push(divider);

  // Ítems de la venta
  let totalItemsCount = 0;
  for (const item of sale.items || []) {
    totalItemsCount += item.quantity;
    const subtotalStr = formatCentsCOP(item.subtotal || item.price_cents * item.quantity);
    if (options.width === '58mm') {
      const leftCol = `${item.quantity}x ${item.product_name}`;
      lines.push(formatTwoColumns(leftCol, subtotalStr, colWidth));
    } else {
      const unitStr = formatCentsCOP(item.price_cents);
      const leftCol = `${item.quantity}x ${item.product_name} (${unitStr})`;
      lines.push(formatTwoColumns(leftCol, subtotalStr, colWidth));
    }
  }

  lines.push(divider);

  // Totales
  lines.push(formatTwoColumns(`Total Artículos (${totalItemsCount}):`, formatCentsCOP(sale.total), colWidth));

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    other: 'Nequi / Bancolombia',
    credit: 'Libro de Fiados',
  };
  const methodLabel = paymentMethodLabels[sale.payment_method] || sale.payment_method;
  lines.push(formatTwoColumns('Forma de Pago:', methodLabel, colWidth));

  if (sale.payment_method === 'cash' && typeof sale.received_cash_cents === 'number') {
    lines.push(formatTwoColumns('Efectivo Recibido:', formatCentsCOP(sale.received_cash_cents), colWidth));
    const change = typeof sale.change_cents === 'number'
      ? sale.change_cents
      : Math.max(0, sale.received_cash_cents - sale.total);
    lines.push(formatTwoColumns('Vueltas a Entregar:', formatCentsCOP(change), colWidth));
  }

  lines.push(doubleDivider);
  lines.push(centerText('SISTEMA POS - CONTROL INTERNO', colWidth));
  lines.push(centerText('NO RESPONSABLE DE IVA (ART. 616-1 E.T.)', colWidth));
  lines.push(centerText('¡Gracias por su compra!', colWidth));
  lines.push(centerText('SurtiFácil SaaS - Medellín', colWidth));

  return lines.join('\n');
}

/**
 * Genera el mensaje formateado para enviar la tirilla de venta por WhatsApp.
 */
export function generateSaleWhatsAppText(sale: Sale, store: Partial<StoreSettings>): string {
  const storeName = store.nombre || 'SurtiFácil Abastos';
  const saleDate = sale.date instanceof Date ? sale.date : new Date((sale as any).createdAt || Date.now());
  const dateStr = saleDate.toLocaleDateString('es-CO');
  const timeStr = saleDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  const paymentMethodLabels: Record<string, string> = {
    cash: '💵 Efectivo',
    card: '💳 Tarjeta',
    other: '📱 Transferencia Nequi / Bancolombia',
    credit: '📒 Libro de Fiados',
  };
  const methodLabel = paymentMethodLabels[sale.payment_method] || sale.payment_method;

  let text = `🧾 *COMPROBANTE DE COMPRA — ${storeName.toUpperCase()}*\n`;
  if (store.barrio) text += `📍 ${store.barrio}, Medellín\n`;
  text += `📅 Fecha: ${dateStr} · ${timeStr}\n`;
  text += `🔢 Comprobante: #${(sale.id || '').slice(0, 8)}\n`;

  if (sale.credit_customer_name) {
    text += `👤 Cliente: *${sale.credit_customer_name}*\n`;
  }

  text += `\n🛒 *DETALLE DEL MERCADO:*\n`;
  for (const item of sale.items || []) {
    const subtotalStr = formatCentsCOP(item.subtotal || item.price_cents * item.quantity);
    text += `▪ ${item.quantity}x ${item.product_name} — ${subtotalStr}\n`;
  }

  text += `\n💰 *TOTAL A PAGAR:* *${formatCentsCOP(sale.total)}*\n`;
  text += `💳 *Medio de pago:* ${methodLabel}\n`;

  if (sale.payment_method === 'cash' && typeof sale.received_cash_cents === 'number') {
    text += `💵 *Efectivo Recibido:* ${formatCentsCOP(sale.received_cash_cents)}\n`;
    const change = typeof sale.change_cents === 'number'
      ? sale.change_cents
      : Math.max(0, sale.received_cash_cents - sale.total);
    text += `🪙 *Vueltas a Entregar:* ${formatCentsCOP(change)}\n`;
  }

  if (store.datos_pago_offline) {
    text += `\n📌 *Datos de Pago:* ${store.datos_pago_offline}\n`;
  }

  text += `\n📌 *Documento de Control Interno — Régimen No Responsable de IVA (Art. 616-1 E.T.)*\n`;
  text += `\n¡Muchas gracias por apoyar el comercio de tu barrio! 🙏✨`;

  return text;
}

/**
 * Genera el texto plano para impresión térmica del Acta de Cierre de Caja (58mm o 80mm).
 */
export function generateCashClosingReceiptText(
  closing: CashClosing,
  store: Partial<StoreSettings>,
  options: { width: ThermalWidth } = { width: '58mm' }
): string {
  const colWidth = options.width === '58mm' ? 32 : 48;
  const divider = '-'.repeat(colWidth);
  const doubleDivider = '='.repeat(colWidth);

  const lines: string[] = [];

  lines.push(centerText((store.nombre || 'SURTIFÁCIL ABASTOS').toUpperCase(), colWidth));
  lines.push(centerText('ACTA DE ARQUEO Y CIERRE DE CAJA', colWidth));
  lines.push(centerText(`Cierre Oficial #${closing.closing_number}`, colWidth));
  lines.push(doubleDivider);

  const closedDate = new Date(closing.closed_at);
  lines.push(formatTwoColumns('Fecha Cierre:', closedDate.toLocaleDateString('es-CO'), colWidth));
  lines.push(formatTwoColumns('Hora Cierre:', closedDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }), colWidth));
  lines.push(formatTwoColumns('Responsable:', closing.closed_by_name || 'Cajero', colWidth));
  lines.push(divider);

  // Resumen del turno
  lines.push(formatTwoColumns('Base Inicial Caja:', formatCentsCOP(closing.initial_cash_cents), colWidth));
  lines.push(formatTwoColumns(`Ventas Efectivo (${closing.total_sales_count}):`, formatCentsCOP(closing.sales_cash_cents), colWidth));
  if (closing.credit_payments_cash_cents > 0) {
    lines.push(formatTwoColumns('Abonos Fiados Efectivo:', formatCentsCOP(closing.credit_payments_cash_cents), colWidth));
  }
  if ((closing.expenses_cash_cents || 0) > 0) {
    lines.push(formatTwoColumns('Gastos Caja Menor (-):', `-${formatCentsCOP(closing.expenses_cash_cents || 0)}`, colWidth));
  }
  lines.push(divider);
  lines.push(formatTwoColumns('TOTAL ESPERADO:', formatCentsCOP(closing.expected_cash_cents), colWidth));
  lines.push(formatTwoColumns('TOTAL FÍSICO CONTADO:', formatCentsCOP(closing.counted_cash_cents), colWidth));

  const diffStr = closing.difference_cents === 0
    ? '$ 0 (CUADRADO)'
    : closing.difference_cents > 0
    ? `+${formatCentsCOP(closing.difference_cents)} (SOBRANTE)`
    : `-${formatCentsCOP(Math.abs(closing.difference_cents))} (FALTANTE)`;

  lines.push(formatTwoColumns('DIFERENCIA:', diffStr, colWidth));
  lines.push(divider);

  // Desglose de billetes
  lines.push(centerText('DESGLOSE DE BILLETES (COP)', colWidth));
  for (const b of COLOMBIAN_BILLS) {
    const qty = closing.breakdown?.bills?.[b.id] || 0;
    if (qty > 0) {
      lines.push(formatTwoColumns(`${qty}x ${b.label}`, formatCentsCOP(b.valueCents * qty), colWidth));
    }
  }

  // Desglose de monedas
  lines.push(divider);
  lines.push(centerText('DESGLOSE DE MONEDAS (COP)', colWidth));
  for (const c of COLOMBIAN_COINS) {
    const qty = closing.breakdown?.coins?.[c.id] || 0;
    if (qty > 0) {
      lines.push(formatTwoColumns(`${qty}x ${c.label}`, formatCentsCOP(c.valueCents * qty), colWidth));
    }
  }

  if (closing.notes) {
    lines.push(divider);
    lines.push(`Notas: ${closing.notes.slice(0, colWidth * 2)}`);
  }

  lines.push(doubleDivider);
  lines.push(centerText('Firma Responsable: __________________', colWidth));
  lines.push(centerText('SurtiFácil SaaS - Control de Caja', colWidth));

  return lines.join('\n');
}

/**
 * Genera el mensaje formateado para enviar el Acta de Cierre por WhatsApp al dueño/administrador.
 */
export function generateCashClosingWhatsAppText(closing: CashClosing, store: Partial<StoreSettings>): string {
  const storeName = store.nombre || 'SurtiFácil Abastos';
  const closedDate = new Date(closing.closed_at);
  const dateStr = closedDate.toLocaleDateString('es-CO');
  const timeStr = closedDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  let statusEmoji = '✅';
  let statusText = 'CUADRADO';
  if (closing.status === 'surplus') {
    statusEmoji = '🔵';
    statusText = `SOBRANTE (+${formatCentsCOP(closing.difference_cents)})`;
  } else if (closing.status === 'shortage') {
    statusEmoji = '⚠️';
    statusText = `FALTANTE (-${formatCentsCOP(Math.abs(closing.difference_cents))})`;
  }

  let text = `🔒 *ACTA DE CIERRE DE CAJA #${closing.closing_number} — ${storeName.toUpperCase()}*\n`;
  text += `📅 Fecha: ${dateStr} · ${timeStr}\n`;
  text += `👤 Cajero: ${closing.closed_by_name || 'Caja'}\n`;
  text += `📊 Estado: ${statusEmoji} *${statusText}*\n\n`;

  text += `💵 *RESUMEN DE EFECTIVO:*\n`;
  text += `▪ Base Inicial: ${formatCentsCOP(closing.initial_cash_cents)}\n`;
  text += `▪ Ventas en Efectivo (${closing.total_sales_count}): ${formatCentsCOP(closing.sales_cash_cents)}\n`;
  if (closing.credit_payments_cash_cents > 0) {
    text += `▪ Abonos de Fiados: ${formatCentsCOP(closing.credit_payments_cash_cents)}\n`;
  }
  if ((closing.expenses_cash_cents || 0) > 0) {
    text += `▪ Gastos Caja Menor (-): -${formatCentsCOP(closing.expenses_cash_cents || 0)}\n`;
  }
  text += `───────────────────────\n`;
  text += `💰 *Efectivo Esperado:* *${formatCentsCOP(closing.expected_cash_cents)}*\n`;
  text += `🎯 *Efectivo Contado:* *${formatCentsCOP(closing.counted_cash_cents)}*\n`;
  text += `⚖️ *Diferencia:* *${statusEmoji} ${statusText}*\n`;

  if (closing.notes) {
    text += `\n📝 *Observaciones:* ${closing.notes}\n`;
  }

  text += `\nReporte generado por *SurtiFácil SaaS*`;

  return text;
}

/**
 * Genera el texto plano para impresión térmica de un recibo de abono de fiados (58mm o 80mm).
 */
export function generateCreditPaymentReceiptText(
  payment: CreditPaymentReceipt,
  store: Partial<StoreSettings>,
  options: { width: ThermalWidth } = { width: '58mm' }
): string {
  const colWidth = options.width === '58mm' ? 32 : 48;
  const divider = '-'.repeat(colWidth);
  const doubleDivider = '='.repeat(colWidth);

  const lines: string[] = [];

  // Cabecera de la tienda
  lines.push(centerText((store.nombre || 'SURTIFÁCIL ABASTOS').toUpperCase(), colWidth));
  if (store.barrio || store.ciudad) {
    lines.push(centerText(`${store.barrio || ''} - ${store.ciudad || 'Medellín'}`, colWidth));
  }
  if (store.direccion) {
    lines.push(centerText(store.direccion, colWidth));
  }
  if (store.telefono_whatsapp) {
    lines.push(centerText(`Tel / WhatsApp: ${store.telefono_whatsapp}`, colWidth));
  }
  lines.push(doubleDivider);

  // Título del comprobante
  lines.push(centerText('COMPROBANTE DE ABONO A FIADOS', colWidth));
  lines.push(centerText(`Recibo #${(payment.receipt_number || '').slice(0, 8)}`, colWidth));
  lines.push(divider);

  // Fecha y responsable
  const payDate = payment.date instanceof Date ? payment.date : new Date(payment.date || Date.now());
  lines.push(formatTwoColumns('Fecha:', payDate.toLocaleDateString('es-CO'), colWidth));
  lines.push(formatTwoColumns('Hora:', payDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }), colWidth));
  if (payment.received_by_name) {
    lines.push(formatTwoColumns('Recibido por:', payment.received_by_name, colWidth));
  }

  // Datos del cliente
  lines.push(divider);
  lines.push(formatTwoColumns('Cliente:', payment.customer_name, colWidth));
  if (payment.customer_phone) {
    lines.push(formatTwoColumns('Teléfono:', payment.customer_phone, colWidth));
  }
  if (payment.description) {
    lines.push(formatTwoColumns('Concepto:', payment.description.slice(0, colWidth - 10), colWidth));
  }
  lines.push(divider);

  // Desglose contable
  if (typeof payment.balance_before_cents === 'number') {
    lines.push(formatTwoColumns('Saldo Anterior:', formatCentsCOP(payment.balance_before_cents), colWidth));
  }

  lines.push(formatTwoColumns('VALOR ABONADO:', formatCentsCOP(payment.amount_cents), colWidth));

  if (typeof payment.balance_after_cents === 'number') {
    lines.push(formatTwoColumns('NUEVO SALDO DEUDOR:', formatCentsCOP(payment.balance_after_cents), colWidth));
  }

  const paymentMethodLabel = payment.payment_method === 'transfer'
    ? 'Transferencia Nequi / Bancolombia'
    : payment.payment_method === 'card'
    ? 'Tarjeta Débito/Crédito'
    : 'Efectivo';
  lines.push(formatTwoColumns('Medio de Pago:', paymentMethodLabel, colWidth));

  lines.push(doubleDivider);
  lines.push(centerText('RECIBO DE CAJA - CONTROL INTERNO', colWidth));
  lines.push(centerText('NO RESPONSABLE DE IVA (ART. 616-1 E.T.)', colWidth));
  lines.push(centerText('¡Gracias por su abono puntual!', colWidth));
  lines.push(centerText('SurtiFácil SaaS - Medellín', colWidth));

  return lines.join('\n');
}

/**
 * Genera el mensaje formateado para enviar el comprobante de abono de fiados por WhatsApp.
 */
export function generateCreditPaymentWhatsAppText(
  payment: CreditPaymentReceipt,
  store: Partial<StoreSettings>
): string {
  const storeName = store.nombre || 'SurtiFácil Abastos';
  const payDate = payment.date instanceof Date ? payment.date : new Date(payment.date || Date.now());
  const dateStr = payDate.toLocaleDateString('es-CO');
  const timeStr = payDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  const methodLabel = payment.payment_method === 'transfer'
    ? '📱 Transferencia Nequi / Bancolombia'
    : payment.payment_method === 'card'
    ? '💳 Tarjeta'
    : '💵 Efectivo';

  let text = `🧾 *COMPROBANTE DE ABONO A FIADOS — ${storeName.toUpperCase()}*\n`;
  if (store.barrio) text += `📍 ${store.barrio}, Medellín\n`;
  text += `📅 Fecha: ${dateStr} · ${timeStr}\n`;
  text += `🔢 Recibo de Caja: #${(payment.receipt_number || '').slice(0, 8)}\n`;
  text += `👤 Cliente: *${payment.customer_name}*\n\n`;

  text += `💰 *DETALLE DEL PAGO:*\n`;
  if (typeof payment.balance_before_cents === 'number') {
    text += `▪ Saldo Anterior: ${formatCentsCOP(payment.balance_before_cents)}\n`;
  }
  text += `▪ *Valor Abonado:* *${formatCentsCOP(payment.amount_cents)}*\n`;
  if (typeof payment.balance_after_cents === 'number') {
    text += `▪ *Nuevo Saldo Pendiente:* *${formatCentsCOP(payment.balance_after_cents)}*\n`;
  }
  text += `💳 *Medio de pago:* ${methodLabel}\n`;
  if (payment.description) {
    text += `📝 Concepto: ${payment.description}\n`;
  }

  text += `\n📌 *Documento de Control Interno — Régimen No Responsable de IVA (Art. 616-1 E.T.)*\n`;
  text += `\n¡Muchas gracias por su puntualidad y apoyo al comercio del barrio! 🙏✨`;

  return text;
}
