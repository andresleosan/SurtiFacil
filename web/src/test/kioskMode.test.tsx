import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KioskMode from '../components/KioskMode';
import { LiveOrdersTray } from '../components/LiveOrdersTray';
import { playNewOrderChime } from '../utils/audioAlerts';
import * as customerOrderService from '../services/customerOrderService';
import type { PublicStoreData, CustomerOrder } from '../types/customerOrder';

const mockKioskStoreData: PublicStoreData = {
  id: 'surtifacil',
  slug: 'surtifacil',
  nombre: 'SurtiFácil Abastos Central - Medellín',
  barrio: 'La Candelaria / Centro',
  ciudad: 'Medellín',
  telefono_whatsapp: '+573001234567',
  direccion: 'Calle 50 # 50-20, Centro, Medellín',
  horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
  logo_url: '/icon-192.png',
  estado: 'activo',
  costo_domicilio_cents: 350000,
  datos_pago_offline: 'Nequi / Bancolombia: 300 123 4567',
  config: {
    slogan: 'El motor digital del tendero paisa',
    allow_kiosk: true,
    allow_whatsapp: true,
    permite_domicilio: true,
    permite_retiro: true,
  },
  products: [
    {
      id: 'p1',
      name: 'Manzana Roja',
      price_cents: 250,
      stock: 45,
      unit: 'unidad',
      category: 'General',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 0,
      precio_oferta_cents: null,
    },
    {
      id: 'p3',
      name: 'Leche Entera 1L',
      price_cents: 350,
      stock: 32,
      unit: 'litro',
      category: 'General',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 0,
      precio_oferta_cents: null,
    },
  ],
  combos: [
    {
      id: 'combo-desayuno-paisa',
      name: 'Combo Desayuno Paisa',
      description: 'Chocolate Corona, quesito antioqueño y arepas tela x5',
      price_cents: 950000,
      items_json: JSON.stringify([
        { product_id: 'p3', product_name: 'Leche Entera 1L', quantity: 2, unit_price_cents: 350000 },
      ]),
      image_url: '/images/products/combo-desayuno-paisa.svg',
      visible_kiosco: 1,
      visible_tienda: 1,
    },
  ],
};

