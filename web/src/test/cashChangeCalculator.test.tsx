import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CashChangeCalculator from '../components/CashChangeCalculator';

describe('CashChangeCalculator', () => {
  it('renders quick COP denomination buttons with accessible touch targets', () => {
    const onReceivedCashChange = vi.fn();
    render(
      <CashChangeCalculator
        totalCents={1850000} // $ 18.500 COP
        receivedCashCents={null}
        onReceivedCashChange={onReceivedCashChange}
        formatPrice={(cents) => `$${(cents / 100).toLocaleString('es-CO')}`}
      />
    );

    expect(screen.getByRole('region', { name: 'Calculadora de efectivo y vueltas COP' })).toBeInTheDocument();

    // Botones requeridos por Tarea 20: [Exacto], [$10.000], [$20.000], [$50.000], [$100.000]
    expect(screen.getByRole('button', { name: /Pago exacto de/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paga con billete de \$ 10\.000/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paga con billete de \$ 20\.000/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paga con billete de \$ 50\.000/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paga con billete de \$ 100\.000/ })).toBeInTheDocument();

    // Touch targets >= 44px
    const exactButton = screen.getByRole('button', { name: /Pago exacto de/ });
    expect(exactButton.className).toContain('min-h-[44px]');
  });

  it('triggers onReceivedCashChange with total when clicking Exacto', async () => {
    const user = userEvent.setup();
    const onReceivedCashChange = vi.fn();
    render(
      <CashChangeCalculator
        totalCents={350000} // $ 3.500 COP
        receivedCashCents={null}
        onReceivedCashChange={onReceivedCashChange}
      />
    );

    const exactBtn = screen.getByRole('button', { name: /Pago exacto de/ });
    await user.click(exactBtn);

    expect(onReceivedCashChange).toHaveBeenCalledWith(350000);
  });

  it('triggers onReceivedCashChange with bill value when clicking a Colombian bill button', async () => {
    const user = userEvent.setup();
    const onReceivedCashChange = vi.fn();
    render(
      <CashChangeCalculator
        totalCents={1850000}
        receivedCashCents={null}
        onReceivedCashChange={onReceivedCashChange}
      />
    );

    const bill50k = screen.getByRole('button', { name: /Paga con billete de \$ 50\.000/ });
    await user.click(bill50k);

    // $50.000 COP en centavos es 5000000
    expect(onReceivedCashChange).toHaveBeenCalledWith(5000000);
  });

  it('displays Vueltas a Entregar in green giant text when cash is sufficient', () => {
    const onReceivedCashChange = vi.fn();
    render(
      <CashChangeCalculator
        totalCents={1850000} // $ 18.500 COP
        receivedCashCents={5000000} // $ 50.000 COP
        onReceivedCashChange={onReceivedCashChange}
        formatPrice={(c) => `$ ${(c / 100).toLocaleString('es-CO')}`}
      />
    );

    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveTextContent('Vueltas a Entregar');
    // Vueltas = $50.000 - $18.500 = $31.500
    expect(statusRegion).toHaveTextContent('$ 31.500');
    expect(statusRegion.querySelector('.text-emerald-600')).toBeInTheDocument();
  });

  it('displays Dinero Insuficiente in red alert when cash is less than total', () => {
    const onReceivedCashChange = vi.fn();
    render(
      <CashChangeCalculator
        totalCents={5000000} // $ 50.000 COP
        receivedCashCents={2000000} // $ 20.000 COP
        onReceivedCashChange={onReceivedCashChange}
        formatPrice={(c) => `$ ${(c / 100).toLocaleString('es-CO')}`}
      />
    );

    const alertRegion = screen.getByRole('alert');
    expect(alertRegion).toHaveTextContent('Dinero Insuficiente');
    // Faltan = $50.000 - $20.000 = $30.000
    expect(alertRegion).toHaveTextContent('Faltan $ 30.000');
    expect(alertRegion.querySelector('.text-rose-600')).toBeInTheDocument();
  });

  it('allows manual input and clearing of received cash', async () => {
    const user = userEvent.setup();
    const onReceivedCashChange = vi.fn();
    const { rerender } = render(
      <CashChangeCalculator
        totalCents={1000000}
        receivedCashCents={null}
        onReceivedCashChange={onReceivedCashChange}
      />
    );

    const input = screen.getByLabelText('Efectivo recibido en pesos');
    await user.type(input, '20000');

    // Debe llamar con centavos convertidos
    expect(onReceivedCashChange).toHaveBeenCalled();

    // Rerender con valor recibido
    rerender(
      <CashChangeCalculator
        totalCents={1000000}
        receivedCashCents={2000000}
        onReceivedCashChange={onReceivedCashChange}
      />
    );

    const clearBtn = screen.getByRole('button', { name: 'Limpiar efectivo recibido' });
    await user.click(clearBtn);
    expect(onReceivedCashChange).toHaveBeenCalledWith(null);
  });
});
