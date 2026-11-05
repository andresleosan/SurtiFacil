import { D1Database, Env } from '../types';
import {
  ChatMessage,
  ChatCompletionTool,
  callDeepSeekChat,
  checkAndConsumeAiQuota,
} from './deepseekEngine';

export interface CartItem {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  priceCents: number;
  subtotalCents: number;
}

export interface StoreConfig {
  permite_domicilio: boolean;
  permite_retiro: boolean;
  costo_domicilio_cents: number;
  slogan?: string;
}

export interface SarinProcessResult {
  reply: string | null;
  botPaused: boolean;
  cart: CartItem[];
  orderCreated?: {
    id: string;
    orderCode: string;
    totalCents: number;
    trackingToken: string;
    trackingUrl: string;
    deliveryType: 'delivery' | 'pickup_counter';
  } | null;
  toolsInvoked: Array<{
    tool: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
}

// Formateador de moneda en pesos colombianos ($ 12.500)
export function formatCOP(cents: number): string {
  const pesos = Math.round(cents / 100);
  return `$ ${pesos.toLocaleString('es-CO')}`;
}

export const SARIN_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'consultar_catalogo_abastos',
      description:
        'Busca productos de abastos, víveres, precios en COP, ofertas y combos disponibles en el inventario real del local.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Término o nombre de producto o combo a buscar (ej: "leche", "arroz", "huevos").',
          },
          category: {
            type: 'string',
            description: 'Categoría de abastos (ej: "Lácteos y Huevos", "Granos y Despensa", "Fruver").',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modificar_canasta_pedido',
      description:
        'Agrega, modifica, quita o limpia productos en la canasta de mercado del cliente validando stock real en bodega.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'remove', 'set', 'clear'],
            description: 'Acción sobre la canasta.',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string', description: 'ID del producto si se conoce' },
                name: { type: 'string', description: 'Nombre o descripción del producto' },
                quantity: { type: 'number', description: 'Cantidad solicitada' },
              },
              required: ['quantity'],
            },
            description: 'Lista de productos a modificar en la canasta.',
          },
        },
        required: ['action', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_pedido_cliente',
      description:
        'Crea y confirma el pedido formal del cliente en customer_orders según las modalidades activas de la tienda (Domicilio o Retiro en mostrador).',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Nombre del cliente' },
          customer_phone: { type: 'string', description: 'Teléfono o WhatsApp del cliente' },
          delivery_type: {
            type: 'string',
            enum: ['delivery', 'pickup_counter'],
            description: 'Modalidad: "delivery" (domicilio) o "pickup_counter" (recoger en tienda).',
          },
          delivery_address: { type: 'string', description: 'Dirección completa si es a domicilio.' },
          delivery_neighborhood: { type: 'string', description: 'Barrio de Medellín si es a domicilio.' },
          payment_method: {
            type: 'string',
            enum: ['cash', 'transfer', 'credit'],
            description: 'Medio de pago: cash (efectivo), transfer (Nequi/Bancolombia) o credit (fiado).',
          },
        },
        required: ['customer_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_estado_o_escalar',
      description:
        'Consulta el estado de un pedido en curso (#W-...) o pausa el bot por 2 horas para que el tendero atienda manualmente.',
      parameters: {
        type: 'object',
        properties: {
          order_code: { type: 'string', description: 'Código del pedido (ej: "#W-01")' },
          tracking_token: { type: 'string', description: 'Token de seguimiento' },
          escalar_a_humano: {
            type: 'boolean',
            description: 'True si el cliente solicita hablar con una persona o tendero.',
          },
          motivo: { type: 'string', description: 'Motivo de la transferencia' },
        },
      },
    },
  },
];

/**
 * Extrae la configuración de entregas del negocio desde config_json y columnas de D1.
 */
export function extractStoreDeliveryConfig(storeRow: any): StoreConfig {
  let config: Record<string, any> = {};
  try {
    config = JSON.parse(storeRow?.config_json || '{}');
  } catch {
    config = {};
  }

  const permite_domicilio =
    config.permite_domicilio !== undefined ? Boolean(config.permite_domicilio) : true;
  const permite_retiro =
    config.permite_retiro !== undefined ? Boolean(config.permite_retiro) : true;
  const costo_domicilio_cents = Number(storeRow?.costo_domicilio_cents ?? 350000);

  return {
    permite_domicilio,
    permite_retiro,
    costo_domicilio_cents,
    slogan: config.slogan || 'El motor digital de la tienda paisa',
  };
}

