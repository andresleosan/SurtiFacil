import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PublicStorefront from '../components/PublicStorefront';
import OrderTracking from '../components/OrderTracking';
import StoreQRCard from '../components/StoreQRCard';
import * as customerOrderService from '../services/customerOrderService';
import type { PublicStoreData } from '../types/customerOrder';

const mockStoreData: PublicStoreData = {
  id: 'surtifacil',
  slug: 'surtifacil',
  nombre: 'SurtiFácil Abastos Central',
  barrio: 'La Candelaria / Centro',
  ciudad: 'Medellín',
  telefono_whatsapp: '+573001234567',
  direccion: 'Calle 50 # 50-20, Medellín',
  horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
  estado: 'activo',
  costo_domicilio_cents: 350000, // $ 3.500 COP
  datos_pago_offline: 'Nequi: 300 123 4567',
  config: {
    slogan: 'El motor digital del tendero paisa',
    permite_domicilio: true,
    permite_retiro: true,
  },
  products: [
    {
      id: 'p1',
      name: 'Arroz Diana 1kg',
      price_cents: 480000,
      stock: 30,
      unit: 'kilo',
      category: 'Granos y Despensa',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 0,
      precio_oferta_cents: null,
    },
    {
      id: 'p2',
      name: 'Plátano Maduro',
      price_cents: 120000,
      stock: 50,
      unit: 'libra',
      category: 'Frutas y Verduras',
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: 1,
      precio_oferta_cents: 99000, // En oferta $ 990
    },
  ],
  combos: [
    {
      id: 'combo-1',
      name: 'Mercado Básico Familiar',
      description: 'Arroz, aceite y granos',
      price_cents: 2500000,
      items_json: JSON.stringify([{ product_name: 'Arroz 1kg', quantity: 2 }]),
      visible_kiosco: 1,
      visible_tienda: 1,
    },
  ],
};

describe('Catálogo Web Vecinal (PublicStorefront.tsx)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(customerOrderService, 'getPublicStore').mockResolvedValue(mockStoreData);
  });

  it('renderiza la cabecera del local, pasillos y productos disponibles', async () => {
    render(<PublicStorefront slug="surtifacil" />);

    expect(screen.getByText(/Cargando la tienda de tu barrio/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SurtiFácil Abastos Central')).toBeInTheDocument();
    });

    expect(screen.getByText(/La Candelaria \/ Centro/i)).toBeInTheDocument();
    expect(screen.getByText(/Domicilios en el barrio:/i)).toBeInTheDocument();
    expect(screen.getByText(/Arroz Diana 1kg/i)).toBeInTheDocument();
    expect(screen.getByText(/Plátano Maduro/i)).toBeInTheDocument();
    expect(screen.getByText(/Mercado Básico Familiar/i)).toBeInTheDocument();
  });

  it('permite filtrar productos por pasillo o buscador', async () => {
    render(<PublicStorefront slug="surtifacil" />);

    await waitFor(() => {
      expect(screen.getByText('SurtiFácil Abastos Central')).toBeInTheDocument();
    });

    // Filtrar por texto en el input de búsqueda
    const searchInput = screen.getByLabelText(/Buscar productos en la tienda vecinal/i);
    fireEvent.change(searchInput, { target: { value: 'Arroz' } });

    expect(screen.getByText(/Arroz Diana 1kg/i)).toBeInTheDocument();
    expect(screen.queryByText(/Plátano Maduro/i)).not.toBeInTheDocument();
  });

  it('agrega productos a la canasta, abre el drawer de checkout y confirma el pedido', async () => {
    const mockCreatedOrder = {
      id: 'ord-123',
      negocio_id: 'surtifacil',
      order_code: '#W-01',
      source: 'web' as const,
      customer_name: 'Doña Martha González',
      delivery_type: 'delivery' as const,
      payment_method: 'cash' as const,
      items_json: '[]',
      total_cents: 480000 + 350000,
      status: 'pending' as const,
      tracking_token: 'tk_test_12345',
    };

    const createOrderSpy = vi
      .spyOn(customerOrderService, 'createCustomerOrder')
      .mockResolvedValue({ success: true, order: mockCreatedOrder });

    render(<PublicStorefront slug="surtifacil" />);

    await waitFor(() => {
      expect(screen.getByText('SurtiFácil Abastos Central')).toBeInTheDocument();
    });

    // Agregar Arroz Diana a la canasta
    const addButtons = screen.getAllByRole('button', { name: /Agregar .* a la canasta/i });
    fireEvent.click(addButtons[0]);

    // Debe aparecer la barra flotante de canasta
    const cartButton = await screen.findByRole('button', { name: /Abrir canasta y confirmar pedido/i });
    expect(cartButton).toBeInTheDocument();
    fireEvent.click(cartButton);

    // En el drawer de checkout: llenar nombre y dirección
    const nameInput = screen.getByLabelText(/Tu Nombre y Apellido \*/i);
    fireEvent.change(nameInput, { target: { value: 'Doña Martha González' } });

    const addressInput = screen.getByLabelText(/Dirección de Entrega \*/i);
    fireEvent.change(addressInput, { target: { value: 'Calle 50 # 50-20 Apto 301' } });

    // Confirmar pedido
    const submitBtn = screen.getByRole('button', { name: /Confirmar Pedido Vecinal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createOrderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_name: 'Doña Martha González',
          delivery_type: 'delivery',
          source: 'web',
        })
      );
    });
  });
});

