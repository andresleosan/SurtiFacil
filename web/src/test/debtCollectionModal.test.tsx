import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DebtCollectionModal } from '../components/DebtCollectionModal';
import { CreditCustomer, CreditEntry } from '../firebase/db';

describe('DebtCollectionModal', () => {
  const mockCustomer: CreditCustomer = {
    id: 'cust-1',
    name: 'Doña Marta Gómez',
    phone: '3129876543',
    balance_cents: 3200000, // $ 32.000 COP
    active: true,
  };

  const mockEntries: CreditEntry[] = [
    {
      id: 'e-1',
      customer_id: 'cust-1',
      type: 'debt',
      amount_cents: 3200000,
      description: 'Víveres de la semana',
      created_by_uid: 'cashier-1',
      createdAt: new Date(),
    },
  ];

  const mockStore = {
    nombre: 'SurtiFácil Belén',
    datos_pago_offline: 'Nequi 312 987 6543 / Bancolombia 456-789012',
  };

  it('renderiza la información del cliente, saldo en COP y vista previa en vivo', () => {
    render(
      <DebtCollectionModal
        open={true}
        customer={mockCustomer}
        entries={mockEntries}
        storeSettings={mockStore}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Doña Marta Gómez')).toBeInTheDocument();
    expect(screen.getByText('Teléfono: 3129876543')).toBeInTheDocument();
    expect(screen.getByText('$ 32.000')).toBeInTheDocument();
    expect(screen.getByText(/SurtiFácil Belén/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir en WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar Mensaje/i })).toBeInTheDocument();
  });

  it('permite cambiar el tono a corte de quincena y actualiza la vista previa', async () => {
    const user = userEvent.setup();
    render(
      <DebtCollectionModal
        open={true}
        customer={mockCustomer}
        entries={mockEntries}
        storeSettings={mockStore}
        onClose={vi.fn()}
      />
    );

    const quincenaButton = screen.getByRole('radio', { name: /Corte Quincena/i });
    await user.click(quincenaButton);

    expect(screen.getByText(/Se acerca el corte de quincena/i)).toBeInTheDocument();
  });

  it('abre la URL de WhatsApp al hacer clic en Abrir en WhatsApp', async () => {
    const user = userEvent.setup();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <DebtCollectionModal
        open={true}
        customer={mockCustomer}
        entries={mockEntries}
        storeSettings={mockStore}
        onClose={vi.fn()}
      />
    );

    const whatsappBtn = screen.getByRole('button', { name: /Abrir en WhatsApp/i });
    await user.click(whatsappBtn);

    expect(windowOpenSpy).toHaveBeenCalled();
    const calledUrl = windowOpenSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://wa.me/573129876543?text=');

    windowOpenSpy.mockRestore();
  });
});