/**
 * Herramienta 1: consultar_catalogo_abastos
 */
export async function executeConsultarCatalogo(
  db: D1Database,
  negocioId: string,
  args: { query?: string; category?: string }
) {
  const queryTerm = (args.query || '').trim().toLowerCase();
  const categoryTerm = (args.category || '').trim();

  // Consultar productos
  let sql = `SELECT id, name, price_cents, stock, unit, category, en_oferta, precio_oferta_cents 
             FROM products 
             WHERE negocio_id = ? AND visible_tienda = 1 AND stock > 0`;
  const bindings: unknown[] = [negocioId];

  if (categoryTerm) {
    sql += ` AND category LIKE ?`;
    bindings.push(`%${categoryTerm}%`);
  }
  if (queryTerm) {
    sql += ` AND name LIKE ?`;
    bindings.push(`%${queryTerm}%`);
  }
  sql += ` ORDER BY name ASC LIMIT 15`;

  const productsResult = await db.prepare(sql).bind(...bindings).all<any>();
  const products = (productsResult?.results || []).map((p) => {
    const finalPrice = p.en_oferta && p.precio_oferta_cents ? p.precio_oferta_cents : p.price_cents;
    return {
      id: p.id,
      name: p.name,
      category: p.category || 'General',
      unit: p.unit || 'unidad',
      price_cents: finalPrice,
      price_display: formatCOP(finalPrice),
      stock: p.stock,
      en_oferta: Boolean(p.en_oferta),
    };
  });

  // Consultar combos
  let comboSql = `SELECT id, name, description, price_cents, items_json FROM combos WHERE negocio_id = ? AND visible_tienda = 1 AND active = 1`;
  const comboBindings: unknown[] = [negocioId];
  if (queryTerm) {
    comboSql += ` AND (name LIKE ? OR description LIKE ?)`;
    comboBindings.push(`%${queryTerm}%`, `%${queryTerm}%`);
  }
  comboSql += ` LIMIT 5`;

  const combosResult = await db.prepare(comboSql).bind(...comboBindings).all<any>();
  const combos = (combosResult?.results || []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    price_cents: c.price_cents,
    price_display: formatCOP(c.price_cents),
    is_combo: true,
  }));

  return {
    encontrados: products.length + combos.length,
    productos: products,
    combos,
  };
}

/**
 * Herramienta 2: modificar_canasta_pedido
 */
