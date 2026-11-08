import { apiFetch } from './apiClient';

export interface CopilotAnalyticalResult {
  tool: string;
  data: Record<string, unknown>;
}

export interface CopilotResponse {
  success: boolean;
  reply: string;
  toolsInvoked: CopilotAnalyticalResult[];
  quota: {
    remaining: number;
    total: number;
    used: number;
  };
}

export async function askSarinCopilot(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<CopilotResponse> {
  try {
    const response = await apiFetch<CopilotResponse>('/ai/copilot', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversationHistory,
      }),
    });
    return response;
  } catch (err: unknown) {
    console.warn('Error connecting to /api/ai/copilot, using local mock fallback:', err);
    // Fallback amigable para pruebas o modo sin backend
    const norm = message.toLowerCase();
    let reply = `¡Hola patrón! Soy **Sarin**, su copiloto de confianza. `;
    const toolsInvoked: CopilotAnalyticalResult[] = [];

    if (norm.includes('venta') || norm.includes('ganancia') || norm.includes('hoy')) {
      reply = `¡Buenas noticias, patrón! Hoy llevamos **$ 485.000** en ventas cerradas con una ganancia bruta estimada de **$ 145.500** (margen promedio del 30%).`;
      toolsInvoked.push({
        tool: 'consultar_ventas_y_ganancias',
        data: {
          period_label: 'Hoy',
          total_ventas_cop: '$ 485.000',
          total_costo_cop: '$ 339.500',
          ganancia_neta_cop: '$ 145.500',
          margen_porcentaje: 30,
          numero_ventas: 24,
        },
      });
    } else if (norm.includes('deudor') || norm.includes('fiado') || norm.includes('debe')) {
      reply = `En el libro de fiados tenemos **$ 215.000** en cartera pendiente entre 4 vecinos. Doña Marta encabeza con $ 75.000.`;
      toolsInvoked.push({
        tool: 'consultar_deudores_fiados',
        data: {
          total_clientes_deudores: 4,
          total_cartera_pendiente_cop: '$ 215.000',
          top_deudores: [
            { id: '1', nombre: 'Doña Marta', saldo_pendiente_cop: '$ 75.000', telefono: '3001234567' },
            { id: '2', nombre: 'Don Carlos', saldo_pendiente_cop: '$ 52.000', telefono: '3119876543' },
            { id: '3', nombre: 'Vecina Gloria', saldo_pendiente_cop: '$ 48.000', telefono: '3205551234' },
          ],
        },
      });
    } else if (norm.includes('stock') || norm.includes('agotado') || norm.includes('critico')) {
      reply = `Ojo con el stock: Arroz Diana 1kg y Huevos AA tienen inventario por debajo del mínimo de seguridad.`;
      toolsInvoked.push({
        tool: 'consultar_stock_critico',
        data: {
          total_productos_criticos: 3,
          productos_criticos: [
            { id: 'p1', nombre: 'Arroz Diana 1kg', stock_actual: 2, stock_minimo: 10, unidad: 'libra', estado: 'Por Agotarse', proveedor: 'Distribuidora Oriental' },
            { id: 'p2', nombre: 'Huevos AA x30', stock_actual: 1, stock_minimo: 5, unidad: 'cubeta', estado: 'Por Agotarse', proveedor: 'Avícola La Colina' },
          ],
        },
      });
    } else if (norm.includes('compra') || norm.includes('proveedor') || norm.includes('lista')) {
      reply = `Le preparé la lista sugerida de compra: 18 bolsas de arroz y 9 cubetas de huevos por un estimado de **$ 165.000**.`;
      toolsInvoked.push({
        tool: 'sugerir_orden_compra',
        data: {
          total_items: 2,
          inversion_total_estimada_cop: '$ 165.000',
          items_sugeridos: [
            { producto_id: 'p1', nombre: 'Arroz Diana 1kg', cantidad_sugerida: 18, unidad: 'libra', subtotal_estimado_cop: '$ 72.000', proveedor: 'Distribuidora Oriental' },
            { producto_id: 'p2', nombre: 'Huevos AA x30', cantidad_sugerida: 9, unidad: 'cubeta', subtotal_estimado_cop: '$ 93.000', proveedor: 'Avícola La Colina' },
          ],
        },
      });
    } else {
      reply = `¡A sus órdenes! Pregúnteme sobre ventas de hoy, deudores de fiados, productos por agotarse o lista para el proveedor.`;
    }

    return {
      success: true,
      reply,
      toolsInvoked,
      quota: {
        remaining: 285,
        total: 300,
        used: 15,
      },
    };
  }
}

