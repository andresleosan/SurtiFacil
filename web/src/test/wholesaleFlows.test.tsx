import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, Sale } from '../firebase/db';
import type { PublicStoreData } from '../types/customerOrder';

const hoistedMocks = vi.hoisted(() => ({
  products: [] as Product[],
  publicStore: null as PublicStoreData | null,
  createSale: vi.fn(async () => 'sale-wholesale-1'),
  getCustomerOrders: vi.fn(async () => []),
  createCustomerOrder: vi.fn(),
}));

vi.mock('../services/productService', () => ({
  subscribeToProducts: (
    onData: (items: Product[]) => void,
    _onError?: (err: Error) => void
  ) => {
    onData(hoistedMocks.products);
    return () => {};
  },
}));

vi.mock('../services/saleService', () => ({
  createSale: hoistedMocks.createSale,
}));

vi.mock('../services/creditService', () => ({
  subscribeToCreditCustomers: (
    onData: (items: unknown[]) => void,
    _onError?: (err: Error) => void
  ) => {
    onData([]);
    return () => {};
  },
}));

vi.mock('../services/customerOrderService', () => ({
  getPublicStore: vi.fn(async () => hoistedMocks.publicStore),
  getCustomerOrders: hoistedMocks.getCustomerOrders,
  createCustomerOrder: hoistedMocks.createCustomerOrder,
  convertOrderToSale: vi.fn(),
  updateCustomerOrderStatus: vi.fn(),
  trackCustomerOrder: vi.fn(),
}));

vi.mock('../components/BarcodeScanner', () => ({
  default: () => <div>Escáner</div>,
}));

import CreateSale from '../components/CreateSale';
import KioskMode from '../components/KioskMode';
import PublicStorefront from '../components/PublicStorefront';
import { WholesaleTiersEditor } from '../components/ui/WholesaleTiersEditor';
import {
  generateSaleReceiptText,
  generateSaleWhatsAppText,
} from '../utils/receiptGenerator';
import type { WholesaleTier } from '../utils/wholesalePricing';

const WHOLESALE_MILK_PRODUCT: Product = {
  id: 'p-leche-mayorista',
  name: 'Leche Entera 1L',
  price_cents: 450000,
  stock: 30,
  category: 'Lácteos y Huevos',
  unit: 'litro',
  barcode: '7702129001100',
  wholesale_tiers: [
    { min_quantity: 3, unit_price_cents: 400000 },
    { min_quantity: 6, unit_price_cents: 380000 },
  ],
};

function createPublicStoreFixture(): PublicStoreData {
  return {
    id: 'surtifacil',
    nombre: 'SurtiFácil Abastos Central',
    slug: 'surtifacil',
    barrio: 'Laureles, Medellín',
    ciudad: 'Medellín',
    telefono_whatsapp: '+573001234567',
    direccion: 'Calle 50 # 50-20, Medellín',
    horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
    estado: 'activo',
    costo_domicilio_cents: 350000,
    config: {
      permite_domicilio: true,
      permite_retiro: true,
      slogan: 'Tu tienda de barrio',
    },
    products: [
      {
        id: 'p-leche-mayorista',
        name: 'Leche Entera 1L',
        price_cents: 450000,
        stock: 30,
        unit: 'litro',
        category: 'Lácteos y Huevos',
        visible_kiosco: 1,
        visible_tienda: 1,
        en_oferta: 0,
        precio_oferta_cents: null,
        wholesale_tiers: [
          { min_quantity: 3, unit_price_cents: 400000 },
          { min_quantity: 6, unit_price_cents: 380000 },
        ],
      },
    ],
    combos: [],
  };
}

