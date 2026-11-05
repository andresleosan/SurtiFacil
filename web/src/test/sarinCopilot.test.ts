import { describe, it, expect } from 'vitest';
import {
  executeConsultarVentas,
  executeConsultarDeudores,
  executeConsultarStockCritico,
  executeSugerirOrdenCompra,
  processSarinCopilotMessage,
  formatCOP,
} from '../../functions/_lib/sarinCopilotOrchestrator';

// Mock simple de D1Database en memoria
function createMockD1Database(data: {
  sales?: any[];
  credit_customers?: any[];
  products?: any[];
  suppliers?: any[];
  negocios?: any[];
}) {
  const sales = data.sales || [];
  const creditCustomers = data.credit_customers || [];
  const products = data.products || [];
  const suppliers = data.suppliers || [];
  const negocios = data.negocios || [
    {
      id: 'surtifacil',
      estado: 'activo',
      cuota_ia_total: 300,
      cuota_ia_usada: 10,
    },
  ];

  return {
    prepare: (query: string) => {
      let boundParams: any[] = [];
      const stmt = {
        bind: (...params: any[]) => {
          boundParams = params;
          return stmt;
        },
        first: async <T = any>() => {
          // Cuota IA
          if (query.includes('FROM negocios')) {
            const row = negocios.find((n) => n.id === boundParams[0]);
            return (row as T) || null;
          }
          // Totales de ventas
          if (query.includes('FROM sales') && query.includes('SUM(total_cents)')) {
            const negId = boundParams[0];
            const filtered = sales.filter((s) => s.negocio_id === negId);
            const totalSales = filtered.reduce((acc, s) => acc + s.total_cents, 0);
            const totalCost = filtered.reduce((acc, s) => acc + (s.total_cost_cents || 0), 0);
            return {
              count: filtered.length,
              total_sales_cents: totalSales,
              total_cost_cents: totalCost,
            } as T;
          }
          // Resumen de deudores
          if (query.includes('FROM credit_customers') && query.includes('SUM(balance_cents)')) {
            const negId = boundParams[0];
            const filtered = creditCustomers.filter(
              (c) => c.negocio_id === negId && c.active === 1 && c.balance_cents > 0
            );
            const totalDebt = filtered.reduce((acc, c) => acc + c.balance_cents, 0);
            return {
              count: filtered.length,
              total_debt_cents: totalDebt,
            } as T;
          }
          // Conteo stock crítico
          if (query.includes('FROM products') && query.includes('COUNT(*) as count')) {
            const negId = boundParams[0];
            const filtered = products.filter(
              (p) => p.negocio_id === negId && p.stock <= p.min_stock
            );
            return { count: filtered.length } as T;
          }
          return null;
        },
        all: async <T = any>() => {
          // Desglose de ventas por método
          if (query.includes('FROM sales') && query.includes('GROUP BY payment_method')) {
            const negId = boundParams[0];
            const filtered = sales.filter((s) => s.negocio_id === negId);
            const groups: Record<string, { count: number; total_cents: number }> = {};
            for (const s of filtered) {
              if (!groups[s.payment_method]) {
                groups[s.payment_method] = { count: 0, total_cents: 0 };
              }
              groups[s.payment_method].count += 1;
              groups[s.payment_method].total_cents += s.total_cents;
            }
            const results = Object.entries(groups).map(([method, val]) => ({
              payment_method: method,
              count: val.count,
              total_cents: val.total_cents,
            }));
            return { results, success: true } as any;
          }
          // Lista de deudores
          if (query.includes('FROM credit_customers') && query.includes('ORDER BY balance_cents DESC')) {
            const negId = boundParams[0];
            const limit = boundParams[1] || 5;
            const filtered = creditCustomers
              .filter((c) => c.negocio_id === negId && c.active === 1 && c.balance_cents > 0)
              .sort((a, b) => b.balance_cents - a.balance_cents)
              .slice(0, limit);
            return { results: filtered, success: true } as any;
          }
          // Lista stock crítico
          if (query.includes('FROM products p') && query.includes('WHERE p.negocio_id = ? AND p.stock <= p.min_stock')) {
            const negId = boundParams[0];
            const filtered = products
              .filter((p) => p.negocio_id === negId && p.stock <= p.min_stock)
              .map((p) => {
                const sup = suppliers.find((s) => s.id === p.supplier_id);
                return { ...p, supplier_name: sup?.name };
              });
            return { results: filtered, success: true } as any;
          }
          return { results: [], success: true } as any;
        },
        run: async () => {
          if (query.includes('UPDATE negocios')) {
            const neg = negocios.find((n) => n.id === boundParams[0]);
            if (neg) neg.cuota_ia_usada += 1;
          }
          return { success: true, meta: { changes: 1 } } as any;
        },
      };
      return stmt as any;
    },
  } as any;
}

