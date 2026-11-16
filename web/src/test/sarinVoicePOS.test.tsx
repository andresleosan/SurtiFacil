import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Product } from '../firebase/db';
import {
  parseCashAmount,
  matchProductInCatalog,
  parseSarinSaleCommand,
} from '../utils/sarinVoiceParser';
import SarinVoicePOS from '../components/SarinVoicePOS';

const MOCK_CATALOG: Product[] = [
  {
    id: 'p1',
    name: 'Leche Colanta Entera 1L',
    price_cents: 450000, // $ 4.500 COP
    stock: 20,
    unit: 'litro',
    category: 'Lácteos y Huevos',
  },
  {
    id: 'p2',
    name: 'Arroz Diana 1kg',
    price_cents: 480000, // $ 4.800 COP
    stock: 50,
    unit: 'kilo',
    category: 'Granos y Despensa',
  },
  {
    id: 'p3',
    name: 'Huevos AA x30',
    price_cents: 1800000, // $ 18.000 COP
    stock: 10,
    unit: 'cubeta',
    category: 'Lácteos y Huevos',
  },
  {
    id: 'p4',
    name: 'Empanada de Carne',
    price_cents: 250000, // $ 2.500 COP
    stock: 15,
    unit: 'unidad',
    category: 'Snacks y Panadería',
  },
];

describe('Sarin Voice POS - Parsing & Financial Logic', () => {
  it('parses cash amounts spoken in colloquial Colombian Spanish', () => {
    // "20 mil" -> 20.000 COP -> 2.000.000 centavos
    expect(parseCashAmount('pagan con 20 mil')).toBe(2000000);
    expect(parseCashAmount('con 50 mil')).toBe(5000000);
    expect(parseCashAmount('con diez mil')).toBe(1000000);
    expect(parseCashAmount('billete de 100 mil')).toBe(10000000);
    expect(parseCashAmount('50000')).toBe(5000000);
  });

  it('matches products by spoken keywords or category tokens', () => {
    const match1 = matchProductInCatalog('dos leches colanta', MOCK_CATALOG);
    expect(match1).not.toBeNull();
    expect(match1?.id).toBe('p1');

    const match2 = matchProductInCatalog('arroz diana', MOCK_CATALOG);
    expect(match2).not.toBeNull();
    expect(match2?.id).toBe('p2');

    const match3 = matchProductInCatalog('empanadas', MOCK_CATALOG);
    expect(match3).not.toBeNull();
    expect(match3?.id).toBe('p4');
  });

  it('interprets sale with multiple items, payment in cash, and computes change (vueltas)', () => {
    // "Sarin, agrega dos leches y una libra de arroz, pagan con 20 mil"
    // 2 leches ($ 4.500 c/u = $ 9.000) + 1 arroz ($ 4.800) = $ 13.800 COP
    // Pagan con $ 20.000 -> Vueltas = $ 6.200 COP
    const result = parseSarinSaleCommand(
      'Sarin, agrega dos leches colanta y un arroz diana, pagan con 20 mil',
      MOCK_CATALOG
    );

    expect(result.hasSarinWakeWord).toBe(true);
    expect(result.intent).toBe('ADD_ITEMS');
    expect(result.items.length).toBe(2);
    expect(result.totalCents).toBe(1380000);
    expect(result.paymentMethod).toBe('cash');
    expect(result.receivedCashCents).toBe(2000000);
    expect(result.isCashSufficient).toBe(true);
    expect(result.changeCents).toBe(620000); // $ 6.200 COP
    expect(result.spokenFeedback).toContain('vueltas son');
  });

  it('alerts when cash received is less than total (dinero insuficiente)', () => {
    // 1 cubeta de huevos ($ 18.000 COP), pagan con $ 10.000 COP -> Faltan $ 8.000 COP
    const result = parseSarinSaleCommand(
      'Sarin, huevos, pagan con diez mil',
      MOCK_CATALOG
    );

    expect(result.totalCents).toBe(1800000);
    expect(result.receivedCashCents).toBe(1000000);
    expect(result.isCashSufficient).toBe(false);
    expect(result.shortageCents).toBe(800000); // Faltan $ 8.000 COP
    expect(result.spokenFeedback).toContain('faltan');
  });

  it('detects fiado payment and customer name', () => {
    const result = parseSarinSaleCommand(
      'Sarin, dos empanadas de carne, fiado a Don Carlos',
      MOCK_CATALOG
    );

    expect(result.paymentMethod).toBe('credit');
    expect(result.creditCustomerName).toContain('Carlos');
    expect(result.totalCents).toBe(500000); // 2 * 2.500 = $ 5.000 COP
    expect(result.spokenFeedback).toContain('fiado');
  });

  it('detects control commands: clear cart and finalize sale', () => {
    const clearResult = parseSarinSaleCommand('Sarin, limpia el carrito', MOCK_CATALOG);
    expect(clearResult.intent).toBe('CLEAR_CART');
    expect(clearResult.spokenFeedback).toContain('Carrito vaciado');

    const finalizeResult = parseSarinSaleCommand('Sarin, cobrar', MOCK_CATALOG);
    expect(finalizeResult.intent).toBe('FINALIZE_SALE');
  });

  it('applies wholesale tier pricing and calculates exact savings and change when dictating 3+ units', () => {
    const wholesaleCatalog: Product[] = [
      {
        ...MOCK_CATALOG[0],
        wholesale_tiers: [
          { min_quantity: 3, unit_price_cents: 400000 },
          { min_quantity: 6, unit_price_cents: 380000 },
        ],
      },
    ];

    const result = parseSarinSaleCommand(
      'Sarin, agrega 3 leches colanta, pagan con 20 mil',
      wholesaleCatalog
    );

    expect(result.intent).toBe('ADD_ITEMS');
    expect(result.items[0].unitPriceCents).toBe(400000);
    expect(result.items[0].subtotalCents).toBe(1200000); // 3 * $4.000 = $12.000
    expect(result.items[0].appliedWholesaleTier).toEqual({ min_quantity: 3, unit_price_cents: 400000 });
    expect(result.items[0].wholesaleSavingsCents).toBe(150000);
    expect(result.totalCents).toBe(1200000);
    expect(result.changeCents).toBe(800000); // $20.000 - $12.000 = $8.000
    expect(result.spokenFeedback).toContain('Ahorro mayorista');
  });
});

