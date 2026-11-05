import { D1Database, Env } from '../types';
import {
  ChatMessage,
  ChatCompletionTool,
  callDeepSeekChat,
  checkAndConsumeAiQuota,
} from './deepseekEngine';

export interface CopilotAnalyticalResult {
  tool: string;
  data: Record<string, unknown>;
}

export interface CopilotProcessResult {
  reply: string;
  toolsInvoked: CopilotAnalyticalResult[];
  quota: {
    remaining: number;
    total: number;
    used: number;
  };
}

export function formatCOP(cents: number): string {
  const pesos = Math.round(cents / 100);
  return `$ ${pesos.toLocaleString('es-CO')}`;
}

export const COPILOT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'consultar_ventas_y_ganancias',
      description:
        'Calcula las ventas acumuladas, costos, ganancia bruta estimada y margen de rentabilidad de la tienda en un período determinado (hoy, esta semana o este mes).',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'week', 'month'],
            description: 'Período a consultar: "today" (hoy), "week" (últimos 7 días), "month" (mes actual).',
          },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_deudores_fiados',
      description:
        'Obtiene el ranking de los clientes con mayores saldos pendientes en el libro de fiados (cartera morosa), junto al total adeudado.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Cantidad máxima de clientes deudores a consultar (por defecto 5).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_stock_critico',
      description:
        'Busca los productos con inventario agotado o en nivel crítico (stock menor o igual al stock mínimo configurado) que requieren reposición urgente.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Cantidad máxima de productos a listar (por defecto 10).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sugerir_orden_compra',
      description:
        'Genera una propuesta inteligente de compra y reposición para proveedores basada en los productos con stock bajo o agotado, con cantidades sugeridas e inversión total estimada en COP.',
      parameters: {
        type: 'object',
        properties: {
          supplier_id: {
            type: 'string',
            description: 'ID de proveedor específico si se desea acotar la sugerencia.',
          },
        },
      },
    },
  },
];

/**
 * 1. Consultar ventas y ganancias
 */
export async function executeConsultarVentas(
  db: D1Database,
  negocioId: string,
  args: { period?: 'today' | 'week' | 'month' }
): Promise<Record<string, unknown>> {
  const period = args.period || 'today';
  let dateFilter = "date('now', 'localtime')";
  let periodLabel = 'Hoy';

  if (period === 'week') {
    dateFilter = "date('now', '-7 days', 'localtime')";
    periodLabel = 'Últimos 7 días';
  } else if (period === 'month') {
    dateFilter = "date('now', 'start of month', 'localtime')";
    periodLabel = 'Este mes';
  }

  const totalsRow = await db
    .prepare(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(total_cents), 0) as total_sales_cents,
         COALESCE(SUM(total_cost_cents), 0) as total_cost_cents
       FROM sales
       WHERE negocio_id = ? AND date(created_at, 'localtime') >= ${dateFilter}`
    )
    .bind(negocioId)
    .first<{ count: number; total_sales_cents: number; total_cost_cents: number }>();

  const totalSalesCents = totalsRow?.total_sales_cents || 0;
  const totalCostCents = totalsRow?.total_cost_cents || 0;
  const count = totalsRow?.count || 0;
  const gananciaCents = totalSalesCents - totalCostCents;
  const marginPct = totalSalesCents > 0 ? (gananciaCents / totalSalesCents) * 100 : 0;

  // Desglose por método de pago
  const breakdownRows = await db
    .prepare(
      `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total_cents), 0) as total_cents
       FROM sales
       WHERE negocio_id = ? AND date(created_at, 'localtime') >= ${dateFilter}
       GROUP BY payment_method`
    )
    .bind(negocioId)
    .all<{ payment_method: string; count: number; total_cents: number }>();

  const breakdown = (breakdownRows.results || []).map((b) => ({
    metodo: b.payment_method,
    cantidad: b.count,
    total_cents: b.total_cents,
    total_cop: formatCOP(b.total_cents),
  }));

  return {
    period,
    period_label: periodLabel,
    total_ventas_cop: formatCOP(totalSalesCents),
    total_ventas_cents: totalSalesCents,
    total_costo_cop: formatCOP(totalCostCents),
    total_costo_cents: totalCostCents,
    ganancia_neta_cop: formatCOP(gananciaCents),
    ganancia_neta_cents: gananciaCents,
    margen_porcentaje: Math.round(marginPct * 10) / 10,
    numero_ventas: count,
    desglose_pagos: breakdown,
  };
}

/**
 * 2. Consultar deudores de fiados
 */
export async function executeConsultarDeudores(
  db: D1Database,
  negocioId: string,
  args: { limit?: number }
): Promise<Record<string, unknown>> {
  const limit = Math.min(Math.max(1, args.limit || 5), 20);

  const summary = await db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(balance_cents), 0) as total_debt_cents
       FROM credit_customers
       WHERE negocio_id = ? AND active = 1 AND balance_cents > 0`
    )
    .bind(negocioId)
    .first<{ count: number; total_debt_cents: number }>();

  const rows = await db
    .prepare(
      `SELECT id, name, phone, balance_cents, updated_at, last_entry_at
       FROM credit_customers
       WHERE negocio_id = ? AND active = 1 AND balance_cents > 0
       ORDER BY balance_cents DESC
       LIMIT ?`
    )
    .bind(negocioId, limit)
    .all<{
      id: string;
      name: string;
      phone?: string;
      balance_cents: number;
      updated_at?: string;
      last_entry_at?: string;
    }>();

  const deudores = (rows.results || []).map((c) => ({
    id: c.id,
    nombre: c.name,
    telefono: c.phone || 'Sin teléfono',
    saldo_pendiente_cents: c.balance_cents,
    saldo_pendiente_cop: formatCOP(c.balance_cents),
    ultimo_movimiento: c.last_entry_at || c.updated_at || 'Reciente',
  }));

  const totalDebtCents = summary?.total_debt_cents || 0;
  const count = summary?.count || 0;

  return {
    total_clientes_deudores: count,
    total_cartera_pendiente_cop: formatCOP(totalDebtCents),
    total_cartera_pendiente_cents: totalDebtCents,
    top_deudores: deudores,
  };
}

