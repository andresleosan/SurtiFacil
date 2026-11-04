import { PagesFunction, Env, D1Database } from '../types';
import { jsonResponse, errorResponse, handleOptions } from '../_lib/response';
import { authenticateRequest, AuthContext } from '../_lib/authMiddleware';

interface ProductInput {
  name: string;
  price_cents: number;
  stock?: number;
  min_stock?: number;
  unit?: string;
  category?: string;
  image_url?: string;
  supplier_id?: string | null;
  barcode?: string | null;
  visible_kiosco?: boolean | number;
  visible_tienda?: boolean | number;
  en_oferta?: boolean | number;
  precio_oferta_cents?: number | null;
  last_cost_cents?: number;
}

interface SaleItemInput {
  product_id: string;
  quantity: number;
  price_cents?: number; // Verificado autoritativamente en servidor
}

interface SaleInput {
  payment_method: 'cash' | 'card' | 'other' | 'credit';
  items: SaleItemInput[];
  credit_customer_id?: string;
  credit_customer_name?: string;
}

interface CreditCustomerInput {
  name: string;
  phone?: string;
  notes?: string;
}

interface CreditEntryInput {
  customer_id: string;
  type: 'debt' | 'payment';
  amount_cents: number;
  description?: string;
  sale_id?: string;
}

interface SupplierInput {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  lead_time_days?: number;
}

interface PurchaseOrderInput {
  supplier_id: string;
  supplier_name: string;
  expected_date?: string;
  notes?: string;
  items: Array<{
    product_id?: string;
    name: string;
    category?: string;
    quantity: number;
    unit_cost_cents: number;
  }>;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method.toUpperCase();

  // 1. Preflight CORS
  if (method === 'OPTIONS') {
    return handleOptions();
  }

