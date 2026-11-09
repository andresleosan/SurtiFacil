import { describe, it, expect, vi } from 'vitest';
import {
  generateDebtReminderWhatsAppText,
  buildWhatsAppClickToChatUrl,
  sendDebtReminderViaWhatsApp,
  getSuggestedDueDate,
  parsePaymentDetails,
} from '../utils/debtReminder';
import { CreditCustomer, CreditEntry } from '../firebase/db';

describe('Cobranza Vecinal por WhatsApp y Cuentas Nequi/Bancolombia (debtReminder)', () => {
  const mockCustomer: CreditCustomer = {
    id: 'cust-1',
    name: 'Don Carlos Botero',
    phone: '3104567890',
    balance_cents: 4850000, // $ 48.500 COP
    active: true,
  };

  const mockEntries: CreditEntry[] = [
    {
      id: 'e-1',
      customer_id: 'cust-1',
      type: 'debt',
      amount_cents: 2500000,
      description: 'Mercado del fin de semana',
      created_by_uid: 'cashier-1',
      createdAt: new Date('2026-11-06T10:00:00Z'),
    },
    {
      id: 'e-2',
      customer_id: 'cust-1',
      type: 'payment',
      amount_cents: 1000000,
      description: 'Abono en efectivo',
      created_by_uid: 'cashier-1',
      createdAt: new Date('2026-11-05T12:00:00Z'),
    },
  ];

  const mockStore = {
    nombre: 'SurtiFácil Laureles',
    datos_pago_offline: 'Bancolombia Ahorros 123-456789 / Nequi 300 123 4567',
  };

  it('genera mensaje amigable por defecto con saldo en COP y movimientos recientes', () => {
    const text = generateDebtReminderWhatsAppText(mockCustomer, mockEntries, mockStore);

    expect(text).toContain('Hola *Don Carlos Botero*');
    expect(text).toContain('*SurtiFácil Laureles*');
    expect(text).toContain('💰 *Saldo pendiente:* *$ 48.500*');
    expect(text).toContain('Mercado del fin de semana (+$ 25.000)');
    expect(text).toContain('Abono en efectivo (-$ 10.000)');
    expect(text).toContain('Bancolombia Ahorros 123-456789 / Nequi 300 123 4567');
  });

  it('soporta tono de quincena con fecha de pago acordada', () => {
    const text = generateDebtReminderWhatsAppText(mockCustomer, mockEntries, mockStore, {
      tone: 'quincena',
      dueDate: 'Día 15 de Noviembre (Quincena)',
    });

    expect(text).toContain('Se acerca el corte de quincena');
    expect(text).toContain('📅 *Fecha de pago acordada:* Día 15 de Noviembre (Quincena)');
    expect(text).toContain('💰 *Saldo pendiente:* *$ 48.500*');
  });

  it('soporta tono formal con recordatorio respetuoso de vencimiento', () => {
    const text = generateDebtReminderWhatsAppText(mockCustomer, mockEntries, mockStore, {
      tone: 'formal',
      dueDate: 'Fin de mes',
    });

    expect(text).toContain('Estimado(a) *Don Carlos Botero*');
    expect(text).toContain('Nos comunicamos con todo respeto');
    expect(text).toContain('📅 *Fecha de pago acordada:* Fin de mes');
    expect(text).toContain('Agradecemos mucho tu puntualidad');
  });

  it('detecta y parsea datos de pago Nequi y Bancolombia', () => {
    const parsed = parsePaymentDetails('Nequi: 300 123 4567 / Bancolombia Ahorros 987654');
    expect(parsed.nequiNumber).toBe('3001234567');
    expect(parsed.formattedText).toContain('Nequi: 300 123 4567');
    expect(parsed.formattedText).toContain('Efectivo en mostrador');
  });

  it('calcula sugerencias amigables de fecha de pago', () => {
    expect(getSuggestedDueDate('none')).toBeUndefined();
    expect(getSuggestedDueDate('week')).toContain('Viernes');
    expect(getSuggestedDueDate('month_end')).toContain('Fin de mes');
    expect(getSuggestedDueDate('fifteenth')).toMatch(/Día \d+/);
  });

  it('construye URL click-to-chat con prefijo 57 de Colombia', () => {
    const url = buildWhatsAppClickToChatUrl('3104567890', 'Hola Don Carlos');
    expect(url).toContain('https://wa.me/573104567890?text=Hola%20Don%20Carlos');
  });

  it('abre la ventana de WhatsApp con sendDebtReminderViaWhatsApp', () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    sendDebtReminderViaWhatsApp(mockCustomer, mockEntries, mockStore, undefined, {
      tone: 'quincena',
      dueDate: '15 de Noviembre',
    });

    expect(windowOpenSpy).toHaveBeenCalled();
    const calledUrl = windowOpenSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://wa.me/573104567890?text=');
    expect(calledUrl).toContain(encodeURIComponent('15 de Noviembre'));

    windowOpenSpy.mockRestore();
  });
});
