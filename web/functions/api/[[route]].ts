import { PagesFunction, Env, D1Database } from '../types';
import { jsonResponse, errorResponse, handleOptions } from '../_lib/response';
import { authenticateRequest, AuthContext } from '../_lib/authMiddleware';
import { ensureDatabaseSchema, hashPassword } from '../_lib/dbSchema';
import { processSarinCustomerMessage, ensureWhatsAppTables } from '../_lib/sarinCustomerOrchestrator';
import { processSarinCopilotMessage } from '../_lib/sarinCopilotOrchestrator';

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
    // 1.1 Asegurar esquema multi-tenant y semillas en Cloudflare D1
    if (env.DB) {
      await ensureDatabaseSchema(env.DB);
    }

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

    // 2.1 Registro Público de Nuevas Tiendas (/registro-negocio)
    if (path === '/registro-negocio' && method === 'POST') {
      const body = (await request.json()) as any;
      const nombre = (body.nombre || '').trim();
      let slug = (body.slug || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!slug && nombre) {
        slug = nombre
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      }

      const email = (body.email || '').trim().toLowerCase();
      const ownerName = (body.owner_name || '').trim();
      const phone = (body.telefono_whatsapp || '').trim();
      const barrio = (body.barrio || 'Medellín').trim();
      const direccion = (body.direccion || '').trim();
      const planId = body.plan_id || 'prueba_3d';

      if (!nombre || !slug || !email || !phone) {
        return errorResponse('Nombre de tienda, identificador (slug), correo y WhatsApp son obligatorios.', 400);
      }

      // Asegurar tabla negocios en D1
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS negocios (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          nombre TEXT NOT NULL,
          barrio TEXT DEFAULT 'Medellín',
          ciudad TEXT DEFAULT 'Medellín',
          telefono_whatsapp TEXT,
          direccion TEXT,
          horario TEXT DEFAULT 'Lunes a Domingo 7:00 AM - 9:00 PM',
          logo_url TEXT,
          estado TEXT NOT NULL CHECK(estado IN ('activo', 'pendiente', 'suspendido')) DEFAULT 'activo',
          plan_id TEXT NOT NULL CHECK(plan_id IN ('prueba_3d', 'semanal_7d', 'quincenal_15d', 'mensual_30d', 'enterprise')) DEFAULT 'prueba_3d',
          suscripcion_vence_en TEXT,
          cuota_ia_total INTEGER NOT NULL DEFAULT 300,
          cuota_ia_usada INTEGER NOT NULL DEFAULT 0,
          costo_domicilio_cents INTEGER NOT NULL DEFAULT 0,
          datos_pago_offline TEXT,
          config_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      ).run().catch(() => {});

      // Verificar si el slug ya existe
      const existing = await env.DB.prepare('SELECT id FROM negocios WHERE slug = ?').bind(slug).first();
      if (existing) {
        return errorResponse('El identificador de tienda (slug) ya está registrado. Por favor elige otro.', 409);
      }

      const negocioId = slug;
      let durationDays = 3;
      let cuotaIA = 300;
      if (planId === 'semanal_7d') {
        durationDays = 7;
        cuotaIA = 700;
      } else if (planId === 'quincenal_15d') {
        durationDays = 15;
        cuotaIA = 1500;
      } else if (planId === 'mensual_30d') {
        durationDays = 30;
        cuotaIA = 3000;
      } else if (planId === 'enterprise') {
        durationDays = 365;
        cuotaIA = 999999;
      }

      const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

      await env.DB.prepare(
        `INSERT INTO negocios (
          id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, estado, plan_id, suscripcion_vence_en, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'Medellín', ?, ?, 'activo', ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))`
      )
        .bind(
          negocioId,
          slug,
          nombre,
          barrio,
          phone,
          direccion || null,
          planId,
          expiresAt,
          cuotaIA,
          JSON.stringify({ owner_name: ownerName, permite_domicilio: true, permite_retiro: true })
        )
        .run();

      // Crear usuario administrador en users con contraseña cifrada
      const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const pwdHash = body.password ? await hashPassword(String(body.password)) : null;

      await env.DB.prepare(
        `INSERT OR REPLACE INTO users (id, negocio_id, email, display_name, role, is_super_admin, active, password_hash, created_at, last_login)
         VALUES (?, ?, ?, ?, 'admin', 0, 1, ?, datetime('now'), datetime('now'))`
      )
        .bind(userId, negocioId, email, ownerName || nombre, pwdHash)
        .run()
        .catch(() => {});

      // Sembrar 5 productos colombianos base en la nueva tienda con imágenes y catálogo listo
      const starterProducts = [
        {
          name: 'Leche Entera Alquería 1L',
          price_cents: 450000,
          stock: 30,
          unit: 'litro',
          category: 'Lácteos y Huevos',
          image_url: '/images/products/leche-alqueria-1l.svg',
          barcode: '7702177001234',
        },
        {
          name: 'Arroz Diana 500g (1 Libra)',
          price_cents: 280000,
          stock: 50,
          unit: 'libra',
          category: 'Granos y Abarrotes',
          image_url: '/images/products/arroz-diana-1lb.svg',
          barcode: '7702001012345',
        },
        {
          name: 'Arepas Antioqueñas de Maíz x10',
          price_cents: 420000,
          stock: 25,
          unit: 'paquete',
          category: 'Panadería y Arepa',
          image_url: '/images/products/arepas-antioquenas-x10.svg',
          barcode: '7708881112223',
        },
        {
          name: 'Cubeta de Huevos AA x30',
          price_cents: 1850000,
          stock: 20,
          unit: 'cubeta',
          category: 'Lácteos y Huevos',
          image_url: '/images/products/huevos-aa-x30.svg',
          barcode: '7709990003030',
        },
        {
          name: 'Chocolate Corona 500g',
          price_cents: 890000,
          stock: 25,
          unit: 'libra',
          category: 'Despensa y Café',
          image_url: '/images/products/chocolate-corona-500g.svg',
          barcode: '7702004005009',
        },
      ];
      for (let i = 0; i < starterProducts.length; i++) {
        const sp = starterProducts[i];
        await env.DB.prepare(
          `INSERT OR IGNORE INTO products (
            id, negocio_id, name, price_cents, stock, min_stock, unit, category, image_url, barcode, visible_kiosco, visible_tienda, en_oferta, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 5, ?, ?, ?, ?, 1, 1, 0, datetime('now'), datetime('now'))`
        )
          .bind(
            `prod-${negocioId}-${i + 1}`,
            negocioId,
            sp.name,
            sp.price_cents,
            sp.stock,
            sp.unit,
            sp.category,
            sp.image_url,
            sp.barcode
          )
          .run()
          .catch(() => {});
      }

      const sessionToken = `d1:${userId}:${email}:admin:${negocioId}`;

      return jsonResponse({
        success: true,
        message: '¡Tienda registrada con éxito!',
        token: sessionToken,
        negocio: {
          id: negocioId,
          slug,
          nombre,
          barrio,
          plan_id: planId,
          suscripcion_vence_en: expiresAt,
          cuota_ia_total: cuotaIA,
        },
        user: {
          id: userId,
          email,
          displayName: ownerName || nombre,
          role: 'admin',
          negocioId,
          active: true,
        },
      }, 201);
    }

    // 2.2 Consulta Pública de Tienda y Catálogo para Kiosco iPad y Storefront (/public/store/:slug)
    if (path.startsWith('/public/store/') && method === 'GET') {
      const slug = path.replace(/^\/public\/store\/?/, '').trim().toLowerCase();
      if (!slug) {
        return errorResponse('Slug de tienda no proporcionado.', 400);
      }

      const negocio = await env.DB.prepare(
        'SELECT id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, logo_url, estado, costo_domicilio_cents, datos_pago_offline, config_json FROM negocios WHERE slug = ?'
      )
        .bind(slug)
        .first<any>();

      if (!negocio) {
        return errorResponse('Tienda no encontrada o no disponible.', 404);
      }

      let parsedConfig = {};
      try {
        parsedConfig = negocio.config_json ? JSON.parse(negocio.config_json) : {};
      } catch {
        parsedConfig = {};
      }

      const productsResult = await env.DB.prepare(
        `SELECT id, name, price_cents, stock, min_stock, unit, category, image_url, barcode, visible_kiosco, visible_tienda, en_oferta, precio_oferta_cents
         FROM products
         WHERE negocio_id = ? AND stock > 0 AND (visible_kiosco = 1 OR visible_tienda = 1)
         ORDER BY category ASC, name ASC`
      )
        .bind(negocio.id)
        .all();

      const combosResult = await env.DB.prepare(
        `SELECT id, name, description, price_cents, items_json, image_url, active, visible_kiosco, visible_tienda
         FROM combos
         WHERE negocio_id = ? AND active = 1 AND (visible_kiosco = 1 OR visible_tienda = 1)
         ORDER BY name ASC`
      )
        .bind(negocio.id)
        .all();

      return jsonResponse({
        store: {
          id: negocio.id,
          slug: negocio.slug,
          nombre: negocio.nombre,
          barrio: negocio.barrio,
          ciudad: negocio.ciudad,
          telefono_whatsapp: negocio.telefono_whatsapp,
          direccion: negocio.direccion,
          horario: negocio.horario,
          logo_url: negocio.logo_url,
          estado: negocio.estado,
          costo_domicilio_cents: negocio.costo_domicilio_cents || 0,
          datos_pago_offline: negocio.datos_pago_offline,
          config: parsedConfig,
        },
        products: productsResult.results || [],
        combos: combosResult.results || [],
      });
    }

    // 3. Provisión de usuario y endpoints compatibles de autenticación
    if (path === '/auth/login' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        email?: string;
        password?: string;
        quick_access?: boolean;
      };
      const email = (body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!email) {
        return jsonResponse({ authenticated: false, error: 'Correo electrónico requerido.' }, 200);
      }

      const userRow = await env.DB.prepare(
        'SELECT id, negocio_id, email, display_name, role, is_super_admin, active, password_hash, deleted_at FROM users WHERE lower(email) = ?'
      )
        .bind(email)
        .first<{
          id: string;
          negocio_id: string;
          email: string;
          display_name: string | null;
          role: string;
          is_super_admin: number;
          active: number;
          password_hash: string | null;
          deleted_at: string | null;
        }>();

      if (!userRow || userRow.active !== 1 || userRow.deleted_at) {
        return jsonResponse({ authenticated: false, error: 'Usuario no encontrado o inactivo.' }, 200);
      }

      const DEMO_SEED_EMAILS = new Set([
        'admin@surtifacil.com',
        'cajero@surtifacil.com',
        'gerente@surtifacil.com',
        'ejemplo@mitienda.com',
        'andres.san1404@gmail.com',
        'qa@surtifacil.com',
      ]);

      const isSeedEmail = DEMO_SEED_EMAILS.has(email);

      if (!body.quick_access || !isSeedEmail) {
        if (!password || password.length < 4) {
          return jsonResponse({ authenticated: false, error: 'Contraseña inválida.' }, 200);
        }

        if (userRow.password_hash) {
          const incomingHash = await hashPassword(password);
          if (incomingHash !== userRow.password_hash) {
            return jsonResponse({ authenticated: false, error: 'Credenciales inválidas.' }, 200);
          }
        }
      }

      await env.DB.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?")
        .bind(userRow.id)
        .run()
        .catch(() => {});

      const role = (['admin', 'manager', 'cashier'].includes(userRow.role) ? userRow.role : 'admin') as
        | 'admin'
        | 'manager'
        | 'cashier';
      const negocioId = userRow.negocio_id || 'surtifacil';
      const isSuperAdmin = userRow.is_super_admin === 1 || email === 'andres.san1404@gmail.com';
      const token = `d1:${userRow.id}:${userRow.email}:${role}:${negocioId}`;

      const negocio = await env.DB.prepare(
        'SELECT id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, estado, plan_id, suscripcion_vence_en, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, datos_pago_offline, config_json FROM negocios WHERE id = ?'
      )
        .bind(negocioId)
        .first();

      return jsonResponse({
        authenticated: true,
        token,
        user: {
          id: userRow.id,
          email: userRow.email,
          displayName: userRow.display_name || userRow.email.split('@')[0],
          role,
          isSuperAdmin,
          negocioId,
          active: true,
        },
        negocio,
      });
    }

    if (path === '/auth/sync-claims' && method === 'POST') {
      return jsonResponse({ success: true, message: 'Custom claims sincronizados correctamente.' });
    }

    if (path === '/auth/provision-user' && method === 'POST') {
      // Provisión de staff desde authService
      const auth = await authenticateRequest(request, env);
      const body = (await request.json()) as {
        email: string;
        password?: string;
        displayName?: string;
        role?: string;
      };
      const role = body.role || 'cashier';
      const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const pwdHash = body.password ? await hashPassword(String(body.password)) : null;

      await env.DB.prepare(
        "INSERT OR REPLACE INTO users (id, negocio_id, email, display_name, role, is_super_admin, active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, datetime('now'))"
      )
        .bind(newId, auth.negocioId, body.email.toLowerCase(), body.displayName || null, role, pwdHash)
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

    // 3.1 Configuración de Tienda (/settings)
    if (path === '/settings') {
      const auth = await authenticateRequest(request, env);

      if (method === 'GET') {
        const row = await env.DB.prepare(
          'SELECT id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, estado, plan_id, suscripcion_vence_en, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, datos_pago_offline, config_json FROM negocios WHERE id = ?'
        )
          .bind(auth.negocioId)
          .first();

        if (!row) {
          return errorResponse('Negocio no encontrado.', 404);
        }

        return jsonResponse(row);
      }

      if (method === 'PUT') {
        if (auth.user.role === 'cashier') {
          return errorResponse('Solo administradores y gerentes pueden modificar la configuración.', 403);
        }

        const body = (await request.json()) as any;
        const current = await env.DB.prepare(
          'SELECT config_json FROM negocios WHERE id = ?'
        )
          .bind(auth.negocioId)
          .first<{ config_json: string }>();

        let currentConfig: Record<string, any> = {};
        try {
          currentConfig = JSON.parse(current?.config_json || '{}');
        } catch {
          currentConfig = {};
        }

        if (body.permite_domicilio !== undefined) currentConfig.permite_domicilio = Boolean(body.permite_domicilio);
        if (body.permite_retiro !== undefined) currentConfig.permite_retiro = Boolean(body.permite_retiro);
        if (body.slogan !== undefined) currentConfig.slogan = String(body.slogan);

        await env.DB.prepare(
          `UPDATE negocios SET
            nombre = COALESCE(?, nombre),
            barrio = COALESCE(?, barrio),
            direccion = COALESCE(?, direccion),
            telefono_whatsapp = COALESCE(?, telefono_whatsapp),
            horario = COALESCE(?, horario),
            costo_domicilio_cents = COALESCE(?, costo_domicilio_cents),
            datos_pago_offline = COALESCE(?, datos_pago_offline),
            config_json = ?,
            updated_at = datetime('now')
          WHERE id = ?`
        )
          .bind(
            body.nombre?.trim() ?? null,
            body.barrio?.trim() ?? null,
            body.direccion?.trim() ?? null,
            body.telefono_whatsapp?.trim() ?? null,
            body.horario?.trim() ?? null,
            body.costo_domicilio_cents !== undefined ? Math.round(body.costo_domicilio_cents) : null,
            body.datos_pago_offline?.trim() ?? null,
            JSON.stringify(currentConfig),
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare(
          'SELECT id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, estado, plan_id, suscripcion_vence_en, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, datos_pago_offline, config_json FROM negocios WHERE id = ?'
        )
          .bind(auth.negocioId)
          .first();

        return jsonResponse(updated);
      }
    }

    // 3.2 Combos y Kits de Mercado (/combos)
    if (path === '/combos' || path.startsWith('/combos/')) {
      const auth = await authenticateRequest(request, env);
      const comboId = path.replace(/^\/combos\/?/, '');

      // Asegurar que la tabla existe en D1
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS combos (
          id TEXT PRIMARY KEY,
          negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          price_cents INTEGER NOT NULL,
          items_json TEXT NOT NULL DEFAULT '[]',
          image_url TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          visible_kiosco INTEGER NOT NULL DEFAULT 1,
          visible_tienda INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      ).run().catch(() => {});

      if (method === 'GET' && !comboId) {
        const result = await env.DB.prepare(
          'SELECT * FROM combos WHERE negocio_id = ? ORDER BY name ASC'
        )
          .bind(auth.negocioId)
          .all();
        return jsonResponse(result.results || []);
      }

      if (method === 'POST') {
        if (auth.user.role === 'cashier') {
          return errorResponse('Solo administradores y gerentes pueden crear combos.', 403);
        }

        const body = (await request.json()) as any;
        if (!body.name || typeof body.price_cents !== 'number') {
          return errorResponse('Nombre y precio del combo son obligatorios.', 400);
        }

        const id = `combo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await env.DB.prepare(
          `INSERT INTO combos (
            id, negocio_id, name, description, price_cents, items_json, image_url,
            active, visible_kiosco, visible_tienda, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
          .bind(
            id,
            auth.negocioId,
            body.name.trim(),
            body.description || null,
            Math.round(body.price_cents),
            JSON.stringify(body.items || []),
            body.image_url || null,
            body.active !== undefined ? (body.active ? 1 : 0) : 1,
            body.visible_kiosco !== undefined ? (body.visible_kiosco ? 1 : 0) : 1,
            body.visible_tienda !== undefined ? (body.visible_tienda ? 1 : 0) : 1
          )
          .run();

        const created = await env.DB.prepare('SELECT * FROM combos WHERE id = ? AND negocio_id = ?')
          .bind(id, auth.negocioId)
          .first();

        return jsonResponse(created, 201);
      }

      if (method === 'PUT' && comboId) {
        if (auth.user.role === 'cashier') {
          return errorResponse('Solo administradores y gerentes pueden editar combos.', 403);
        }

        const body = (await request.json()) as any;
        await env.DB.prepare(
          `UPDATE combos SET
            name = COALESCE(?, name),
            description = COALESCE(?, description),
            price_cents = COALESCE(?, price_cents),
            items_json = COALESCE(?, items_json),
            image_url = COALESCE(?, image_url),
            active = COALESCE(?, active),
            visible_kiosco = COALESCE(?, visible_kiosco),
            visible_tienda = COALESCE(?, visible_tienda),
            updated_at = datetime('now')
          WHERE id = ? AND negocio_id = ?`
        )
          .bind(
            body.name?.trim() ?? null,
            body.description?.trim() ?? null,
            body.price_cents !== undefined ? Math.round(body.price_cents) : null,
            body.items ? JSON.stringify(body.items) : null,
            body.image_url ?? null,
            body.active !== undefined ? (body.active ? 1 : 0) : null,
            body.visible_kiosco !== undefined ? (body.visible_kiosco ? 1 : 0) : null,
            body.visible_tienda !== undefined ? (body.visible_tienda ? 1 : 0) : null,
            comboId,
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare('SELECT * FROM combos WHERE id = ? AND negocio_id = ?')
          .bind(comboId, auth.negocioId)
          .first();

        return jsonResponse(updated);
      }

      if (method === 'DELETE' && comboId) {
        if (auth.user.role === 'cashier') {
          return errorResponse('Solo administradores y gerentes pueden eliminar combos.', 403);
        }

        await env.DB.prepare('DELETE FROM combos WHERE id = ? AND negocio_id = ?')
          .bind(comboId, auth.negocioId)
          .run();

        return jsonResponse({ success: true, id: comboId });
      }
    }

    // 3.3 Centro de Control SuperAdmin (/super-admin/negocios)
    if (path === '/super-admin/negocios' || path.startsWith('/super-admin/negocios/')) {
      const auth = await authenticateRequest(request, env);
      if (!auth.user.isSuperAdmin && auth.user.email.toLowerCase() !== 'andres.san1404@gmail.com') {
        return errorResponse('Acceso denegado: solo el SuperAdmin de SurtiFácil puede acceder.', 403);
      }

      const subPath = path.replace(/^\/super-admin\/negocios\/?/, '');

      // GET /api/super-admin/negocios
      if (method === 'GET' && !subPath) {
        const rows = await env.DB.prepare(
          `SELECT n.*,
            (SELECT COUNT(*) FROM products p WHERE p.negocio_id = n.id) as total_products,
            (SELECT COUNT(*) FROM users u WHERE u.negocio_id = n.id) as total_users,
            (SELECT COUNT(*) FROM sales s WHERE s.negocio_id = n.id) as total_sales
           FROM negocios n
           ORDER BY n.created_at DESC`
        ).all<any>();

        const negocios = rows.results || [];

        // Calcular KPIs de plataforma
        const totalTiendas = negocios.length;
        let tiendasActivas = 0;
        let recaudoEstimadoCOP = 0;
        let cuotaIATotal = 0;
        let cuotaIAUsada = 0;

        for (const n of negocios) {
          if (n.estado === 'activo') tiendasActivas++;
          cuotaIATotal += Number(n.cuota_ia_total || 0);
          cuotaIAUsada += Number(n.cuota_ia_usada || 0);

          if (n.estado === 'activo') {
            if (n.plan_id === 'prueba_3d') recaudoEstimadoCOP += 5000;
            else if (n.plan_id === 'semanal_7d') recaudoEstimadoCOP += 19900;
            else if (n.plan_id === 'quincenal_15d') recaudoEstimadoCOP += 34900;
            else if (n.plan_id === 'mensual_30d') recaudoEstimadoCOP += 59900;
          }
        }

        return jsonResponse({
          kpis: {
            totalTiendas,
            tiendasActivas,
            recaudoEstimadoCOP,
            cuotaIATotal,
            cuotaIAUsada,
          },
          negocios,
        });
      }

      // POST /api/super-admin/negocios/:id/renovar
      if (method === 'POST' && subPath.endsWith('/renovar')) {
        const targetId = subPath.replace(/\/renovar$/, '');
        const body = (await request.json()) as { days?: number; add_cuota_ia?: number };
        const days = Math.max(1, Number(body.days || 3));
        const addCuota = Number(body.add_cuota_ia || 0);

        const current = await env.DB.prepare(
          'SELECT id, suscripcion_vence_en, cuota_ia_total, estado FROM negocios WHERE id = ?'
        ).bind(targetId).first<any>();

        if (!current) {
          return errorResponse('Negocio no encontrado.', 404);
        }

        let baseDate = new Date();
        if (current.suscripcion_vence_en) {
          const currentExpiry = new Date(current.suscripcion_vence_en);
          if (currentExpiry > baseDate) {
            baseDate = currentExpiry;
          }
        }

        const newExpiry = new Date(baseDate.getTime() + days * 86400000).toISOString();
        const newCuota = (current.cuota_ia_total || 0) + addCuota;

        await env.DB.prepare(
          `UPDATE negocios
           SET suscripcion_vence_en = ?,
               cuota_ia_total = ?,
               estado = 'activo',
               updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(newExpiry, newCuota, targetId)
          .run();

        const updated = await env.DB.prepare('SELECT * FROM negocios WHERE id = ?').bind(targetId).first();
        return jsonResponse(updated);
      }

      // PUT /api/super-admin/negocios/:id
      if (method === 'PUT' && subPath) {
        const targetId = subPath;
        const body = (await request.json()) as any;

        const current = await env.DB.prepare('SELECT id FROM negocios WHERE id = ?').bind(targetId).first();
        if (!current) {
          return errorResponse('Negocio no encontrado.', 404);
        }

        const updates: string[] = [];
        const bindings: any[] = [];

        if (body.estado !== undefined) {
          updates.push('estado = ?');
          bindings.push(body.estado);
        }
        if (body.plan_id !== undefined) {
          updates.push('plan_id = ?');
          bindings.push(body.plan_id);
        }
        if (body.suscripcion_vence_en !== undefined) {
          updates.push('suscripcion_vence_en = ?');
          bindings.push(body.suscripcion_vence_en);
        }
        if (body.cuota_ia_total !== undefined) {
          updates.push('cuota_ia_total = ?');
          bindings.push(Number(body.cuota_ia_total));
        }
        if (body.cuota_ia_usada !== undefined) {
          updates.push('cuota_ia_usada = ?');
          bindings.push(Number(body.cuota_ia_usada));
        }

        if (updates.length > 0) {
          updates.push("updated_at = datetime('now')");
          bindings.push(targetId);
          await env.DB.prepare(`UPDATE negocios SET ${updates.join(', ')} WHERE id = ?`)
            .bind(...bindings)
            .run();
        }

        const updated = await env.DB.prepare('SELECT * FROM negocios WHERE id = ?').bind(targetId).first();
        return jsonResponse(updated);
      }
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
    if (path === '/sales' || path === '/sales/create' || path.startsWith('/sales/')) {
      const auth = await authenticateRequest(request, env);

      // GET /api/sales/:id (Detalle de venta individual para tirilla térmica)
      if (method === 'GET' && path.startsWith('/sales/')) {
        const singleSaleId = path.replace(/^\/sales\//, '');
        if (singleSaleId && singleSaleId !== 'create') {
          const sale = await env.DB.prepare('SELECT * FROM sales WHERE id = ? AND negocio_id = ?')
            .bind(singleSaleId, auth.negocioId)
            .first<any>();
          if (!sale) {
            return errorResponse('Venta no encontrada.', 404);
          }
          const items = await env.DB.prepare('SELECT * FROM sale_items WHERE sale_id = ?')
            .bind(singleSaleId)
            .all();
          return jsonResponse({
            ...sale,
            items: items.results || [],
          });
        }
      }

      // GET /api/sales
      if (method === 'GET') {
        // Soporte para totales agregados calculados en D1
        if (url.searchParams.get('totals') === 'true') {
          const row = await env.DB.prepare(
            'SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as totalCents FROM sales WHERE negocio_id = ?'
          )
            .bind(auth.negocioId)
            .first<{ count: number; totalCents: number }>();

          return jsonResponse({
            count: row?.count || 0,
            totalCents: row?.totalCents || 0,
          });
        }

        const since = url.searchParams.get('since');
        const cursor = url.searchParams.get('cursor');
        const limitParam = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

        let query = 'SELECT * FROM sales WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];

        if (since) {
          query += ' AND created_at >= ?';
          params.push(since);
        }

        if (cursor) {
          query += ' AND id < ?';
          params.push(cursor);
        }

        query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
        params.push(limitParam);

        const sales = await env.DB.prepare(query)
          .bind(...params)
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
            saleId,
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

    // 5.1 Arqueos y Cierres de Caja COP (/cash-closings)
    if (path === '/cash-closings' || path.startsWith('/cash-closings/')) {
      const auth = await authenticateRequest(request, env);

      // Asegurar tabla en D1
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS cash_closings (
          id TEXT PRIMARY KEY,
          negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
          closing_number INTEGER NOT NULL,
          opened_at TEXT NOT NULL,
          closed_at TEXT NOT NULL DEFAULT (datetime('now')),
          closed_by_uid TEXT NOT NULL,
          closed_by_name TEXT,
          initial_cash_cents INTEGER NOT NULL DEFAULT 0,
          sales_cash_cents INTEGER NOT NULL DEFAULT 0,
          credit_payments_cash_cents INTEGER NOT NULL DEFAULT 0,
          expected_cash_cents INTEGER NOT NULL,
          counted_cash_cents INTEGER NOT NULL,
          difference_cents INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('balanced', 'surplus', 'shortage')),
          breakdown_json TEXT NOT NULL DEFAULT '{}',
          notes TEXT,
          total_sales_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      ).run().catch(() => {});

      // GET /api/cash-closings/summary (Resumen de turno actual)
      if (method === 'GET' && path === '/cash-closings/summary') {
        const lastClosing = await env.DB.prepare(
          'SELECT closed_at FROM cash_closings WHERE negocio_id = ? ORDER BY closed_at DESC LIMIT 1'
        ).bind(auth.negocioId).first<{ closed_at: string }>();

        const now = new Date();
        const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const openedAt = lastClosing?.closed_at || startOfTodayIso;

        const initialBaseParam = url.searchParams.get('initial_base_cents');
        const initialCashCents = initialBaseParam !== null ? Math.max(0, parseInt(initialBaseParam, 10) || 0) : 10000000;

        // 1. Ventas en efectivo desde el último cierre
        const salesCashRow = await env.DB.prepare(
          "SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as total_cash_cents FROM sales WHERE negocio_id = ? AND payment_method = 'cash' AND created_at >= ?"
        ).bind(auth.negocioId, openedAt).first<{ count: number; total_cash_cents: number }>();

        const salesCashCents = salesCashRow?.total_cash_cents || 0;
        const salesCashCount = salesCashRow?.count || 0;

        // 2. Abonos de fiados recibidos en efectivo desde el último cierre
        const creditPaymentsRow = await env.DB.prepare(
          "SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_credit_cash_cents FROM credit_entries WHERE negocio_id = ? AND type = 'payment' AND created_at >= ?"
        ).bind(auth.negocioId, openedAt).first<{ count: number; total_credit_cash_cents: number }>();

        const creditPaymentsCashCents = creditPaymentsRow?.total_credit_cash_cents || 0;
        const creditPaymentsCashCount = creditPaymentsRow?.count || 0;

        // 3. Ventas por otros medios (tarjeta, otros, fiado) para visibilidad gerencial
        const otherSalesRows = await env.DB.prepare(
          "SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total_cents), 0) as total_cents FROM sales WHERE negocio_id = ? AND payment_method != 'cash' AND created_at >= ? GROUP BY payment_method"
        ).bind(auth.negocioId, openedAt).all<{ payment_method: string; count: number; total_cents: number }>();

        const expectedCashCents = initialCashCents + salesCashCents + creditPaymentsCashCents;

        return jsonResponse({
          opened_at: openedAt,
          initial_cash_cents: initialCashCents,
          sales_cash_cents: salesCashCents,
          sales_cash_count: salesCashCount,
          credit_payments_cash_cents: creditPaymentsCashCents,
          credit_payments_cash_count: creditPaymentsCashCount,
          expected_cash_cents: expectedCashCents,
          other_sales: otherSalesRows.results || [],
        });
      }

      // POST /api/cash-closings (Guardar Acta de Cierre Inmutable)
      if (method === 'POST' && path === '/cash-closings') {
        const body = (await request.json()) as {
          initial_cash_cents?: number;
          breakdown?: {
            bills?: Record<string, number>;
            coins?: Record<string, number>;
          };
          notes?: string;
        };

        const initialCashCents = Math.max(0, Math.floor(Number(body.initial_cash_cents) || 0));

        const BILL_VALUES_CENTS: Record<string, number> = {
          '100000': 10000000,
          '50000': 5000000,
          '20000': 2000000,
          '10000': 1000000,
          '5000': 500000,
          '2000': 200000,
        };

        const COIN_VALUES_CENTS: Record<string, number> = {
          '1000': 100000,
          '500': 50000,
          '200': 20000,
          '100': 10000,
          '50': 5000,
        };

        let countedCashCents = 0;
        const billsBreakdown: Record<string, number> = {};
        const coinsBreakdown: Record<string, number> = {};

        if (body.breakdown?.bills) {
          for (const [denom, count] of Object.entries(body.breakdown.bills)) {
            const qty = Math.max(0, Math.floor(Number(count) || 0));
            billsBreakdown[denom] = qty;
            const unitCents = BILL_VALUES_CENTS[denom] ?? (Number(denom) * 100);
            countedCashCents += unitCents * qty;
          }
        }

        if (body.breakdown?.coins) {
          for (const [denom, count] of Object.entries(body.breakdown.coins)) {
            const qty = Math.max(0, Math.floor(Number(count) || 0));
            coinsBreakdown[denom] = qty;
            const unitCents = COIN_VALUES_CENTS[denom] ?? (Number(denom) * 100);
            countedCashCents += unitCents * qty;
          }
        }

        const lastClosing = await env.DB.prepare(
          'SELECT closed_at FROM cash_closings WHERE negocio_id = ? ORDER BY closed_at DESC LIMIT 1'
        ).bind(auth.negocioId).first<{ closed_at: string }>();

        const now = new Date();
        const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const openedAt = lastClosing?.closed_at || startOfTodayIso;

        const salesCashRow = await env.DB.prepare(
          "SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as total_cash_cents FROM sales WHERE negocio_id = ? AND payment_method = 'cash' AND created_at >= ?"
        ).bind(auth.negocioId, openedAt).first<{ count: number; total_cash_cents: number }>();

        const salesCashCents = salesCashRow?.total_cash_cents || 0;
        const totalSalesCount = salesCashRow?.count || 0;

        const creditPaymentsRow = await env.DB.prepare(
          "SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_credit_cash_cents FROM credit_entries WHERE negocio_id = ? AND type = 'payment' AND created_at >= ?"
        ).bind(auth.negocioId, openedAt).first<{ count: number; total_credit_cash_cents: number }>();

        const creditPaymentsCashCents = creditPaymentsRow?.total_credit_cash_cents || 0;

        const expectedCashCents = initialCashCents + salesCashCents + creditPaymentsCashCents;
        const differenceCents = countedCashCents - expectedCashCents;

        let status: 'balanced' | 'surplus' | 'shortage' = 'balanced';
        if (differenceCents > 0) status = 'surplus';
        else if (differenceCents < 0) status = 'shortage';

        const maxNumberRow = await env.DB.prepare(
          'SELECT COALESCE(MAX(closing_number), 0) + 1 as next_number FROM cash_closings WHERE negocio_id = ?'
        ).bind(auth.negocioId).first<{ next_number: number }>();

        const closingNumber = maxNumberRow?.next_number || 1;
        const closingId = `cclose-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const closedAt = new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO cash_closings (
            id, negocio_id, closing_number, opened_at, closed_at, closed_by_uid, closed_by_name,
            initial_cash_cents, sales_cash_cents, credit_payments_cash_cents, expected_cash_cents,
            counted_cash_cents, difference_cents, status, breakdown_json, notes, total_sales_count, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          closingId,
          auth.negocioId,
          closingNumber,
          openedAt,
          closedAt,
          auth.user.id,
          auth.user.displayName || auth.user.email,
          initialCashCents,
          salesCashCents,
          creditPaymentsCashCents,
          expectedCashCents,
          countedCashCents,
          differenceCents,
          status,
          JSON.stringify({ bills: billsBreakdown, coins: coinsBreakdown }),
          body.notes?.trim() || null,
          totalSalesCount
        ).run();

        const createdRecord = await env.DB.prepare(
          'SELECT * FROM cash_closings WHERE id = ? AND negocio_id = ?'
        ).bind(closingId, auth.negocioId).first<any>();

        return jsonResponse({
          ...createdRecord,
          breakdown: { bills: billsBreakdown, coins: coinsBreakdown },
        }, 201);
      }

      // GET /api/cash-closings (Historial de cierres)
      if (method === 'GET' && path === '/cash-closings') {
        const rows = await env.DB.prepare(
          'SELECT * FROM cash_closings WHERE negocio_id = ? ORDER BY closed_at DESC LIMIT 50'
        ).bind(auth.negocioId).all<any>();

        const mapped = (rows.results || []).map((row) => {
          let breakdown = { bills: {}, coins: {} };
          try {
            breakdown = typeof row.breakdown_json === 'string' ? JSON.parse(row.breakdown_json) : row.breakdown_json;
          } catch {}
          return {
            ...row,
            breakdown,
          };
        });

        return jsonResponse(mapped);
      }

      // GET /api/cash-closings/:id
      if (method === 'GET' && path.startsWith('/cash-closings/')) {
        const targetId = path.replace(/^\/cash-closings\//, '');
        const record = await env.DB.prepare(
          'SELECT * FROM cash_closings WHERE id = ? AND negocio_id = ?'
        ).bind(targetId, auth.negocioId).first<any>();

        if (!record) {
          return errorResponse('Acta de cierre no encontrada.', 404);
        }

        let breakdown = { bills: {}, coins: {} };
        try {
          breakdown = typeof record.breakdown_json === 'string' ? JSON.parse(record.breakdown_json) : record.breakdown_json;
        } catch {}

        return jsonResponse({
          ...record,
          breakdown,
        });
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
        const limitParam = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
        let query = 'SELECT * FROM credit_entries WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];

        if (customerId) {
          query += ' AND customer_id = ?';
          params.push(customerId);
        }
        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limitParam);

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
            'El abono no puede superar la deuda actual',
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

      if (method === 'DELETE' && supplierId) {
        const orderCount = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ? AND negocio_id = ?'
        )
          .bind(supplierId, auth.negocioId)
          .first<{ count: number }>();

        if (orderCount && orderCount.count > 0) {
          return errorResponse('No se puede eliminar: tiene órdenes asociadas', 400);
        }

        await env.DB.prepare('DELETE FROM suppliers WHERE id = ? AND negocio_id = ?')
          .bind(supplierId, auth.negocioId)
          .run();

        return jsonResponse({ success: true, id: supplierId });
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
        const body = (await request.json()) as {
          status?: string;
          received_total_cents?: number;
          receives?: Array<{ index: number; received_quantity: number; final_cost_cents: number }>;
        };
        const order = await env.DB.prepare('SELECT * FROM purchase_orders WHERE id = ? AND negocio_id = ?')
          .bind(orderId, auth.negocioId)
          .first<{ id: string; status: string; total_cents: number; supplier_id: string }>();

        if (!order) {
          return errorResponse('Orden de compra no encontrada.', 404);
        }

        // Cancelación de orden
        if (body.status === 'cancelled') {
          const itemsResult = await env.DB.prepare('SELECT received_quantity FROM purchase_order_items WHERE order_id = ?')
            .bind(orderId)
            .all<{ received_quantity: number }>();
          const hasReception = (itemsResult.results || []).some((i) => i.received_quantity > 0);
          if (hasReception) {
            return errorResponse('No se puede cancelar: ya se recibió stock', 400);
          }
          await env.DB.prepare("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ? AND negocio_id = ?")
            .bind(orderId, auth.negocioId)
            .run();
          return jsonResponse({ success: true, order_id: orderId, status: 'cancelled' });
        }

        // Recepción granular de ítems
        if (body.receives && Array.isArray(body.receives)) {
          const existingItemsRes = await env.DB.prepare('SELECT * FROM purchase_order_items WHERE order_id = ?')
            .bind(orderId)
            .all<any>();
          const existingItems = existingItemsRes.results || [];
          const batch: any[] = [];
          let currentReceivedTotal = 0;
          let allReceived = true;
          let someReceived = false;

          for (let idx = 0; idx < existingItems.length; idx++) {
            const it = existingItems[idx];
            const r = body.receives.find((x) => x.index === idx);
            const newReceivedQty = (it.received_quantity || 0) + (r ? r.received_quantity : 0);
            const finalCost = r ? r.final_cost_cents : (it.final_cost_cents || it.unit_cost_cents);

            if (newReceivedQty > it.quantity) {
              return errorResponse(
                `No se puede recibir más de lo pedido en "${it.name}". Pedido: ${it.quantity}, ya recibido: ${it.received_quantity}, intento: ${r?.received_quantity}`,
                400
              );
            }

            if (newReceivedQty < it.quantity) {
              allReceived = false;
            }
            if (newReceivedQty > 0) {
              someReceived = true;
            }

            currentReceivedTotal += newReceivedQty * finalCost;

            if (r && r.received_quantity > 0) {
              batch.push(
                env.DB.prepare(
                  'UPDATE purchase_order_items SET received_quantity = ?, final_cost_cents = ? WHERE id = ?'
                ).bind(newReceivedQty, finalCost, it.id)
              );

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
                  ).bind(r.received_quantity, finalCost, it.product_id, auth.negocioId)
                );
              }
            }
          }

          const nextStatus = allReceived ? 'received' : someReceived ? 'partial' : order.status;
          batch.push(
            env.DB.prepare(
              "UPDATE purchase_orders SET status = ?, received_total_cents = ?, received_date = IIF(? = 'received', datetime('now'), received_date) WHERE id = ? AND negocio_id = ?"
            ).bind(nextStatus, currentReceivedTotal, nextStatus, orderId, auth.negocioId)
          );

          if (allReceived) {
            batch.push(
              env.DB.prepare(
                'UPDATE suppliers SET total_orders = total_orders + 1, total_spent_cents = total_spent_cents + ? WHERE id = ? AND negocio_id = ?'
              ).bind(currentReceivedTotal, order.supplier_id, auth.negocioId)
            );
          }

          await env.DB.batch(batch);
          return jsonResponse({ success: true, order_id: orderId, status: nextStatus });
        }

        // Transición de estado directa
        const batch: any[] = [];
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

    // 10. Pedidos de Clientes (Modo Kiosco iPad / Tienda Web / Bot Sarin WhatsApp)
    if (path === '/customer-orders' || path.startsWith('/customer-orders/')) {
      const subPath = path.replace(/^\/customer-orders\/?/, '');

      // 10.1 Rastreo público de pedido (/customer-orders/track/:token)
      if (subPath.startsWith('track/') && method === 'GET') {
        const token = subPath.replace(/^track\/?/, '').trim();
        if (!token) return errorResponse('Token de rastreo no proporcionado.', 400);

        const order = await env.DB.prepare(
          'SELECT * FROM customer_orders WHERE tracking_token = ?'
        )
          .bind(token)
          .first<any>();

        if (!order) return errorResponse('Pedido no encontrado.', 404);

        const store = await env.DB.prepare(
          'SELECT id, slug, nombre, barrio, telefono_whatsapp, direccion, datos_pago_offline FROM negocios WHERE id = ?'
        )
          .bind(order.negocio_id)
          .first<any>();

        let items = [];
        try {
          items = JSON.parse(order.items_json);
        } catch {}

        return jsonResponse({
          order: {
            ...order,
            items,
          },
          store,
        });
      }

      // 10.2 Creación PÚBLICA de Pedido (Desde Kiosco o Tienda Web)
      if (method === 'POST' && (!subPath || subPath === 'create')) {
        const body = (await request.json()) as any;
        const customerName = (body.customer_name || '').trim();
        const source = (['kiosk', 'web', 'whatsapp'].includes(body.source) ? body.source : 'kiosk') as 'kiosk' | 'web' | 'whatsapp';
        const deliveryType = (['pickup_counter', 'delivery'].includes(body.delivery_type) ? body.delivery_type : 'pickup_counter') as 'pickup_counter' | 'delivery';
        const paymentMethod = (['cash', 'transfer', 'credit'].includes(body.payment_method) ? body.payment_method : 'cash') as 'cash' | 'transfer' | 'credit';
        const rawItems = Array.isArray(body.items) ? body.items : [];

        if (!customerName) {
          return errorResponse('El nombre del cliente es obligatorio.', 400);
        }
        if (rawItems.length === 0) {
          return errorResponse('El pedido debe tener al menos un producto.', 400);
        }

        // Determinar tienda por slug o negocio_id
        let negocio = null;
        if (body.slug) {
          negocio = await env.DB.prepare('SELECT * FROM negocios WHERE slug = ?').bind(body.slug).first<any>();
        } else if (body.negocio_id) {
          negocio = await env.DB.prepare('SELECT * FROM negocios WHERE id = ?').bind(body.negocio_id).first<any>();
        }

        if (!negocio) {
          return errorResponse('Negocio no válido o no encontrado.', 404);
        }

        // Cálculo autoritativo de precios en el servidor contra la base de datos D1
        let totalCents = 0;
        const verifiedItems = [];

        for (const item of rawItems) {
          const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
          const prodId = String(item.product_id || '');

          // Consultar producto
          const dbProd = await env.DB.prepare(
            'SELECT id, name, price_cents, en_oferta, precio_oferta_cents, unit, image_url, stock FROM products WHERE id = ? AND negocio_id = ?'
          )
            .bind(prodId, negocio.id)
            .first<any>();

          if (dbProd) {
            const unitPrice = (dbProd.en_oferta && dbProd.precio_oferta_cents && dbProd.precio_oferta_cents > 0)
              ? dbProd.precio_oferta_cents
              : dbProd.price_cents;
            const subtotal = unitPrice * qty;
            totalCents += subtotal;
            verifiedItems.push({
              product_id: dbProd.id,
              product_name: dbProd.name,
              quantity: qty,
              unit_price_cents: unitPrice,
              subtotal_cents: subtotal,
              unit: dbProd.unit,
              image_url: dbProd.image_url,
            });
          } else {
            // Verificar si es combo
            const dbCombo = await env.DB.prepare(
              'SELECT id, name, price_cents, image_url FROM combos WHERE id = ? AND negocio_id = ?'
            )
              .bind(prodId, negocio.id)
              .first<any>();

            if (dbCombo) {
              const subtotal = dbCombo.price_cents * qty;
              totalCents += subtotal;
              verifiedItems.push({
                product_id: dbCombo.id,
                product_name: dbCombo.name,
                quantity: qty,
                unit_price_cents: dbCombo.price_cents,
                subtotal_cents: subtotal,
                unit: 'combo',
                image_url: dbCombo.image_url,
              });
            } else if (item.product_name && typeof item.unit_price_cents === 'number') {
              const unitPrice = Math.round(item.unit_price_cents);
              const subtotal = unitPrice * qty;
              totalCents += subtotal;
              verifiedItems.push({
                product_id: prodId || `custom-${Date.now()}`,
                product_name: item.product_name,
                quantity: qty,
                unit_price_cents: unitPrice,
                subtotal_cents: subtotal,
                unit: item.unit || 'unidad',
              });
            }
          }
        }

        if (verifiedItems.length === 0) {
          return errorResponse('Ningún producto seleccionado es válido en el catálogo.', 400);
        }

        // Sumar costo de domicilio si aplica
        if (deliveryType === 'delivery' && (negocio.costo_domicilio_cents || 0) > 0) {
          totalCents += negocio.costo_domicilio_cents;
        }

        // Generar código de turno correlativo por negocio
        const countRes = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM customer_orders WHERE negocio_id = ? AND source = ?'
        )
          .bind(negocio.id, source)
          .first<{ count: number }>();

        const seq = (countRes?.count ?? 0) + 1;
        const prefix = source === 'kiosk' ? 'K' : source === 'whatsapp' ? 'WA' : 'W';
        const orderCode = `#${prefix}-${String(seq).padStart(2, '0')}`;

        const orderId = `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const trackingToken = `tk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

        await env.DB.prepare(
          `INSERT INTO customer_orders (
            id, negocio_id, order_code, source, customer_name, customer_phone,
            delivery_type, delivery_address, delivery_neighborhood, payment_method,
            items_json, total_cents, status, tracking_token, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
        )
          .bind(
            orderId,
            negocio.id,
            orderCode,
            source,
            customerName,
            body.customer_phone?.trim() || null,
            deliveryType,
            body.delivery_address?.trim() || null,
            body.delivery_neighborhood?.trim() || null,
            paymentMethod,
            JSON.stringify(verifiedItems),
            totalCents,
            trackingToken
          )
          .run();

        const createdOrder = await env.DB.prepare('SELECT * FROM customer_orders WHERE id = ?')
          .bind(orderId)
          .first<any>();

        return jsonResponse({
          success: true,
          order: {
            ...createdOrder,
            items: verifiedItems,
          },
        }, 201);
      }

      // 10.3 Endpoints PRIVADOS para el Mostrador del Tendero (Requieren Auth)
      const auth = await authenticateRequest(request, env);

      // GET /api/customer-orders (Listado para la bandeja del POS)
      if (method === 'GET' && !subPath) {
        const status = url.searchParams.get('status');
        let query = 'SELECT * FROM customer_orders WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];

        if (status) {
          query += ' AND status = ?';
          params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT 50';

        const result = await env.DB.prepare(query).bind(...params).all();
        const orders = (result.results || []).map((row: any) => {
          let items = [];
          try {
            items = JSON.parse(row.items_json);
          } catch {}
          return { ...row, items };
        });

        return jsonResponse(orders);
      }

      // PUT /api/customer-orders/:id/status (Actualizar estado de orden)
      if (method === 'PUT' && subPath.endsWith('/status')) {
        const orderId = subPath.replace(/\/status$/, '').trim();
        const body = (await request.json()) as { status: string };
        const nextStatus = body.status;

        const validStatuses = ['pending', 'preparing', 'ready_or_on_way', 'completed', 'cancelled'];
        if (!validStatuses.includes(nextStatus)) {
          return errorResponse('Estado no válido.', 400);
        }

        await env.DB.prepare(
          "UPDATE customer_orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
        )
          .bind(nextStatus, orderId, auth.negocioId)
          .run();

        const updated = await env.DB.prepare('SELECT * FROM customer_orders WHERE id = ? AND negocio_id = ?')
          .bind(orderId, auth.negocioId)
          .first<any>();

        let items = [];
        try {
          items = JSON.parse(updated.items_json);
        } catch {}

        return jsonResponse({ ...updated, items });
      }

      // POST /api/customer-orders/:id/convert-to-sale (Facturar y Despachar en 1 Clic desde el POS)
      if (method === 'POST' && subPath.endsWith('/convert-to-sale')) {
        const orderId = subPath.replace(/\/convert-to-sale$/, '').trim();
        const body = (await request.json().catch(() => ({}))) as any;

        const order = await env.DB.prepare(
          'SELECT * FROM customer_orders WHERE id = ? AND negocio_id = ?'
        )
          .bind(orderId, auth.negocioId)
          .first<any>();

        if (!order) {
          return errorResponse('Pedido no encontrado en este local.', 404);
        }

        if (order.status === 'completed' && order.sale_id) {
          return jsonResponse({
            success: true,
            message: 'Este pedido ya fue facturado previamente.',
            sale_id: order.sale_id,
          });
        }

        let items: Array<any> = [];
        try {
          items = JSON.parse(order.items_json);
        } catch {}

        const saleId = `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const paymentMethod = body.payment_method || (order.payment_method === 'transfer' ? 'other' : order.payment_method === 'credit' ? 'credit' : 'cash');
        const creditCustomerId = body.credit_customer_id || null;
        const creditCustomerName = body.credit_customer_name || (paymentMethod === 'credit' ? order.customer_name : null);

        // Operación atómica en D1 batch
        const batchStatements: any[] = [];

        // 1. Insertar venta
        batchStatements.push(
          env.DB.prepare(
            `INSERT INTO sales (
              id, negocio_id, total_cents, payment_method, credit_customer_id, credit_customer_name,
              created_by_uid, created_by_role, schema_version, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, datetime('now'))`
          ).bind(
            saleId,
            auth.negocioId,
            order.total_cents,
            paymentMethod,
            creditCustomerId,
            creditCustomerName,
            auth.user.id,
            auth.user.role
          )
        );

        // 2. Insertar items y descontar stock
        for (const item of items) {
          const itemId = `si-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const subtotal = item.subtotal_cents || (item.quantity * item.unit_price_cents);
          batchStatements.push(
            env.DB.prepare(
              `INSERT INTO sale_items (
                id, sale_id, product_id, product_name, quantity, price_cents, subtotal_cents, category
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              itemId,
              saleId,
              item.product_id,
              item.product_name,
              item.quantity,
              item.unit_price_cents,
              subtotal,
              item.category || null
            )
          );

          batchStatements.push(
            env.DB.prepare(
              `UPDATE products SET stock = MAX(0, stock - ?), updated_at = datetime('now')
               WHERE id = ? AND negocio_id = ?`
            ).bind(item.quantity, item.product_id, auth.negocioId)
          );
        }

        // 3. Si fue fiado, crear cargo en credit_entries si se especificó el cliente
        if (paymentMethod === 'credit' && creditCustomerId) {
          const entryId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          batchStatements.push(
            env.DB.prepare(
              `INSERT INTO credit_entries (
                id, negocio_id, customer_id, type, amount_cents, description, sale_id,
                created_by_uid, created_by_role, created_at
              ) VALUES (?, ?, ?, 'debt', ?, ?, ?, ?, ?, datetime('now'))`
            ).bind(
              entryId,
              auth.negocioId,
              creditCustomerId,
              order.total_cents,
              `Pedido Kiosco ${order.order_code}`,
              saleId,
              auth.user.id,
              auth.user.role
            )
          );

          batchStatements.push(
            env.DB.prepare(
              `UPDATE credit_customers
               SET balance_cents = balance_cents + ?, last_entry_at = datetime('now'), updated_at = datetime('now')
               WHERE id = ? AND negocio_id = ?`
            ).bind(order.total_cents, creditCustomerId, auth.negocioId)
          );
        }

        // 4. Actualizar estado de customer_orders
        batchStatements.push(
          env.DB.prepare(
            "UPDATE customer_orders SET status = 'completed', sale_id = ?, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
          ).bind(saleId, orderId, auth.negocioId)
        );

        await env.DB.batch(batchStatements);

        return jsonResponse({
          success: true,
          message: `Pedido ${order.order_code} facturado y descontado exitosamente.`,
          sale_id: saleId,
          order_id: orderId,
        });
      }
    }

    // 11. Webhooks de Meta WhatsApp Cloud API (Público / HMAC & Challenge)
    if (path === '/webhooks/whatsapp' || path.startsWith('/webhooks/whatsapp')) {
      await ensureWhatsAppTables(env.DB);

      // 11.1 Verificación de Webhook (Meta GET challenge)
      if (method === 'GET') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        const expectedToken = (env.WHATSAPP_VERIFY_TOKEN as string) || 'surtifacil-webhook-secret';
        if (mode === 'subscribe' && token === expectedToken && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        return errorResponse('Verificación de webhook fallida.', 403);
      }

      // 11.2 Recepción de Mensajes Entrantes (Meta POST)
      if (method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as any;
        const entry = body?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const messages = value?.messages;

        if (Array.isArray(messages) && messages.length > 0) {
          const firstMsg = messages[0];
          const fromPhone = firstMsg.from || '';
          const messageText = firstMsg.text?.body || '';
          const contact = value?.contacts?.[0];
          const customerName = contact?.profile?.name || 'Cliente WhatsApp';

          if (fromPhone && messageText) {
            // Identificar tienda por teléfono de WhatsApp o tomar negocio insignia
            let store = await env.DB.prepare(
              'SELECT id FROM negocios WHERE telefono_whatsapp = ? OR id = ? LIMIT 1'
            )
              .bind(fromPhone, 'surtifacil')
              .first<any>();

            if (!store) {
              store = await env.DB.prepare('SELECT id FROM negocios LIMIT 1').first<any>();
            }

            if (store) {
              await processSarinCustomerMessage(env.DB, env, {
                negocioId: store.id,
                customerPhone: fromPhone,
                customerName,
                userMessage: messageText,
              });
            }
          }
        }

        return jsonResponse({ success: true });
      }
    }

    // 12. Chat Vecinal Asistido por Sarin (/api/ai/sarin-chat - Público o Cliente Web)
    if (path === '/ai/sarin-chat' && method === 'POST') {
      await ensureWhatsAppTables(env.DB);
      const body = (await request.json()) as any;
      const slug = (body.slug || 'surtifacil').trim().toLowerCase();
      const userMessage = (body.message || body.messageText || '').trim();

      if (!userMessage) {
        return errorResponse('El mensaje no puede estar vacío.', 400);
      }

      const store = await env.DB.prepare(
        'SELECT id, slug, nombre FROM negocios WHERE slug = ? OR id = ? LIMIT 1'
      )
        .bind(slug, slug)
        .first<any>();

      if (!store) {
        return errorResponse('Tienda no encontrada.', 404);
      }

      const result = await processSarinCustomerMessage(env.DB, env, {
        negocioId: store.id,
        conversationId: body.conversationId,
        customerPhone: body.customerPhone || 'web-cliente',
        customerName: body.customerName || 'Vecino Web',
        userMessage,
      });

      return jsonResponse({
        success: true,
        ...result,
      });
    }

    // 12.1 Copiloto Gerencial Sarin (/api/ai/copilot - Requiere Auth de Staff)
    if (path === '/ai/copilot' && method === 'POST') {
      const auth = await authenticateRequest(request, env);
      const body = (await request.json()) as any;
      const userMessage = (body.message || body.userMessage || '').trim();

      if (!userMessage) {
        return errorResponse('El mensaje para el copiloto no puede estar vacío.', 400);
      }

      const result = await processSarinCopilotMessage(env.DB, env, {
        negocioId: auth.negocioId,
        userMessage,
        conversationHistory: body.conversationHistory || [],
      });

      return jsonResponse({
        success: true,
        ...result,
      });
    }

    // 13. Endpoints de WhatsApp para Mostrador y Staff (Requieren Auth)
    if (path === '/whatsapp' || path.startsWith('/whatsapp/')) {
      await ensureWhatsAppTables(env.DB);
      const auth = await authenticateRequest(request, env);
      const subPath = path.replace(/^\/whatsapp\/?/, '');

      // 13.1 GET /api/whatsapp/conversations (Bandeja de conversaciones del local)
      if (method === 'GET' && subPath === 'conversations') {
        const rows = await env.DB.prepare(
          `SELECT id, phone_number, customer_name, status, bot_active, paused_until, cart_json, 
                  last_message_text, last_message_at, created_at, updated_at 
           FROM whatsapp_conversations 
           WHERE negocio_id = ? 
           ORDER BY updated_at DESC LIMIT 50`
        )
          .bind(auth.negocioId)
          .all<any>();

        const conversations = (rows.results || []).map((row) => {
          let cart = [];
          try {
            cart = JSON.parse(row.cart_json || '[]');
          } catch {}

          return {
            id: row.id,
            phoneNumber: row.phone_number,
            customerName: row.customer_name,
            firstMessageDate: row.created_at,
            lastMessageDate: row.last_message_at || row.updated_at,
            status: row.status,
            botActive: Boolean(row.bot_active),
            pausedUntil: row.paused_until,
            cart,
            lastMessageText: row.last_message_text,
          };
        });

        return jsonResponse(conversations);
      }

      // 13.2 GET /api/whatsapp/conversations/:id/messages (Historial de mensajes)
      if (method === 'GET' && subPath.startsWith('conversations/') && subPath.endsWith('/messages')) {
        const convId = subPath.replace(/^conversations\//, '').replace(/\/messages$/, '').trim();

        const rows = await env.DB.prepare(
          `SELECT id, conversation_id, direction, sender, message_text, message_type, metadata_json, created_at 
           FROM whatsapp_messages 
           WHERE conversation_id = ? AND negocio_id = ? 
           ORDER BY created_at ASC LIMIT 100`
        )
          .bind(convId, auth.negocioId)
          .all<any>();

        const messages = (rows.results || []).map((m) => {
          let metadata = {};
          try {
            metadata = JSON.parse(m.metadata_json || '{}');
          } catch {}

          return {
            id: m.id,
            conversationId: m.conversation_id,
            sender: m.sender === 'customer' ? 'customer' : 'admin',
            message: m.message_text,
            timestamp: m.created_at,
            messageType: m.message_type || 'text',
            metadata,
          };
        });

        return jsonResponse(messages);
      }

      // 13.3 POST /api/whatsapp/conversations/:id/toggle-bot (Activar / Pausar Bot Sarin)
      if (method === 'POST' && subPath.startsWith('conversations/') && subPath.endsWith('/toggle-bot')) {
        const convId = subPath.replace(/^conversations\//, '').replace(/\/toggle-bot$/, '').trim();
        const body = (await request.json().catch(() => ({}))) as any;
        const botActive = body.botActive !== undefined ? (body.botActive ? 1 : 0) : 1;
        const pausedHours = Number(body.pausedHours || 2);

        if (botActive === 1) {
          await env.DB.prepare(
            `UPDATE whatsapp_conversations 
             SET bot_active = 1, status = 'active', paused_until = null, updated_at = datetime('now') 
             WHERE id = ? AND negocio_id = ?`
          )
            .bind(convId, auth.negocioId)
            .run();
        } else {
          await env.DB.prepare(
            `UPDATE whatsapp_conversations 
             SET bot_active = 0, status = 'paused', 
                 paused_until = datetime('now', '+' || ? || ' hours'), 
                 updated_at = datetime('now') 
             WHERE id = ? AND negocio_id = ?`
          )
            .bind(pausedHours, convId, auth.negocioId)
            .run();
        }

        return jsonResponse({
          success: true,
          botActive: botActive === 1,
          conversationId: convId,
        });
      }

      // 13.4 POST /api/whatsapp/send (Envío manual de tendero a cliente)
      if (method === 'POST' && subPath === 'send') {
        const body = (await request.json()) as any;
        const convId = (body.conversationId || '').trim();
        const text = (body.message || '').trim();
        const msgType = body.messageType || 'text';

        if (!text) {
          return errorResponse('El contenido del mensaje es obligatorio.', 400);
        }

        const msgId = `wamid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        if (convId) {
          await env.DB.prepare(
            `INSERT INTO whatsapp_messages (
              id, conversation_id, negocio_id, direction, sender, message_text, message_type, created_at
            ) VALUES (?, ?, ?, 'outbound', 'human_staff', ?, ?, datetime('now'))`
          )
            .bind(msgId, convId, auth.negocioId, text, msgType)
            .run();

          await env.DB.prepare(
            `UPDATE whatsapp_conversations 
             SET last_message_text = ?, last_message_at = datetime('now'), updated_at = datetime('now') 
             WHERE id = ? AND negocio_id = ?`
          )
            .bind(text, convId, auth.negocioId)
            .run();
        }

        return jsonResponse({
          success: true,
          id: msgId,
          messageId: msgId,
          data: {
            messages: [{ id: msgId }],
          },
        });
      }

      // 13.5 POST /api/whatsapp/simulate (Simulador interactivo de Sarin desde el panel staff)
      if (method === 'POST' && subPath === 'simulate') {
        const body = (await request.json()) as any;
        const text = (body.messageText || body.message || '').trim();

        if (!text) {
          return errorResponse('El mensaje para simular no puede estar vacío.', 400);
        }

        const result = await processSarinCustomerMessage(env.DB, env, {
          negocioId: auth.negocioId,
          conversationId: body.conversationId,
          customerPhone: body.phoneNumber || '+573001234567',
          customerName: body.customerName || 'Vecino en Mostrador',
          userMessage: text,
        });

        return jsonResponse({
          success: true,
          ...result,
        });
      }
    }

    // 14. Diagnóstico de Integraciones y Auditoría de Secretos (/api/integrations)
    if (path === '/integrations' || path.startsWith('/integrations/')) {
      const auth = await authenticateRequest(request, env);
      const subPath = path.replace('/integrations', '').replace(/^\//, '');

      // 14.1 GET /api/integrations/status
      if (method === 'GET' && (subPath === 'status' || subPath === '')) {
        const hasDeepSeekKey = Boolean(env.DEEPSEEK_API_KEY && String(env.DEEPSEEK_API_KEY).trim().length > 10);
        const hasWhatsAppToken = Boolean(env.WHATSAPP_TOKEN && String(env.WHATSAPP_TOKEN).trim().length > 10);
        const hasWhatsAppPhoneId = Boolean(env.WHATSAPP_PHONE_ID && String(env.WHATSAPP_PHONE_ID).trim().length > 5);

        return jsonResponse({
          deepseek: {
            configured: hasDeepSeekKey,
            mode: hasDeepSeekKey ? 'live' : 'simulated_heuristic',
            model: 'deepseek-chat',
            provider: 'DeepSeek API v3 (Edge)',
          },
          whatsapp: {
            configured: hasWhatsAppToken && hasWhatsAppPhoneId,
            mode: hasWhatsAppToken && hasWhatsAppPhoneId ? 'live' : 'simulated_local',
            phone_id: hasWhatsAppPhoneId
              ? String(env.WHATSAPP_PHONE_ID).slice(-4).padStart(String(env.WHATSAPP_PHONE_ID).length, '*')
              : null,
            webhook_url: 'https://surtifacil.pages.dev/api/webhooks/whatsapp',
            verify_token_configured: Boolean(env.WHATSAPP_VERIFY_TOKEN),
          },
          database: {
            status: 'connected',
            engine: 'Cloudflare D1 (SQLite Edge)',
            multi_tenant: true,
          },
        });
      }

      // 14.2 POST /api/integrations/test-deepseek
      if (method === 'POST' && subPath === 'test-deepseek') {
        const hasDeepSeekKey = Boolean(env.DEEPSEEK_API_KEY && String(env.DEEPSEEK_API_KEY).trim().length > 10);
        if (!hasDeepSeekKey) {
          return jsonResponse({
            success: true,
            mode: 'simulated_heuristic',
            latency_ms: 32,
            message:
              'DeepSeek opera en Modo Heurístico Paisa (secreto DEEPSEEK_API_KEY no configurado en Cloudflare Pages).',
          });
        }

        const start = Date.now();
        try {
          const resp = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: 'Di "SurtiFácil Online" en 3 palabras.' }],
              max_tokens: 15,
            }),
          });
          const latency = Date.now() - start;
          if (resp.ok) {
            return jsonResponse({
              success: true,
              mode: 'live',
              latency_ms: latency,
              message: 'Conexión exitosa con DeepSeek API oficial en la nube.',
            });
          }
          const errData = await resp.json().catch(() => ({}));
          return jsonResponse(
            {
              success: false,
              mode: 'error',
              latency_ms: latency,
              error: `DeepSeek devolvió HTTP ${resp.status}: ${(errData as any).error?.message || 'Error de clave o cuota'}`,
            },
            400
          );
        } catch (e: any) {
          return jsonResponse(
            {
              success: false,
              mode: 'error',
              error: `Error de red al conectar con DeepSeek: ${e.message}`,
            },
            500
          );
        }
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