  try {
    // 2. Health check (Público)
    if (path === '/health' && method === 'GET') {
      let d1Ok = false;
      try {
        if (env.DB) {
          const res = await env.DB.prepare('SELECT 1 as alive').first<{ alive: number }>();
          d1Ok = res?.alive === 1;
        }
      } catch (err) {
        console.error('Error conectando a D1 en /health:', err);
      }

      return jsonResponse({
        status: d1Ok ? 'ok' : 'degraded',
        service: 'SurtiFácil SaaS API',
        d1: d1Ok,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Provisión de usuario y endpoints compatibles de autenticación
    if (path === '/auth/sync-claims' && method === 'POST') {
      return jsonResponse({ success: true, message: 'Custom claims sincronizados correctamente.' });
    }

    if (path === '/auth/provision-user' && method === 'POST') {
      // Provisión de staff desde authService
      const auth = await authenticateRequest(request, env);
      const body = await request.json() as { email: string; displayName?: string; role?: string };
      const role = body.role || 'cashier';
      const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      await env.DB.prepare(
        "INSERT INTO users (id, negocio_id, email, display_name, role, is_super_admin, active, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, datetime('now'))"
      )
        .bind(newId, auth.negocioId, body.email.toLowerCase(), body.displayName || null, role)
        .run();

      return jsonResponse({
        id: newId,
        email: body.email.toLowerCase(),
        displayName: body.displayName || null,
        role,
        active: true,
        createdAt: new Date().toISOString(),
      });
    }

    if (path === '/auth/provision' && method === 'POST') {
      const auth = await authenticateRequest(request, env);
      return jsonResponse({
        user: auth.user,
        negocioId: auth.negocioId,
        provisioned: true,
      });
    }

    if (path === '/auth/me' && method === 'GET') {
      const auth = await authenticateRequest(request, env);
      const negocio = await env.DB.prepare(
        'SELECT id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, estado, plan_id, suscripcion_vence_en, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, datos_pago_offline, config_json FROM negocios WHERE id = ?'
      )
        .bind(auth.negocioId)
        .first();

      return jsonResponse({
        user: auth.user,
        negocio,
      });
    }

    // 4. Catálogo de Productos (/products)
    if (path === '/products' || path.startsWith('/products/')) {
      const auth = await authenticateRequest(request, env);
      const productId = path.replace(/^\/products\/?/, '');

      // GET /api/products
      if (method === 'GET' && !productId) {
        const category = url.searchParams.get('category');
        const search = url.searchParams.get('search');
        let query = 'SELECT * FROM products WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];

        if (category) {
          query += ' AND category = ?';
          params.push(category);
        }
        if (search) {
          query += ' AND (name LIKE ? OR barcode LIKE ?)';
          params.push(`%${search}%`, `%${search}%`);
        }
        query += ' ORDER BY name ASC';

        const result = await env.DB.prepare(query).bind(...params).all();
        return jsonResponse(result.results || []);
      }

      // POST /api/products
      if (method === 'POST') {
        const body = (await request.json()) as ProductInput;
        if (!body.name || typeof body.price_cents !== 'number' || body.price_cents < 0) {
          return errorResponse('Nombre y precio en centavos válidos son obligatorios.', 400);
        }

        const id = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await env.DB.prepare(
          `INSERT INTO products (
            id, negocio_id, name, price_cents, stock, min_stock, unit, category, image_url,
            supplier_id, barcode, visible_kiosco, visible_tienda, en_oferta, precio_oferta_cents,
            last_cost_cents, last_cost_source, last_cost_updated_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
        )
          .bind(
            id,
            auth.negocioId,
            body.name.trim(),
            Math.round(body.price_cents),
            body.stock ?? 0,
            body.min_stock ?? 5,
            body.unit || 'unidad',
            body.category || 'General',
            body.image_url || null,
            body.supplier_id || null,
            body.barcode || null,
            body.visible_kiosco !== undefined ? (body.visible_kiosco ? 1 : 0) : 1,
            body.visible_tienda !== undefined ? (body.visible_tienda ? 1 : 0) : 1,
            body.en_oferta ? 1 : 0,
            body.precio_oferta_cents ?? null,
            body.last_cost_cents ?? null,
            body.last_cost_cents ? 'fallback_price' : null
          )
          .run();

        const created = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND negocio_id = ?')
          .bind(id, auth.negocioId)
          .first();

        return jsonResponse(created, 201);
      }

      // PUT /api/products/:id
      if (method === 'PUT' && productId) {
        const body = (await request.json()) as Partial<ProductInput>;
        const existing = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND negocio_id = ?')
          .bind(productId, auth.negocioId)
          .first();

        if (!existing) {
          return errorResponse('Producto no encontrado.', 404);
        }

        await env.DB.prepare(
          `UPDATE products SET
            name = COALESCE(?, name),
            price_cents = COALESCE(?, price_cents),
            stock = COALESCE(?, stock),
            min_stock = COALESCE(?, min_stock),
            unit = COALESCE(?, unit),
            category = COALESCE(?, category),
            image_url = COALESCE(?, image_url),
            supplier_id = COALESCE(?, supplier_id),
            barcode = COALESCE(?, barcode),
            visible_kiosco = COALESCE(?, visible_kiosco),
            visible_tienda = COALESCE(?, visible_tienda),
            en_oferta = COALESCE(?, en_oferta),
            precio_oferta_cents = COALESCE(?, precio_oferta_cents),
            updated_at = datetime('now')
          WHERE id = ? AND negocio_id = ?`
        )
          .bind(
            body.name?.trim() ?? null,
            body.price_cents !== undefined ? Math.round(body.price_cents) : null,
            body.stock !== undefined ? body.stock : null,
            body.min_stock !== undefined ? body.min_stock : null,
            body.unit ?? null,
            body.category ?? null,
            body.image_url ?? null,
            body.supplier_id ?? null,
            body.barcode ?? null,
            body.visible_kiosco !== undefined ? (body.visible_kiosco ? 1 : 0) : null,
            body.visible_tienda !== undefined ? (body.visible_tienda ? 1 : 0) : null,
            body.en_oferta !== undefined ? (body.en_oferta ? 1 : 0) : null,
            body.precio_oferta_cents !== undefined ? body.precio_oferta_cents : null,
            productId,
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND negocio_id = ?')
          .bind(productId, auth.negocioId)
          .first();

        return jsonResponse(updated);
      }

      // DELETE /api/products/:id
      if (method === 'DELETE' && productId) {
        await env.DB.prepare('DELETE FROM products WHERE id = ? AND negocio_id = ?')
          .bind(productId, auth.negocioId)
          .run();

        return jsonResponse({ success: true, id: productId });
      }
    }

    // 5. Ventas y Cobro en Mostrador (/sales)
    if (path === '/sales') {
      const auth = await authenticateRequest(request, env);

      // GET /api/sales
      if (method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
        const sales = await env.DB.prepare(
          'SELECT * FROM sales WHERE negocio_id = ? ORDER BY created_at DESC LIMIT ?'
        )
          .bind(auth.negocioId, limit)
          .all();

        // Cargar ítems asociados para cada venta
        const saleList = sales.results || [];
        const enrichedSales = await Promise.all(
          saleList.map(async (sale: any) => {
            const items = await env.DB.prepare('SELECT * FROM sale_items WHERE sale_id = ?')
              .bind(sale.id)
              .all();
            return {
              ...sale,
              items: items.results || [],
            };
          })
        );

        return jsonResponse(enrichedSales);
      }

      // POST /api/sales — Transacción atómica en D1
      if (method === 'POST') {
        const body = (await request.json()) as SaleInput;
        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
          return errorResponse('La venta debe incluir al menos un producto.', 400);
        }

        if (body.payment_method === 'credit' && !body.credit_customer_id) {
          return errorResponse('Debe seleccionar un cliente de crédito para ventas fiadas.', 400);
        }

        // Consultar productos involucrados en la base de datos para autoridad de precios y stock
        const productIds = body.items.map((i) => i.product_id);
        const placeholders = productIds.map(() => '?').join(',');
        const dbProductsResult = await env.DB.prepare(
          `SELECT id, name, price_cents, stock, category, last_cost_cents FROM products WHERE negocio_id = ? AND id IN (${placeholders})`
        )
          .bind(auth.negocioId, ...productIds)
          .all<{ id: string; name: string; price_cents: number; stock: number; category: string; last_cost_cents: number | null }>();

        const productMap = new Map((dbProductsResult.results || []).map((p) => [p.id, p]));

        let computedTotalCents = 0;
        let computedTotalCostCents = 0;
        const preparedItems: Array<{
          id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          price_cents: number;
          subtotal_cents: number;
          unit_cost_cents: number;
          cost_subtotal_cents: number;
          category: string;
        }> = [];

        for (const item of body.items) {
          const dbProd = productMap.get(item.product_id);
          if (!dbProd) {
            return errorResponse(`Producto ${item.product_id} no encontrado en este local.`, 404);
          }
          if (item.quantity <= 0) {
            return errorResponse('La cantidad vendida debe ser mayor a 0.', 400);
          }

          const unitPrice = dbProd.price_cents;
          const subtotal = unitPrice * item.quantity;
          const unitCost = dbProd.last_cost_cents ?? Math.round(unitPrice * 0.7);
          const costSubtotal = unitCost * item.quantity;

          computedTotalCents += subtotal;
          computedTotalCostCents += costSubtotal;

          preparedItems.push({
            id: `sitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            product_id: dbProd.id,
            product_name: dbProd.name,
            quantity: item.quantity,
            price_cents: unitPrice,
            subtotal_cents: subtotal,
            unit_cost_cents: unitCost,
            cost_subtotal_cents: costSubtotal,
            category: dbProd.category || 'General',
          });
        }

        const saleId = `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const batchStatements: any[] = [];

        // 1. Insertar la venta
        batchStatements.push(
          env.DB.prepare(
            `INSERT INTO sales (
              id, negocio_id, total_cents, payment_method, credit_customer_id, credit_customer_name,
              total_cost_cents, created_by_uid, created_by_role, schema_version, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2, datetime('now'))`
          ).bind(
            saleId,
            auth.negocioId,
            computedTotalCents,
            body.payment_method,
            body.credit_customer_id || null,
            body.credit_customer_name || null,
            computedTotalCostCents,
            auth.user.id,
            auth.user.role
          )
        );

        // 2. Insertar cada ítem y descontar stock
        for (const it of preparedItems) {
          batchStatements.push(
            env.DB.prepare(
              `INSERT INTO sale_items (
                id, sale_id, product_id, product_name, quantity, price_cents, subtotal_cents,
                unit_cost_cents, cost_subtotal_cents, category
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              it.id,
              saleId,
              it.product_id,
              it.product_name,
              it.quantity,
              it.price_cents,
              it.subtotal_cents,
              it.unit_cost_cents,
              it.cost_subtotal_cents,
              it.category
            )
          );

          batchStatements.push(
            env.DB.prepare(
              'UPDATE products SET stock = stock - ?, updated_at = datetime(\'now\') WHERE id = ? AND negocio_id = ?'
            ).bind(it.quantity, it.product_id, auth.negocioId)
          );
        }

        // 3. Si fue fiado, crear cargo en credit_entries y sumar al balance del cliente
        if (body.payment_method === 'credit' && body.credit_customer_id) {
          const entryId = `centry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          batchStatements.push(
            env.DB.prepare(
              `INSERT INTO credit_entries (
                id, negocio_id, customer_id, type, amount_cents, description, sale_id, created_by_uid, created_by_role, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            ).bind(
              entryId,
              auth.negocioId,
              body.credit_customer_id,
              'debt',
              computedTotalCents,
              'Venta a crédito en mostrador',
              saleId,
              auth.user.id,
              auth.user.role
            )
          );

          batchStatements.push(
            env.DB.prepare(
              "UPDATE credit_customers SET balance_cents = balance_cents + ?, last_entry_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
            ).bind(computedTotalCents, body.credit_customer_id, auth.negocioId)
          );
        }

        // Ejecutar toda la venta de manera atómica
        await env.DB.batch(batchStatements);

        return jsonResponse(
          {
            id: saleId,
            negocio_id: auth.negocioId,
            total_cents: computedTotalCents,
            total_cost_cents: computedTotalCostCents,
            payment_method: body.payment_method,
            items: preparedItems,
            created_at: new Date().toISOString(),
          },
          201
        );
      }
    }

    // 6. Libro de Fiados (/credits/customers y /credits/entries)
    if (path.startsWith('/credits/customers')) {
      const auth = await authenticateRequest(request, env);
      const customerId = path.replace(/^\/credits\/customers\/?/, '');

      if (method === 'GET' && !customerId) {
        const res = await env.DB.prepare(
          'SELECT * FROM credit_customers WHERE negocio_id = ? ORDER BY name ASC'
        )
          .bind(auth.negocioId)
          .all();
        return jsonResponse(res.results || []);
      }

      if (method === 'POST') {
        const body = (await request.json()) as CreditCustomerInput;
        if (!body.name || !body.name.trim()) {
          return errorResponse('El nombre del cliente es obligatorio.', 400);
        }
        const id = `ccust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await env.DB.prepare(
          `INSERT INTO credit_customers (
            id, negocio_id, name, phone, notes, balance_cents, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, 1, datetime('now'), datetime('now'))`
        )
          .bind(id, auth.negocioId, body.name.trim(), body.phone || null, body.notes || null)
          .run();

        const created = await env.DB.prepare('SELECT * FROM credit_customers WHERE id = ? AND negocio_id = ?')
          .bind(id, auth.negocioId)
          .first();

        return jsonResponse(created, 201);
      }

      if (method === 'PUT' && customerId) {
        const body = (await request.json()) as Partial<CreditCustomerInput & { active: boolean }>;
        await env.DB.prepare(
          `UPDATE credit_customers SET
            name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            notes = COALESCE(?, notes),
            active = COALESCE(?, active),
            updated_at = datetime('now')
          WHERE id = ? AND negocio_id = ?`
        )
          .bind(
            body.name?.trim() ?? null,
            body.phone ?? null,
            body.notes ?? null,
            body.active !== undefined ? (body.active ? 1 : 0) : null,
            customerId,
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare('SELECT * FROM credit_customers WHERE id = ? AND negocio_id = ?')
          .bind(customerId, auth.negocioId)
          .first();

        return jsonResponse(updated);
      }
    }

    if (path.startsWith('/credits/entries')) {
      const auth = await authenticateRequest(request, env);

      if (method === 'GET') {
        const customerId = url.searchParams.get('customer_id');
        let query = 'SELECT * FROM credit_entries WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];

        if (customerId) {
          query += ' AND customer_id = ?';
          params.push(customerId);
        }
        query += ' ORDER BY created_at DESC';

        const res = await env.DB.prepare(query).bind(...params).all();
        return jsonResponse(res.results || []);
      }

      if (method === 'POST') {
        const body = (await request.json()) as CreditEntryInput;
        if (!body.customer_id || !body.type || !body.amount_cents || body.amount_cents <= 0) {
          return errorResponse('Cliente, tipo y monto mayor a 0 son obligatorios.', 400);
        }

        const customer = await env.DB.prepare(
          'SELECT id, balance_cents FROM credit_customers WHERE id = ? AND negocio_id = ?'
        )
          .bind(body.customer_id, auth.negocioId)
          .first<{ id: string; balance_cents: number }>();

        if (!customer) {
          return errorResponse('Cliente de fiados no encontrado.', 404);
        }

        // Validación: un abono no puede ser mayor al saldo actual
        if (body.type === 'payment' && body.amount_cents > customer.balance_cents) {
          return errorResponse(
            `El abono ($${body.amount_cents / 100}) no puede superar la deuda actual ($${customer.balance_cents / 100}).`,
            400
          );
        }

        const delta = body.type === 'debt' ? body.amount_cents : -body.amount_cents;
        const entryId = `centry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO credit_entries (
              id, negocio_id, customer_id, type, amount_cents, description, sale_id, created_by_uid, created_by_role, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(
            entryId,
            auth.negocioId,
            body.customer_id,
            body.type,
            body.amount_cents,
            body.description || (body.type === 'payment' ? 'Abono a deuda' : 'Cargo fiado'),
            body.sale_id || null,
            auth.user.id,
            auth.user.role
          ),
          env.DB.prepare(
            "UPDATE credit_customers SET balance_cents = balance_cents + ?, last_entry_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
          ).bind(delta, body.customer_id, auth.negocioId),
        ]);

        return jsonResponse({
          id: entryId,
          customer_id: body.customer_id,
          type: body.type,
          amount_cents: body.amount_cents,
          new_balance_cents: customer.balance_cents + delta,
        }, 201);
      }
    }

    // 7. Proveedores (/suppliers)
    if (path.startsWith('/suppliers')) {
      const auth = await authenticateRequest(request, env);
      const supplierId = path.replace(/^\/suppliers\/?/, '');

      if (method === 'GET' && !supplierId) {
        const res = await env.DB.prepare('SELECT * FROM suppliers WHERE negocio_id = ? ORDER BY name ASC')
          .bind(auth.negocioId)
          .all();
        return jsonResponse(res.results || []);
      }

      if (method === 'POST') {
        const body = (await request.json()) as SupplierInput;
        if (!body.name || !body.name.trim()) {
          return errorResponse('El nombre del proveedor es obligatorio.', 400);
        }
        const id = `supp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await env.DB.prepare(
          `INSERT INTO suppliers (
            id, negocio_id, name, contact_name, phone, email, address, category, lead_time_days, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
          .bind(
            id,
            auth.negocioId,
            body.name.trim(),
            body.contact_name || null,
            body.phone || null,
            body.email || null,
            body.address || null,
            body.category || 'General',
            body.lead_time_days ?? 0
          )
          .run();

        const created = await env.DB.prepare('SELECT * FROM suppliers WHERE id = ? AND negocio_id = ?')
          .bind(id, auth.negocioId)
          .first();

        return jsonResponse(created, 201);
      }

      if (method === 'PUT' && supplierId) {
        const body = (await request.json()) as Partial<SupplierInput & { active: boolean }>;
        await env.DB.prepare(
          `UPDATE suppliers SET
            name = COALESCE(?, name),
            contact_name = COALESCE(?, contact_name),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            category = COALESCE(?, category),
            lead_time_days = COALESCE(?, lead_time_days),
            active = COALESCE(?, active)
          WHERE id = ? AND negocio_id = ?`
        )
          .bind(
            body.name?.trim() ?? null,
            body.contact_name ?? null,
            body.phone ?? null,
            body.email ?? null,
            body.address ?? null,
            body.category ?? null,
            body.lead_time_days !== undefined ? body.lead_time_days : null,
            body.active !== undefined ? (body.active ? 1 : 0) : null,
            supplierId,
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare('SELECT * FROM suppliers WHERE id = ? AND negocio_id = ?')
          .bind(supplierId, auth.negocioId)
          .first();

        return jsonResponse(updated);
      }
    }

    // 8. Órdenes de Compra a Proveedores (/orders)
    if (path.startsWith('/orders')) {
      const auth = await authenticateRequest(request, env);
      const orderId = path.replace(/^\/orders\/?/, '');

      if (method === 'GET' && !orderId) {
        const res = await env.DB.prepare(
          'SELECT * FROM purchase_orders WHERE negocio_id = ? ORDER BY created_at DESC'
        )
          .bind(auth.negocioId)
          .all();

        const orders = res.results || [];
        const enriched = await Promise.all(
          orders.map(async (o: any) => {
            const items = await env.DB.prepare('SELECT * FROM purchase_order_items WHERE order_id = ?')
              .bind(o.id)
              .all();
            return {
              ...o,
              items: items.results || [],
            };
          })
        );
        return jsonResponse(enriched);
      }

      if (method === 'POST') {
        const body = (await request.json()) as PurchaseOrderInput;
        if (!body.supplier_id || !body.items || body.items.length === 0) {
          return errorResponse('Proveedor e ítems son obligatorios.', 400);
        }

        const id = `porder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        let totalCents = 0;
        for (const it of body.items) {
          totalCents += it.quantity * it.unit_cost_cents;
        }

        const batch: any[] = [
          env.DB.prepare(
            `INSERT INTO purchase_orders (
              id, negocio_id, supplier_id, supplier_name, status, total_cents, expected_date, notes, created_at
            ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, datetime('now'))`
          ).bind(
            id,
            auth.negocioId,
            body.supplier_id,
            body.supplier_name,
            totalCents,
            body.expected_date || null,
            body.notes || null
          ),
        ];

        for (const it of body.items) {
          const itemId = `poitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          batch.push(
            env.DB.prepare(
              `INSERT INTO purchase_order_items (
                id, order_id, product_id, name, category, quantity, received_quantity, unit_cost_cents, is_new_product
              ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)`
            ).bind(
              itemId,
              id,
              it.product_id || null,
              it.name,
              it.category || 'General',
              it.quantity,
              it.unit_cost_cents
            )
          );
        }

        await env.DB.batch(batch);
        return jsonResponse({ id, total_cents: totalCents, status: 'draft' }, 201);
      }

      if (method === 'PUT' && orderId) {
        const body = (await request.json()) as { status?: string; received_total_cents?: number };
        const order = await env.DB.prepare('SELECT * FROM purchase_orders WHERE id = ? AND negocio_id = ?')
          .bind(orderId, auth.negocioId)
          .first<{ id: string; status: string; total_cents: number }>();

        if (!order) {
          return errorResponse('Orden de compra no encontrada.', 404);
        }

        const batch: any[] = [];
        // Si el estado cambia a 'received', actualizar stock y last_cost_cents de los productos
        if (body.status === 'received' && order.status !== 'received') {
          const items = await env.DB.prepare('SELECT * FROM purchase_order_items WHERE order_id = ?')
            .bind(orderId)
            .all<{ product_id: string | null; quantity: number; unit_cost_cents: number }>();

          for (const it of items.results || []) {
            if (it.product_id) {
              batch.push(
                env.DB.prepare(
                  `UPDATE products SET
                    stock = stock + ?,
                    last_cost_cents = ?,
                    last_cost_source = 'purchase',
                    last_cost_updated_at = datetime('now'),
                    updated_at = datetime('now')
                  WHERE id = ? AND negocio_id = ?`
                ).bind(it.quantity, it.unit_cost_cents, it.product_id, auth.negocioId)
              );
            }
          }

          batch.push(
            env.DB.prepare(
              "UPDATE purchase_orders SET status = 'received', received_date = datetime('now'), received_total_cents = total_cents WHERE id = ? AND negocio_id = ?"
            ).bind(orderId, auth.negocioId)
          );
        } else {
          batch.push(
            env.DB.prepare(
              'UPDATE purchase_orders SET status = COALESCE(?, status) WHERE id = ? AND negocio_id = ?'
            ).bind(body.status || null, orderId, auth.negocioId)
          );
        }

        await env.DB.batch(batch);
        return jsonResponse({ success: true, order_id: orderId, status: body.status || order.status });
      }
    }

    // 9. Gestión de Usuarios y Staff (/users)
    if (path.startsWith('/users')) {
      const auth = await authenticateRequest(request, env);
      const targetUserId = path.replace(/^\/users\/?/, '');

      // Solo administradores pueden gestionar usuarios
      if (auth.user.role !== 'admin' && !auth.user.isSuperAdmin) {
        return errorResponse('Acceso denegado: solo el administrador puede gestionar empleados.', 403);
      }

      if (method === 'GET' && !targetUserId) {
        const users = await env.DB.prepare(
          'SELECT id, negocio_id, email, display_name, role, is_super_admin, active, created_at, last_login FROM users WHERE negocio_id = ? AND (deleted_at IS NULL)'
        )
          .bind(auth.negocioId)
          .all();
        return jsonResponse(users.results || []);
      }

      if (method === 'POST') {
        const body = (await request.json()) as { email: string; display_name?: string; role?: string };
        if (!body.email) {
          return errorResponse('El correo electrónico es obligatorio.', 400);
        }
        const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await env.DB.prepare(
          `INSERT INTO users (
            id, negocio_id, email, display_name, role, is_super_admin, active, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, 1, datetime('now'))`
        )
          .bind(id, auth.negocioId, body.email.toLowerCase(), body.display_name || null, body.role || 'cashier')
          .run();

        const created = await env.DB.prepare('SELECT id, negocio_id, email, display_name, role, active FROM users WHERE id = ?')
          .bind(id)
          .first();

        return jsonResponse(created, 201);
      }

      if (method === 'PUT' && targetUserId) {
        const body = (await request.json()) as { role?: string; active?: boolean; display_name?: string };
        await env.DB.prepare(
          `UPDATE users SET
            role = COALESCE(?, role),
            active = COALESCE(?, active),
            display_name = COALESCE(?, display_name)
          WHERE id = ? AND negocio_id = ?`
        )
          .bind(
            body.role || null,
            body.active !== undefined ? (body.active ? 1 : 0) : null,
            body.display_name || null,
            targetUserId,
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare('SELECT id, email, display_name, role, active FROM users WHERE id = ?')
          .bind(targetUserId)
          .first();

        return jsonResponse(updated);
      }

      if (method === 'DELETE' && targetUserId) {
        await env.DB.prepare(
          "UPDATE users SET active = 0, deleted_at = datetime('now'), deleted_by_uid = ? WHERE id = ? AND negocio_id = ?"
        )
          .bind(auth.user.id, targetUserId, auth.negocioId)
          .run();

        return jsonResponse({ success: true, id: targetUserId });
      }
    }

    return errorResponse(`Ruta API no encontrada: ${method} /api${path}`, 404);
  } catch (error: any) {
    console.error('Error en Pages Functions API:', error);
    const message = error?.message || 'Error interno en el servidor.';
    const status = message.includes('token') || message.includes('autorización') || message.includes('denegado')
      ? 401
      : 500;
    return errorResponse(message, status);
  }
};
