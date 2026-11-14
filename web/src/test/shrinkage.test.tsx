import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShrinkageModal } from '../components/ShrinkageModal';
import StockAlerts from '../components/StockAlerts';
import { Product } from '../firebase/db';
import { mockProducts, resetLocalSales } from '../services/mockData';
import * as saleService from '../services/saleService';
import {
  clearMockShrinkage,
  getShrinkageHistory,
  recordShrinkage,
  revertShrinkageEntry,
} from '../services/shrinkageService';

function daysFromTodayIso(deltaDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('Control de Mermas, Averías y Alertas de Vencimiento', () => {
  beforeEach(() => {
    clearMockShrinkage();
    resetLocalSales();
    vi.restoreAllMocks();
  });

  it('valida cantidad entera positiva, stock suficiente y revierte stock en modo mock', async () => {
    const first = mockProducts[0]; // Manzana Roja, stock 45, price_cents 250
    const initialStock = first.stock;

    await expect(
      recordShrinkage({ product_id: first.id, quantity: 0, reason: 'damaged' })
    ).rejects.toThrow(/entero mayor a 0/i);

    await expect(
      recordShrinkage({ product_id: first.id, quantity: initialStock + 5, reason: 'damaged' })
    ).rejects.toThrow(/Stock insuficiente/i);

    const created = await recordShrinkage({
      product_id: first.id,
      quantity: 3,
      reason: 'spoiled_fruver',
      notes: 'Fruta magullada al recibo',
    });

    expect(created.quantity).toBe(3);
    expect(created.updated_stock).toBe(initialStock - 3);
    expect(first.stock).toBe(initialStock - 3);
    expect(created.total_cost_loss_cents).toBe(3 * Math.round(first.price_cents * 0.7));

    const history = await getShrinkageHistory();
    expect(history).toHaveLength(1);

    await revertShrinkageEntry(created.id);
    expect(first.stock).toBe(initialStock);
    expect(await getShrinkageHistory()).toHaveLength(0);
  });

  it('renderiza ShrinkageModal, registra baja con cálculo de costo COP y revierte en 2 toques sin window.confirm', async () => {
    const user = userEvent.setup();
    const onShrinkageChanged = vi.fn();

    const perishableProducts: Product[] = [
      {
        id: 'p-leche-test',
        name: 'Leche Entera 1L',
        price_cents: 450000,
        last_cost_cents: 340000,
        stock: 10,
        min_stock: 4,
        unit: 'litro',
        category: 'Lácteos y Huevos',
        expiration_date: daysFromTodayIso(2),
      },
      {
        id: 'p-aguacate-test',
        name: 'Aguacate Hass Maduro',
        price_cents: 350000,
        last_cost_cents: 220000,
        stock: 6,
        min_stock: 2,
        unit: 'unidad',
        category: 'Frutas y Verduras',
        expiration_date: daysFromTodayIso(-1),
      },
    ];

    render(
      <ShrinkageModal
        isOpen={true}
        onClose={vi.fn()}
        products={perishableProducts}
        initialProductId="p-aguacate-test"
        onShrinkageChanged={onShrinkageChanged}
      />
    );

    const dialog = await screen.findByRole('dialog', {
      name: /Control de Mermas, Averías y Vencimientos/i,
    });
    expect(dialog).toBeInTheDocument();

    // Producto preseleccionado vencido debe activar motivo Producto Vencido
    expect(within(dialog).getByRole('button', { name: /Producto Vencido/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Cambiar cantidad a 2 usando botón rápido "2"
    await user.click(within(dialog).getByRole('button', { name: /^2$/ }));
    expect(within(dialog).getByText(/\$ 4\.400/)).toBeInTheDocument(); // 2 * $ 2.200 costo

    // Cambiar motivo a Daño Fruver y agregar observación
    await user.click(within(dialog).getByRole('button', { name: /Daño Fruver \/ Maduración/i }));
    await user.type(
      within(dialog).getByLabelText(/Observación \/ Detalle/i),
      'Aguacates sobremaduros en exhibidor'
    );

    await user.click(within(dialog).getByRole('button', { name: /Registrar Baja de Inventario/i }));

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        /Baja registrada: -2 unidad de Aguacate Hass Maduro/i
      );
    });
    expect(onShrinkageChanged).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText(/“Aguacates sobremaduros en exhibidor”/)).toBeInTheDocument();

    // Reversión en 2 toques
    await user.click(
      within(dialog).getByRole('button', { name: /Revertir merma de Aguacate Hass Maduro/i })
    );
    const confirmBtn = within(dialog).getByRole('button', { name: /Devolver \+2/i });
    expect(confirmBtn).toBeInTheDocument();
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent(/Merma revertida/i);
    });
    expect(onShrinkageChanged).toHaveBeenCalledTimes(2);
  });

  it('muestra alertas de vencimiento próximo en StockAlerts para Fruver y Lácteos', async () => {
    vi.spyOn(saleService, 'getProducts').mockResolvedValue([
      {
        id: 'p-1',
        name: 'Quesito Colanta 400g',
        price_cents: 980000,
        last_cost_cents: 760000,
        stock: 5,
        category: 'Lácteos y Huevos',
        unit: 'unidad',
        expiration_date: daysFromTodayIso(2),
      },
      {
        id: 'p-2',
        name: 'Arroz Diana',
        price_cents: 280000,
        stock: 40,
        category: 'Granos y Abarrotes',
      },
    ]);

    render(<StockAlerts />);

    await waitFor(() => {
      expect(screen.getByText(/Alertas de Vencimiento/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText('Quesito Colanta 400g').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/En riesgo: \$ 38\.000/i)).toBeInTheDocument();
  });
});