/**
 * 3. Consultar stock crítico
 */
export async function executeConsultarStockCritico(
  db: D1Database,
  negocioId: string,
  args: { limit?: number }
): Promise<Record<string, unknown>> {
  const limit = Math.min(Math.max(1, args.limit || 10), 30);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM products
       WHERE negocio_id = ? AND stock <= min_stock`
    )
    .bind(negocioId)
    .first<{ count: number }>();

  const rows = await db
    .prepare(
      `SELECT p.id, p.name, p.stock, p.min_stock, p.unit, p.price_cents, p.last_cost_cents, s.name as supplier_name
       FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.negocio_id = ? AND p.stock <= p.min_stock
       ORDER BY p.stock ASC, p.name ASC
       LIMIT ?`
    )
    .bind(negocioId, limit)
    .all<{
      id: string;
      name: string;
      stock: number;
      min_stock: number;
      unit: string;
      price_cents: number;
      last_cost_cents?: number;
      supplier_name?: string;
    }>();

  const productos = (rows.results || []).map((p) => ({
    id: p.id,
    nombre: p.name,
    stock_actual: p.stock,
    stock_minimo: p.min_stock,
    unidad: p.unit || 'unidad',
    precio_cop: formatCOP(p.price_cents),
    estado: p.stock <= 0 ? 'Agotado' : 'Por Agotarse',
    proveedor: p.supplier_name || 'Sin proveedor asignado',
  }));

  return {
    total_productos_criticos: countRow?.count || 0,
    productos_criticos: productos,
  };
}

/**
 * 4. Sugerir orden de compra
 */
export async function executeSugerirOrdenCompra(
  db: D1Database,
  negocioId: string,
  args: { supplier_id?: string }
): Promise<Record<string, unknown>> {
  let query = `
    SELECT p.id, p.name, p.stock, p.min_stock, p.unit, p.price_cents, p.last_cost_cents, p.supplier_id, s.name as supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.negocio_id = ? AND p.stock <= p.min_stock
  `;
  const params: unknown[] = [negocioId];

  if (args.supplier_id) {
    query += ' AND p.supplier_id = ?';
    params.push(args.supplier_id);
  }

  query += ' ORDER BY (p.stock - p.min_stock) ASC LIMIT 20';

  const rows = await db.prepare(query).bind(...params).all<{
    id: string;
    name: string;
    stock: number;
    min_stock: number;
    unit: string;
    price_cents: number;
    last_cost_cents?: number;
    supplier_id?: string;
    supplier_name?: string;
  }>();

  let totalInversionCents = 0;
  const items = (rows.results || []).map((p) => {
    // Sugerimos reponer para tener el doble del mínimo o al menos 10 unidades
    const targetStock = Math.max(p.min_stock * 2, 10);
    const cantidadSugerida = Math.max(1, targetStock - Math.max(0, p.stock));
    const costoUnitarioCents = p.last_cost_cents && p.last_cost_cents > 0
      ? p.last_cost_cents
      : Math.round(p.price_cents * 0.7); // 70% margen costo referencial

    const subtotalCents = cantidadSugerida * costoUnitarioCents;
    totalInversionCents += subtotalCents;

    return {
      producto_id: p.id,
      nombre: p.name,
      unidad: p.unit,
      stock_actual: p.stock,
      cantidad_sugerida: cantidadSugerida,
      costo_unitario_estimado_cop: formatCOP(costoUnitarioCents),
      subtotal_estimado_cop: formatCOP(subtotalCents),
      subtotal_estimado_cents: subtotalCents,
      proveedor: p.supplier_name || 'Proveedor general',
    };
  });

  return {
    total_items: items.length,
    inversion_total_estimada_cop: formatCOP(totalInversionCents),
    inversion_total_estimada_cents: totalInversionCents,
    items_sugeridos: items,
  };
}

/**
 * Fallback heurístico inteligente cuando no hay API Key de DeepSeek o en tests
 */
export async function executeCopilotDeterministicFallback(
  db: D1Database,
  negocioId: string,
  userMessage: string
): Promise<{ reply: string; toolsInvoked: CopilotAnalyticalResult[] }> {
  const norm = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const toolsInvoked: CopilotAnalyticalResult[] = [];

  // 1. Ventas y ganancias
  if (
    norm.includes('venta') ||
    norm.includes('vendido') ||
    norm.includes('ganancia') ||
    norm.includes('margen') ||
    norm.includes('cuanto llevamos') ||
    norm.includes('caja')
  ) {
    let period: 'today' | 'week' | 'month' = 'today';
    if (norm.includes('semana') || norm.includes('7 dias')) period = 'week';
    if (norm.includes('mes')) period = 'month';

    const data = await executeConsultarVentas(db, negocioId, { period });
    toolsInvoked.push({ tool: 'consultar_ventas_y_ganancias', data });

    const periodLabel = String(data.period_label || 'Hoy').toLowerCase();
    const reply = `¡Hola patrón! Aquí tiene el balance de ventas de ${periodLabel}:\n\n` +
      `💰 **Ventas Totales:** ${data.total_ventas_cop} (${data.numero_ventas} ventas cerradas)\n` +
      `📦 **Costo de Mercancía:** ${data.total_costo_cop}\n` +
      `📈 **Ganancia Bruta:** ${data.ganancia_neta_cop}\n` +
      `🎯 **Margen Promedio:** ${data.margen_porcentaje}%\n\n` +
      `El mostrador se ha movido muy bien. ¿Desea revisar también los fiados o el stock?`;

    return { reply, toolsInvoked };
  }

  // 2. Deudores / Fiados
  if (
    norm.includes('deudor') ||
    norm.includes('fiado') ||
    norm.includes('debe') ||
    norm.includes('cartera') ||
    norm.includes('cobrar')
  ) {
    const data = await executeConsultarDeudores(db, negocioId, { limit: 5 });
    toolsInvoked.push({ tool: 'consultar_deudores_fiados', data });

    const top = (data.top_deudores as any[]) || [];
    let listText = '';
    if (top.length === 0) {
      listText = 'No tiene clientes con saldo moroso pendiente en este momento. ¡Excelente cartera al día!';
    } else {
      listText = top
        .map((d, i) => `${i + 1}. **${d.nombre}**: ${d.saldo_pendiente_cop} (Tel: ${d.telefono})`)
        .join('\n');
    }

    const reply = `¡Listo! Este es el estado del libro de fiados:\n\n` +
      `📒 **Total en Cartera Pendiente:** ${data.total_cartera_pendiente_cop}\n` +
      `👥 **Clientes con Saldo:** ${data.total_clientes_deudores}\n\n` +
      `**Top 5 Clientes con Mayor Saldo:**\n${listText}\n\n` +
      `Recuerde que puede enviarles un recordatorio cordial a su WhatsApp desde la sección de Cartera.`;

    return { reply, toolsInvoked };
  }

  // 3. Stock crítico / Agotados
  if (
    norm.includes('stock') ||
    norm.includes('agotado') ||
    norm.includes('critico') ||
    norm.includes('escaso') ||
    norm.includes('falta')
  ) {
    const data = await executeConsultarStockCritico(db, negocioId, { limit: 8 });
    toolsInvoked.push({ tool: 'consultar_stock_critico', data });

    const prods = (data.productos_criticos as any[]) || [];
    let listText = '';
    if (prods.length === 0) {
      listText = '¡Todo el inventario está en niveles óptimos de stock por encima del mínimo!';
    } else {
      listText = prods
        .map(
          (p) =>
            `• **${p.nombre}**: le quedan **${p.stock_actual} ${p.unidad}** (mínimo: ${p.stock_minimo}) — *${p.estado}* [${p.proveedor}]`
        )
        .join('\n');
    }

    const reply = `¡Ojo con estos productos en bodega! Encontré **${data.total_productos_criticos} productos** con stock bajo o agotado:\n\n` +
      `${listText}\n\n` +
      `¿Desea que le arme la lista sugerida de compra para los proveedores?`;

    return { reply, toolsInvoked };
  }

  // 4. Lista sugerida de compra / Proveedores
  if (
    norm.includes('orden de compra') ||
    norm.includes('lista') ||
    norm.includes('compra') ||
    norm.includes('proveedor') ||
    norm.includes('reponer') ||
    norm.includes('surtir')
  ) {
    const data = await executeSugerirOrdenCompra(db, negocioId, {});
    toolsInvoked.push({ tool: 'sugerir_orden_compra', data });

    const items = (data.items_sugeridos as any[]) || [];
    let listText = '';
    if (items.length === 0) {
      listText = 'No hay productos críticos que requieran compra inmediata hoy.';
    } else {
      listText = items
        .slice(0, 6)
        .map(
          (item) =>
            `• **${item.nombre}**: pedir **${item.cantidad_sugerida} ${item.unidad}** (~${item.subtotal_estimado_cop}) [${item.proveedor}]`
        )
        .join('\n');
    }

    const reply = `¡Con gusto, patrón! Le preparé la propuesta de abastecimiento para surtir el negocio:\n\n` +
      `📦 **Items a Reponer:** ${data.total_items}\n` +
      `💵 **Inversión Estimada Total:** ${data.inversion_total_estimada_cop}\n\n` +
      `**Principales Productos Sugeridos:**\n${listText}\n\n` +
      `Puede generar estas órdenes oficiales en la sección de Proveedores y Pedidos.`;

    return { reply, toolsInvoked };
  }

  // Respuesta general
  const reply = `¡Hola! Soy **Sarin**, su copiloto inteligente de mostrador en SurtiFácil. ` +
    `Puedo ayudarle al instante con:\n\n` +
    `📊 **1. Ventas y Ganancias:** *"¿Cuánto llevamos vendido hoy y cuál es la ganancia?"*\n` +
    `📒 **2. Cartera y Fiados:** *"¿Quiénes son los clientes que más me deben?"*\n` +
    `⚠️ **3. Stock Crítico:** *"¿Qué productos tienen stock crítico o están agotados?"*\n` +
    `🚚 **4. Reposición:** *"Ármame la lista de compra para proveedores"*\n\n` +
    `¿Con qué empezamos hoy?`;

  return { reply, toolsInvoked };
}

/**
 * Orquestador principal del Copiloto Gerencial Sarin para el Tendero / Staff
 */
export async function processSarinCopilotMessage(
  db: D1Database,
  env: Env,
  params: {
    negocioId: string;
    userMessage: string;
    conversationHistory?: ChatMessage[];
  }
): Promise<CopilotProcessResult> {
  const { negocioId, userMessage } = params;

  // 1. Verificación y consumo atómico de cuota de IA
  const quota = await checkAndConsumeAiQuota(db, negocioId);
  if (!quota.allowed) {
    return {
      reply:
        '⚠️ Se ha alcanzado el límite de turnos de IA para este negocio en el plan actual. ' +
        'Por favor renueva o amplía tu suscripción desde el Centro de Control o por WhatsApp.',
      toolsInvoked: [],
      quota,
    };
  }

  // 2. Si no hay DEEPSEEK_API_KEY configurada, fallback determinístico
  if (!env.DEEPSEEK_API_KEY || env.ENVIRONMENT === 'test') {
    const fallback = await executeCopilotDeterministicFallback(db, negocioId, userMessage);
    return {
      reply: fallback.reply,
      toolsInvoked: fallback.toolsInvoked,
      quota,
    };
  }

  // 3. Preparación de contexto para DeepSeek API
  const systemPrompt = `Eres Sarin, el Copiloto Inteligente y Asesor Gerencial del tendero de barrio y dueño de abastos en Medellín (SurtiFácil SaaS).
Tu tono es ejecutivo, cercano, respetuoso y con calidez paisa (llamas al tendero "patrón" o "don/doña" con cortesía profesional).
Cuentas con 4 herramientas de consulta analítica en tiempo real sobre la base de datos de la tienda:
1. 'consultar_ventas_y_ganancias': para consultar ventas acumuladas, costos, ganancia neta y márgenes de rentabilidad.
2. 'consultar_deudores_fiados': para consultar el libro de fiados, clientes deudores y total de cartera pendiente.
3. 'consultar_stock_critico': para revisar productos con inventario bajo el mínimo o agotados.
4. 'sugerir_orden_compra': para proponer la lista de abastecimiento a proveedores e inversión estimada.

Reglas obligatorias:
- Siempre responde con datos exactos devueltos por las herramientas. Jamás inventes cifras de ventas ni deudas.
- Todos los valores monetarios deben expresarse en Pesos Colombianos formato COP ($ 12.500) usando las cifras calculadas.
- Sé conciso, directo al grano y enfocado en la rentabilidad del tendero.
- Si el usuario te pregunta por ventas, cartera, stock o proveedores, invoca de inmediato la herramienta adecuada.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(params.conversationHistory || []).slice(-6),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await callDeepSeekChat(env, {
      messages,
      tools: COPILOT_TOOLS,
      temperature: 0.2,
      max_tokens: 800,
    });

    const choice = response?.choices?.[0];
    const message = choice?.message;

    // Si DeepSeek decide llamar a herramientas
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolsInvoked: CopilotAnalyticalResult[] = [];
      const toolMessages: ChatMessage[] = [
        ...messages,
        {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls,
        },
      ];

      for (const call of message.tool_calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }

        let toolResult: Record<string, unknown> = {};

        if (call.function.name === 'consultar_ventas_y_ganancias') {
          toolResult = await executeConsultarVentas(db, negocioId, args);
        } else if (call.function.name === 'consultar_deudores_fiados') {
          toolResult = await executeConsultarDeudores(db, negocioId, args);
        } else if (call.function.name === 'consultar_stock_critico') {
          toolResult = await executeConsultarStockCritico(db, negocioId, args);
        } else if (call.function.name === 'sugerir_orden_compra') {
          toolResult = await executeSugerirOrdenCompra(db, negocioId, args);
        }

        toolsInvoked.push({
          tool: call.function.name,
          data: toolResult,
        });

        toolMessages.push({
          role: 'tool',
          name: call.function.name,
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Segunda llamada a DeepSeek para generar el resumen amigable final con los datos de las herramientas
      const secondResponse = await callDeepSeekChat(env, {
        messages: toolMessages,
        temperature: 0.2,
        max_tokens: 800,
      });

      const finalReply = secondResponse?.choices?.[0]?.message?.content?.trim();
      if (finalReply) {
        return {
          reply: finalReply,
          toolsInvoked,
          quota,
        };
      }

      // Si falla la segunda respuesta, generar resumen fallback con las herramientas ejecutadas
      const fallback = await executeCopilotDeterministicFallback(db, negocioId, userMessage);
      return {
        reply: fallback.reply,
        toolsInvoked,
        quota,
      };
    }

    if (message?.content) {
      return {
        reply: message.content.trim(),
        toolsInvoked: [],
        quota,
      };
    }

    // Fallback si la respuesta vino vacía
    const fallback = await executeCopilotDeterministicFallback(db, negocioId, userMessage);
    return {
      reply: fallback.reply,
      toolsInvoked: fallback.toolsInvoked,
      quota,
    };
  } catch (err) {
    console.error('Error invoking DeepSeek Copilot, using deterministic fallback:', err);
    const fallback = await executeCopilotDeterministicFallback(db, negocioId, userMessage);
    return {
      reply: fallback.reply,
      toolsInvoked: fallback.toolsInvoked,
      quota,
    };
  }
}
