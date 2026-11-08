import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  generateDebtReminderWhatsAppText,
  sendDebtReminderViaWhatsApp,
} from '../components/Credits';
import { CreditCustomer, CreditEntry } from '../firebase/db';

describe('Cobro Amigable de Fiados por WhatsApp (Credits)', () => {
  const mockCustomer: CreditCustomer = {
    id: 'cust-don-carlos',
    name: 'Don Carlos Botero',
    phone: '3104567890',
    notes: 'Vecino de la esquina',
    balance_cents: 4850000, // $ 48.500 COP
    active: true,
  };

  const mockEntries: CreditEntry[] = [
    {
      id: 'e-1',
      customer_id: 'cust-don-carlos',
      type: 'debt',
      amount_cents: 2500000,
      description: 'Mercado del fin de semana',
      created_by_uid: 'cashier-1',
      createdAt: new Date('2026-11-06T10:00:00Z'),
    },
    {
      id: 'e-2',
      customer_id: 'cust-don-carlos',
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

  it('genera un mensaje cordial de cobro con nombre del vecino, saldo en COP y movimientos', () => {
    const text = generateDebtReminderWhatsAppText(mockCustomer, mockEntries, mockStore);

    expect(text).toContain('Hola *Don Carlos Botero*');
    expect(text).toContain('*SurtiFácil Laureles*');
    expect(text).toContain('💰 *Saldo pendiente:* *$ 48.500*');
    expect(text).toContain('Mercado del fin de semana (+$ 25.000)');
    expect(text).toContain('Abono en efectivo (-$ 10.000)');
    expect(text).toContain('Bancolombia Ahorros 123-456789 / Nequi 300 123 4567');
  });

  it('abre la URL de WhatsApp con el código de país colombiano 57 y texto codificado', () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    sendDebtReminderViaWhatsApp(mockCustomer, mockEntries, mockStore);

    expect(windowOpenSpy).toHaveBeenCalled();
    const calledUrl = windowOpenSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://wa.me/573104567890?text=');
    expect(calledUrl).toContain(encodeURIComponent('Don Carlos Botero'));

    windowOpenSpy.mockRestore();
  });
});