export async function executeModificarCanasta(
  db: D1Database,
  negocioId: string,
  currentCart: CartItem[],
  args: {
    action: 'add' | 'remove' | 'set' | 'clear';
    items?: Array<{ product_id?: string; name?: string; quantity: number }>;
  }
) {
  if (args.action === 'clear') {
    return { canasta: [], subtotal_cents: 0, subtotal_display: formatCOP(0), advertencias: [] };
  }

  const updatedCart = [...currentCart];
  const warnings: string[] = [];
  const requestedItems = args.items || [];

  for (const item of requestedItems) {
    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) continue;

    // Buscar el producto en la BD de D1
    let match = null;
    if (item.product_id) {
      match = await db
        .prepare('SELECT id, name, price_cents, stock, unit, en_oferta, precio_oferta_cents FROM products WHERE negocio_id = ? AND id = ?')
        .bind(negocioId, item.product_id)
        .first<any>();
    }

    if (!match && item.name) {
      match = await db
        .prepare(
          'SELECT id, name, price_cents, stock, unit, en_oferta, precio_oferta_cents FROM products WHERE negocio_id = ? AND name LIKE ? AND visible_tienda = 1 ORDER BY stock DESC LIMIT 1'
        )
        .bind(negocioId, `%${item.name.trim()}%`)
        .first<any>();
    }

    // Si aún no hay match, buscar en combos
    let comboMatch = null;
    if (!match && item.name) {
      comboMatch = await db
        .prepare('SELECT id, name, price_cents FROM combos WHERE negocio_id = ? AND name LIKE ? AND active = 1 LIMIT 1')
        .bind(negocioId, `%${item.name.trim()}%`)
        .first<any>();
    }

    if (!match && !comboMatch) {
      warnings.push(`No encontramos "${item.name || item.product_id}" en el inventario actual.`);
      continue;
    }

    const itemId = match ? match.id : comboMatch.id;
    const itemName = match ? match.name : comboMatch.name;
    const itemUnit = match ? match.unit || 'unidad' : 'combo';
    const itemStock = match ? Number(match.stock) : 999;
    const itemPrice = match
      ? match.en_oferta && match.precio_oferta_cents
        ? match.precio_oferta_cents
        : match.price_cents
      : comboMatch.price_cents;

    const existingIndex = updatedCart.findIndex((c) => c.productId === itemId);

    if (args.action === 'add') {
      const currentQty = existingIndex >= 0 ? updatedCart[existingIndex].quantity : 0;
      const newQty = currentQty + qty;
      if (newQty > itemStock) {
        warnings.push(`Solo quedan ${itemStock} ${itemUnit}s de ${itemName}. Ajustamos al máximo.`);
      }
      const finalQty = Math.min(newQty, itemStock);

      if (existingIndex >= 0) {
        updatedCart[existingIndex].quantity = finalQty;
        updatedCart[existingIndex].subtotalCents = finalQty * itemPrice;
      } else if (finalQty > 0) {
        updatedCart.push({
          productId: itemId,
          name: itemName,
          unit: itemUnit,
          quantity: finalQty,
          priceCents: itemPrice,
          subtotalCents: finalQty * itemPrice,
        });
      }
    } else if (args.action === 'remove') {
      if (existingIndex >= 0) {
        const newQty = updatedCart[existingIndex].quantity - qty;
        if (newQty <= 0) {
          updatedCart.splice(existingIndex, 1);
        } else {
          updatedCart[existingIndex].quantity = newQty;
          updatedCart[existingIndex].subtotalCents = newQty * itemPrice;
        }
      }
    } else if (args.action === 'set') {
      const finalQty = Math.min(qty, itemStock);
      if (qty > itemStock) {
        warnings.push(`Solo quedan ${itemStock} ${itemUnit}s de ${itemName}.`);
      }
      if (existingIndex >= 0) {
        if (finalQty <= 0) {
          updatedCart.splice(existingIndex, 1);
        } else {
          updatedCart[existingIndex].quantity = finalQty;
          updatedCart[existingIndex].subtotalCents = finalQty * itemPrice;
        }
      } else if (finalQty > 0) {
        updatedCart.push({
          productId: itemId,
          name: itemName,
          unit: itemUnit,
          quantity: finalQty,
          priceCents: itemPrice,
          subtotalCents: finalQty * itemPrice,
        });
      }
    }
  }

  const subtotalCents = updatedCart.reduce((acc, it) => acc + it.subtotalCents, 0);

  return {
    canasta: updatedCart,
    subtotal_cents: subtotalCents,
    subtotal_display: formatCOP(subtotalCents),
    advertencias: warnings,
  };
}

/**
 * Herramienta 3: confirmar_pedido_cliente
 */