describe('Rastreo de Pedido en Vivo (OrderTracking.tsx)', () => {
  it('muestra la barra de progreso de 4 etapas y el resumen del pedido', async () => {
    vi.spyOn(customerOrderService, 'trackCustomerOrder').mockResolvedValue({
      order: {
        id: 'ord-123',
        negocio_id: 'surtifacil',
        order_code: '#W-01',
        source: 'web',
        customer_name: 'Carlos Montoya',
        customer_phone: '3124567890',
        delivery_type: 'delivery',
        delivery_address: 'Carrera 70 # 45-12',
        delivery_neighborhood: 'Laureles',
        payment_method: 'cash',
        items_json: JSON.stringify([
          {
            product_id: 'p1',
            product_name: 'Arroz Diana 1kg',
            quantity: 2,
            unit_price_cents: 480000,
            subtotal_cents: 960000,
          },
        ]),
        total_cents: 960000 + 350000,
        status: 'preparing',
        tracking_token: 'tk_test_123',
      },
      store: {
        nombre: 'SurtiFácil Abastos Central',
        barrio: 'Laureles, Medellín',
        telefono_whatsapp: '+573001234567',
      },
    });

    render(<OrderTracking token="tk_test_123" />);

    expect(screen.getByText(/Consultando tu pedido en vivo/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('#W-01')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Alistando' })).toBeInTheDocument();
    expect(screen.getByText(/El tendero está empacando tus productos/i)).toBeInTheDocument();
    expect(screen.getByText(/Carrera 70 # 45-12/i)).toBeInTheDocument();
    expect(screen.getByText('Arroz Diana 1kg')).toBeInTheDocument();
  });
});

describe('Componente de Afiches y Códigos QR (StoreQRCard.tsx)', () => {
  it('permite alternar entre afiche de Tienda Vecinal y Modo Kiosco', () => {
    render(
      <StoreQRCard
        storeSlug="don-pedro"
        storeName="Tienda Don Pedro"
        neighborhood="Belén, Medellín"
      />
    );

    expect(screen.getByText('Afiches y Códigos QR para el Mostrador')).toBeInTheDocument();
    expect(screen.getByText(/Tienda Vecinal Web/i)).toBeInTheDocument();
    expect(screen.getByText(/Kiosco de Autoatención/i)).toBeInTheDocument();

    // Alternar pestaña a Modo Kiosco
    const kioskTab = screen.getByRole('tab', { name: /Kiosco de Autoatención/i });
    fireEvent.click(kioskTab);

    expect(kioskTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Turno de Autoatención Kiosco/i)).toBeInTheDocument();
  });

  it('ofrece botones para copiar enlace, descargar e imprimir afiche', () => {
    render(
      <StoreQRCard
        storeSlug="don-pedro"
        storeName="Tienda Don Pedro"
      />
    );

    expect(screen.getByRole('button', { name: /Copiar enlace al portapapeles/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descargar Afiche en PNG/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Imprimir Afiche/i })).toBeInTheDocument();
  });
});
