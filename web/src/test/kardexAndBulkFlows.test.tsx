import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkWeightCalculatorModal } from '../components/ui/BulkWeightCalculatorModal';
import { ProductKardexModal } from '../components/ProductKardexModal';
import { CurrentUserProvider } from '../auth/CurrentUserContext';
import type { Product, User } from '../firebase/db';
import * as kardexService from '../services/kardexService';

const ADMIN_USER: User = {
  id: 'u-admin-1',
  email: 'admin@surtifacil.com',
  displayName: 'Admin SurtiFácil',
  role: 'admin',
  active: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const PAPA_PRODUCT: Product = {
  id: 'prod-papa-test',
  name: 'Papa Criolla a Granel',
  price_cents: 400000, // $4.000 / lb
  last_cost_cents: 260000,
  stock: 25,
  min_stock: 5,
  unit: 'libra',
  category: 'Frutas y Verduras',
  allow_fractional: true,
};

describe('BulkWeightCalculatorModal', () => {
  it('calcula peso exacto desde valor COP ("$3.000 de Papa Criolla") y confirma 0.75 lb', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <BulkWeightCalculatorModal
        open={true}
        onClose={onClose}
        product={PAPA_PRODUCT}
        onConfirm={onConfirm}
      />
    );

    // Cambiar a modo Por Valor (COP)
    fireEvent.click(screen.getByRole('tab', { name: /Por Valor \(COP\)/i }));
    fireEvent.click(screen.getByRole('button', { name: '$ 3.000' }));

    const submitBtn = screen.getByRole('button', { name: /Agregar 0\.75 lb/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    expect(onConfirm).toHaveBeenCalledWith(0.75);
  });

  it('selecciona preset de fracción por peso (1/2 lb = 0.5) y confirma', () => {
    const onConfirm = vi.fn();
    render(
      <BulkWeightCalculatorModal
        open={true}
        onClose={() => {}}
        product={PAPA_PRODUCT}
        kioskMode={true}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /½ lb/i }));
    fireEvent.click(screen.getByRole('button', { name: /Agregar 0\.5 lb/i }));
    expect(onConfirm).toHaveBeenCalledWith(0.5);
  });
});

describe('ProductKardexModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carga movimientos trazables y permite registrar ajuste manual auditable como admin', async () => {
    const getSpy = vi.spyOn(kardexService, 'getProductKardex').mockResolvedValue({
      product: PAPA_PRODUCT,
      summary: {
        total_in: 30,
        total_out: 5,
        net_change: 25,
        movements_count: 2,
      },
      entries: [
        {
          id: 'kdx-2',
          negocio_id: 'surtifacil',
          product_id: PAPA_PRODUCT.id,
          product_name: PAPA_PRODUCT.name,
          unit: 'libra',
          movement_type: 'sale',
          quantity_delta: -5,
          stock_before: 30,
          stock_after: 25,
          unit_cost_cents: 260000,
          unit_price_cents: 400000,
          total_value_cents: 2000000,
          reference_id: 'sale-99',
          notes: 'Venta mostrador',
          created_by_uid: 'u-admin-1',
          created_by_name: 'Admin SurtiFácil',
          created_at: '2026-11-26T14:00:00Z',
        },
        {
          id: 'kdx-1',
          negocio_id: 'surtifacil',
          product_id: PAPA_PRODUCT.id,
          product_name: PAPA_PRODUCT.name,
          unit: 'libra',
          movement_type: 'initial',
          quantity_delta: 30,
          stock_before: 0,
          stock_after: 30,
          unit_cost_cents: 260000,
          unit_price_cents: 400000,
          total_value_cents: 7800000,
          reference_id: null,
          notes: 'Inventario inicial',
          created_by_uid: 'u-admin-1',
          created_by_name: 'Admin SurtiFácil',
          created_at: '2026-11-26T09:00:00Z',
        },
      ],
    });

    const adjustSpy = vi.spyOn(kardexService, 'adjustProductStockKardex').mockResolvedValue({
      success: true,
      product: { ...PAPA_PRODUCT, stock: 27.5 },
      entry: {
        id: 'kdx-3',
        negocio_id: 'surtifacil',
        product_id: PAPA_PRODUCT.id,
        product_name: PAPA_PRODUCT.name,
        unit: 'libra',
        movement_type: 'adjustment',
        quantity_delta: 2.5,
        stock_before: 25,
        stock_after: 27.5,
        unit_cost_cents: 260000,
        unit_price_cents: 400000,
        total_value_cents: 650000,
        reference_id: null,
        notes: 'Conteo físico de bodega',
        created_by_uid: 'u-admin-1',
        created_by_name: 'Admin SurtiFácil',
        created_at: '2026-11-26T15:00:00Z',
      },
    });

    const onStockAdjusted = vi.fn();

    render(
      <CurrentUserProvider value={ADMIN_USER}>
        <ProductKardexModal
          isOpen={true}
          onClose={() => {}}
          product={PAPA_PRODUCT}
          onStockAdjusted={onStockAdjusted}
        />
      </CurrentUserProvider>
    );

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalled();
      expect(screen.getByText('Venta mostrador')).toBeInTheDocument();
      expect(screen.getByText('Inventario inicial')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Ajuste Manual de Stock/i }));
    fireEvent.change(screen.getByLabelText(/Cantidad/i), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conteo físico de bodega' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar Ajuste en Kardex/i }));

    await waitFor(() => {
      expect(adjustSpy).toHaveBeenCalledWith(
        PAPA_PRODUCT.id,
        {
          mode: 'add',
          quantity: 2.5,
          reason: 'Conteo físico de bodega',
        },
        expect.objectContaining({ id: PAPA_PRODUCT.id })
      );
      expect(onStockAdjusted).toHaveBeenCalled();
    });
  });
});