export async function executeConfirmarPedido(
  db: D1Database,
  negocioId: string,
  storeRow: any,
  currentCart: CartItem[],
  args: {
    customer_name: string;
    customer_phone?: string;
    delivery_type?: 'delivery' | 'pickup_counter';
    delivery_address?: string;
    delivery_neighborhood?: string;
    payment_method?: 'cash' | 'transfer' | 'credit';
  }
) {
  const storeConfig = extractStoreDeliveryConfig(storeRow);

  if (currentCart.length === 0) {
    return {
      exito: false,
      mensaje: 'La canasta está vacía. Por favor indica qué productos deseas agregar primero.',
    };
  }

  // Verificar modalidades de entrega activas
  if (!storeConfig.permite_domicilio && !storeConfig.permite_retiro) {
    return {
      exito: false,
      pedidos_en_pausa: true,
      mensaje:
        'En este momento nuestra tienda tiene los pedidos a distancia en pausa temporal. ¡Te esperamos directamente en nuestro mostrador!',
    };
  }

  let finalDeliveryType = args.delivery_type;

  // Si ambas están activas y el cliente aún no eligió
  if (storeConfig.permite_domicilio && storeConfig.permite_retiro && !finalDeliveryType) {
    return {
      exito: false,
      requiere_seleccion_entrega: true,
      mensaje:
        '¿Prefieres que te lo llevemos 🛵 **A Domicilio** a tu casa o pasas a 🏪 **Retirar en Tienda**?',
      opciones: ['🛵 A Domicilio', '🏪 Retirar en Tienda'],
    };
  }

  // Si solo una está activa, aplicarla de forma obligatoria
  if (!storeConfig.permite_domicilio && storeConfig.permite_retiro) {
    finalDeliveryType = 'pickup_counter';
  } else if (storeConfig.permite_domicilio && !storeConfig.permite_retiro) {
    finalDeliveryType = 'delivery';
  }

  // Validaciones según el modo
  let deliveryFeeCents = 0;
  if (finalDeliveryType === 'delivery') {
    if (!args.delivery_address || args.delivery_address.trim().length < 4) {
      return {
        exito: false,
        requiere_direccion: true,
        mensaje:
          '¡Con gusto te lo enviamos a domicilio! Por favor indícanos tu barrio y dirección exacta en Medellín.',
      };
    }
    deliveryFeeCents = storeConfig.costo_domicilio_cents;
  }

  const productsSubtotalCents = currentCart.reduce((acc, it) => acc + it.subtotalCents, 0);
  const totalCents = productsSubtotalCents + deliveryFeeCents;

  // Generar código de turno correlativo (#W-01)
  const countRow = await db
    .prepare(
      `SELECT count(*) as total FROM customer_orders 
       WHERE negocio_id = ? AND date(created_at) = date('now')`
    )
    .bind(negocioId)
    .first<{ total: number }>();

  const num = (countRow?.total ?? 0) + 1;
  const orderCode = `#W-${num < 10 ? '0' + num : num}`;
  const orderId = `co-w-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const trackingToken = `trk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Serializar ítems para customer_orders
  const itemsJson = JSON.stringify(
    currentCart.map((it) => ({
      product_id: it.productId,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      price_cents: it.priceCents,
      subtotal_cents: it.subtotalCents,
    }))
  );

  await db
    .prepare(
      `INSERT INTO customer_orders (
        id, negocio_id, order_code, source, customer_name, customer_phone,
        delivery_type, delivery_address, delivery_neighborhood, payment_method,
        items_json, total_cents, status, tracking_token, created_at, updated_at
      ) VALUES (?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
    )
    .bind(
      orderId,
      negocioId,
      orderCode,
      args.customer_name.trim(),
      args.customer_phone?.trim() || null,
      finalDeliveryType,
      args.delivery_address?.trim() || null,
      args.delivery_neighborhood?.trim() || null,
      args.payment_method || 'cash',
      itemsJson,
      totalCents,
      trackingToken
    )
    .run();

  return {
    exito: true,
    orderId,
    orderCode,
    totalCents,
    totalDisplay: formatCOP(totalCents),
    deliveryFeeCents,
    deliveryFeeDisplay: formatCOP(deliveryFeeCents),
    deliveryType: finalDeliveryType,
    trackingToken,
    trackingUrl: `#/pedido/${trackingToken}`,
    mensaje: `¡Listo, pedido ${orderCode} confirmado! Enseguida lo alistamos en la tienda. Puedes ver el estado de tu pedido aquí: #/pedido/${trackingToken}`,
  };
}

/**
 * Herramienta 4: consultar_estado_o_escalar
 */
