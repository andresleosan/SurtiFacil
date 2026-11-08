import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, setActiveNegocioId } from '../services/apiClient';
import {
  cacheCreditCustomersForTenant,
  cacheProductsForTenant,
  clearOfflineStateForTests,
  enqueueOfflineCreditEntry,
  enqueueOfflineSale,
  getCachedCreditCustomersForTenant,
  getCachedProductsForTenant,
  getOfflineQueueForTenant,
  isOfflineModeActive,
  setSimulatedOfflineMode,
  syncPendingQueue,
} from '../services/offlineSyncService';
import { OfflineQueueModal, OfflineSyncBanner } from '../components/OfflineSyncBanner';

describe('offlineSyncService & Multi-Tenant Offline Resilience', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_USE_MOCK_DATA', 'false');
    setActiveNegocioId('surtifacil');
    await clearOfflineStateForTests();
  });

  afterEach(async () => {
    await clearOfflineStateForTests();
    setActiveNegocioId(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('aísla estrictamente el caché de productos y clientes de fiado por negocio_id', async () => {
    await cacheProductsForTenant(
      [
        { id: 'p-laureles-1', name: 'Aguacate Hass Laureles', price_cents: 450000, stock: 12 },
        { id: 'p-laureles-2', name: 'Leche Colanta 1L', price_cents: 420000, stock: 20 },
      ],
      'abastos-laureles',
    );

    await cacheProductsForTenant(
      [{ id: 'p-belen-1', name: 'Arepa Paisa Belén', price_cents: 250000, stock: 30 }],
      'tienda-belen',
    );

    await cacheCreditCustomersForTenant(
      [{ id: 'c-laureles-1', name: 'Doña Marta Laureles', balance_cents: 1500000, active: true }],
      'abastos-laureles',
    );

    await cacheCreditCustomersForTenant(
      [{ id: 'c-belen-1', name: 'Don Carlos Belén', balance_cents: 800000, active: true }],
      'tienda-belen',
    );

    const laurelesProds = await getCachedProductsForTenant('abastos-laureles');
    const belenProds = await getCachedProductsForTenant('tienda-belen');
    expect(laurelesProds.map((p) => p.id)).toEqual(['p-laureles-1', 'p-laureles-2']);
    expect(belenProds.map((p) => p.id)).toEqual(['p-belen-1']);

    const laurelesCusts = await getCachedCreditCustomersForTenant('abastos-laureles');
    const belenCusts = await getCachedCreditCustomersForTenant('tienda-belen');
    expect(laurelesCusts.map((c) => c.name)).toEqual(['Doña Marta Laureles']);
    expect(belenCusts.map((c) => c.name)).toEqual(['Don Carlos Belén']);
  });

  it('encola ventas y abonos en orden FIFO, descuenta stock local y protege contra sobre-abonos', async () => {
    setSimulatedOfflineMode(true);
    expect(isOfflineModeActive()).toBe(true);

    await cacheProductsForTenant(
      [{ id: 'prod-1', name: 'Arroz Diana 1kg', price_cents: 480000, stock: 5 }],
      'surtifacil',
    );
    await cacheCreditCustomersForTenant(
      [{ id: 'cust-1', name: 'Vecino Don Jorge', balance_cents: 1000000, active: true }],
      'surtifacil',
    );

    // 1. Encolar venta fiada de 2 unidades ($9.600 COP = 960.000 cents)
    const saleItem = await enqueueOfflineSale(
      [
        {
          product_id: 'prod-1',
          product_name: 'Arroz Diana 1kg',
          quantity: 2,
          price_cents: 480000,
          subtotal: 960000,
        },
      ],
      'credit',
      'cust-1',
      'surtifacil',
    );

    expect(saleItem.type).toBe('sale');
    expect(saleItem.status).toBe('pending');

    // Verificar descuento inmediato de stock en caché local (5 - 2 = 3)
    const cachedAfterSale = await getCachedProductsForTenant('surtifacil');
    expect(cachedAfterSale[0].stock).toBe(3);

    // Verificar incremento de saldo en caché local ($10.000 + $9.600 = $19.600)
    const custAfterSale = await getCachedCreditCustomersForTenant('surtifacil');
    expect(custAfterSale[0].balance_cents).toBe(1960000);

    // 2. Intentar abonar más de la deuda pendiente debe fallar incluso en modo offline
    await expect(
      enqueueOfflineCreditEntry(
        'cust-1',
        { type: 'payment', amount_cents: 3000000, description: 'Abono excesivo' },
        { uid: 'cashier-1', role: 'cashier' },
        'surtifacil',
      ),
    ).rejects.toThrow('El abono supera la deuda pendiente');

    // 3. Registrar abono válido de $5.000 COP (500.000 cents)
    const creditItem = await enqueueOfflineCreditEntry(
      'cust-1',
      { type: 'payment', amount_cents: 500000, description: 'Abono en efectivo mostrador' },
      { uid: 'cashier-1', role: 'cashier' },
      'surtifacil',
    );

    expect(creditItem.sequence).toBeGreaterThan(saleItem.sequence);

    const queue = await getOfflineQueueForTenant('surtifacil');
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe(saleItem.id);
    expect(queue[1].id).toBe(creditItem.id);

    // 4. Sincronizar en orden FIFO al reconectar
    const postCalls: Array<{ endpoint: string; body: unknown; headers?: unknown }> = [];
    vi.spyOn(apiClient, 'post').mockImplementation(async (endpoint, body, options) => {
      postCalls.push({ endpoint, body, headers: options?.headers });
      return { id: `synced-${postCalls.length}` } as any;
    });

    setSimulatedOfflineMode(false);
    await waitFor(async () => {
      const remaining = await getOfflineQueueForTenant('surtifacil');
      expect(remaining).toHaveLength(0);
    });

    expect(postCalls).toHaveLength(2);
    expect(postCalls[0].endpoint).toBe('/sales');
    expect(postCalls[0].body).toEqual({
      items: [{ product_id: 'prod-1', quantity: 2 }],
      payment_method: 'credit',
      credit_customer_id: 'cust-1',
    });
    expect(postCalls[1].endpoint).toBe('/credits/entries');
    expect(postCalls[1].body).toEqual({
      customer_id: 'cust-1',
      type: 'payment',
      amount_cents: 500000,
      description: 'Abono en efectivo mostrador',
    });
  });

  it('muestra el banner interactivo en modo offline y permite inspeccionar y sincronizar desde el modal', async () => {
    const user = userEvent.setup();
    setSimulatedOfflineMode(true);

    await cacheProductsForTenant(
      [{ id: 'p-1', name: 'Pan Aliñado', price_cents: 100000, stock: 10 }],
      'surtifacil',
    );

    await enqueueOfflineSale(
      [
        {
          product_id: 'p-1',
          product_name: 'Pan Aliñado',
          quantity: 3,
          price_cents: 100000,
          subtotal: 300000,
        },
      ],
      'cash',
      undefined,
      'surtifacil',
    );

    let modalOpen = false;
    const { rerender } = render(
      <>
        <OfflineSyncBanner
          onOpenModal={() => {
            modalOpen = true;
          }}
        />
        <OfflineQueueModal isOpen={true} onClose={() => {}} />
      </>,
    );

    expect(
      await screen.findByText(/Modo Offline Resiliente Activo/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 en cola FIFO/i)).toBeInTheDocument();

    // Verificar contenido del modal de inspección de cola
    const dialog = screen.getByRole('dialog', {
      name: /Resiliencia Offline y Cola FIFO Multi-Tenant/i,
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/3x Pan Aliñado/i)).toBeInTheDocument();

    vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'sale-server-1' } as any);

    const syncBtn = screen.getByRole('button', { name: /Sincronizar Cola Ahora/i });
    await user.click(syncBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Cola FIFO vacía — Todo está sincronizado/i),
      ).toBeInTheDocument();
    });

    rerender(<OfflineQueueModal isOpen={modalOpen} onClose={() => {}} />);
    expect(syncPendingQueue).toBeDefined();
  });
});
