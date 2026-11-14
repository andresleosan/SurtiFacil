import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from '../../functions/api/[[route]]';
import { D1Database, D1PreparedStatement, D1Result, Env } from '../../functions/types';

// Simulador en memoria de Cloudflare D1 para pruebas unitarias
class MockD1Database implements D1Database {
  public tables: {
    negocios: any[];
    users: any[];
    products: any[];
    sales: any[];
    sale_items: any[];
    credit_customers: any[];
    credit_entries: any[];
    suppliers: any[];
    purchase_orders: any[];
    purchase_order_items: any[];
    combos: any[];
    customer_orders: any[];
    whatsapp_conversations: any[];
    whatsapp_messages: any[];
    cash_closings: any[];
    cash_expenses: any[];
  };

  constructor() {
    this.tables = {
      negocios: [
        {
          id: 'surtifacil',
          slug: 'surtifacil',
          nombre: 'SurtiFácil Abastos Central',
          barrio: 'Centro',
          ciudad: 'Medellín',
          estado: 'activo',
          plan_id: 'enterprise',
        },
      ],
      users: [
        {
          id: 'admin-1',
          negocio_id: 'surtifacil',
          email: 'admin@surtifacil.com',
          display_name: 'Admin Test',
          role: 'admin',
          is_super_admin: 1,
          active: 1,
        },
        {
          id: 'cashier-1',
          negocio_id: 'surtifacil',
          email: 'cajero@surtifacil.com',
          display_name: 'Cajero Test',
          role: 'cashier',
          is_super_admin: 0,
          active: 1,
        },
      ],
      products: [
        {
          id: 'p-1',
          negocio_id: 'surtifacil',
          name: 'Arroz Diana 1kg',
          price_cents: 450000,
          stock: 20,
          min_stock: 5,
          unit: 'libra',
          category: 'Granos y Despensa',
          last_cost_cents: 350000,
          barcode: '7701234567890',
          visible_kiosco: 1,
          visible_tienda: 1,
        },
        {
          id: 'p-other-store',
          negocio_id: 'otra-tienda',
          name: 'Producto Secreto Otra Tienda',
          price_cents: 999900,
          stock: 10,
          min_stock: 2,
          unit: 'unidad',
          category: 'General',
          last_cost_cents: 800000,
          barcode: '9999999999999',
          visible_kiosco: 1,
          visible_tienda: 1,
        },
      ],
      sales: [],
      sale_items: [],
      credit_customers: [
        {
          id: 'cust-1',
          negocio_id: 'surtifacil',
          name: 'Doña Gloria',
          phone: '3001234567',
          balance_cents: 5000000, // Debe $50.000 COP
          active: 1,
        },
      ],
      credit_entries: [],
      suppliers: [
        {
          id: 'supp-1',
          negocio_id: 'surtifacil',
          name: 'Distribuidora Paisa',
          active: 1,
        },
      ],
      purchase_orders: [],
      purchase_order_items: [],
      combos: [],
      customer_orders: [],
      whatsapp_conversations: [
        {
          id: 'conv-1',
          negocio_id: 'surtifacil',
          phone_number: '+573001234567',
          customer_name: 'Vecino Test',
          status: 'active',
          bot_active: 1,
          paused_until: null,
          cart_json: '[]',
          last_message_text: 'Hola vecino',
          last_message_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      whatsapp_messages: [],
      cash_closings: [],
      cash_expenses: [],
    };
  }

  prepare(query: string): D1PreparedStatement {
    const db = this;
    let boundValues: any[] = [];

    const stmt: D1PreparedStatement = {
      bind(...values: any[]) {
        boundValues = values;
        return stmt;
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const res = await stmt.all<T>();
        if (!res.results || res.results.length === 0) return null;
        if (colName) return ((res.results[0] as any)[colName] ?? null) as T;
        return res.results[0] as T;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const q = query.trim();

        if (q.includes('SELECT 1 as alive')) {
          return { results: [{ alive: 1 } as unknown as T], success: true };
        }

        if (q.startsWith('SELECT id, negocio_id, email') && q.includes('FROM users WHERE id = ?')) {
          const user = db.tables.users.find((u) => u.id === boundValues[0]);
          return { results: user ? [user as T] : [], success: true };
        }

        if (q.startsWith('SELECT id, negocio_id, email') && q.includes('FROM users WHERE email = ?')) {
          const user = db.tables.users.find((u) => u.email === boundValues[0]);
          return { results: user ? [user as T] : [], success: true };
        }

        if (q.includes('FROM negocios WHERE id = ?')) {
          const n = db.tables.negocios.find((neg) => neg.id === boundValues[0]);
          return { results: n ? [n as T] : [], success: true };
        }

        if (q.includes('FROM negocios WHERE slug = ?')) {
          const n = db.tables.negocios.find((neg) => neg.slug === boundValues[0]);
          return { results: n ? [n as T] : [], success: true };
        }

        if (q.includes('FROM negocios n') || q.includes('FROM negocios ORDER BY')) {
          const res = db.tables.negocios.map((n) => ({
            ...n,
            total_products: db.tables.products.filter((p) => p.negocio_id === n.id).length,
            total_users: db.tables.users.filter((u) => u.negocio_id === n.id).length,
            total_sales: db.tables.sales.filter((s) => s.negocio_id === n.id).length,
          }));
          return { results: res as T[], success: true };
        }

        if (q.includes('FROM products WHERE negocio_id = ?') && q.includes('id IN')) {
          // Extract product IDs
          const storeId = boundValues[0];
          const ids = boundValues.slice(1);
          const prods = db.tables.products.filter(
            (p) => p.negocio_id === storeId && ids.includes(p.id)
          );
          return { results: prods as T[], success: true };
        }

        if (q.includes('FROM products') && q.includes('WHERE id = ? AND negocio_id = ?')) {
          const p = db.tables.products.find(
            (prod) => prod.id === boundValues[0] && (!boundValues[1] || prod.negocio_id === boundValues[1])
          );
          return { results: p ? [p as T] : [], success: true };
        }

        if (q.includes('FROM products') && q.includes('negocio_id = ?')) {
          const prods = db.tables.products.filter((p) => p.negocio_id === boundValues[0]);
          return { results: prods as T[], success: true };
        }

        if (q.includes('FROM customer_orders WHERE id = ?')) {
          const o = db.tables.customer_orders.find((ord) => ord.id === boundValues[0]);
          return { results: o ? [o as T] : [], success: true };
        }

        if (q.includes('FROM customer_orders WHERE tracking_token = ?')) {
          const o = db.tables.customer_orders.find((ord) => ord.tracking_token === boundValues[0]);
          return { results: o ? [o as T] : [], success: true };
        }

        if (q.includes('SELECT COUNT(*) as count FROM customer_orders')) {
          const count = db.tables.customer_orders.filter(
            (o) => o.negocio_id === boundValues[0] && (!boundValues[1] || o.source === boundValues[1])
          ).length;
          return { results: [{ count } as unknown as T], success: true };
        }

        if (q.includes('FROM customer_orders WHERE negocio_id = ?')) {
          let list = db.tables.customer_orders.filter((o) => o.negocio_id === boundValues[0]);
          if (boundValues[1]) {
            list = list.filter((o) => o.status === boundValues[1]);
          }
          return { results: list as T[], success: true };
        }

        if (q.includes('FROM products WHERE id = ? AND negocio_id = ?')) {
          const p = db.tables.products.find(
            (prod) => prod.id === boundValues[0] && prod.negocio_id === boundValues[1]
          );
          return { results: p ? [p as T] : [], success: true };
        }

        if (q.includes('FROM sales') && q.includes("payment_method = 'cash'")) {
          const sales = db.tables.sales.filter(
            (s) => s.negocio_id === boundValues[0] && s.payment_method === 'cash'
          );
          const totalCash = sales.reduce((acc, s) => acc + (s.total_cents || s.total || 0), 0);
          return { results: [{ count: sales.length, total_cash_cents: totalCash } as unknown as T], success: true };
        }

        if (q.includes('FROM credit_entries') && q.includes("type = 'payment'")) {
          const entries = db.tables.credit_entries.filter(
            (e) => e.negocio_id === boundValues[0] && e.type === 'payment'
          );
          const totalCash = entries.reduce((acc, e) => acc + (e.amount_cents || 0), 0);
          return { results: [{ count: entries.length, total_credit_cash_cents: totalCash } as unknown as T], success: true };
        }

        if (q.includes('FROM sales WHERE id = ? AND negocio_id = ?')) {
          const s = db.tables.sales.find(
            (sale) => sale.id === boundValues[0] && sale.negocio_id === boundValues[1]
          );
          return { results: s ? [s as T] : [], success: true };
        }

        if (q.includes('FROM sales WHERE negocio_id = ?')) {
          const s = db.tables.sales.filter((sale) => sale.negocio_id === boundValues[0]);
          return { results: s as T[], success: true };
        }

        if (q.includes('FROM sale_items WHERE sale_id = ?')) {
          const items = db.tables.sale_items.filter((it) => it.sale_id === boundValues[0]);
          return { results: items as T[], success: true };
        }

        if (q.includes('FROM credit_customers WHERE negocio_id = ?')) {
          const c = db.tables.credit_customers.filter((cust) => cust.negocio_id === boundValues[0]);
          return { results: c as T[], success: true };
        }

        if (q.includes('FROM credit_customers WHERE id = ? AND negocio_id = ?')) {
          const c = db.tables.credit_customers.find(
            (cust) => cust.id === boundValues[0] && cust.negocio_id === boundValues[1]
          );
          return { results: c ? [c as T] : [], success: true };
        }

        if (q.includes('FROM suppliers WHERE negocio_id = ?')) {
          const s = db.tables.suppliers.filter((sup) => sup.negocio_id === boundValues[0]);
          return { results: s as T[], success: true };
        }

        if (q.includes('FROM purchase_orders WHERE id = ? AND negocio_id = ?')) {
          const o = db.tables.purchase_orders.find(
            (ord) => ord.id === boundValues[0] && ord.negocio_id === boundValues[1]
          );
          return { results: o ? [o as T] : [], success: true };
        }

        if (q.includes('FROM purchase_order_items WHERE order_id = ?')) {
          const items = db.tables.purchase_order_items.filter((it) => it.order_id === boundValues[0]);
          return { results: items as T[], success: true };
        }

        if (q.includes('FROM users WHERE negocio_id = ?')) {
          const u = db.tables.users.filter(
            (user) => user.negocio_id === boundValues[0] && !user.deleted_at
          );
          return { results: u as T[], success: true };
        }

        if (q.includes('FROM combos WHERE id = ? AND negocio_id = ?')) {
          const c = db.tables.combos.find(
            (cb: any) => cb.id === boundValues[0] && cb.negocio_id === boundValues[1]
          );
          return { results: c ? [c as T] : [], success: true };
        }

        if (q.includes('FROM combos WHERE negocio_id = ?')) {
          const c = db.tables.combos.filter((cb: any) => cb.negocio_id === boundValues[0]);
          return { results: c as T[], success: true };
        }

        if (q.includes('SELECT cuota_ia_total, cuota_ia_usada, estado FROM negocios WHERE id = ?')) {
          const n = db.tables.negocios.find((neg) => neg.id === boundValues[0]);
          return {
            results: n
              ? ([
                  {
                    cuota_ia_total: n.cuota_ia_total ?? 300,
                    cuota_ia_usada: n.cuota_ia_usada ?? 0,
                    estado: n.estado || 'activo',
                  },
                ] as unknown as T[])
              : [],
            success: true,
          };
        }

        if (q.includes('FROM whatsapp_conversations') && q.includes('id = ? AND negocio_id = ?')) {
          const c = db.tables.whatsapp_conversations.find(
            (conv) => conv.id === boundValues[0] && conv.negocio_id === boundValues[1]
          );
          return { results: c ? [c as T] : [], success: true };
        }

        if (q.includes('FROM whatsapp_conversations') && q.includes('phone_number = ?')) {
          const c = db.tables.whatsapp_conversations.find(
            (conv) => conv.negocio_id === boundValues[0] && conv.phone_number === boundValues[1]
          );
          return { results: c ? [c as T] : [], success: true };
        }

        if (q.includes('FROM whatsapp_conversations') && q.includes('negocio_id = ?')) {
          const list = db.tables.whatsapp_conversations.filter((c) => c.negocio_id === boundValues[0]);
          return { results: list as T[], success: true };
        }

        if (q.includes('FROM whatsapp_messages') && q.includes('conversation_id = ?')) {
          const list = db.tables.whatsapp_messages.filter(
            (m) => m.conversation_id === boundValues[0] && (!boundValues[1] || m.negocio_id === boundValues[1])
          );
          return { results: list as T[], success: true };
        }

        if (q.includes('FROM cash_closings') && q.includes('ORDER BY closed_at DESC LIMIT 1')) {
          const list = db.tables.cash_closings
            .filter((c) => c.negocio_id === boundValues[0])
            .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());
          return { results: list.length > 0 ? [list[0] as T] : [], success: true };
        }

        if (q.includes('FROM cash_closings') && q.includes('ORDER BY closed_at DESC')) {
          const list = db.tables.cash_closings
            .filter((c) => c.negocio_id === boundValues[0])
            .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());
          return { results: list as T[], success: true };
        }

        if (q.includes('FROM cash_closings') && q.includes('WHERE id = ? AND negocio_id = ?')) {
          const c = db.tables.cash_closings.find(
            (cl) => cl.id === boundValues[0] && cl.negocio_id === boundValues[1]
          );
          return { results: c ? [c as T] : [], success: true };
        }

        if (q.includes('SELECT COALESCE(MAX(closing_number), 0) + 1 as next_number FROM cash_closings')) {
          const closings = db.tables.cash_closings.filter((c) => c.negocio_id === boundValues[0]);
          const maxNum = closings.reduce((max, c) => Math.max(max, c.closing_number || 0), 0);
          return { results: [{ next_number: maxNum + 1 } as unknown as T], success: true };
        }

        if (q.includes('FROM cash_expenses') && q.includes('total_expenses_cash_cents')) {
          const expenses = db.tables.cash_expenses.filter(
            (e) =>
              e.negocio_id === boundValues[0] &&
              e.payment_method === 'cash' &&
              (!boundValues[1] || e.created_at >= boundValues[1])
          );
          const totalExpensesCashCents = expenses.reduce((acc, e) => acc + (e.amount_cents || 0), 0);
          return {
            results: [{ count: expenses.length, total_expenses_cash_cents: totalExpensesCashCents } as unknown as T],
            success: true,
          };
        }

        if (q.includes('FROM cash_expenses WHERE id = ? AND negocio_id = ?')) {
          const e = db.tables.cash_expenses.find(
            (exp) => exp.id === boundValues[0] && exp.negocio_id === boundValues[1]
          );
          return { results: e ? [e as T] : [], success: true };
        }

        if (q.includes('FROM cash_expenses WHERE negocio_id = ?')) {
          let list = db.tables.cash_expenses.filter((exp) => exp.negocio_id === boundValues[0]);
          if (boundValues[1]) {
            list = list.filter((exp) => exp.created_at >= boundValues[1]);
          }
          list = list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          return { results: list as T[], success: true };
        }

        return { results: [], success: true };
      },
      async run() {
        const q = query.trim();

        if (q.startsWith('INSERT INTO products')) {
          const [id, negocio_id, name, price_cents, stock, min_stock, unit, category, image_url, supplier_id, barcode, visible_kiosco, visible_tienda, en_oferta, precio_oferta_cents, last_cost_cents] = boundValues;
          db.tables.products.push({
            id,
            negocio_id,
            name,
            price_cents,
            stock,
            min_stock,
            unit,
            category,
            image_url,
            supplier_id,
            barcode,
            visible_kiosco,
            visible_tienda,
            en_oferta,
            precio_oferta_cents,
            last_cost_cents,
          });
        }

        if (q.includes('UPDATE products') && q.includes('stock = stock - ?')) {
          const [qty, prodId, negId] = boundValues;
          const prod = db.tables.products.find((p) => p.id === prodId && p.negocio_id === negId);
          if (prod) prod.stock -= qty;
        }

        if (q.includes('UPDATE products') && q.includes('stock = stock + ?')) {
          const [qty, lastCost, prodId, negId] = boundValues;
          const prod = db.tables.products.find((p) => p.id === prodId && p.negocio_id === negId);
          if (prod) {
            prod.stock += qty;
            prod.last_cost_cents = lastCost;
          }
        }

        if (q.startsWith('INSERT INTO sales')) {
          const [id, negocio_id, total_cents, payment_method, credit_customer_id, credit_customer_name, total_cost_cents, created_by_uid, created_by_role] = boundValues;
          db.tables.sales.push({
            id,
            negocio_id,
            total_cents,
            payment_method,
            credit_customer_id,
            credit_customer_name,
            total_cost_cents,
            created_by_uid,
            created_by_role,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('INSERT INTO sale_items')) {
          const [id, sale_id, product_id, product_name, quantity, price_cents, subtotal_cents, unit_cost_cents, cost_subtotal_cents, category] = boundValues;
          db.tables.sale_items.push({
            id,
            sale_id,
            product_id,
            product_name,
            quantity,
            price_cents,
            subtotal_cents,
            unit_cost_cents,
            cost_subtotal_cents,
            category,
          });
        }

        if (q.startsWith('INSERT INTO credit_entries')) {
          const [id, negocio_id, customer_id, type, amount_cents, description, sale_id, created_by_uid, created_by_role] = boundValues;
          db.tables.credit_entries.push({
            id,
            negocio_id,
            customer_id,
            type,
            amount_cents,
            description,
            sale_id,
            created_by_uid,
            created_by_role,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('UPDATE credit_customers SET balance_cents = balance_cents + ?')) {
          const [delta, customer_id, negId] = boundValues;
          const cust = db.tables.credit_customers.find(
            (c) => c.id === customer_id && c.negocio_id === negId
          );
          if (cust) cust.balance_cents += delta;
        }

        if (q.startsWith('INSERT INTO purchase_orders')) {
          const [id, negocio_id, supplier_id, supplier_name, total_cents, expected_date, notes] = boundValues;
          db.tables.purchase_orders.push({
            id,
            negocio_id,
            supplier_id,
            supplier_name,
            status: 'draft',
            total_cents,
            expected_date,
            notes,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('INSERT INTO purchase_order_items')) {
          const [id, order_id, product_id, name, category, quantity, unit_cost_cents] = boundValues;
          db.tables.purchase_order_items.push({
            id,
            order_id,
            product_id,
            name,
            category,
            quantity,
            received_quantity: 0,
            unit_cost_cents,
          });
        }

        if (q.includes("UPDATE purchase_orders SET status = 'received'")) {
          const [orderId, negId] = boundValues;
          const ord = db.tables.purchase_orders.find(
            (o) => o.id === orderId && o.negocio_id === negId
          );
          if (ord) ord.status = 'received';
        }

        if (q.startsWith('DELETE FROM products WHERE id = ? AND negocio_id = ?')) {
          const [prodId, negId] = boundValues;
          db.tables.products = db.tables.products.filter(
            (p) => !(p.id === prodId && p.negocio_id === negId)
          );
        }

        if (q.startsWith('CREATE TABLE IF NOT EXISTS combos') || q.startsWith('CREATE TABLE IF NOT EXISTS negocios')) {
          return { success: true };
        }

        if (q.startsWith('INSERT INTO negocios')) {
          const [id, slug, nombre, barrio, phone, direccion, planId, expiresAt, cuotaIA, configJson] = boundValues;
          db.tables.negocios.push({
            id,
            slug,
            nombre,
            barrio,
            ciudad: 'Medellín',
            telefono_whatsapp: phone,
            direccion,
            estado: 'activo',
            plan_id: planId,
            suscripcion_vence_en: expiresAt,
            cuota_ia_total: cuotaIA,
            cuota_ia_usada: 0,
            costo_domicilio_cents: 0,
            config_json: configJson,
          });
        }

        if (q.startsWith('INSERT INTO users')) {
          const [id, negocio_id, email, display_name] = boundValues;
          db.tables.users.push({
            id,
            negocio_id,
            email,
            display_name,
            role: 'admin',
            is_super_admin: 0,
            active: 1,
          });
        }

        if (q.includes('suscripcion_vence_en = ?') && q.includes('UPDATE negocios')) {
          const [expiresAt, cuotaIA, targetId] = boundValues;
          const neg = db.tables.negocios.find((n: any) => n.id === targetId);
          if (neg) {
            neg.suscripcion_vence_en = expiresAt;
            neg.cuota_ia_total = cuotaIA;
            neg.estado = 'activo';
          }
        }

        if (q.startsWith('UPDATE negocios SET')) {
          const [nombre, barrio, direccion, telefono, horario, costoDom, datosPago, configJson, negId] = boundValues;
          const neg = db.tables.negocios.find((n: any) => n.id === negId);
          if (neg) {
            if (nombre !== null) neg.nombre = nombre;
            if (barrio !== null) neg.barrio = barrio;
            if (direccion !== null) neg.direccion = direccion;
            if (telefono !== null) neg.telefono_whatsapp = telefono;
            if (horario !== null) neg.horario = horario;
            if (costoDom !== null) neg.costo_domicilio_cents = costoDom;
            if (datosPago !== null) neg.datos_pago_offline = datosPago;
            neg.config_json = configJson;
          }
        }

        if (q.startsWith('INSERT INTO combos')) {
          const [id, negocio_id, name, description, price_cents, items_json, image_url, active, visible_kiosco, visible_tienda] = boundValues;
          db.tables.combos.push({
            id,
            negocio_id,
            name,
            description,
            price_cents,
            items_json,
            image_url,
            active,
            visible_kiosco,
            visible_tienda,
          });
        }

        if (q.startsWith('DELETE FROM combos WHERE id = ? AND negocio_id = ?')) {
          const [comboId, negId] = boundValues;
          db.tables.combos = db.tables.combos.filter((c: any) => !(c.id === comboId && c.negocio_id === negId));
        }

        if (q.startsWith('INSERT INTO customer_orders')) {
          const [
            id, negocio_id, order_code, source, customer_name, customer_phone,
            delivery_type, delivery_address, delivery_neighborhood, payment_method,
            items_json, total_cents, tracking_token
          ] = boundValues;
          db.tables.customer_orders.push({
            id,
            negocio_id,
            order_code,
            source,
            customer_name,
            customer_phone,
            delivery_type,
            delivery_address,
            delivery_neighborhood,
            payment_method,
            items_json,
            total_cents,
            status: 'pending',
            tracking_token,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('UPDATE customer_orders')) {
          const orderId = boundValues[boundValues.length - 2];
          const ord = db.tables.customer_orders.find((o) => o.id === orderId);
          if (ord) {
            ord.status = boundValues[0];
            if (boundValues.length >= 4) {
              ord.sale_id = boundValues[1];
            }
          }
        }

        if (q.startsWith('INSERT INTO whatsapp_conversations')) {
          const [id, negocio_id, phone_number, customer_name] = boundValues;
          db.tables.whatsapp_conversations.push({
            id,
            negocio_id,
            phone_number,
            customer_name,
            status: 'active',
            bot_active: 1,
            paused_until: null,
            cart_json: '[]',
            last_message_text: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('INSERT INTO whatsapp_messages')) {
          const [id, conversation_id, negocio_id, direction, sender, message_text, message_type, metadata_json] = boundValues;
          db.tables.whatsapp_messages.push({
            id,
            conversation_id,
            negocio_id,
            direction,
            sender,
            message_text,
            message_type,
            metadata_json: metadata_json || '{}',
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('UPDATE whatsapp_conversations')) {
          if (q.includes('bot_active = 1')) {
            const [convId, negId] = boundValues;
            const conv = db.tables.whatsapp_conversations.find((c) => c.id === convId && c.negocio_id === negId);
            if (conv) {
              conv.bot_active = 1;
              conv.status = 'active';
              conv.paused_until = null;
            }
          } else if (q.includes('bot_active = 0')) {
            const [pausedHours, convId, negId] = boundValues;
            const conv = db.tables.whatsapp_conversations.find((c) => c.id === convId && c.negocio_id === negId);
            if (conv) {
              conv.bot_active = 0;
              conv.status = 'paused';
              conv.paused_until = new Date(Date.now() + Number(pausedHours) * 3600 * 1000).toISOString();
            }
          } else if (q.includes('cart_json = ?')) {
            const [cartJson, lastMsg, convId, negId] = boundValues;
            const conv = db.tables.whatsapp_conversations.find((c) => c.id === convId && c.negocio_id === negId);
            if (conv) {
              conv.cart_json = cartJson;
              conv.last_message_text = lastMsg;
            }
          } else if (q.includes('last_message_text = ?')) {
            const [lastMsg, convId, negId] = boundValues;
            const conv = db.tables.whatsapp_conversations.find((c) => c.id === convId && c.negocio_id === negId);
            if (conv) {
              conv.last_message_text = lastMsg;
            }
          }
        }

        if (q.startsWith('INSERT INTO cash_closings')) {
          const [id, negocio_id, closing_number, opened_at, closed_at, closed_by_uid, closed_by_name, initial_cash_cents, sales_cash_cents, credit_payments_cash_cents, expected_cash_cents, counted_cash_cents, difference_cents, status, breakdown_json, notes, total_sales_count, expenses_cash_cents] = boundValues;
          db.tables.cash_closings.push({
            id,
            negocio_id,
            closing_number,
            opened_at,
            closed_at,
            closed_by_uid,
            closed_by_name,
            initial_cash_cents,
            sales_cash_cents,
            credit_payments_cash_cents,
            expected_cash_cents,
            counted_cash_cents,
            difference_cents,
            status,
            breakdown_json,
            notes,
            total_sales_count,
            expenses_cash_cents: expenses_cash_cents ?? 0,
            created_at: new Date().toISOString(),
          });
        }

        if (q.startsWith('INSERT INTO cash_expenses')) {
          const [id, negocio_id, category, description, beneficiary, amount_cents, payment_method, created_by_uid, created_by_name, created_at] = boundValues;
          db.tables.cash_expenses.push({
            id,
            negocio_id,
            category,
            description,
            beneficiary,
            amount_cents,
            payment_method,
            created_by_uid,
            created_by_name,
            created_at,
          });
        }

        if (q.startsWith('DELETE FROM cash_expenses WHERE id = ? AND negocio_id = ?')) {
          const [expenseId, negId] = boundValues;
          db.tables.cash_expenses = db.tables.cash_expenses.filter(
            (e) => !(e.id === expenseId && e.negocio_id === negId)
          );
        }

        if (q.includes('UPDATE negocios') && q.includes('cuota_ia_usada = cuota_ia_usada + 1')) {
          const [negId] = boundValues;
          const neg = db.tables.negocios.find((n) => n.id === negId);
          if (neg) neg.cuota_ia_usada = (neg.cuota_ia_usada ?? 0) + 1;
        }

        return { success: true };
      },
      async raw() {
        return [];
      },
    };
    return stmt;
  }

  async batch(statements: any[]) {
    const results: any[] = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  async dump() {
    return new ArrayBuffer(0);
  }

  async exec(query: string) {
    return { success: true };
  }
}

function createMockContext(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body: any = null,
  db: MockD1Database
) {
  const reqInit: RequestInit = {
    method,
    headers: new Headers(headers),
  };
  if (body) {
    reqInit.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  const req = new Request(url, reqInit);

  const env: Env = {
    DB: db,
    FIREBASE_PROJECT_ID: 'surtifacilapp',
  };

  return {
    request: req,
    env,
    params: {},
    data: {},
    functionPath: '/api',
    waitUntil: vi.fn(),
    next: vi.fn(),
  };
}

describe('Cloudflare Pages Functions API (/api/*)', () => {
  let db: MockD1Database;

  beforeEach(() => {
    db = new MockD1Database();
  });

  it('GET /api/health retorna 200 OK con d1: true', async () => {
    const ctx = createMockContext('GET', 'http://localhost/api/health', {}, null, db);
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.d1).toBe(true);
  });

  it('rechaza llamadas sin token de autenticación con 401', async () => {
    const ctx = createMockContext('GET', 'http://localhost/api/products', {}, null, db);
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('token');
  });

  it('GET /api/products filtra estrictamente por el negocio_id del usuario', async () => {
    const ctx = createMockContext(
      'GET',
      'http://localhost/api/products',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const products = await res.json();
    expect(products.length).toBe(1);
    expect(products[0].name).toBe('Arroz Diana 1kg');
    // Verifica que el producto de 'otra-tienda' no se filtre jamás
    expect(products.some((p: any) => p.name === 'Producto Secreto Otra Tienda')).toBe(false);
  });

  it('POST /api/products crea un producto validando datos y asociando negocio_id', async () => {
    const newProd = {
      name: 'Leche Colanta 1L',
      price_cents: 380000,
      stock: 30,
      unit: 'litro',
      category: 'Lácteos y Huevos',
    };
    const ctx = createMockContext(
      'POST',
      'http://localhost/api/products',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      newProd,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.name).toBe('Leche Colanta 1L');
    expect(created.negocio_id).toBe('surtifacil');
    expect(created.stock).toBe(30);
  });

  it('POST /api/sales registra venta atómica, descuenta stock y autoriza precios en servidor', async () => {
    const salePayload = {
      payment_method: 'cash',
      items: [
        {
          product_id: 'p-1',
          quantity: 2,
        },
      ],
    };

    const ctx = createMockContext(
      'POST',
      'http://localhost/api/sales',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      salePayload,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(201);
    const sale = await res.json();
    // 2 * 450000 = 900000 ($9.000 COP)
    expect(sale.total_cents).toBe(900000);
    expect(sale.items.length).toBe(1);

    // Stock de Arroz Diana debió reducirse de 20 a 18
    const arroz = db.tables.products.find((p) => p.id === 'p-1');
    expect(arroz?.stock).toBe(18);
  });

  it('POST /api/sales registra venta a crédito aumentando saldo del cliente de fiados', async () => {
    const salePayload = {
      payment_method: 'credit',
      credit_customer_id: 'cust-1',
      credit_customer_name: 'Doña Gloria',
      items: [
        {
          product_id: 'p-1',
          quantity: 1, // 450000 ($4.500 COP)
        },
      ],
    };

    const ctx = createMockContext(
      'POST',
      'http://localhost/api/sales',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      salePayload,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(201);

    // Saldo inicial 5000000 + 450000 = 5450000
    const donaGloria = db.tables.credit_customers.find((c) => c.id === 'cust-1');
    expect(donaGloria?.balance_cents).toBe(5450000);
    expect(db.tables.credit_entries.length).toBe(1);
    expect(db.tables.credit_entries[0].type).toBe('debt');
  });

  it('POST /api/credits/entries valida que el abono no exceda la deuda actual', async () => {
    const overpayment = {
      customer_id: 'cust-1',
      type: 'payment',
      amount_cents: 6000000, // Deuda es 5000000
      description: 'Abono excesivo',
    };

    const ctx = createMockContext(
      'POST',
      'http://localhost/api/credits/entries',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      overpayment,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toContain('no puede superar la deuda actual');
  });

  it('PUT /api/orders/:id con status received incrementa stock y actualiza costo de compra', async () => {
    // 1. Crear orden
    const createCtx = createMockContext(
      'POST',
      'http://localhost/api/orders',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {
        supplier_id: 'supp-1',
        supplier_name: 'Distribuidora Paisa',
        items: [
          {
            product_id: 'p-1',
            name: 'Arroz Diana 1kg',
            quantity: 15,
            unit_cost_cents: 360000,
          },
        ],
      },
      db
    );
    const createRes = await onRequest(createCtx as any);
    expect(createRes.status).toBe(201);
    const order = await createRes.json();

    // 2. Recibir orden
    const receiveCtx = createMockContext(
      'PUT',
      `http://localhost/api/orders/${order.id}`,
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      { status: 'received' },
      db
    );
    const receiveRes = await onRequest(receiveCtx as any);
    expect(receiveRes.status).toBe(200);

    // Stock de Arroz Diana debió aumentar 20 + 15 = 35 y costo a 360000
    const arroz = db.tables.products.find((p) => p.id === 'p-1');
    expect(arroz?.stock).toBe(35);
    expect(arroz?.last_cost_cents).toBe(360000);
  });

  it('GET /api/users bloquea acceso a cajeros y permite a administradores', async () => {
    // Cajero intentando listar usuarios
    const cashierCtx = createMockContext(
      'GET',
      'http://localhost/api/users',
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      null,
      db
    );
    const cashierRes = await onRequest(cashierCtx as any);
    expect(cashierRes.status).toBe(403);

    // Administrador listando usuarios
    const adminCtx = createMockContext(
      'GET',
      'http://localhost/api/users',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const adminRes = await onRequest(adminCtx as any);
    expect(adminRes.status).toBe(200);
    const users = await adminRes.json();
    expect(users.length).toBe(2);
  });

  it('GET y PUT /api/settings actualiza y retorna la configuración del local y modalidades de entrega', async () => {
    // 1. Obtener configuración inicial
    const getCtx = createMockContext(
      'GET',
      'http://localhost/api/settings',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const getRes = await onRequest(getCtx as any);
    expect(getRes.status).toBe(200);
    const settings = await getRes.json();
    expect(settings.slug).toBe('surtifacil');

    // 2. Modificar con PUT
    const putCtx = createMockContext(
      'PUT',
      'http://localhost/api/settings',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {
        nombre: 'SurtiFácil Abastos El Poblado',
        barrio: 'El Poblado',
        costo_domicilio_cents: 450000,
        permite_domicilio: true,
        permite_retiro: false,
        slogan: 'Calidad vecinal en Medellín',
      },
      db
    );
    const putRes = await onRequest(putCtx as any);
    expect(putRes.status).toBe(200);
    const updated = await putRes.json();
    expect(updated.nombre).toBe('SurtiFácil Abastos El Poblado');
    expect(updated.barrio).toBe('El Poblado');
    expect(updated.costo_domicilio_cents).toBe(450000);
    expect(JSON.parse(updated.config_json).permite_retiro).toBe(false);
  });

  it('GET y POST /api/combos gestiona combos y kits de mercado con aislamiento multi-tenant', async () => {
    // 1. Crear combo
    const createCtx = createMockContext(
      'POST',
      'http://localhost/api/combos',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {
        name: 'Combo Desayuno Paisa',
        description: 'Arepas tela, quesito y chocolate',
        price_cents: 950000,
        items: [
          { product_id: 'p-1', product_name: 'Arroz Diana 1kg', quantity: 2, unit_price_cents: 450000 },
        ],
      },
      db
    );
    const createRes = await onRequest(createCtx as any);
    expect(createRes.status).toBe(201);
    const combo = await createRes.json();
    expect(combo.name).toBe('Combo Desayuno Paisa');
    expect(combo.price_cents).toBe(950000);

    // 2. Listar combos
    const listCtx = createMockContext(
      'GET',
      'http://localhost/api/combos',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const listRes = await onRequest(listCtx as any);
    expect(listRes.status).toBe(200);
    const combos = await listRes.json();
    expect(combos.length).toBe(1);
    expect(combos[0].name).toBe('Combo Desayuno Paisa');
  });

  it('POST /api/registro-negocio registra una nueva tienda con plan y crea su admin', async () => {
    const regCtx = createMockContext(
      'POST',
      'http://localhost/api/registro-negocio',
      {},
      {
        nombre: 'Minimercado Don Paisa',
        slug: 'minimercado-don-paisa',
        owner_name: 'Don Paisa',
        email: 'donpaisa@abastos.co',
        telefono_whatsapp: '3009998877',
        barrio: 'San Javier (Comuna 13)',
        plan_id: 'quincenal_15d',
      },
      db
    );
    const regRes = await onRequest(regCtx as any);
    expect(regRes.status).toBe(201);
    const resBody = await regRes.json();
    expect(resBody.success).toBe(true);
    expect(resBody.negocio.slug).toBe('minimercado-don-paisa');
    expect(resBody.negocio.plan_id).toBe('quincenal_15d');
    expect(resBody.negocio.cuota_ia_total).toBe(1500);

    // Intentar registrar el mismo slug debe retornar 409
    const dupCtx = createMockContext(
      'POST',
      'http://localhost/api/registro-negocio',
      {},
      {
        nombre: 'Otro Minimercado',
        slug: 'minimercado-don-paisa',
        email: 'otro@abastos.co',
        telefono_whatsapp: '3001112233',
        plan_id: 'prueba_3d',
      },
      db
    );
    const dupRes = await onRequest(dupCtx as any);
    expect(dupRes.status).toBe(409);
  });

  it('GET /api/super-admin/negocios y /renovar gestionan la plataforma y suscripciones', async () => {
    // 1. Usuario normal (cajero) intentando acceder a SuperAdmin -> 403
    const cashierCtx = createMockContext(
      'GET',
      'http://localhost/api/super-admin/negocios',
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      null,
      db
    );
    const forbiddenRes = await onRequest(cashierCtx as any);
    expect(forbiddenRes.status).toBe(403);

    // 2. SuperAdmin accediendo -> 200 con KPIs y lista
    const superAdminCtx = createMockContext(
      'GET',
      'http://localhost/api/super-admin/negocios',
      { Authorization: 'Bearer mock:admin-1:andres.san1404@gmail.com:admin' },
      null,
      db
    );
    const saRes = await onRequest(superAdminCtx as any);
    expect(saRes.status).toBe(200);
    const saData = await saRes.json();
    expect(saData.kpis).toBeDefined();
    expect(saData.kpis.totalTiendas).toBeGreaterThanOrEqual(1);
    expect(saData.negocios.length).toBeGreaterThanOrEqual(1);

    // 3. Renovar negocio
    const renewCtx = createMockContext(
      'POST',
      'http://localhost/api/super-admin/negocios/surtifacil/renovar',
      { Authorization: 'Bearer mock:admin-1:andres.san1404@gmail.com:admin' },
      { days: 7, add_cuota_ia: 700 },
      db
    );
    const renewRes = await onRequest(renewCtx as any);
    expect(renewRes.status).toBe(200);
    const renewed = await renewRes.json();
    expect(renewed.estado).toBe('activo');
  });

  it('GET /api/public/store/:slug devuelve la tienda y catálogo activo para Kiosco', async () => {
    const pubCtx = createMockContext(
      'GET',
      'http://localhost/api/public/store/surtifacil',
      {},
      null,
      db
    );
    const pubRes = await onRequest(pubCtx as any);
    expect(pubRes.status).toBe(200);
    const pubData = await pubRes.json();
    expect(pubData.store.slug).toBe('surtifacil');
    expect(pubData.store.nombre).toBe('SurtiFácil Abastos Central');
    expect(Array.isArray(pubData.products)).toBe(true);
    expect(pubData.products.length).toBeGreaterThanOrEqual(1);
  });

  it('POST y GET /api/customer-orders gestiona el flujo de Kiosco y conversión a venta', async () => {
    // 1. Crear pedido público desde Kiosco
    const orderPayload = {
      slug: 'surtifacil',
      source: 'kiosk',
      customer_name: 'Don Carlos Vecino',
      customer_phone: '3001234567',
      delivery_type: 'pickup_counter',
      payment_method: 'cash',
      items: [
        {
          product_id: 'p-1',
          quantity: 2,
        },
      ],
    };

    const createCtx = createMockContext(
      'POST',
      'http://localhost/api/customer-orders',
      {},
      orderPayload,
      db
    );
    const createRes = await onRequest(createCtx as any);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    expect(createData.order.order_code).toMatch(/^#K-\d+/);
    expect(createData.order.customer_name).toBe('Don Carlos Vecino');
    expect(createData.order.status).toBe('pending');
    expect(createData.order.tracking_token).toBeDefined();

    const orderId = createData.order.id;

    // 2. El tendero consulta la lista de pedidos en el POS
    const listCtx = createMockContext(
      'GET',
      'http://localhost/api/customer-orders?status=pending',
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      null,
      db
    );
    const listRes = await onRequest(listCtx as any);
    expect(listRes.status).toBe(200);
    const orders = await listRes.json();
    expect(orders.some((o: any) => o.id === orderId)).toBe(true);

    // 3. El tendero factura el pedido en 1 clic desde el POS
    const convertCtx = createMockContext(
      'POST',
      `http://localhost/api/customer-orders/${orderId}/convert-to-sale`,
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      { payment_method: 'cash' },
      db
    );
    const convertRes = await onRequest(convertCtx as any);
    expect(convertRes.status).toBe(200);
    const convertData = await convertRes.json();
    expect(convertData.success).toBe(true);
    expect(convertData.sale_id).toBeDefined();
  });

  it('verifica el webhook de WhatsApp Cloud API mediante challenge GET', async () => {
    const db = new MockD1Database();
    const ctx = createMockContext(
      'GET',
      'http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=surtifacil-webhook-secret&hub.challenge=test_challenge_123',
      {},
      null,
      db
    );

    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('test_challenge_123');
  });

  it('recibe mensajes de WhatsApp vía webhook y responde con 200 OK', async () => {
    const db = new MockD1Database();
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Doña Gloria' } }],
                messages: [
                  {
                    from: '+573001234567',
                    text: { body: 'Hola vecino, ¿tiene arroz?' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const ctx = createMockContext(
      'POST',
      'http://localhost/api/webhooks/whatsapp',
      {},
      payload,
      db
    );

    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('permite al tendero listar conversaciones, enviar mensajes y alternar el Bot Sarin', async () => {
    const db = new MockD1Database();

    // 1. Listar conversaciones
    const listCtx = createMockContext(
      'GET',
      'http://localhost/api/whatsapp/conversations',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const listRes = await onRequest(listCtx as any);
    expect(listRes.status).toBe(200);
    const convs = await listRes.json();
    expect(Array.isArray(convs)).toBe(true);
    expect(convs.length).toBeGreaterThan(0);

    // 2. Enviar mensaje del tendero a cliente
    const sendCtx = createMockContext(
      'POST',
      'http://localhost/api/whatsapp/send',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      { conversationId: 'conv-1', message: '¡Hola! Ya te alisto el pedido.' },
      db
    );
    const sendRes = await onRequest(sendCtx as any);
    expect(sendRes.status).toBe(200);
    const sendData = await sendRes.json();
    expect(sendData.success).toBe(true);
    expect(sendData.id).toMatch(/^wamid-/);

    // 3. Alternar estado del bot (pausar para atención personal)
    const toggleCtx = createMockContext(
      'POST',
      'http://localhost/api/whatsapp/conversations/conv-1/toggle-bot',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      { botActive: false, pausedHours: 2 },
      db
    );
    const toggleRes = await onRequest(toggleCtx as any);
    expect(toggleRes.status).toBe(200);
    const toggleData = await toggleRes.json();
    expect(toggleData.success).toBe(true);
    expect(toggleData.botActive).toBe(false);
  });

  it('procesa simulación interactiva de Sarin y chat web vecinal', async () => {
    const db = new MockD1Database();

    // 1. Simulación desde panel staff
    const simCtx = createMockContext(
      'POST',
      'http://localhost/api/whatsapp/simulate',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {
        phoneNumber: '+573009998877',
        customerName: 'Don Jaime',
        messageText: 'Hola vecino, ¿qué tiene de despensa?',
      },
      db
    );
    const simRes = await onRequest(simCtx as any);
    expect(simRes.status).toBe(200);
    const simData = await simRes.json();
    expect(simData.success).toBe(true);
    expect(simData.reply).toBeDefined();

    // 2. Chat web público con Sarin
    const webCtx = createMockContext(
      'POST',
      'http://localhost/api/ai/sarin-chat',
      {},
      {
        slug: 'surtifacil',
        customerName: 'Vecina Web',
        messageText: '¿Tienen arroz disponible?',
      },
      db
    );
    const webRes = await onRequest(webCtx as any);
    expect(webRes.status).toBe(200);
    const webData = await webRes.json();
    expect(webData.success).toBe(true);
    expect(webData.reply).toContain('Arroz');
  });

  it('calcula resumen de turno, registra arqueo físico COP y lista actas de cierre', async () => {
    const db = new MockD1Database();

    // 1. Simular una venta en efectivo en la base de datos
    db.tables.sales.push({
      id: 'sale-test-cash',
      negocio_id: 'surtifacil',
      total_cents: 3500000, // $ 35.000 COP
      payment_method: 'cash',
      created_at: new Date().toISOString(),
    });

    // 2. GET /api/cash-closings/summary
    const summaryCtx = createMockContext(
      'GET',
      'http://localhost/api/cash-closings/summary?initial_base_cents=10000000',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const summaryRes = await onRequest(summaryCtx as any);
    expect(summaryRes.status).toBe(200);
    const summaryData = await summaryRes.json();
    expect(summaryData.initial_cash_cents).toBe(10000000); // $ 100.000 COP
    expect(summaryData.sales_cash_cents).toBe(3500000); // $ 35.000 COP
    expect(summaryData.expected_cash_cents).toBe(13500000); // $ 135.000 COP

    // 3. POST /api/cash-closings con denominaciones COP contadas exactamente (cuadrado)
    // 1 billete de 100.000 ($100k = 10000000 cents) + 1 billete de 20.000 ($20k = 2000000 cents) + 15 monedas de 1.000 ($15k = 1500000 cents) = $ 135.000 COP
    const closingCtx = createMockContext(
      'POST',
      'http://localhost/api/cash-closings',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {
        initial_cash_cents: 10000000,
        breakdown: {
          bills: {
            '100000': 1,
            '20000': 1,
          },
          coins: {
            '1000': 15,
          },
        },
        notes: 'Arqueo de turno tarde sin novedades',
      },
      db
    );
    const closingRes = await onRequest(closingCtx as any);
    expect(closingRes.status).toBe(201);
    const closingData = await closingRes.json();
    expect(closingData.counted_cash_cents).toBe(13500000);
    expect(closingData.expected_cash_cents).toBe(13500000);
    expect(closingData.difference_cents).toBe(0);
    expect(closingData.status).toBe('balanced');
    expect(closingData.closing_number).toBe(1);

    // 4. GET /api/cash-closings
    const listCtx = createMockContext(
      'GET',
      'http://localhost/api/cash-closings',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const listRes = await onRequest(listCtx as any);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(Array.isArray(listData)).toBe(true);
    expect(listData.length).toBe(1);
    expect(listData[0].notes).toBe('Arqueo de turno tarde sin novedades');
  });

  it('obtiene una venta individual por ID para emisión de tirilla térmica', async () => {
    const db = new MockD1Database();
    db.tables.sales.push({
      id: 'sale-single-1',
      negocio_id: 'surtifacil',
      total_cents: 1250000,
      payment_method: 'cash',
      created_at: new Date().toISOString(),
    });
    db.tables.sale_items.push({
      id: 'item-1',
      sale_id: 'sale-single-1',
      product_id: 'p-1',
      product_name: 'Arroz Diana 1kg',
      quantity: 2,
      price_cents: 420000,
      subtotal_cents: 840000,
    });

    const ctx = createMockContext(
      'GET',
      'http://localhost/api/sales/sale-single-1',
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      null,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('sale-single-1');
    expect(data.items.length).toBe(1);
    expect(data.items[0].product_name).toBe('Arroz Diana 1kg');
  });

  it('GET /api/integrations/status reporta el estado de DeepSeek, WhatsApp y D1', async () => {
    const ctx = createMockContext(
      'GET',
      'http://localhost/api/integrations/status',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.database.status).toBe('connected');
    expect(data.database.engine).toContain('D1');
    expect(data.deepseek.model).toBe('deepseek-chat');
    expect(data.whatsapp.webhook_url).toContain('/api/webhooks/whatsapp');
  });

  it('POST /api/integrations/test-deepseek responde con modo simulado cuando no hay API key', async () => {
    const ctx = createMockContext(
      'POST',
      'http://localhost/api/integrations/test-deepseek',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {},
      db
    );
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.mode).toBe('simulated_heuristic');
  });

  it('registra gastos de caja menor, los descuenta del arqueo COP y permite anularlos con aislamiento multi-tenant', async () => {
    const db = new MockD1Database();

    // 1. Registrar venta en efectivo de $ 40.000 COP
    db.tables.sales.push({
      id: 'sale-exp-1',
      negocio_id: 'surtifacil',
      total_cents: 4000000,
      payment_method: 'cash',
      created_at: new Date().toISOString(),
    });

    // 2. Registrar un gasto en efectivo de $ 15.000 COP vía POST /api/cash-expenses
    const createExpenseCtx = createMockContext(
      'POST',
      'http://localhost/api/cash-expenses',
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      {
        category: 'proveedor_contado',
        description: 'Pago de arepas y panadería del día',
        beneficiary: 'Panadería El Trigo',
        amount_cents: 1500000,
        payment_method: 'cash',
      },
      db
    );
    const createRes = await onRequest(createExpenseCtx as any);
    expect(createRes.status).toBe(201);
    const createdExpense = await createRes.json();
    expect(createdExpense.amount_cents).toBe(1500000);
    expect(createdExpense.negocio_id).toBe('surtifacil');

    // 3. Registrar un gasto por transferencia (NO debe descontar del efectivo de caja)
    const createTransferExpenseCtx = createMockContext(
      'POST',
      'http://localhost/api/cash-expenses',
      { Authorization: 'Bearer mock:cashier-1:cajero@surtifacil.com:cashier' },
      {
        category: 'servicios_aseo',
        description: 'Pago factura internet Nequi',
        amount_cents: 5000000,
        payment_method: 'transfer',
      },
      db
    );
    const transferRes = await onRequest(createTransferExpenseCtx as any);
    expect(transferRes.status).toBe(201);

    // 4. GET /api/cash-closings/summary debe descontar únicamente los $ 15.000 en efectivo:
    // Base $ 100.000 + Ventas $ 40.000 - Gastos Efectivo $ 15.000 = $ 125.000 (12500000 cents)
    const summaryCtx = createMockContext(
      'GET',
      'http://localhost/api/cash-closings/summary?initial_base_cents=10000000',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const summaryRes = await onRequest(summaryCtx as any);
    expect(summaryRes.status).toBe(200);
    const summaryData = await summaryRes.json();
    expect(summaryData.expenses_cash_cents).toBe(1500000);
    expect(summaryData.expenses_cash_count).toBe(1);
    expect(summaryData.expected_cash_cents).toBe(12500000);

    // 5. POST /api/cash-closings con $ 125.000 contados debe dar Cuadrado ($ 0) y guardar expenses_cash_cents
    const closingCtx = createMockContext(
      'POST',
      'http://localhost/api/cash-closings',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      {
        initial_cash_cents: 10000000,
        breakdown: {
          bills: { '100000': 1, '20000': 1, '5000': 1 },
          coins: {},
        },
      },
      db
    );
    const closingRes = await onRequest(closingCtx as any);
    expect(closingRes.status).toBe(201);
    const closingData = await closingRes.json();
    expect(closingData.expected_cash_cents).toBe(12500000);
    expect(closingData.expenses_cash_cents).toBe(1500000);
    expect(closingData.status).toBe('balanced');

    // 6. DELETE /api/cash-expenses/:id elimina el gasto
    const deleteCtx = createMockContext(
      'DELETE',
      `http://localhost/api/cash-expenses/${createdExpense.id}`,
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const deleteRes = await onRequest(deleteCtx as any);
    expect(deleteRes.status).toBe(200);

    const listCtx = createMockContext(
      'GET',
      'http://localhost/api/cash-expenses',
      { Authorization: 'Bearer mock:admin-1:admin@surtifacil.com:admin' },
      null,
      db
    );
    const listRes = await onRequest(listCtx as any);
    const listData = await listRes.json();
    expect(listData.length).toBe(1);
    expect(listData[0].payment_method).toBe('transfer');
  });
});
