import { describe, it, expect } from 'vitest';
import {
  buildFiscalLedger,
  generateFiscalLedgerCSV,
} from '../services/fiscalLedgerGenerator';
import type { Sale } from '../firebase/db';

describe('fiscalLedgerGenerator (Libro Fiscal DIAN)', () => {
  const mockSales: Sale[] = [
    {
      id: 's1',
      date: new Date('2026-11-01T10:00:00Z'),
      total: 450000,
      payment_method: 'cash',
      items: [],
    },
    {
      id: 's2',
      date: new Date('2026-11-01T14:30:00Z'),
      total: 350000,
      payment_method: 'other', // Nequi / Bancolombia
      items: [],
    },
    {
      id: 's3',
      date: new Date('2026-11-02T09:15:00Z'),
      total: 500000,
      payment_method: 'credit', // Fiado
      items: [],
    },
  ];

  it('agrupa las ventas diarias por fecha y discrimina medios de pago', () => {
    const summary = buildFiscalLedger(mockSales, {
      nombre: 'Mi Tiendita',
      direccion: 'Calle 10 # 20-30',
      barrio: 'Laureles',
    });

    expect(summary.storeName).toBe('Mi Tiendita');
    expect(summary.entries.length).toBe(2);

    // Día 1
    const day1 = summary.entries[0];
    expect(day1.date).toBe('2026-11-01');
    expect(day1.receiptsCount).toBe(2);
    expect(day1.cashSalesCents).toBe(450000);
    expect(day1.transferSalesCents).toBe(350000);
    expect(day1.creditSalesCents).toBe(0);
    expect(day1.totalSalesCents).toBe(800000);

    // Día 2
    const day2 = summary.entries[1];
    expect(day2.date).toBe('2026-11-02');
    expect(day2.receiptsCount).toBe(1);
    expect(day2.creditSalesCents).toBe(500000);
    expect(day2.totalSalesCents).toBe(500000);

    // Totales consolidados
    expect(summary.grandTotalCents).toBe(1300000);
    expect(summary.totalReceipts).toBe(3);
  });

  it('genera un CSV con BOM UTF-8 y encabezados DIAN colombianos', () => {
    const summary = buildFiscalLedger(mockSales, {
      nombre: 'SurtiFácil Abastos',
      nit: '123456789-0',
    });

    const csv = generateFiscalLedgerCSV(summary);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('LIBRO FISCAL DE REGISTRO DE OPERACIONES DIARIAS');
    expect(csv).toContain('Conforme al Art. 616-1 del Estatuto Tributario');
    expect(csv).toContain('SurtiFácil Abastos');
    expect(csv).toContain('"Ventas Efectivo (COP)"');
    expect(csv).toContain('"Total Ingresos Diarios (COP)"');
    expect(csv).toContain('"TOTAL CONSOLIDADO:"');
  });
});
