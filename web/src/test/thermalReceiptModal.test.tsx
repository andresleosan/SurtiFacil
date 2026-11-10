import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThermalReceiptModal } from '../components/ThermalReceiptModal';
import { Sale } from '../firebase/db';
import { CreditPaymentReceipt } from '../utils/receiptGenerator';

vi.mock('../services/settingsService', () => ({
  getStoreSettings: vi.fn().mockResolvedValue({
    nombre: 'SurtiFácil Abastos San Javier',
    barrio: 'San Javier',
    ciudad: 'Medellín',
    slug: 'sanjavier',
    telefono_whatsapp: '+573001234567',
  }),
}));

describe('ThermalReceiptModal', () => {
  const mockSale: Sale = {
    id: 'sale-987654321',
    date: new Date('2026-11-09T12:00:00Z'),
    total: 850000, // $ 8.500 COP
    total_cost_cents: 600000,
    payment_method: 'cash',
    received_cash_cents: 1000000,
    change_cents: 150000,
    created_by_role: 'cashier',
    items: [
      {
        product_id: 'p-1',
        product_name: 'Leche Colanta 1L',
        quantity: 2,
        price_cents: 425000,
        subtotal: 850000,
      },
    ],
  };

  const mockCreditPayment: CreditPaymentReceipt = {
    id: 'pay-55443322',
    receipt_number: 'pay-55443322',
    customer_name: 'Doña Gloria Inés',
    customer_phone: '3123456789',
    amount_cents: 1500000, // $ 15.000 COP
    balance_before_cents: 4000000,
    balance_after_cents: 2500000,
    payment_method: 'cash',
    date: new Date('2026-11-09T15:30:00Z'),
    description: 'Abono fiado fin de semana',
    received_by_name: 'Cajero Andrés',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no renderiza nada cuando isOpen es false', () => {
    const { container } = render(
      <ThermalReceiptModal isOpen={false} onClose={vi.fn()} sale={mockSale} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza la tirilla térmica de venta con QR vecinal y leyenda DIAN Art. 616-1', async () => {
    render(<ThermalReceiptModal isOpen={true} onClose={vi.fn()} sale={mockSale} />);

    await waitFor(() => {
      expect(screen.getByText(/Tirilla de Venta #sale-987/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/SURTIFÁCIL ABASTOS SAN JAVIER/i)).toBeInTheDocument();
    expect(screen.getByText(/Leche Colanta 1L/i)).toBeInTheDocument();
    expect(screen.getByText(/NO RESPONSABLE DE IVA/i)).toBeInTheDocument();
    expect(screen.getByText(/ART\. 616-1/i)).toBeInTheDocument();

    // Verifica que el SVG del QR vecinal esté presente
    const qrSvg = screen.getByLabelText(/Código QR de verificación vecinal y pedidos/i);
    expect(qrSvg).toBeInTheDocument();
    expect(screen.getByText(/\[ Escanea para pedir o verificar \]/i)).toBeInTheDocument();
  });

  it('permite alternar entre anchos de 58mm y 80mm', async () => {
    render(<ThermalReceiptModal isOpen={true} onClose={vi.fn()} sale={mockSale} />);

    await waitFor(() => {
      expect(screen.getByText(/58mm \(Estándar\)/i)).toBeInTheDocument();
    });

    const btn80mm = screen.getByRole('button', { name: /80mm \(Ancho\)/i });
    fireEvent.click(btn80mm);

    expect(screen.getByText(/Vista previa térmica \(80mm\)/i)).toBeInTheDocument();
  });

  it('permite alternar la visualización del código QR', async () => {
    render(<ThermalReceiptModal isOpen={true} onClose={vi.fn()} sale={mockSale} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Alternar código QR en la tirilla/i })).toBeInTheDocument();
    });

    const toggleQRBtn = screen.getByRole('button', { name: /Alternar código QR en la tirilla/i });
    expect(toggleQRBtn).toHaveTextContent('📷 Con QR');

    // Ocultar QR
    fireEvent.click(toggleQRBtn);
    expect(toggleQRBtn).toHaveTextContent('Sin QR');
    expect(screen.queryByLabelText(/Código QR de verificación vecinal y pedidos/i)).not.toBeInTheDocument();

    // Reactivar QR
    fireEvent.click(toggleQRBtn);
    expect(toggleQRBtn).toHaveTextContent('📷 Con QR');
    expect(screen.getByLabelText(/Código QR de verificación vecinal y pedidos/i)).toBeInTheDocument();
  });

  it('renderiza el comprobante de abono de fiados para el cliente con desglose contable', async () => {
    render(
      <ThermalReceiptModal
        isOpen={true}
        onClose={vi.fn()}
        creditPayment={mockCreditPayment}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Comprobante de Abono #pay-5544/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/COMPROBANTE DE ABONO A FIADOS/i)).toBeInTheDocument();
    expect(screen.getByText(/Doña Gloria Inés/i)).toBeInTheDocument();
    expect(screen.getByText(/VALOR ABONADO:/i)).toBeInTheDocument();
    expect(screen.getByText(/NUEVO SALDO DEUDOR:/i)).toBeInTheDocument();
  });

  it('abre la ventana de impresión nativa al hacer clic en Imprimir', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ThermalReceiptModal isOpen={true} onClose={vi.fn()} sale={mockSale} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Imprimir/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Imprimir/i }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
