import { describe, it, expect, vi } from 'vitest';
import {
  formatCOP,
  extractStoreDeliveryConfig,
  executeConsultarCatalogo,
  executeModificarCanasta,
  executeConfirmarPedido,
  executeConsultarEstadoOEscalar,
  processSarinCustomerMessage,
} from '../../functions/_lib/sarinCustomerOrchestrator';
import { checkAndConsumeAiQuota } from '../../functions/_lib/deepseekEngine';

describe('Sarin Customer Orchestrator & DeepSeek Engine', () => {
  it('formatea precios en Pesos Colombianos con el formato oficial', () => {
    expect(formatCOP(450000)).toBe('$ 4.500');
    expect(formatCOP(1250000)).toBe('$ 12.500');
    expect(formatCOP(0)).toBe('$ 0');
  });

  it('extrae la configuración de entregas del negocio desde config_json', () => {
    const config = extractStoreDeliveryConfig({
      costo_domicilio_cents: 350000,
      config_json: JSON.stringify({
        permite_domicilio: true,
        permite_retiro: false,
        slogan: 'El abasto del barrio',
      }),
    });

    expect(config.permite_domicilio).toBe(true);
    expect(config.permite_retiro).toBe(false);
    expect(config.costo_domicilio_cents).toBe(350000);
    expect(config.slogan).toBe('El abasto del barrio');
  });

  it('verifica y descuenta la cuota de IA atómicamente', async () => {
    let used = 10;
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => ({
            cuota_ia_total: 300,
            cuota_ia_usada: used,
            estado: 'activo',
          }),
          run: async () => {
            used++;
            return { success: true };
          },
        }),
      }),
    };

    const quota = await checkAndConsumeAiQuota(mockDb, 'surtifacil');
    expect(quota.allowed).toBe(true);
    expect(quota.used).toBe(11);
    expect(quota.remaining).toBe(289);

    // Cuando la cuota se agota
    used = 300;
    const exhausted = await checkAndConsumeAiQuota(mockDb, 'surtifacil');
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.remaining).toBe(0);
  });

  it('herramienta consultar_catalogo_abastos busca productos y combos en D1', async () => {
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          all: async () => {
            if (sql.includes('FROM products')) {
              return {
                results: [
                  {
                    id: 'p-1',
                    name: 'Leche Entera 1L',
                    price_cents: 350000,
                    stock: 15,
                    unit: 'litro',
                    category: 'Lácteos y Huevos',
                    en_oferta: 0,
                  },
                ],
              };
            }
            return { results: [] };
          },
        }),
      }),
    };

    const res = await executeConsultarCatalogo(mockDb, 'surtifacil', { query: 'leche' });
    expect(res.encontrados).toBe(1);
    expect(res.productos[0].name).toBe('Leche Entera 1L');
    expect(res.productos[0].price_display).toBe('$ 3.500');
  });

  it('herramienta modificar_canasta_pedido agrega productos validando stock', async () => {
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => ({
            id: 'p-1',
            name: 'Huevos AA x30',
            price_cents: 1800000,
            stock: 10,
            unit: 'cubeta',
          }),
        }),
      }),
    };

    const currentCart: any[] = [];
    const res = await executeModificarCanasta(mockDb, 'surtifacil', currentCart, {
      action: 'add',
      items: [{ name: 'Huevos AA', quantity: 2 }],
    });

    expect(res.canasta.length).toBe(1);
    expect(res.canasta[0].quantity).toBe(2);
    expect(res.subtotal_cents).toBe(3600000);
    expect(res.subtotal_display).toBe('$ 36.000');
  });

  it('herramienta confirmar_pedido_cliente respeta la selección de modalidad de entrega', async () => {
    let orderInserted: any = null;
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => ({ total: 5 }),
          run: async () => {
            if (sql.startsWith('INSERT INTO customer_orders')) {
              orderInserted = args;
            }
            return { success: true };
          },
        }),
      }),
    };

    const storeRow = {
      id: 'surtifacil',
      nombre: 'SurtiFácil Central',
      costo_domicilio_cents: 350000,
      config_json: JSON.stringify({ permite_domicilio: true, permite_retiro: true }),
    };

    const cart = [
      {
        productId: 'p-1',
        name: 'Arroz Diana',
        unit: 'libra',
        quantity: 2,
        priceCents: 200000,
        subtotalCents: 400000,
      },
    ];

    // 1. Si ambas modalidades están activas y el cliente no especifica, solicita selección
    const askRes = await executeConfirmarPedido(mockDb, 'surtifacil', storeRow, cart, {
      customer_name: 'Doña Gloria',
    });
    expect(askRes.requiere_seleccion_entrega).toBe(true);
    expect(askRes.mensaje).toContain('¿Prefieres que te lo llevemos 🛵 **A Domicilio**');

    // 2. Si elige Domicilio pero no da dirección, solicita dirección exacta
    const askAddressRes = await executeConfirmarPedido(mockDb, 'surtifacil', storeRow, cart, {
      customer_name: 'Doña Gloria',
      delivery_type: 'delivery',
    });
    expect(askAddressRes.requiere_direccion).toBe(true);

    // 3. Si confirma con dirección, crea la orden y suma costo de domicilio ($3.500 COP)
    const confirmRes = await executeConfirmarPedido(mockDb, 'surtifacil', storeRow, cart, {
      customer_name: 'Doña Gloria',
      delivery_type: 'delivery',
      delivery_address: 'Calle 45 # 32-10, Belén',
    });
    expect(confirmRes.exito).toBe(true);
    expect(confirmRes.orderCode).toBe('#W-06');
    expect(confirmRes.totalCents).toBe(750000); // 400000 + 350000
    expect(confirmRes.trackingUrl).toContain('#/pedido/');
    expect(orderInserted).not.toBeNull();
  });

  it('herramienta consultar_estado_o_escalar transfiere al tendero pausando el bot', async () => {
    let paused = false;
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          run: async () => {
            if (sql.includes("bot_active = 0")) paused = true;
            return { success: true };
          },
        }),
      }),
    };

    const res = await executeConsultarEstadoOEscalar(mockDb, 'surtifacil', 'conv-1', {
      escalar_a_humano: true,
    });

    expect(res.escalado).toBe(true);
    expect(paused).toBe(true);
    expect(res.mensaje).toContain('He notificado al tendero');
  });
});