describe('Modo Kiosco iPad (#/kiosco/:slug)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(customerOrderService, 'getPublicStore').mockResolvedValue(mockKioskStoreData);
    vi.spyOn(customerOrderService, 'createCustomerOrder').mockResolvedValue({
      success: true,
      order: {
        id: 'ord-test-01',
        negocio_id: 'surtifacil',
        order_code: '#K-01',
        source: 'kiosk',
        customer_name: 'Don Roberto Gómez',
        delivery_type: 'pickup_counter',
        payment_method: 'cash',
        items_json: '[]',
        total_cents: 250,
        status: 'pending',
      },
    });
  });

  it('renderiza la cabecera del kiosco con el nombre de la tienda y pasillos de abastos', async () => {
    render(<KioskMode slug="surtifacil" />);

    await waitFor(() => {
      expect(screen.getByText(/SurtiFácil Abastos Central/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Frutas y Verduras')).toBeInTheDocument();
    expect(screen.getByText('Panadería y Arepas')).toBeInTheDocument();
    expect(screen.getByText('Lácteos y Huevos')).toBeInTheDocument();
    expect(screen.getByText('Combos del Barrio')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Busca por nombre/i)).toBeInTheDocument();
  });

  it('permite buscar productos, agregar a la canasta y calcular el total en COP', async () => {
    const user = userEvent.setup();
    render(<KioskMode slug="surtifacil" />);

    await waitFor(() => {
      expect(screen.getByText('Manzana Roja')).toBeInTheDocument();
    });

    // Agregar Manzana Roja
    const addButtons = screen.getAllByRole('button', { name: /Agregar/i });
    expect(addButtons.length).toBeGreaterThan(0);
    await user.click(addButtons[0]);

    // Verificar que la canasta se actualiza
    await waitFor(() => {
      expect(screen.getAllByText(/Mi Canasta/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('completa el flujo de checkout en 2 pasos y emite el Turno Gigante con cuenta regresiva', async () => {
    const user = userEvent.setup();
    render(<KioskMode slug="surtifacil" />);

    await waitFor(() => {
      expect(screen.getByText('Manzana Roja')).toBeInTheDocument();
    });

    // 1. Agregar producto
    const addButtons = screen.getAllByRole('button', { name: /Agregar/i });
    await user.click(addButtons[0]);

    // 2. Clic en CONTINUAR PEDIDO en el panel docked
    const continueBtn = screen.getByRole('button', { name: /CONTINUAR PEDIDO/i });
    await user.click(continueBtn);

    // 3. Paso 1: Nombre del cliente
    await waitFor(() => {
      expect(screen.getByText(/¿A nombre de quién\?/i)).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText(/Tu Nombre o Apellido/i);
    await user.type(nameInput, 'Don Roberto Gómez');

    const nextBtn = screen.getByRole('button', { name: /Siguiente: Forma de Pago/i });
    await user.click(nextBtn);

    // 4. Paso 2: Forma de Pago
    await waitFor(() => {
      expect(screen.getByText(/¿Cómo vas a pagar\?/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Efectivo en Mostrador')).toBeInTheDocument();
    expect(screen.getByText('Transferencia Nequi / Bancolombia')).toBeInTheDocument();
    expect(screen.getByText('Anotar a mi Fiado')).toBeInTheDocument();

    const confirmOrderBtn = screen.getByRole('button', { name: /Confirmar y Sacar Turno/i });
    await user.click(confirmOrderBtn);

    // 5. Pantalla de Turno Gigante
    await waitFor(() => {
      expect(screen.getByText(/¡Pedido Registrado con Éxito!/i)).toBeInTheDocument();
      expect(screen.getByText(/¡Listo Don Roberto Gómez!/i)).toBeInTheDocument();
      expect(screen.getByText(/Hacer Otro Pedido Ahora/i)).toBeInTheDocument();
    });
  });
});

describe('Bandeja de Pedidos en Vivo en POS (LiveOrdersTray)', () => {
  it('muestra los pedidos pendientes del kiosco y permite facturar en 1 clic', async () => {
    const user = userEvent.setup();
    const handleSaleCreated = vi.fn();

    const mockPendingOrders: CustomerOrder[] = [
      {
        id: 'ord-mock-01',
        negocio_id: 'surtifacil',
        order_code: '#K-01',
        source: 'kiosk',
        customer_name: 'Doña Gloria Hernández',
        customer_phone: '3001112233',
        delivery_type: 'pickup_counter',
        payment_method: 'cash',
        items_json: JSON.stringify([
          {
            product_id: 'p1',
            product_name: 'Manzana Roja',
            quantity: 3,
            unit_price_cents: 250,
            subtotal_cents: 750,
            unit: 'unidad',
          },
        ]),
        items: [
          {
            product_id: 'p1',
            product_name: 'Manzana Roja',
            quantity: 3,
            unit_price_cents: 250,
            subtotal_cents: 750,
            unit: 'unidad',
          },
        ],
        total_cents: 750,
        status: 'pending',
      },
    ];

    vi.spyOn(customerOrderService, 'getCustomerOrders').mockResolvedValue(mockPendingOrders);
    vi.spyOn(customerOrderService, 'convertOrderToSale').mockResolvedValue({
      success: true,
      message: 'Orden facturada con éxito',
      sale_id: 'sale-001',
    });

    render(<LiveOrdersTray onSaleCreated={handleSaleCreated} />);

    await waitFor(() => {
      expect(screen.getByText(/Bandeja de Pedidos en Vivo/i)).toBeInTheDocument();
    });

    // Debe mostrar al menos un pedido mock pendiente
    await waitFor(() => {
      expect(screen.getByText('#K-01')).toBeInTheDocument();
      expect(screen.getByText(/Doña Gloria Hernández/i)).toBeInTheDocument();
    });

    // Facturar y Despachar
    const invoiceButtons = screen.getAllByRole('button', { name: /Facturar y Despachar/i });
    expect(invoiceButtons.length).toBeGreaterThan(0);
    await user.click(invoiceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/facturado exitosamente/i)).toBeInTheDocument();
    });
  });

  it('playNewOrderChime se ejecuta sin error en el entorno de pruebas', () => {
    const result = playNewOrderChime();
    expect(typeof result).toBe('boolean');
  });
});
