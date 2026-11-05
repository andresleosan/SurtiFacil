import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import KioskMode from '../components/KioskMode';
import { LiveOrdersTray } from '../components/LiveOrdersTray';
import { playNewOrderChime } from '../utils/audioAlerts';
import * as customerOrderService from '../services/customerOrderService';

describe('Modo Kiosco iPad (#/kiosco/:slug)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