describe('Flujos de Promociones Mayoristas (UI + Recibos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoistedMocks.products = [WHOLESALE_MILK_PRODUCT];
    hoistedMocks.publicStore = createPublicStoreFixture();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('WholesaleTiersEditor permite agregar atajos rápidos, editar precio con % descuento y eliminar escalas', async () => {
    const onChangeSpy = vi.fn();
    function Harness() {
      const [tiers, setTiers] = useState<WholesaleTier[]>([]);
      return (
        <WholesaleTiersEditor
          tiers={tiers}
          regularPriceCents={450000}
          inputScale="pesos"
          idPrefix="test-wholesale"
          onChange={(next) => {
            setTiers(next);
            onChangeSpy(next);
          }}
        />
      );
    }

    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+3 uds' }));
    expect(onChangeSpy).toHaveBeenCalledWith([{ min_quantity: 3, unit_price_cents: 405000 }]);

    const priceInput = screen.getByLabelText(/Precio c\/u \(\$ COP\)/i);
    await user.clear(priceInput);
    await user.type(priceInput, '3600');

    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getByText(/Equivale a \$ 3\.600 c\/u/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Eliminar escala desde 3 unidades/i }));
    expect(screen.getByText(/Sin escalas mayoristas/i)).toBeInTheDocument();
  });

  it('CreateSale (POS) muestra badge mayorista, nudge y recalcula ahorro al cruzar umbral 3+ y al decrementar', async () => {
    const user = userEvent.setup();
    render(<CreateSale />);

    const catalogList = await screen.findByRole('list', { name: 'Productos disponibles' });
    expect(within(catalogList).getByText(/🏷️ 3\+/)).toBeInTheDocument();

    const addButton = within(catalogList).getByRole('button', { name: 'Agregar Leche Entera 1L' });
    await user.click(addButton);
    await user.click(addButton);

    // Con 2 unidades aún está en tarifa normal y muestra nudge para llegar a 3
    expect(screen.getByText(/\+1 para 3\+/i)).toBeInTheDocument();

    // Sube a 3 unidades -> activa promoción mayorista
    await user.click(screen.getByRole('button', { name: 'Agregar uno de Leche Entera 1L' }));
    expect(await screen.findByText(/🏷️ Mayorista 3\+/i)).toBeInTheDocument();
    expect(screen.getByText('Ahorro mayorista')).toBeInTheDocument();

    // Baja a 2 unidades -> revierte a precio normal
    await user.click(screen.getByRole('button', { name: 'Quitar uno de Leche Entera 1L' }));
    await waitFor(() => {
      expect(screen.queryByText(/🏷️ Mayorista 3\+/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Ahorro mayorista')).not.toBeInTheDocument();
    });
  });

  it('KioskMode muestra pill promocional y actualiza dinámicamente el precio mayorista al subir/bajar cantidad', async () => {
    const user = userEvent.setup();
    render(<KioskMode slug="surtifacil" />);

    expect(await screen.findByText(/🏷️ Lleva 3\+ a \$ 4\.000 c\/u/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar Leche Entera 1L al pedido' }));
    const cardPlus = await screen.findByRole('button', {
      name: 'Agregar otra unidad de Leche Entera 1L',
    });
    await user.click(cardPlus); // 2 uds
    await user.click(cardPlus); // 3 uds -> activa promo

    expect(await screen.findByText(/✅ Promo 3\+ activa · Ahorras \$ 1\.500/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ahorro mayorista aplicado/i).length).toBeGreaterThanOrEqual(1);

    const cardMinus = screen.getByRole('button', { name: 'Quitar una unidad de Leche Entera 1L' });
    await user.click(cardMinus); // vuelve a 2 uds

    await waitFor(() => {
      expect(screen.queryByText(/✅ Promo 3\+ activa/i)).not.toBeInTheDocument();
    });
  });

  it('PublicStorefront (Tienda Vecinal) muestra badge mayorista, nudge y recalcula ahorro al modificar cantidad en checkout', async () => {
    render(<PublicStorefront slug="surtifacil" />);

    expect(await screen.findByText(/🏷️ 3\+ a /i)).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /Agregar Leche Entera 1L a la canasta/i });
    fireEvent.click(addBtn); // 1 unidad en canasta

    const openCartBtn = await screen.findByRole('button', {
      name: /Abrir canasta y confirmar pedido/i,
    });
    fireEvent.click(openCartBtn);

    expect(await screen.findByText(/Lleva 2 más para pagar/i)).toBeInTheDocument();

    // Sube a 2 y luego a 3 unidades dentro del drawer
    fireEvent.click(screen.getByRole('button', { name: 'Sumar uno de Leche Entera 1L' }));
    expect(await screen.findByText(/Lleva 1 más para pagar/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sumar uno de Leche Entera 1L' }));
    expect(await screen.findByText(/🏷️ Mayorista 3\+ · Ahorras/i)).toBeInTheDocument();
    expect(screen.getByText(/🏷️ Ahorro mayorista incluido:/i)).toBeInTheDocument();

    // Baja a 2 unidades -> revierte el ahorro mayorista
    fireEvent.click(screen.getByRole('button', { name: 'Quitar uno de Leche Entera 1L' }));
    await waitFor(() => {
      expect(screen.queryByText(/🏷️ Ahorro mayorista incluido:/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Lleva 1 más para pagar/i)).toBeInTheDocument();
    });
  });

  it('receiptGenerator incluye detalle de escala aplicada y ahorro mayorista en tirilla 58mm y WhatsApp', () => {
    const sampleSale: Sale = {
      id: 'sale-w-01',
      items: [
        {
          product_id: 'p-leche-mayorista',
          product_name: 'Leche Entera 1L',
          quantity: 3,
          price_cents: 400000,
          subtotal: 1200000,
          regular_price_cents: 450000,
          applied_wholesale_tier: { min_quantity: 3, unit_price_cents: 400000 },
          wholesale_savings_cents: 150000,
        },
      ],
      total: 1200000,
      payment_method: 'cash',
      date: new Date('2026-11-14T15:30:00Z'),
    };

    const thermal = generateSaleReceiptText(sampleSale, { nombre: 'Tienda La Esquina' }, { width: '58mm' });
    expect(thermal).toContain('Promo 3+ c/u');
    expect(thermal).toMatch(/Ahorro Mayorista/i);

    const whatsapp = generateSaleWhatsAppText(sampleSale, { nombre: 'Tienda La Esquina' });
    expect(whatsapp).toContain('Promo 3+');
    expect(whatsapp).toMatch(/Ahorro Mayorista/i);
  });
});