describe('Sarin Business Copilot - D1 Analytical Tools', () => {
  it('formats cents into COP correctly', () => {
    expect(formatCOP(1250000)).toBe('$ 12.500');
    expect(formatCOP(480000)).toBe('$ 4.800');
    expect(formatCOP(0)).toBe('$ 0');
  });

  it('executes consultar_ventas_y_ganancias calculating gross profit and margin %', async () => {
    const db = createMockD1Database({
      sales: [
        { negocio_id: 'surtifacil', total_cents: 2000000, total_cost_cents: 1400000, payment_method: 'cash' }, // $20.000 (cost $14.000)
        { negocio_id: 'surtifacil', total_cents: 1000000, total_cost_cents: 700000, payment_method: 'other' },  // $10.000 (cost $7.000)
      ],
    });

    const result = await executeConsultarVentas(db, 'surtifacil', { period: 'today' });

    expect(result.numero_ventas).toBe(2);
    expect(result.total_ventas_cents).toBe(3000000); // $ 30.000 COP
    expect(result.total_ventas_cop).toBe('$ 30.000');
    expect(result.total_costo_cents).toBe(2100000);  // $ 21.000 COP
    expect(result.ganancia_neta_cents).toBe(900000);  // $ 9.000 COP
    expect(result.ganancia_neta_cop).toBe('$ 9.000');
    expect(result.margen_porcentaje).toBe(30); // 30%
  });

  it('executes consultar_deudores_fiados ranking top debtors with balance in COP', async () => {
    const db = createMockD1Database({
      credit_customers: [
        { id: 'c1', negocio_id: 'surtifacil', name: 'Doña Marta', balance_cents: 7500000, phone: '3001234567', active: 1 },
        { id: 'c2', negocio_id: 'surtifacil', name: 'Don Carlos', balance_cents: 4500000, phone: '3119876543', active: 1 },
        { id: 'c3', negocio_id: 'surtifacil', name: 'Vecino Pagado', balance_cents: 0, active: 1 },
      ],
    });

    const result = await executeConsultarDeudores(db, 'surtifacil', { limit: 5 });

    expect(result.total_clientes_deudores).toBe(2);
    expect(result.total_cartera_pendiente_cop).toBe('$ 120.000');
    const top = result.top_deudores as any[];
    expect(top.length).toBe(2);
    expect(top[0].nombre).toBe('Doña Marta');
    expect(top[0].saldo_pendiente_cop).toBe('$ 75.000');
    expect(top[1].nombre).toBe('Don Carlos');
  });

  it('executes consultar_stock_critico listing exhausted and low stock items', async () => {
    const db = createMockD1Database({
      products: [
        { id: 'p1', negocio_id: 'surtifacil', name: 'Arroz Diana 1kg', stock: 2, min_stock: 5, unit: 'kilo', price_cents: 480000 },
        { id: 'p2', negocio_id: 'surtifacil', name: 'Huevos AA x30', stock: 0, min_stock: 3, unit: 'cubeta', price_cents: 1800000 },
        { id: 'p3', negocio_id: 'surtifacil', name: 'Azúcar Manuelita 1kg', stock: 15, min_stock: 5, unit: 'kilo', price_cents: 500000 },
      ],
    });

    const result = await executeConsultarStockCritico(db, 'surtifacil', { limit: 10 });

    expect(result.total_productos_criticos).toBe(2);
    const prods = result.productos_criticos as any[];
    expect(prods.length).toBe(2);
    expect(prods.find((p) => p.nombre === 'Huevos AA x30')?.estado).toBe('Agotado');
  });

  it('executes sugerir_orden_compra proposing restocking quantities and investment', async () => {
    const db = createMockD1Database({
      products: [
        { id: 'p1', negocio_id: 'surtifacil', name: 'Arroz Diana 1kg', stock: 2, min_stock: 5, unit: 'kilo', price_cents: 480000, last_cost_cents: 350000 },
      ],
    });

    const result = await executeSugerirOrdenCompra(db, 'surtifacil', {});

    expect(result.total_items).toBe(1);
    const items = result.items_sugeridos as any[];
    expect(items[0].cantidad_sugerida).toBe(8); // target 10 - stock 2 = 8
    expect(items[0].costo_unitario_estimado_cop).toBe('$ 3.500');
    expect(result.inversion_total_estimada_cop).toBe('$ 28.000'); // 8 * $3.500 = $28.000
  });

  it('processes copilot message in test mode using deterministic paisa fallback', async () => {
    const db = createMockD1Database({
      sales: [
        { negocio_id: 'surtifacil', total_cents: 1500000, total_cost_cents: 1000000, payment_method: 'cash' },
      ],
    });

    const env = { DB: db, ENVIRONMENT: 'test' } as any;

    const res = await processSarinCopilotMessage(db, env, {
      negocioId: 'surtifacil',
      userMessage: '¿Cuánto llevamos vendido hoy y cuál es la ganancia?',
    });

    expect(res.reply).toContain('balance de ventas');
    expect(res.reply).toContain('Ganancia Bruta');
    expect(res.toolsInvoked.length).toBe(1);
    expect(res.toolsInvoked[0].tool).toBe('consultar_ventas_y_ganancias');
    expect(res.quota.used).toBe(11); // Consumió 1 turno de IA
  });
});
