import { describe, it, expect, vi } from 'vitest';
import { Sale } from '../firebase/db';
import { CashClosing } from '../types/cashClosing';
import { StoreSettings } from '../types/storeSettings';
import {
  generateSaleReceiptText,
  generateSaleWhatsAppText,
  generateCashClosingReceiptText,
  generateCashClosingWhatsAppText,
  generateCreditPaymentReceiptText,
  generateCreditPaymentWhatsAppText,
  CreditPaymentReceipt,
} from '../utils/receiptGenerator';
import { exportSalesToCSV, exportClosingsToCSV, downloadCSV } from '../utils/csvExporter';

describe('Generador de Tirillas Térmicas y Exportación Excel CSV', () => {
  const mockStore: Partial<StoreSettings> = {
    nombre: 'SurtiFácil Abastos Belén',
    barrio: 'Belén',
    ciudad: 'Medellín',
    direccion: 'Carrera 76 # 30-10',
    telefono_whatsapp: '+573001234567',
    datos_pago_offline: 'Nequi / Bancolombia: 300 123 4567',
  };

  const mockSale: Sale = {
    id: 'sale-test-99',
    date: new Date('2026-11-07T14:30:00Z'),
    total: 1250000, // $ 12.500 COP
    total_cost_cents: 800000,
    payment_method: 'cash',
    created_by_role: 'cashier',
    items: [
      {
        product_id: 'p-1',
        product_name: 'Arroz Diana 1kg',
        quantity: 2,
        price_cents: 420000,
        subtotal: 840000,
      },
      {
        product_id: 'p-2',
        product_name: 'Panela Pastilla',
        quantity: 1,
        price_cents: 410000,
        subtotal: 410000,
      },
    ],
  };

  const mockClosing: CashClosing = {
    id: 'cclose-test-01',
    negocio_id: 'surtifacil',
    closing_number: 5,
    opened_at: '2026-11-07T08:00:00Z',
    closed_at: '2026-11-07T18:00:00Z',
    closed_by_uid: 'uid-1',
    closed_by_name: 'Cajero Andrés',
    initial_cash_cents: 10000000, // $ 100.000 COP
    sales_cash_cents: 25000000, // $ 250.000 COP
    credit_payments_cash_cents: 5000000, // $ 50.000 COP
    expected_cash_cents: 40000000, // $ 400.000 COP
    counted_cash_cents: 40000000,
    difference_cents: 0,
    status: 'balanced',
    breakdown: {
      bills: { '100000': 3, '50000': 2 },
      coins: { '1000': 0 },
    },
    notes: 'Cierre de sábado cuadrado',
    total_sales_count: 15,
  };

  it('genera tirilla de venta formateada para impresora térmica de 58mm', () => {
    const text58 = generateSaleReceiptText(mockSale, mockStore, { width: '58mm' });
    expect(text58).toContain('SURTIFÁCIL ABASTOS BELÉN');
    expect(text58).toContain('Arroz Diana 1kg');
    expect(text58).toContain('$ 12.500');
    expect(text58).toContain('NO RESPONSABLE DE IVA');
    expect(text58).toContain('616-1 E.T.');
    expect(text58).toContain('¡Gracias por su compra!');
  });

  it('incluye efectivo recibido y vueltas en la tirilla de venta cuando se paga en efectivo con cambio', () => {
    const saleWithCash: Sale = {
      ...mockSale,
      payment_method: 'cash',
      received_cash_cents: 2000000, // $ 20.000 COP
      change_cents: 750000, // $ 7.500 COP
    };
    const receipt = generateSaleReceiptText(saleWithCash, mockStore, { width: '58mm' });
    expect(receipt).toContain('Efectivo Recibido:');
    expect(receipt).toContain('$ 20.000');
    expect(receipt).toContain('Vueltas a Entregar:');
    expect(receipt).toContain('$ 7.500');

    const wa = generateSaleWhatsAppText(saleWithCash, mockStore);
    expect(wa).toContain('💵 *Efectivo Recibido:* $ 20.000');
    expect(wa).toContain('🪙 *Vueltas a Entregar:* $ 7.500');
  });

  it('genera tirilla de venta formateada para impresora térmica de 80mm', () => {
    const text80 = generateSaleReceiptText(mockSale, mockStore, { width: '80mm' });
    expect(text80).toContain('SURTIFÁCIL ABASTOS BELÉN');
    expect(text80).toContain('Subtotal');
    expect(text80).toContain('$ 12.500');
  });

  it('genera texto con emojis y formato para compartir recibo de venta por WhatsApp', () => {
    const waText = generateSaleWhatsAppText(mockSale, mockStore);
    expect(waText).toContain('🧾 *COMPROBANTE DE COMPRA');
    expect(waText).toContain('Belén, Medellín');
    expect(waText).toContain('Arroz Diana 1kg');
    expect(waText).toContain('*$ 12.500*');
    expect(waText).toContain('Nequi / Bancolombia: 300 123 4567');
    expect(waText).toContain('Art. 616-1 E.T.');
  });

  it('genera tirilla térmica de comprobante de abono a fiados para 58mm y 80mm con leyenda DIAN Art. 616-1', () => {
    const mockPayment: CreditPaymentReceipt = {
      id: 'pay-test-101',
      receipt_number: 'pay-test-101',
      customer_name: 'Don Carlos Restrepo',
      customer_phone: '3109876543',
      amount_cents: 2000000, // $ 20.000 COP
      balance_before_cents: 5500000, // $ 55.000 COP
      balance_after_cents: 3500000, // $ 35.000 COP
      payment_method: 'cash',
      date: new Date('2026-11-08T10:15:00Z'),
      description: 'Abono en efectivo de quincena',
      received_by_name: 'Cajero Andrés',
    };

    const text58 = generateCreditPaymentReceiptText(mockPayment, mockStore, { width: '58mm' });
    expect(text58).toContain('COMPROBANTE DE ABONO A FIADOS');
    expect(text58).toContain('Don Carlos Restrepo');
    expect(text58).toContain('Saldo Anterior:');
    expect(text58).toContain('$ 55.000');
    expect(text58).toContain('VALOR ABONADO:');
    expect(text58).toContain('$ 20.000');
    expect(text58).toContain('NUEVO SALDO DEUDOR:');
    expect(text58).toContain('$ 35.000');
    expect(text58).toContain('NO RESPONSABLE DE IVA');
    expect(text58).toContain('616-1 E.T.');

    const text80 = generateCreditPaymentReceiptText(mockPayment, mockStore, { width: '80mm' });
    expect(text80).toContain('COMPROBANTE DE ABONO A FIADOS');
    expect(text80).toContain('Don Carlos Restrepo');
    expect(text80).toContain('$ 20.000');
    expect(text80).toContain('NO RESPONSABLE DE IVA (ART. 616-1 E.T.)');

    const waText = generateCreditPaymentWhatsAppText(mockPayment, mockStore);
    expect(waText).toContain('🧾 *COMPROBANTE DE ABONO A FIADOS');
    expect(waText).toContain('Don Carlos Restrepo');
    expect(waText).toContain('$ 20.000');
    expect(waText).toContain('$ 35.000');
    expect(waText).toContain('Art. 616-1 E.T.');
  });

  it('genera tirilla térmica del Acta de Cierre de Caja con desglose de billetes y monedas', () => {
    const closingText = generateCashClosingReceiptText(mockClosing, mockStore, { width: '58mm' });
    expect(closingText).toContain('ACTA DE ARQUEO Y CIERRE DE CAJA');
    expect(closingText).toContain('Cierre Oficial #5');
    expect(closingText).toContain('Base Inicial Caja:');
    expect(closingText).toContain('$ 100.000');
    expect(closingText).toContain('$ 400.000');
    expect(closingText).toContain('CUADRADO');
    expect(closingText).toContain('3x $ 100.000');
  });

  it('genera reporte de cierre para WhatsApp dirigido al administrador', () => {
    const closingWa = generateCashClosingWhatsAppText(mockClosing, mockStore);
    expect(closingWa).toContain('🔒 *ACTA DE CIERRE DE CAJA #5');
    expect(closingWa).toContain('Cajero Andrés');
    expect(closingWa).toContain('✅ *CUADRADO*');
    expect(closingWa).toContain('*$ 400.000*');
    expect(closingWa).toContain('Cierre de sábado cuadrado');
  });

  it('genera archivo CSV con encabezados en español y prefijo UTF-8 BOM', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    let appendedBlob: Blob | null = null;
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el: any) => {
      return el;
    });
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((el: any) => {
      return el;
    });

    exportSalesToCSV([mockSale], 'test-ventas.csv');
    expect(createObjectURLMock).toHaveBeenCalled();
    const blobArg = createObjectURLMock.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toContain('text/csv');

    exportClosingsToCSV([mockClosing], 'test-cierres.csv');
    expect(createObjectURLMock).toHaveBeenCalledTimes(2);

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('respeta estrictamente el ancho de 32 columnas (58mm) y 48 columnas (80mm) al envolver textos largos sin truncar montos ni leyenda DIAN', () => {
    const longStore: Partial<StoreSettings> = {
      nombre: 'Supermercado Comunitario La Prosperidad del Valle de Aburra Medellín',
      barrio: 'Santo Domingo Savio',
      ciudad: 'Medellín',
      direccion: 'Carrera 38 # 105-24 Local Principal',
    };

    const longSale: Sale = {
      ...mockSale,
      total: 14560000, // $ 145.600 COP
      received_cash_cents: 15000000,
      change_cents: 440000,
      items: [
        {
          product_id: 'p-long',
          product_name: 'Aceite Vegetal Girasol Gourmet Premium Extra Virgen x 3000ml',
          quantity: 2,
          price_cents: 7280000,
          subtotal: 14560000,
        },
      ],
    };

    const text58 = generateSaleReceiptText(longSale, longStore, { width: '58mm' });
    const lines58 = text58.split('\n');
    for (const line of lines58) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
    expect(text58).toContain('$ 145.600');
    expect(text58).toContain('$ 4.400');
    expect(text58).toContain('NO RESPONSABLE DE IVA');
    expect(text58).toContain('616-1 E.T.');

    const text80 = generateSaleReceiptText(longSale, longStore, { width: '80mm' });
    const lines80 = text80.split('\n');
    for (const line of lines80) {
      expect(line.length).toBeLessThanOrEqual(48);
    }
    expect(text80).toContain('$ 145.600');
    expect(text80).toContain('NO RESPONSABLE DE IVA (ART. 616-1 E.T.)');
  });
});