export async function executeConsultarEstadoOEscalar(
  db: D1Database,
  negocioId: string,
  conversationId: string | null,
  args: {
    order_code?: string;
    tracking_token?: string;
    escalar_a_humano?: boolean;
    motivo?: string;
  }
) {
  if (args.escalar_a_humano && conversationId) {
    // Pausar el bot para esta conversación por 2 horas
    await db
      .prepare(
        `UPDATE whatsapp_conversations 
         SET status = 'paused', 
             bot_active = 0, 
             paused_until = datetime('now', '+2 hours'),
             updated_at = datetime('now')
         WHERE id = ? AND negocio_id = ?`
      )
      .bind(conversationId, negocioId)
      .run();

    return {
      escalado: true,
      mensaje:
        'He notificado al tendero para que te atienda personalmente. En unos momentos continuará la conversación contigo.',
    };
  }

  if (args.order_code || args.tracking_token) {
    let query = `SELECT id, order_code, status, total_cents, delivery_type, tracking_token, created_at 
                 FROM customer_orders WHERE negocio_id = ?`;
    const params: unknown[] = [negocioId];

    if (args.tracking_token) {
      query += ` AND tracking_token = ?`;
      params.push(args.tracking_token);
    } else if (args.order_code) {
      query += ` AND order_code = ?`;
      params.push(args.order_code.trim());
    }

    const order = await db.prepare(query).bind(...params).first<any>();
    if (!order) {
      return {
        encontrado: false,
        mensaje: `No encontramos ningún pedido reciente con esa referencia.`,
      };
    }

    const statusMap: Record<string, string> = {
      pending: '🟡 Recibido (en cola para alistar)',
      preparing: '🟠 Alistando tu mercado en mostrador',
      ready_or_on_way:
        order.delivery_type === 'delivery'
          ? '🛵 En camino con el domiciliario'
          : '🟢 Listo para recoger en mostrador',
      completed: '✅ Entregado con éxito',
      cancelled: '❌ Cancelado',
    };

    return {
      encontrado: true,
      orderCode: order.order_code,
      status: statusMap[order.status] || order.status,
      total_display: formatCOP(order.total_cents),
      trackingUrl: `#/pedido/${order.tracking_token}`,
    };
  }

  return {
    mensaje: 'Por favor indícame el número de pedido o si deseas hablar con el tendero.',
  };
}

/**
 * Asegura que las tablas whatsapp_conversations y whatsapp_messages existan en D1.
 */
export async function ensureWhatsAppTables(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id TEXT PRIMARY KEY,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
      phone_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'archived')) DEFAULT 'active',
      bot_active INTEGER NOT NULL DEFAULT 1,
      paused_until TEXT,
      cart_json TEXT DEFAULT '[]',
      delivery_mode TEXT DEFAULT 'counter',
      delivery_address TEXT,
      delivery_neighborhood TEXT,
      last_message_text TEXT,
      last_message_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
      negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')) DEFAULT 'inbound',
      sender TEXT NOT NULL,
      message_text TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_negocio ON whatsapp_conversations(negocio_id, phone_number);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_conv ON whatsapp_messages(conversation_id, created_at);
  `);
}

/**
 * Orquestador principal de Sarin Vecino.
 * Procesa mensajes de clientes (de WhatsApp webhook o del simulador web),
 * consulta o descuenta cuota en D1 y devuelve la respuesta cálida en español paisa.
 */
export async function processSarinCustomerMessage(
  db: D1Database,
  env: Env,
  params: {
    negocioId: string;
    conversationId?: string;
    customerPhone: string;
    customerName: string;
    userMessage: string;
    conversationHistory?: ChatMessage[];
  }
): Promise<SarinProcessResult> {
  await ensureWhatsAppTables(db);

  const { negocioId, customerPhone, customerName, userMessage } = params;

  // 1. Obtener tienda
  const storeRow = await db
    .prepare(
      `SELECT id, slug, nombre, barrio, ciudad, telefono_whatsapp, horario, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, config_json, estado 
       FROM negocios WHERE id = ?`
    )
    .bind(negocioId)
    .first<any>();

  if (!storeRow) {
    return {
      reply: 'Lo sentimos, este local no está disponible temporalmente.',
      botPaused: false,
      cart: [],
      toolsInvoked: [],
    };
  }

  // 2. Cargar o crear conversación
  let convId = params.conversationId;
  let convRow = null;

  if (convId) {
    convRow = await db
      .prepare('SELECT * FROM whatsapp_conversations WHERE id = ? AND negocio_id = ?')
      .bind(convId, negocioId)
      .first<any>();
  }

  if (!convRow) {
    convRow = await db
      .prepare('SELECT * FROM whatsapp_conversations WHERE negocio_id = ? AND phone_number = ?')
      .bind(negocioId, customerPhone)
      .first<any>();
  }

  if (!convRow) {
    convId = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await db
      .prepare(
        `INSERT INTO whatsapp_conversations (
          id, negocio_id, phone_number, customer_name, status, bot_active, cart_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', 1, '[]', datetime('now'), datetime('now'))`
      )
      .bind(convId, negocioId, customerPhone, customerName || 'Cliente Vecino')
      .run();
    convRow = {
      id: convId,
      negocio_id: negocioId,
      phone_number: customerPhone,
      customer_name: customerName,
      status: 'active',
      bot_active: 1,
      paused_until: null,
      cart_json: '[]',
    };
  } else {
    convId = convRow.id;
  }

  // Guardar mensaje entrante del cliente
  const inMsgId = `msg-in-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  await db
    .prepare(
      `INSERT INTO whatsapp_messages (
        id, conversation_id, negocio_id, direction, sender, message_text, message_type, created_at
      ) VALUES (?, ?, ?, 'inbound', 'customer', ?, 'text', datetime('now'))`
    )
    .bind(inMsgId, convId, negocioId, userMessage)
    .run();

  // 3. Verificar si el bot está pausado manualmente por el tendero
  const isPaused =
    convRow.bot_active === 0 &&
    convRow.paused_until &&
    new Date(convRow.paused_until).getTime() > Date.now();

  if (isPaused) {
    return {
      reply: null,
      botPaused: true,
      cart: [],
      toolsInvoked: [],
    };
  }

  // 4. Verificar cuota de IA
  const quota = await checkAndConsumeAiQuota(db, negocioId);
  if (!quota.allowed) {
    const quotaReply =
      '¡Hola vecino! En este momento estoy transfiriendo tu mensaje directamente al tendero para atenderte personalmente. ¡Enseguida te responde!';
    return {
      reply: quotaReply,
      botPaused: true,
      cart: [],
      toolsInvoked: [],
    };
  }

  // 5. Cargar canasta actual de la sesión
  let currentCart: CartItem[] = [];
  try {
    currentCart = JSON.parse(convRow.cart_json || '[]');
  } catch {
    currentCart = [];
  }

  const storeDelivery = extractStoreDeliveryConfig(storeRow);
  const toolsInvoked: SarinProcessResult['toolsInvoked'] = [];
  let orderCreatedResult: SarinProcessResult['orderCreated'] = null;
  let finalReply = '';

  // 6. Preparar Mensaje del Sistema para Sarin
  const systemPrompt = `Eres Sarin, el bot asistente de mostrador y pedidos vecinales de "${storeRow.nombre}" en ${storeRow.barrio}, Medellín.