describe('SarinVoicePOS Component Interaction', () => {
  it('renders microphone toggle and simulation input', () => {
    const onApply = vi.fn();
    render(<SarinVoicePOS products={MOCK_CATALOG} onApplyCommand={onApply} />);

    expect(screen.getByRole('button', { name: /micrófono Sarin/i })).toBeDefined();
    expect(screen.getByText(/Escribir \/ Simular comando/i)).toBeDefined();
  });

  it('simulates voice command and renders high-contrast didactic confirmation card with vueltas', () => {
    const onApply = vi.fn();
    render(<SarinVoicePOS products={MOCK_CATALOG} onApplyCommand={onApply} />);

    // Abrir simulador de texto
    fireEvent.click(screen.getByText(/Escribir \/ Simular comando/i));

    const input = screen.getByPlaceholderText(/Sarin, dos leches/i);
    fireEvent.change(input, {
      target: { value: 'Sarin, dos leches colanta, pagan con 20 mil' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Interpretar Comando/i }));

    // Tarjeta didáctica visible
    expect(screen.getByRole('region', { name: /Confirmación didáctica/i })).toBeDefined();
    expect(screen.getByText(/Vueltas a Entregar/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Aplicar productos al carrito/i })).toBeDefined();

    // Aplicar a venta
    fireEvent.click(screen.getByRole('button', { name: /Aplicar productos al carrito/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].totalCents).toBe(900000); // 2 * $4.500 = $9.000 COP
  });

  it('muestra badge de escala mayorista en la tarjeta didáctica de voz al dictar 3+ unidades', () => {
    const onApply = vi.fn();
    const wholesaleCatalog: Product[] = [
      {
        ...MOCK_CATALOG[0],
        wholesale_tiers: [{ min_quantity: 3, unit_price_cents: 400000 }],
      },
    ];
    render(<SarinVoicePOS products={wholesaleCatalog} onApplyCommand={onApply} />);

    fireEvent.click(screen.getByText(/Escribir \/ Simular comando/i));
    fireEvent.change(screen.getByPlaceholderText(/Sarin, dos leches/i), {
      target: { value: 'Sarin, 3 leches colanta, pagan con 20 mil' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Interpretar Comando/i }));

    expect(screen.getByText(/🏷️ Mayorista 3\+/i)).toBeDefined();
    expect(screen.getAllByText('$ 12.000').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$ 8.000')).toBeDefined();
  });
});