Tu objetivo es ayudar amablemente al vecino a consultar el inventario, armar su canasta de mercado y confirmar su pedido.
Personalidad: Cálido, ágil, servicial, estilo tendero paisa amable de Medellín ("¡Hola vecino!", "Con gusto le colaboro").
Precios: Siempre menciona los valores en Pesos Colombianos con el formato oficial COP.
Reglas de Entrega:
- Si el cliente confirma su pedido y la tienda tiene activas ambas modalidades (Domicilio y Retiro), pregúntale: "¿Prefieres que te lo llevemos 🛵 A Domicilio o pasas a 🏪 Retirar en Tienda?".
- Si elige domicilio, el costo de envío es ${formatCOP(storeDelivery.costo_domicilio_cents)} y debes solicitar dirección y barrio.
- Si elige retirar en tienda, el costo de envío es $ 0.
Usa las herramientas siempre que sea necesario para consultar catálogo, modificar la canasta o confirmar el pedido.`;

  // 7. Intentar orquestación con DeepSeek API si hay clave disponible
  const deepseekResponse = await callDeepSeekChat(env, {
    messages: [
      { role: 'system', content: systemPrompt },
      ...(params.conversationHistory || []),
      { role: 'user', content: userMessage },
    ],
    tools: SARIN_TOOLS,
    tool_choice: 'auto',
  });

  if (deepseekResponse?.choices?.[0]?.message) {
    const choice = deepseekResponse.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          args = {};
        }

        let toolRes: any = null;
        if (call.function.name === 'consultar_catalogo_abastos') {
          toolRes = await executeConsultarCatalogo(db, negocioId, args);
        } else if (call.function.name === 'modificar_canasta_pedido') {
          toolRes = await executeModificarCanasta(db, negocioId, currentCart, args);
          if (toolRes.canasta) currentCart = toolRes.canasta;
        } else if (call.function.name === 'confirmar_pedido_cliente') {
          toolRes = await executeConfirmarPedido(db, negocioId, storeRow, currentCart, {
            customer_name: args.customer_name || customerName,
            customer_phone: customerPhone,
            delivery_type: args.delivery_type,
            delivery_address: args.delivery_address,
            delivery_neighborhood: args.delivery_neighborhood,
            payment_method: args.payment_method,
          });
          if (toolRes.exito) {
            orderCreatedResult = {
              id: toolRes.orderId,
              orderCode: toolRes.orderCode,
              totalCents: toolRes.totalCents,
              trackingToken: toolRes.trackingToken,
              trackingUrl: toolRes.trackingUrl,
              deliveryType: toolRes.deliveryType,
            };
            currentCart = []; // Se vacía la canasta tras confirmar
          }
        } else if (call.function.name === 'consultar_estado_o_escalar') {
          toolRes = await executeConsultarEstadoOEscalar(db, negocioId, convId ?? null, args);
        }

        toolsInvoked.push({
          tool: call.function.name,
          arguments: args,
          result: toolRes,
        });
      }

      // Generar respuesta explicativa a partir del resultado de herramientas
      if (orderCreatedResult) {
        finalReply = `¡Listo, vecino! Tu pedido ${orderCreatedResult.orderCode} ha sido registrado con éxito. Total: ${formatCOP(orderCreatedResult.totalCents)}. Puedes hacerle seguimiento en vivo aquí: ${orderCreatedResult.trackingUrl}`;
      } else if (msg.content) {
        finalReply = msg.content;
      } else {
        const lastTool = toolsInvoked[toolsInvoked.length - 1];
        finalReply =
          (lastTool?.result as any)?.mensaje ||
          `¡Con gusto, vecino! Tu canasta actual tiene ${currentCart.length} producto(s) por un subtotal de ${formatCOP(currentCart.reduce((a, b) => a + b.subtotalCents, 0))}.`;
      }
    } else if (msg.content) {
      finalReply = msg.content;
    }
  }

  // 8. Resilient Rule Engine Fallback (cuando no hay clave de DeepSeek o devolvió vacío)
  if (!finalReply) {
    const lower = userMessage.toLowerCase().trim();

    // Detección de escalamiento a tendero
    if (lower.includes('humano') || lower.includes('tendero') || lower.includes('dueño') || lower.includes('persona')) {
      const res = await executeConsultarEstadoOEscalar(db, negocioId, convId ?? null, {
        escalar_a_humano: true,
        motivo: 'Solicitud explícita del cliente',
      });
      finalReply = res.mensaje || 'He notificado al tendero para que te atienda personalmente.';
      toolsInvoked.push({ tool: 'consultar_estado_o_escalar', arguments: { escalar_a_humano: true }, result: res });
    }
    // Detección de consulta de pedido / estado
    else if (lower.includes('estado') || lower.includes('mi pedido') || lower.includes('#w-') || lower.includes('#k-')) {
      const matchCode = userMessage.match(/#[WK]-\d+/i);
      const res = await executeConsultarEstadoOEscalar(db, negocioId, convId ?? null, {
        order_code: matchCode ? matchCode[0].toUpperCase() : undefined,
      });
      finalReply = res.mensaje || `Tu pedido ${res.orderCode}: ${res.status}. Total: ${res.total_display}.`;
      toolsInvoked.push({ tool: 'consultar_estado_o_escalar', arguments: { order_code: matchCode?.[0] }, result: res });
    }
    // Detección de confirmación de pedido o selección de entrega
    else if (
      lower.includes('confirmar') ||
      lower.includes('pedir') ||
      lower.includes('domicilio') ||
      lower.includes('retirar') ||
      lower.includes('calle') ||
      lower.includes('carrera') ||
      lower.includes('cr ') ||
      lower.includes('cl ')
    ) {
      let deliveryType: 'delivery' | 'pickup_counter' | undefined = undefined;
      if (lower.includes('domicilio') || lower.includes('calle') || lower.includes('carrera') || lower.includes('cr ') || lower.includes('cl ')) {
        deliveryType = 'delivery';
      } else if (lower.includes('retirar') || lower.includes('tienda') || lower.includes('paso a recoger')) {
        deliveryType = 'pickup_counter';
      }

      // Si no hay productos en la canasta, agregar algún producto que el usuario haya mencionado
      if (currentCart.length === 0) {
        const catRes = await executeConsultarCatalogo(db, negocioId, { query: '' });
        if (catRes.productos.length > 0) {
          const sample = catRes.productos[0];
          currentCart.push({
            productId: sample.id,
            name: sample.name,
            unit: sample.unit,
            quantity: 1,
            priceCents: sample.price_cents,
            subtotalCents: sample.price_cents,
          });
        }
      }

      const res = await executeConfirmarPedido(db, negocioId, storeRow, currentCart, {
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_type: deliveryType,
        delivery_address: deliveryType === 'delivery' ? userMessage : undefined,
        delivery_neighborhood: storeRow.barrio,
      });

      toolsInvoked.push({ tool: 'confirmar_pedido_cliente', arguments: { delivery_type: deliveryType }, result: res });

      if (res.exito && res.orderId && res.orderCode && res.totalCents !== undefined && res.trackingToken && res.trackingUrl && res.deliveryType) {
        orderCreatedResult = {
          id: res.orderId,
          orderCode: res.orderCode,
          totalCents: res.totalCents,
          trackingToken: res.trackingToken,
          trackingUrl: res.trackingUrl,
          deliveryType: res.deliveryType,
        };
        currentCart = [];
        finalReply = res.mensaje;
      } else {
        finalReply = res.mensaje;
      }
    }
    // Detección de intención de compra (agregar productos a canasta)
    else if (
      lower.includes('quiero') ||
      lower.includes('dame') ||
      lower.includes('traeme') ||
      lower.includes('necesito') ||
      lower.includes('agrega')
    ) {
      // Extraer nombre del producto
      const cleaned = lower
        .replace(/quiero|dame|traeme|necesito|agrega|un|una|dos|tres|por favor/gi, '')
        .trim();
      const modRes = await executeModificarCanasta(db, negocioId, currentCart, {
        action: 'add',
        items: [{ name: cleaned || 'leche', quantity: 1 }],
      });
      currentCart = modRes.canasta;
      toolsInvoked.push({ tool: 'modificar_canasta_pedido', arguments: { action: 'add', name: cleaned }, result: modRes });

      finalReply = `¡Listo vecino! Agregué el producto a tu canasta. Tienes ${currentCart.length} producto(s) por un subtotal de ${modRes.subtotal_display}. ¿Deseas algo más o confirmamos el pedido?`;
    }
    // Consulta de catálogo o saludo
    else {
      const searchRes = await executeConsultarCatalogo(db, negocioId, { query: lower.replace(/hola|buenas|tienen|hay/g, '').trim() });
      toolsInvoked.push({ tool: 'consultar_catalogo_abastos', arguments: { query: lower }, result: searchRes });

      if (searchRes.productos.length > 0) {
        const top = searchRes.productos.slice(0, 3).map((p) => `• ${p.name} (${p.unit}): ${p.price_display}`).join('\n');
        finalReply = `¡Hola vecino! En ${storeRow.nombre} tenemos disponible:\n${top}\n\n¿Te alisto alguno de estos o qué más necesitas hoy?`;
      } else {
        finalReply = `¡Hola vecino! Bienvenido a ${storeRow.nombre}. ¿Qué le provoca llevar hoy? Cuénteme y con gusto le alisto su canasta de mercado.`;
      }
    }
  }

  // 9. Actualizar sesión y guardar mensaje de salida
  const outMsgId = `msg-out-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  await db
    .prepare(
      `INSERT INTO whatsapp_messages (
        id, conversation_id, negocio_id, direction, sender, message_text, message_type, metadata_json, created_at
      ) VALUES (?, ?, ?, 'outbound', 'bot_sarin', ?, 'text', ?, datetime('now'))`
    )
    .bind(
      outMsgId,
      convId,
      negocioId,
      finalReply,
      JSON.stringify({
        tools: toolsInvoked.map((t) => t.tool),
        orderCode: orderCreatedResult?.orderCode,
        trackingToken: orderCreatedResult?.trackingToken,
      })
    )
    .run();

  await db
    .prepare(
      `UPDATE whatsapp_conversations 
       SET cart_json = ?, 
           last_message_text = ?, 
           last_message_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ? AND negocio_id = ?`
    )
    .bind(JSON.stringify(currentCart), finalReply, convId, negocioId)
    .run();

  return {
    reply: finalReply,
    botPaused: false,
    cart: currentCart,
    orderCreated: orderCreatedResult,
    toolsInvoked,
  };
}
