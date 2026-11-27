import { PagesFunction, Env, D1Database } from '../types';
import { jsonResponse, errorResponse, handleOptions } from '../_lib/response';
import { authenticateRequest, AuthContext } from '../_lib/authMiddleware';
import { ensureDatabaseSchema, hashPassword, verifyPasswordHash } from '../_lib/dbSchema';
import {
  checkRateLimit,
  clearRateLimit,
  isDevOrTestAuthAllowed,
  resolveSessionSigningSecret,
  signD1SessionToken,
  verifyWhatsAppWebhookSignature,
} from '../_lib/securityCrypto';
import { processSarinCustomerMessage, ensureWhatsAppTables } from '../_lib/sarinCustomerOrchestrator';
import { processSarinCopilotMessage } from '../_lib/sarinCopilotOrchestrator';
import {
  parseWholesaleTiers,
  resolveProductUnitPricing,
  validateWholesaleTiersInput,
  WholesaleTier,
} from '../_lib/wholesalePricing';
import {
  computeLineSubtotalCents,
  roundQuantity,
  validateItemQuantity,
  type KardexMovementType,
} from '../_lib/bulkWeight';
import {
  calculateNetProfitStatement,
  extractSalePaymentBuckets,
  parsePaymentBreakdown,
  resolveSalePaymentBreakdown,
  type PaymentBreakdownEntry,
} from '../_lib/saleAccounting';
import {
  DEFAULT_LOYALTY_CONFIG,
  isValidCouponCode,
  isValidLoyaltyPhone,
  maskPublicCustomerName,
  normalizeCouponCode,
  normalizeLoyaltyConfig,
  normalizeLoyaltyPhone,
  settleOrderLoyaltyAndCoupon,
  validateCouponForSubtotal,
  type CouponDiscountType,
  type CouponRecord,
  type LoyaltyConfig,
} from '../_lib/loyaltyEngine';

const VALID_STAFF_ROLES = new Set(['admin', 'manager', 'cashier']);

function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP') || request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const forwarded = request.headers.get('X-Forwarded-For') || request.headers.get('x-forwarded-for');
  if (forwarded && forwarded.trim()) return forwarded.split(',')[0].trim();
  return 'local';
}

async function getDemoSecurityConfig(
  db: D1Database | undefined,
  request: Request,
  env: Env
): Promise<{ demo_quick_access_enabled: boolean; superadmin_quick_access_enabled: boolean }> {
  const envDisabled = String(env.DISABLE_DEMO_ACCESS || '').trim().toLowerCase() === 'true';
  let demoQuickAccessEnabled = !envDisabled;

  if (!envDisabled && db) {
    try {
      const row = await db
        .prepare('SELECT secret_value FROM _system_secrets WHERE secret_key = ?')
        .bind('demo_quick_access_enabled')
        .first<{ secret_value?: string }>();
      if (row?.secret_value === 'false') {
        demoQuickAccessEnabled = false;
      } else if (row?.secret_value === 'true') {
        demoQuickAccessEnabled = true;
      }
    } catch {
      // Fallback al valor por defecto según variable de entorno
    }
  }

  const allowSuperAdminQuick =
    demoQuickAccessEnabled &&
    (isDevOrTestAuthAllowed(request, env) ||
      String(env.ALLOW_SUPERADMIN_QUICK_DEMO || '').trim().toLowerCase() === 'true');

  return {
    demo_quick_access_enabled: demoQuickAccessEnabled,
    superadmin_quick_access_enabled: allowSuperAdminQuick,
  };
}

function enrichProductRow<T extends Record<string, any> | null | undefined>(row: T): T {
  if (!row) return row;
  return {
    ...row,
    stock: roundQuantity(Number(row.stock ?? 0), true),
    allow_fractional: Boolean(row.allow_fractional),
    wholesale_tiers: parseWholesaleTiers(row.wholesale_tiers ?? row.wholesale_tiers_json),
  };
}

interface KardexStatementInput {
  negocioId: string;
  productId: string;
  productName: string;
  unit?: string | null;
  movementType: KardexMovementType;
  quantityDelta: number;
  stockBefore: number;
  stockAfter: number;
  unitCostCents?: number;
  unitPriceCents?: number;
  totalValueCents?: number;
  referenceId?: string | null;
  notes?: string | null;
  actorUid: string;
  actorName?: string | null;
}

function buildKardexStatement(db: D1Database, entry: KardexStatementInput) {
  const id = `kdx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const cleanDelta = roundQuantity(entry.quantityDelta, true);
  const cleanBefore = roundQuantity(entry.stockBefore, true);
  const cleanAfter = roundQuantity(entry.stockAfter, true);
  return db
    .prepare(
      `INSERT INTO inventory_kardex (
        id, negocio_id, product_id, product_name, unit, movement_type,
        quantity_delta, stock_before, stock_after, unit_cost_cents, unit_price_cents,
        total_value_cents, reference_id, notes, created_by_uid, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      id,
      entry.negocioId,
      entry.productId,
      entry.productName,
      entry.unit || 'unidad',
      entry.movementType,
      cleanDelta,
      cleanBefore,
      cleanAfter,
      Math.max(0, Math.round(Number(entry.unitCostCents) || 0)),
      Math.max(0, Math.round(Number(entry.unitPriceCents) || 0)),
      Math.max(0, Math.round(Number(entry.totalValueCents) || 0)),
      entry.referenceId || null,
      entry.notes ? entry.notes.slice(0, 250) : null,
      entry.actorUid,
      entry.actorName || null
    );
}

function enrichSaleRow<T extends Record<string, any>>(row: T, items: any[] = []) {
  const breakdown = parsePaymentBreakdown(
    row.payment_breakdown_json ?? row.payment_breakdown,
    row.payment_method || 'cash',
    Number(row.total_cents ?? row.total ?? 0)
  );
  return {
    ...row,
    status: row.status === 'voided' ? 'voided' : 'completed',
    payment_method: breakdown.length > 1 ? 'mixed' : (row.payment_method || breakdown[0]?.method || 'cash'),
    payment_breakdown: breakdown,
    items,
  };
}

async function aggregateShiftSalesAndCredits(
  db: D1Database,
  negocioId: string,
  openedAt: string
): Promise<{
  salesCashCents: number;
  salesCashCount: number;
  creditPaymentsCashCents: number;
  creditPaymentsCashCount: number;
  otherSales: Array<{ payment_method: string; count: number; total_cents: number }>;
}> {
  const shiftSalesRows = await db
    .prepare(
      "SELECT id, total_cents, payment_method, payment_breakdown_json, status FROM sales WHERE negocio_id = ? AND COALESCE(status, 'completed') != 'voided' AND created_at >= ?"
    )
    .bind(negocioId, openedAt)
    .all<{
      id: string;
      total_cents: number;
      payment_method: string;
      payment_breakdown_json?: string | null;
      status?: string | null;
    }>();

  let salesCashCents = 0;
  let salesCashCount = 0;
  const otherBuckets: Record<string, { count: number; total_cents: number }> = {};

  for (const row of shiftSalesRows.results || []) {
    const buckets = extractSalePaymentBuckets(row);
    if (buckets.cash_cents > 0) {
      salesCashCents += buckets.cash_cents;
      salesCashCount += 1;
    }
    if (buckets.card_cents > 0) {
      if (!otherBuckets.card) otherBuckets.card = { count: 0, total_cents: 0 };
      otherBuckets.card.count += 1;
      otherBuckets.card.total_cents += buckets.card_cents;
    }
    if (buckets.transfer_cents > 0) {
      if (!otherBuckets.other) otherBuckets.other = { count: 0, total_cents: 0 };
      otherBuckets.other.count += 1;
      otherBuckets.other.total_cents += buckets.transfer_cents;
    }
    if (buckets.credit_cents > 0) {
      if (!otherBuckets.credit) otherBuckets.credit = { count: 0, total_cents: 0 };
      otherBuckets.credit.count += 1;
      otherBuckets.credit.total_cents += buckets.credit_cents;
    }
  }

  // Excluir reversiones de fiado generadas por anulación de ventas (sale_id != NULL)
  const creditPaymentsRow = await db
    .prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_credit_cash_cents FROM credit_entries WHERE negocio_id = ? AND type = 'payment' AND (sale_id IS NULL OR sale_id = '') AND created_at >= ?"
    )
    .bind(negocioId, openedAt)
    .first<{ count: number; total_credit_cash_cents: number }>();

  return {
    salesCashCents,
    salesCashCount,
    creditPaymentsCashCents: creditPaymentsRow?.total_credit_cash_cents || 0,
    creditPaymentsCashCount: creditPaymentsRow?.count || 0,
    otherSales: Object.entries(otherBuckets).map(([payment_method, data]) => ({
      payment_method,
      count: data.count,
      total_cents: data.total_cents,
    })),
  };
}

async function loadNegocioLoyaltyConfig(
  db: D1Database,
  negocioId: string
): Promise<{ config: LoyaltyConfig; configObj: Record<string, any> }> {
  const row = await db
    .prepare('SELECT config_json FROM negocios WHERE id = ?')
    .bind(negocioId)
    .first<{ config_json?: string | null }>();
  let parsed: Record<string, any> = {};
  try {
    parsed = row?.config_json ? JSON.parse(row.config_json) : {};
  } catch {
    parsed = {};
  }
  return {
    config: normalizeLoyaltyConfig((parsed as any).loyalty),
    configObj: parsed,
  };
}

async function appendOrderLoyaltyEarnStatements(
  db: D1Database,
  negocioId: string,
  order: any,
  batchStatements: any[],
  actor: { id: string; role: string },
  saleId: string | null = null
): Promise<string | null> {
  if (!order || order.loyalty_settled === 1) return order?.loyalty_account_id ?? null;

  const normalizedPhone = order.customer_phone ? normalizeLoyaltyPhone(String(order.customer_phone)) : '';
  if (!isValidLoyaltyPhone(normalizedPhone)) {
    return order.loyalty_account_id ?? null;
  }

  const { config: loyaltyConfig } = await loadNegocioLoyaltyConfig(db, negocioId);
  const pointsEarned = loyaltyConfig.enabled ? Math.max(0, Math.round(Number(order.loyalty_points_earned) || 0)) : 0;

  const existingAcc = await db
    .prepare('SELECT * FROM loyalty_accounts WHERE negocio_id = ? AND phone = ?')
    .bind(negocioId, normalizedPhone)
    .first<any>();

  const paidMerchandiseCents = Math.max(
    0,
    (Number(order.subtotal_cents) || Number(order.total_cents) || 0) -
      (Number(order.coupon_discount_cents) || 0) -
      (Number(order.loyalty_discount_cents) || 0)
  );
  const spentTotalCents = Math.max(0, Number(order.total_cents) || 0);
  let resolvedAccountId: string | null = existingAcc?.id ?? order.loyalty_account_id ?? null;

  if (existingAcc) {
    const nextBalance = Math.max(0, (Number(existingAcc.points_balance) || 0) + pointsEarned);
    batchStatements.push(
      db
        .prepare(
          `UPDATE loyalty_accounts
           SET points_balance = points_balance + ?,
               lifetime_points_earned = lifetime_points_earned + ?,
               total_purchases_count = total_purchases_count + 1,
               total_spent_cents = total_spent_cents + ?,
               last_activity_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ? AND negocio_id = ?`
        )
        .bind(pointsEarned, pointsEarned, spentTotalCents, existingAcc.id, negocioId)
    );
    if (pointsEarned > 0) {
      const movId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      batchStatements.push(
        db
          .prepare(
            `INSERT INTO loyalty_movements (
              id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, sale_id, order_id, created_by_uid, created_by_role, created_at
            ) VALUES (?, ?, ?, 'earn', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .bind(
            movId,
            negocioId,
            existingAcc.id,
            pointsEarned,
            nextBalance,
            paidMerchandiseCents,
            `Puntos ganados por pedido ${order.order_code}`,
            saleId,
            order.id,
            actor.id,
            actor.role
          )
      );
    }
  } else if (pointsEarned > 0 || loyaltyConfig.enabled) {
    resolvedAccountId = `loy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const customerName = String(order.customer_name || '').trim() || `Vecino ${normalizedPhone.slice(-4)}`;
    batchStatements.push(
      db
        .prepare(
          `INSERT INTO loyalty_accounts (
            id, negocio_id, phone, customer_name, points_balance, lifetime_points_earned, lifetime_points_redeemed,
            total_purchases_count, total_spent_cents, active, last_activity_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 1, datetime('now'), datetime('now'), datetime('now'))`
        )
        .bind(resolvedAccountId, negocioId, normalizedPhone, customerName, pointsEarned, pointsEarned, spentTotalCents)
    );
    if (pointsEarned > 0) {
      const movId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      batchStatements.push(
        db
          .prepare(
            `INSERT INTO loyalty_movements (
              id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, sale_id, order_id, created_by_uid, created_by_role, created_at
            ) VALUES (?, ?, ?, 'earn', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .bind(
            movId,
            negocioId,
            resolvedAccountId,
            pointsEarned,
            pointsEarned,
            paidMerchandiseCents,
            `Puntos ganados por pedido ${order.order_code}`,
            saleId,
            order.id,
            actor.id,
            actor.role
          )
      );
    }
  }

  return resolvedAccountId;
}

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
  wholesale_tiers?: WholesaleTier[] | string | null;
  wholesale_tiers_json?: string | null;
  allow_fractional?: boolean | number;
  adjustment_reason?: string;
  last_cost_cents?: number;
  expiration_date?: string | null;
}

function normalizeExpirationDate(raw?: string | null): string | null | 'INVALID' {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return 'INVALID';
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const isoDay = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return 'INVALID';
  const [year, month, day] = isoDay.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return 'INVALID';
  }
  return isoDay;
}

interface SaleItemInput {
  product_id: string;
  quantity: number;
  price_cents?: number; // Verificado autoritativamente en servidor
}

interface SaleInput {
  payment_method: 'cash' | 'card' | 'other' | 'credit' | 'mixed';
  payment_breakdown?: Array<{ method: string; amount_cents: number }>;
  items: SaleItemInput[];
  credit_customer_id?: string;
  credit_customer_name?: string;
  loyalty_phone?: string;
  loyalty_customer_name?: string;
  loyalty_points_redeemed?: number;
  coupon_code?: string;
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

    // 2.05 Configuración Pública de Seguridad y Modo Demo (/auth/public-config)
    if (path === '/auth/public-config' && method === 'GET') {
      const demoConfig = await getDemoSecurityConfig(env.DB, request, env);
      return jsonResponse({
        demo_quick_access_enabled: demoConfig.demo_quick_access_enabled,
        superadmin_quick_access_enabled: demoConfig.superadmin_quick_access_enabled,
        token_signing: 'HMAC-SHA256',
        password_hashing: 'PBKDF2-SHA256',
      });
    }

    // 2.1 Registro Público de Nuevas Tiendas (/registro-negocio)
    if (path === '/registro-negocio' && method === 'POST') {
      const clientIp = getClientIp(request);
      const rate = checkRateLimit(`register:${clientIp}`, 10, 10 * 60_000, true);
      if (!rate.allowed) {
        return jsonResponse(
          { error: 'Demasiados registros desde esta red. Intenta nuevamente en unos minutos.', status: 429 },
          429,
          { 'Retry-After': String(rate.retryAfterSeconds) }
        );
      }

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
      const rawPassword = body.password !== undefined && body.password !== null ? String(body.password).trim() : '';

      if (!nombre || !slug || !email || !phone) {
        return errorResponse('Nombre de tienda, identificador (slug), correo y WhatsApp son obligatorios.', 400);
      }

      if (rawPassword.length > 0 && rawPassword.length < 6) {
        return errorResponse('La contraseña de administrador debe tener al menos 6 caracteres.', 400);
      }

      // Verificar que el correo electrónico no esté ya activo en otro local
      const existingEmailUser = await env.DB.prepare(
        'SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL'
      )
        .bind(email)
        .first();
      if (existingEmailUser) {
        return errorResponse('Este correo electrónico ya está registrado en SurtiFácil.', 409);
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

      // Crear usuario administrador en users con contraseña cifrada PBKDF2-SHA256
      const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const pwdHash = rawPassword ? await hashPassword(rawPassword) : null;

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

      const signingSecret = await resolveSessionSigningSecret(env);
      const sessionToken = await signD1SessionToken(
        { uid: userId, email, role: 'admin', negocioId, isSuperAdmin: false },
        signingSecret
      );

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
        `SELECT id, name, price_cents, stock, min_stock, unit, category, image_url, barcode, visible_kiosco, visible_tienda, en_oferta, precio_oferta_cents, wholesale_tiers_json, allow_fractional
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
          loyalty_config: normalizeLoyaltyConfig((parsedConfig as any).loyalty),
        },
        products: (productsResult.results || []).map((row: any) => enrichProductRow(row)),
        combos: combosResult.results || [],
      });
    }

    // 2.3 Consulta Pública de Puntos del Club del Barrio (/public/loyalty/lookup?slug=...&phone=...)
    if (path === '/public/loyalty/lookup' && method === 'GET') {
      const clientIp = getClientIp(request);
      const rl = checkRateLimit(`public-loyalty-lookup:${clientIp}`, 40, 5 * 60 * 1000);
      if (!rl.allowed) {
        return errorResponse('Demasiadas consultas de puntos. Espera unos minutos.', 429);
      }

      const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
      const rawPhone = url.searchParams.get('phone') || '';
      if (!slug) {
        return errorResponse('Slug de tienda no proporcionado.', 400);
      }
      const normalizedPhone = normalizeLoyaltyPhone(rawPhone);
      if (!isValidLoyaltyPhone(normalizedPhone)) {
        return errorResponse('Ingresa un número celular válido (7 a 15 dígitos).', 400);
      }

      const negocio = await env.DB.prepare('SELECT id, config_json FROM negocios WHERE slug = ?')
        .bind(slug)
        .first<{ id: string; config_json?: string | null }>();
      if (!negocio) {
        return errorResponse('Tienda no encontrada.', 404);
      }

      let parsedConfig: Record<string, any> = {};
      try {
        parsedConfig = negocio.config_json ? JSON.parse(negocio.config_json) : {};
      } catch {
        parsedConfig = {};
      }
      const config = normalizeLoyaltyConfig((parsedConfig as any).loyalty);

      const account = await env.DB.prepare(
        'SELECT id, customer_name, points_balance FROM loyalty_accounts WHERE negocio_id = ? AND phone = ? AND active = 1'
      )
        .bind(negocio.id, normalizedPhone)
        .first<{ id: string; customer_name: string; points_balance: number }>();

      if (!account) {
        return jsonResponse({
          enrolled: false,
          phone: normalizedPhone,
          display_name: null,
          points_balance: 0,
          redeemable_value_cents: 0,
          config,
        });
      }

      return jsonResponse({
        enrolled: true,
        phone: normalizedPhone,
        display_name: maskPublicCustomerName(account.customer_name),
        points_balance: Number(account.points_balance) || 0,
        redeemable_value_cents: (Number(account.points_balance) || 0) * config.point_value_cents,
        config,
      });
    }

    // 2.4 Validación Pública de Cupón de Descuento (/public/coupons/validate)
    if (path === '/public/coupons/validate' && method === 'POST') {
      const clientIp = getClientIp(request);
      const rl = checkRateLimit(`public-coupon-validate:${clientIp}`, 40, 5 * 60 * 1000);
      if (!rl.allowed) {
        return errorResponse('Demasiados intentos validando cupones. Espera unos minutos.', 429);
      }

      const body = (await request.json().catch(() => ({}))) as {
        slug?: string;
        code?: string;
        subtotal_cents?: number;
      };
      const slug = String(body.slug || '').trim().toLowerCase();
      const code = normalizeCouponCode(body.code || '');
      const subtotalCents = Math.max(0, Math.round(Number(body.subtotal_cents) || 0));

      if (!slug) {
        return errorResponse('Slug de tienda no proporcionado.', 400);
      }
      if (!code) {
        return errorResponse('Ingresa un código de cupón.', 400);
      }

      const negocio = await env.DB.prepare('SELECT id FROM negocios WHERE slug = ?')
        .bind(slug)
        .first<{ id: string }>();
      if (!negocio) {
        return errorResponse('Tienda no encontrada.', 404);
      }

      const coupon = await env.DB.prepare(
        'SELECT * FROM discount_coupons WHERE negocio_id = ? AND code = ?'
      )
        .bind(negocio.id, code)
        .first<CouponRecord>();

      const validation = validateCouponForSubtotal(coupon, subtotalCents);
      if (!validation.valid) {
        return jsonResponse({ valid: false, error: validation.error }, 400);
      }

      return jsonResponse({
        valid: true,
        coupon: {
          id: coupon!.id,
          code: coupon!.code,
          description: coupon!.description,
          discount_type: coupon!.discount_type,
          discount_value: coupon!.discount_value,
          min_purchase_cents: coupon!.min_purchase_cents,
          max_discount_cents: coupon!.max_discount_cents,
          expires_at: coupon!.expires_at,
        },
        discount_cents: validation.discount_cents,
        final_subtotal_cents: validation.final_subtotal_cents,
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

      const clientIp = getClientIp(request);
      const loginBucket = `login:${clientIp}:${email}`;
      const rateState = checkRateLimit(loginBucket, 10, 5 * 60_000, false);
      if (!rateState.allowed) {
        return jsonResponse(
          {
            authenticated: false,
            error: `Demasiados intentos fallidos. Espera ${rateState.retryAfterSeconds}s antes de intentar nuevamente.`,
            status: 429,
          },
          429,
          { 'Retry-After': String(rateState.retryAfterSeconds) }
        );
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
        checkRateLimit(loginBucket, 10, 5 * 60_000, true);
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
      const demoConfig = await getDemoSecurityConfig(env.DB, request, env);

      if (body.quick_access === true) {
        if (!demoConfig.demo_quick_access_enabled) {
          return errorResponse('El acceso rápido de demostración está deshabilitado en este entorno.', 403);
        }
        if (email === 'andres.san1404@gmail.com' && !demoConfig.superadmin_quick_access_enabled) {
          return errorResponse(
            'El acceso rápido de SuperAdmin está bloqueado en producción. Inicia sesión con Google.',
            403
          );
        }
        if (!isSeedEmail) {
          checkRateLimit(loginBucket, 10, 5 * 60_000, true);
          return errorResponse('El acceso rápido solo está permitido para cuentas demo oficiales.', 403);
        }
      } else {
        if (!password || password.length < 4) {
          checkRateLimit(loginBucket, 10, 5 * 60_000, true);
          return jsonResponse({ authenticated: false, error: 'Contraseña inválida.' }, 200);
        }

        if (userRow.password_hash) {
          const { valid, needsRehash } = await verifyPasswordHash(password, userRow.password_hash);
          if (!valid) {
            checkRateLimit(loginBucket, 10, 5 * 60_000, true);
            return jsonResponse({ authenticated: false, error: 'Credenciales inválidas.' }, 200);
          }
          if (needsRehash) {
            const upgradedHash = await hashPassword(password);
            await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
              .bind(upgradedHash, userRow.id)
              .run()
              .catch(() => {});
          }
        } else {
          // Solo cuentas demo no-SuperAdmin sin contraseña fijada pueden usar clave demo cuando el modo demo está activo
          const allowSeedPasswordFallback =
            isSeedEmail &&
            email !== 'andres.san1404@gmail.com' &&
            demoConfig.demo_quick_access_enabled &&
            password.length >= 6;
          if (!allowSeedPasswordFallback) {
            checkRateLimit(loginBucket, 10, 5 * 60_000, true);
            return jsonResponse({ authenticated: false, error: 'Credenciales inválidas.' }, 200);
          }
        }
      }

      clearRateLimit(loginBucket);

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
      const signingSecret = await resolveSessionSigningSecret(env);
      const token = await signD1SessionToken(
        {
          uid: userRow.id,
          email: userRow.email,
          role,
          negocioId,
          isSuperAdmin,
        },
        signingSecret
      );

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
      // Provisión segura de staff desde authService (solo admin / SuperAdmin)
      const auth = await authenticateRequest(request, env);
      if (auth.user.role !== 'admin' && !auth.user.isSuperAdmin) {
        return errorResponse('Acceso denegado: solo el administrador puede aprovisionar empleados.', 403);
      }

      const body = (await request.json()) as {
        email: string;
        password?: string;
        displayName?: string;
        role?: string;
      };
      const cleanEmail = (body.email || '').trim().toLowerCase();
      if (!cleanEmail) {
        return errorResponse('El correo electrónico es obligatorio.', 400);
      }

      const role = (body.role || 'cashier').trim();
      if (!VALID_STAFF_ROLES.has(role)) {
        return errorResponse('Rol de usuario no válido. Permitidos: admin, manager, cashier.', 400);
      }

      const rawPassword = body.password !== undefined && body.password !== null ? String(body.password).trim() : '';
      if (rawPassword.length > 0 && rawPassword.length < 6) {
        return errorResponse('La contraseña del empleado debe tener al menos 6 caracteres.', 400);
      }

      const existingEmail = await env.DB.prepare(
        'SELECT id, negocio_id FROM users WHERE lower(email) = ? AND deleted_at IS NULL'
      )
        .bind(cleanEmail)
        .first<{ id: string; negocio_id: string }>();
      if (existingEmail) {
        return errorResponse(
          existingEmail.negocio_id !== auth.negocioId
            ? 'Este correo ya pertenece a otra tienda registrada.'
            : 'Este correo ya está registrado en el personal de esta tienda.',
          409
        );
      }

      const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const pwdHash = rawPassword ? await hashPassword(rawPassword) : null;

      await env.DB.prepare(
        "INSERT INTO users (id, negocio_id, email, display_name, role, is_super_admin, active, password_hash, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, datetime('now'))"
      )
        .bind(newId, auth.negocioId, cleanEmail, body.displayName || null, role, pwdHash)
        .run();

      return jsonResponse({
        id: newId,
        email: cleanEmail,
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

    // 3.25 Control de Seguridad Global por SuperAdmin (/super-admin/security-config)
    if (path === '/super-admin/security-config' && method === 'PUT') {
      const auth = await authenticateRequest(request, env);
      if (!auth.user.isSuperAdmin && auth.user.email.toLowerCase() !== 'andres.san1404@gmail.com') {
        return errorResponse('Acceso denegado: solo el SuperAdmin de SurtiFácil puede modificar la seguridad.', 403);
      }

      const body = (await request.json().catch(() => ({}))) as { demo_quick_access_enabled?: boolean };
      if (typeof body.demo_quick_access_enabled !== 'boolean') {
        return errorResponse('El campo demo_quick_access_enabled (boolean) es obligatorio.', 400);
      }

      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS _system_secrets (
          secret_key TEXT PRIMARY KEY,
          secret_value TEXT NOT NULL,
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      )
        .run()
        .catch(() => {});

      await env.DB.prepare(
        `INSERT INTO _system_secrets (secret_key, secret_value, updated_at)
         VALUES ('demo_quick_access_enabled', ?, datetime('now'))
         ON CONFLICT(secret_key) DO UPDATE SET
           secret_value = excluded.secret_value,
           updated_at = datetime('now')`
      )
        .bind(body.demo_quick_access_enabled ? 'true' : 'false')
        .run();

      const demoConfig = await getDemoSecurityConfig(env.DB, request, env);
      return jsonResponse({
        success: true,
        demo_quick_access_enabled: demoConfig.demo_quick_access_enabled,
        superadmin_quick_access_enabled: demoConfig.superadmin_quick_access_enabled,
      });
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

      // GET /api/products/:id/kardex
      if (method === 'GET' && /^[^/]+\/kardex$/.test(productId)) {
        const targetId = decodeURIComponent(productId.replace(/\/kardex$/, ''));
        const product = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND negocio_id = ?')
          .bind(targetId, auth.negocioId)
          .first<Record<string, any>>();

        if (!product) {
          return errorResponse('Producto no encontrado en este local.', 404);
        }

        const movementTypeFilter = url.searchParams.get('movement_type') || '';
        const limitParam = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 200);

        let query = 'SELECT * FROM inventory_kardex WHERE negocio_id = ? AND product_id = ?';
        const params: unknown[] = [auth.negocioId, targetId];
        if (movementTypeFilter) {
          query += ' AND movement_type = ?';
          params.push(movementTypeFilter);
        }
        query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
        params.push(limitParam);

        const rows = await env.DB.prepare(query).bind(...params).all<any>();
        const entries = (rows.results || []).map((row: any) => ({
          ...row,
          quantity_delta: roundQuantity(Number(row.quantity_delta) || 0, true),
          stock_before: roundQuantity(Number(row.stock_before) || 0, true),
          stock_after: roundQuantity(Number(row.stock_after) || 0, true),
        }));

        let totalIn = 0;
        let totalOut = 0;
        for (const e of entries) {
          if (e.quantity_delta > 0) totalIn += e.quantity_delta;
          else if (e.quantity_delta < 0) totalOut += Math.abs(e.quantity_delta);
        }

        return jsonResponse({
          product: enrichProductRow(product),
          summary: {
            total_in: roundQuantity(totalIn, true),
            total_out: roundQuantity(totalOut, true),
            net_change: roundQuantity(totalIn - totalOut, true),
            movements_count: entries.length,
          },
          entries,
        });
      }

      // POST /api/products/:id/kardex/adjust
      if (method === 'POST' && /^[^/]+\/kardex\/adjust$/.test(productId)) {
        if (auth.user.role !== 'admin' && auth.user.role !== 'manager' && !auth.user.isSuperAdmin) {
          return errorResponse('Solo administradores y gerentes pueden ajustar inventario.', 403);
        }

        const targetId = decodeURIComponent(productId.replace(/\/kardex\/adjust$/, ''));
        const body = (await request.json().catch(() => ({}))) as {
          mode?: 'add' | 'subtract' | 'set';
          quantity?: number;
          reason?: string;
        };

        const mode = body.mode;
        if (mode !== 'add' && mode !== 'subtract' && mode !== 'set') {
          return errorResponse('Modo de ajuste inválido (usa add, subtract o set).', 400);
        }

        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (reason.length < 3 || reason.length > 250) {
          return errorResponse('Ingresa un motivo válido de al menos 3 caracteres para el Kardex.', 400);
        }

        const product = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND negocio_id = ?')
          .bind(targetId, auth.negocioId)
          .first<Record<string, any>>();

        if (!product) {
          return errorResponse('Producto no encontrado en este local.', 404);
        }

        const allowFractional = Boolean(product.allow_fractional);
        const rawQty = Number(body.quantity);
        let cleanQty = 0;

        if (mode === 'set') {
          if (!Number.isFinite(rawQty) || rawQty < 0 || rawQty > 99999) {
            return errorResponse('La cantidad final debe ser un número válido mayor o igual a 0.', 400);
          }
          if (!allowFractional && Math.abs(rawQty - Math.round(rawQty)) >= 1e-6) {
            return errorResponse('Este producto se controla por unidades enteras.', 400);
          }
          cleanQty = roundQuantity(rawQty, allowFractional);
        } else {
          const check = validateItemQuantity(rawQty, allowFractional);
          if (!check.ok) {
            return errorResponse(check.error, 400);
          }
          cleanQty = check.quantity;
        }

        const prevStock = roundQuantity(Number(product.stock) || 0, true);
        const nextStock =
          mode === 'add'
            ? roundQuantity(prevStock + cleanQty, true)
            : mode === 'subtract'
            ? roundQuantity(prevStock - cleanQty, true)
            : cleanQty;

        if (nextStock < 0) {
          return errorResponse(
            `El ajuste dejaría el stock en negativo (disponible: ${prevStock}).`,
            400
          );
        }

        const delta = roundQuantity(nextStock - prevStock, true);
        if (Math.abs(delta) < 1e-6) {
          return errorResponse('El stock resultante es igual al actual. No hay cambio por registrar.', 400);
        }

        const unitCost = product.last_cost_cents ?? Math.round((Number(product.price_cents) || 0) * 0.7);
        const totalValueCents = computeLineSubtotalCents(unitCost, Math.abs(delta));
        const actorName = auth.user.displayName || auth.user.email;

        await env.DB.batch([
          env.DB.prepare(
            "UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
          ).bind(nextStock, targetId, auth.negocioId),
          buildKardexStatement(env.DB, {
            negocioId: auth.negocioId,
            productId: targetId,
            productName: product.name,
            unit: product.unit || 'unidad',
            movementType: 'adjustment',
            quantityDelta: delta,
            stockBefore: prevStock,
            stockAfter: nextStock,
            unitCostCents: unitCost,
            unitPriceCents: Number(product.price_cents) || 0,
            totalValueCents,
            notes: reason,
            actorUid: auth.user.id,
            actorName,
          }),
        ]);

        const updated = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND negocio_id = ?')
          .bind(targetId, auth.negocioId)
          .first<Record<string, any>>();
        const latestKardex = await env.DB.prepare(
          'SELECT * FROM inventory_kardex WHERE negocio_id = ? AND product_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
        )
          .bind(auth.negocioId, targetId)
          .first<Record<string, any>>();

        return jsonResponse({
          success: true,
          product: enrichProductRow(updated),
          entry: latestKardex,
        });
      }

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
        return jsonResponse((result.results || []).map((row: any) => enrichProductRow(row)));
      }

      // POST /api/products
      if (method === 'POST') {
        const body = (await request.json()) as ProductInput;
        if (!body.name || typeof body.price_cents !== 'number' || body.price_cents < 0) {
          return errorResponse('Nombre y precio en centavos válidos son obligatorios.', 400);
        }

        const normalizedExp = normalizeExpirationDate(body.expiration_date);
        if (normalizedExp === 'INVALID') {
          return errorResponse('Fecha de vencimiento inválida. Usa formato YYYY-MM-DD.', 400);
        }

        const tiersCheck = validateWholesaleTiersInput(
          body.wholesale_tiers ?? body.wholesale_tiers_json,
          Math.round(body.price_cents)
        );
        if (!tiersCheck.valid) {
          return errorResponse(tiersCheck.error, 400);
        }

        const allowFractional = Boolean(body.allow_fractional);
        const rawStock = Number(body.stock ?? 0);
        if (!Number.isFinite(rawStock) || rawStock < 0) {
          return errorResponse('El stock inicial debe ser mayor o igual a 0.', 400);
        }
        const initialStock = roundQuantity(rawStock, allowFractional);

        const id = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const actorName = auth.user.displayName || auth.user.email;
        const unitCost = body.last_cost_cents ?? Math.round(Math.round(body.price_cents) * 0.7);
        const createBatch: any[] = [
          env.DB.prepare(
            `INSERT INTO products (
              id, negocio_id, name, price_cents, stock, min_stock, unit, category, image_url,
              supplier_id, barcode, visible_kiosco, visible_tienda, en_oferta, precio_oferta_cents,
              wholesale_tiers_json, allow_fractional, last_cost_cents, last_cost_source, expiration_date, last_cost_updated_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
          ).bind(
            id,
            auth.negocioId,
            body.name.trim(),
            Math.round(body.price_cents),
            initialStock,
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
            tiersCheck.json,
            allowFractional ? 1 : 0,
            body.last_cost_cents ?? null,
            body.last_cost_cents ? 'fallback_price' : null,
            normalizedExp
          ),
        ];

        if (initialStock > 0) {
          createBatch.push(
            buildKardexStatement(env.DB, {
              negocioId: auth.negocioId,
              productId: id,
              productName: body.name.trim(),
              unit: body.unit || 'unidad',
              movementType: 'initial',
              quantityDelta: initialStock,
              stockBefore: 0,
              stockAfter: initialStock,
              unitCostCents: unitCost,
              unitPriceCents: Math.round(body.price_cents),
              totalValueCents: computeLineSubtotalCents(unitCost, initialStock),
              notes: 'Alta inicial de producto en catálogo',
              actorUid: auth.user.id,
              actorName,
            })
          );
        }

        await env.DB.batch(createBatch);

        const created = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND negocio_id = ?')
          .bind(id, auth.negocioId)
          .first<Record<string, any>>();

        return jsonResponse(enrichProductRow(created), 201);
      }

      // PUT /api/products/:id
      if (method === 'PUT' && productId) {
        const body = (await request.json()) as Partial<ProductInput>;
        const existing = await env.DB.prepare(
          'SELECT id, name, unit, price_cents, stock, last_cost_cents, allow_fractional, expiration_date, wholesale_tiers_json FROM products WHERE id = ? AND negocio_id = ?'
        )
          .bind(productId, auth.negocioId)
          .first<{
            id: string;
            name: string;
            unit?: string;
            price_cents: number;
            stock: number;
            last_cost_cents?: number | null;
            allow_fractional?: number | boolean;
            expiration_date?: string | null;
            wholesale_tiers_json?: string | null;
          }>();

        if (!existing) {
          return errorResponse('Producto no encontrado.', 404);
        }

        let nextExpirationDate: string | null = existing.expiration_date ?? null;
        if (body.expiration_date !== undefined) {
          const normalizedExp = normalizeExpirationDate(body.expiration_date);
          if (normalizedExp === 'INVALID') {
            return errorResponse('Fecha de vencimiento inválida. Usa formato YYYY-MM-DD.', 400);
          }
          nextExpirationDate = normalizedExp;
        }

        const effectivePriceCents =
          body.price_cents !== undefined ? Math.round(body.price_cents) : existing.price_cents;
        let nextWholesaleTiersJson = existing.wholesale_tiers_json ?? '[]';
        if (body.wholesale_tiers !== undefined || body.wholesale_tiers_json !== undefined) {
          const tiersCheck = validateWholesaleTiersInput(
            body.wholesale_tiers ?? body.wholesale_tiers_json,
            effectivePriceCents
          );
          if (!tiersCheck.valid) {
            return errorResponse(tiersCheck.error, 400);
          }
          nextWholesaleTiersJson = tiersCheck.json;
        }

        const nextAllowFractional =
          body.allow_fractional !== undefined
            ? Boolean(body.allow_fractional)
            : Boolean(existing.allow_fractional);

        const prevStock = roundQuantity(Number(existing.stock) || 0, true);
        let nextStockParam: number | null = null;
        if (body.stock !== undefined && body.stock !== null) {
          const parsedStock = Number(body.stock);
          if (!Number.isFinite(parsedStock) || parsedStock < 0) {
            return errorResponse('El stock debe ser mayor o igual a 0.', 400);
          }
          nextStockParam = roundQuantity(parsedStock, nextAllowFractional);
        }

        const updateBatch: any[] = [
          env.DB.prepare(
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
              wholesale_tiers_json = ?,
              allow_fractional = ?,
              expiration_date = ?,
              updated_at = datetime('now')
            WHERE id = ? AND negocio_id = ?`
          ).bind(
            body.name?.trim() ?? null,
            body.price_cents !== undefined ? Math.round(body.price_cents) : null,
            nextStockParam,
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
            nextWholesaleTiersJson,
            nextAllowFractional ? 1 : 0,
            nextExpirationDate,
            productId,
            auth.negocioId
          ),
        ];

        if (nextStockParam !== null) {
          const delta = roundQuantity(nextStockParam - prevStock, true);
          if (Math.abs(delta) >= 1e-6) {
            const unitCost = existing.last_cost_cents ?? Math.round(effectivePriceCents * 0.7);
            updateBatch.push(
              buildKardexStatement(env.DB, {
                negocioId: auth.negocioId,
                productId,
                productName: body.name?.trim() || existing.name,
                unit: body.unit || existing.unit || 'unidad',
                movementType: 'adjustment',
                quantityDelta: delta,
                stockBefore: prevStock,
                stockAfter: nextStockParam,
                unitCostCents: unitCost,
                unitPriceCents: effectivePriceCents,
                totalValueCents: computeLineSubtotalCents(unitCost, Math.abs(delta)),
                notes: body.adjustment_reason?.trim() || 'Ajuste manual en catálogo',
                actorUid: auth.user.id,
                actorName: auth.user.displayName || auth.user.email,
              })
            );
          }
        }

        await env.DB.batch(updateBatch);

        const updated = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND negocio_id = ?')
          .bind(productId, auth.negocioId)
          .first<Record<string, any>>();

        return jsonResponse(enrichProductRow(updated));
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
          return jsonResponse(enrichSaleRow(sale, items.results || []));
        }
      }

      // GET /api/sales
      if (method === 'GET') {
        // Soporte para totales agregados calculados en D1 (solo ventas vigentes)
        if (url.searchParams.get('totals') === 'true') {
          const row = await env.DB.prepare(
            "SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as totalCents FROM sales WHERE negocio_id = ? AND COALESCE(status, 'completed') != 'voided'"
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
            return enrichSaleRow(sale, items.results || []);
          })
        );

        return jsonResponse(enrichedSales);
      }

      // POST /api/sales/:id/void — Anulación/Devolución Atómica en D1 (Admin / Manager)
      if (method === 'POST' && /^\/sales\/[^/]+\/void$/.test(path)) {
        if (auth.user.role !== 'admin' && auth.user.role !== 'manager' && !auth.user.isSuperAdmin) {
          return errorResponse('Solo administradores y gerentes pueden anular ventas.', 403);
        }

        const saleId = decodeURIComponent(path.replace(/^\/sales\//, '').replace(/\/void$/, '').trim());
        if (!saleId) {
          return errorResponse('ID de venta inválido.', 400);
        }

        const body = (await request.json().catch(() => ({}))) as { reason?: string };
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (reason.length < 3 || reason.length > 250) {
          return errorResponse('Ingresa un motivo de anulación válido (entre 3 y 250 caracteres).', 400);
        }

        const sale = await env.DB.prepare('SELECT * FROM sales WHERE id = ? AND negocio_id = ?')
          .bind(saleId, auth.negocioId)
          .first<any>();
        if (!sale) {
          return errorResponse('Venta no encontrada en este local.', 404);
        }
        if (sale.status === 'voided') {
          return errorResponse('Esta venta ya fue anulada previamente.', 409);
        }

        const itemsResult = await env.DB.prepare('SELECT * FROM sale_items WHERE sale_id = ?')
          .bind(saleId)
          .all<any>();
        const saleItems = itemsResult.results || [];

        const voidedAt = new Date().toISOString();
        const actorName = auth.user.displayName || auth.user.email || auth.user.id;
        const voidBatch: any[] = [
          env.DB.prepare(
            `UPDATE sales
             SET status = 'voided', voided_at = ?, voided_by_uid = ?, voided_by_name = ?, void_reason = ?
             WHERE id = ? AND negocio_id = ?`
          ).bind(voidedAt, auth.user.id, actorName, reason, saleId, auth.negocioId),
        ];

        let restockedUnits = 0;
        const voidProductIds = Array.from(
          new Set(saleItems.map((it: any) => it.product_id).filter(Boolean))
        );
        const voidStockMap = new Map<string, { stock: number; unit: string; name: string }>();
        if (voidProductIds.length > 0) {
          const ph = voidProductIds.map(() => '?').join(',');
          const prodsRes = await env.DB.prepare(
            `SELECT id, name, unit, stock FROM products WHERE negocio_id = ? AND id IN (${ph})`
          )
            .bind(auth.negocioId, ...voidProductIds)
            .all<{ id: string; name: string; unit?: string; stock: number }>();
          for (const p of prodsRes.results || []) {
            voidStockMap.set(p.id, {
              stock: roundQuantity(Number(p.stock) || 0, true),
              unit: p.unit || 'unidad',
              name: p.name,
            });
          }
        }

        for (const item of saleItems) {
          const qty = roundQuantity(Math.max(0, Number(item.quantity) || 0), true);
          if (qty > 0 && item.product_id) {
            restockedUnits = roundQuantity(restockedUnits + qty, true);
            voidBatch.push(
              env.DB.prepare(
                "UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
              ).bind(qty, item.product_id, auth.negocioId)
            );
            const pInfo = voidStockMap.get(item.product_id);
            const beforeStock = pInfo ? pInfo.stock : 0;
            const afterStock = roundQuantity(beforeStock + qty, true);
            if (pInfo) pInfo.stock = afterStock;
            voidBatch.push(
              buildKardexStatement(env.DB, {
                negocioId: auth.negocioId,
                productId: item.product_id,
                productName: item.product_name || pInfo?.name || 'Producto',
                unit: pInfo?.unit || 'unidad',
                movementType: 'sale_void',
                quantityDelta: qty,
                stockBefore: beforeStock,
                stockAfter: afterStock,
                unitCostCents: Number(item.unit_cost_cents) || 0,
                unitPriceCents: Number(item.price_cents) || 0,
                totalValueCents: Number(item.subtotal_cents) || 0,
                referenceId: saleId,
                notes: `Anulación venta #${saleId.slice(0, 8)}: ${reason}`,
                actorUid: auth.user.id,
                actorName,
              })
            );
          }
        }

        const buckets = extractSalePaymentBuckets(sale);
        if (buckets.credit_cents > 0 && sale.credit_customer_id) {
          const creditCust = await env.DB.prepare(
            'SELECT id, balance_cents FROM credit_customers WHERE id = ? AND negocio_id = ?'
          )
            .bind(sale.credit_customer_id, auth.negocioId)
            .first<{ id: string; balance_cents: number }>();

          if (creditCust) {
            const revEntryId = `centry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            voidBatch.push(
              env.DB.prepare(
                `INSERT INTO credit_entries (
                  id, negocio_id, customer_id, type, amount_cents, description, sale_id, created_by_uid, created_by_role, created_at
                ) VALUES (?, ?, ?, 'payment', ?, ?, ?, ?, ?, datetime('now'))`
              ).bind(
                revEntryId,
                auth.negocioId,
                sale.credit_customer_id,
                buckets.credit_cents,
                `Reversión por anulación venta #${saleId.slice(0, 8)}: ${reason}`.slice(0, 200),
                saleId,
                auth.user.id,
                auth.user.role
              )
            );

            voidBatch.push(
              env.DB.prepare(
                "UPDATE credit_customers SET balance_cents = MAX(0, balance_cents - ?), last_entry_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
              ).bind(buckets.credit_cents, sale.credit_customer_id, auth.negocioId)
            );
          }
        }

        if (sale.coupon_code) {
          voidBatch.push(
            env.DB.prepare(
              "UPDATE discount_coupons SET used_count = MAX(0, used_count - 1), updated_at = datetime('now') WHERE negocio_id = ? AND code = ?"
            ).bind(auth.negocioId, normalizeCouponCode(String(sale.coupon_code)))
          );
        }

        let loyaltyPointsDelta = 0;
        const earnedPts = Math.max(0, Number(sale.loyalty_points_earned) || 0);
        const redeemedPts = Math.max(0, Number(sale.loyalty_points_redeemed) || 0);
        if (sale.loyalty_account_id && (earnedPts > 0 || redeemedPts > 0)) {
          const loyAcc = await env.DB.prepare(
            'SELECT * FROM loyalty_accounts WHERE id = ? AND negocio_id = ?'
          )
            .bind(sale.loyalty_account_id, auth.negocioId)
            .first<any>();

          if (loyAcc) {
            loyaltyPointsDelta = redeemedPts - earnedPts;
            const prevBalance = Number(loyAcc.points_balance) || 0;
            const nextBalance = Math.max(0, prevBalance + loyaltyPointsDelta);
            const spentToSubtract = Math.max(0, Number(sale.total_cents) || 0);

            voidBatch.push(
              env.DB.prepare(
                `UPDATE loyalty_accounts
                 SET points_balance = MAX(0, points_balance + ?),
                     lifetime_points_earned = MAX(0, lifetime_points_earned - ?),
                     lifetime_points_redeemed = MAX(0, lifetime_points_redeemed - ?),
                     total_purchases_count = MAX(0, total_purchases_count - 1),
                     total_spent_cents = MAX(0, total_spent_cents - ?),
                     last_activity_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ? AND negocio_id = ?`
              ).bind(
                loyaltyPointsDelta,
                earnedPts,
                redeemedPts,
                spentToSubtract,
                loyAcc.id,
                auth.negocioId
              )
            );

            const revMovId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            voidBatch.push(
              env.DB.prepare(
                `INSERT INTO loyalty_movements (
                  id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, sale_id, created_by_uid, created_by_role, created_at
                ) VALUES (?, ?, ?, 'adjust', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
              ).bind(
                revMovId,
                auth.negocioId,
                loyAcc.id,
                loyaltyPointsDelta,
                nextBalance,
                spentToSubtract,
                `Reversión por anulación venta #${saleId.slice(0, 8)}`,
                saleId,
                auth.user.id,
                auth.user.role
              )
            );
          }
        }

        await env.DB.batch(voidBatch);

        const updatedSale = await env.DB.prepare('SELECT * FROM sales WHERE id = ? AND negocio_id = ?')
          .bind(saleId, auth.negocioId)
          .first<any>();

        return jsonResponse({
          success: true,
          sale: enrichSaleRow(
            updatedSale || {
              ...sale,
              status: 'voided',
              voided_at: voidedAt,
              voided_by_uid: auth.user.id,
              voided_by_name: actorName,
              void_reason: reason,
            },
            saleItems
          ),
          restocked_units: restockedUnits,
          credit_reversed_cents: buckets.credit_cents,
          loyalty_points_delta: loyaltyPointsDelta,
        });
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
          `SELECT id, name, price_cents, stock, unit, category, last_cost_cents, en_oferta, precio_oferta_cents, wholesale_tiers_json, allow_fractional
           FROM products WHERE negocio_id = ? AND id IN (${placeholders})`
        )
          .bind(auth.negocioId, ...productIds)
          .all<{
            id: string;
            name: string;
            price_cents: number;
            stock: number;
            unit?: string;
            category: string;
            last_cost_cents: number | null;
            en_oferta?: number;
            precio_oferta_cents?: number | null;
            wholesale_tiers_json?: string | null;
            allow_fractional?: number | boolean;
          }>();

        const productMap = new Map((dbProductsResult.results || []).map((p) => [p.id, p]));
        const runningStockMap = new Map(
          (dbProductsResult.results || []).map((p) => [p.id, roundQuantity(Number(p.stock) || 0, true)])
        );

        let computedTotalCents = 0;
        let computedTotalCostCents = 0;
        const preparedItems: Array<{
          id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          price_cents: number;
          subtotal_cents: number;
          regular_price_cents: number;
          applied_wholesale_tier: WholesaleTier | null;
          wholesale_savings_cents: number;
          unit_cost_cents: number;
          cost_subtotal_cents: number;
          unit: string;
          category: string;
        }> = [];

        for (const item of body.items) {
          const dbProd = productMap.get(item.product_id);
          if (!dbProd) {
            return errorResponse(`Producto ${item.product_id} no encontrado en este local.`, 404);
          }
          const qtyValidation = validateItemQuantity(item.quantity, Boolean(dbProd.allow_fractional));
          if (!qtyValidation.ok) {
            return errorResponse(qtyValidation.error, 400);
          }
          const validQty = qtyValidation.quantity;

          const pricing = resolveProductUnitPricing(dbProd, validQty);
          const unitPrice = pricing.unit_price_cents;
          const subtotal = pricing.subtotal_cents;
          const unitCost = dbProd.last_cost_cents ?? Math.round(unitPrice * 0.7);
          const costSubtotal = computeLineSubtotalCents(unitCost, validQty);

          computedTotalCents += subtotal;
          computedTotalCostCents += costSubtotal;

          preparedItems.push({
            id: `sitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            product_id: dbProd.id,
            product_name: dbProd.name,
            quantity: validQty,
            price_cents: unitPrice,
            subtotal_cents: subtotal,
            regular_price_cents: pricing.regular_unit_price_cents,
            applied_wholesale_tier: pricing.applied_tier,
            wholesale_savings_cents: pricing.wholesale_savings_cents,
            unit_cost_cents: unitCost,
            cost_subtotal_cents: costSubtotal,
            unit: dbProd.unit || 'unidad',
            category: dbProd.category || 'General',
          });
        }

        const { config: loyaltyConfig } = await loadNegocioLoyaltyConfig(env.DB, auth.negocioId);

        let dbCoupon: CouponRecord | null = null;
        const requestedCouponCode = normalizeCouponCode(body.coupon_code || '');
        if (requestedCouponCode) {
          dbCoupon = await env.DB.prepare(
            'SELECT * FROM discount_coupons WHERE negocio_id = ? AND code = ?'
          )
            .bind(auth.negocioId, requestedCouponCode)
            .first<CouponRecord>();
        }

        const rawLoyaltyPhone = body.loyalty_phone ? String(body.loyalty_phone).trim() : '';
        const normalizedPhone = rawLoyaltyPhone ? normalizeLoyaltyPhone(rawLoyaltyPhone) : '';
        if (rawLoyaltyPhone && !isValidLoyaltyPhone(normalizedPhone)) {
          return errorResponse('Número celular del Club de Puntos inválido (debe tener 7 a 15 dígitos).', 400);
        }

        let dbLoyaltyAccount: any = null;
        if (normalizedPhone) {
          dbLoyaltyAccount = await env.DB.prepare(
            'SELECT * FROM loyalty_accounts WHERE negocio_id = ? AND phone = ?'
          )
            .bind(auth.negocioId, normalizedPhone)
            .first<any>();
          if (dbLoyaltyAccount && dbLoyaltyAccount.active === 0) {
            return errorResponse('Esta cuenta del Club de Puntos se encuentra inactiva.', 400);
          }
        }

        const settlement = settleOrderLoyaltyAndCoupon({
          itemsSubtotalCents: computedTotalCents,
          deliveryFeeCents: 0,
          config: loyaltyConfig,
          coupon: dbCoupon,
          couponCodeRequested: requestedCouponCode || null,
          hasValidPhone: Boolean(normalizedPhone && isValidLoyaltyPhone(normalizedPhone)),
          accountPointsBalance: Number(dbLoyaltyAccount?.points_balance) || 0,
          pointsToRedeemRequested: body.loyalty_points_redeemed ?? 0,
        });

        if (!settlement.ok) {
          return errorResponse(settlement.error, 400);
        }

        const finalTotalCents = settlement.final_total_cents;
        const paymentResolution = resolveSalePaymentBreakdown({
          totalCents: finalTotalCents,
          paymentMethod: body.payment_method,
          paymentBreakdown: body.payment_breakdown,
          creditCustomerId: body.credit_customer_id,
        });
        if (!paymentResolution.ok) {
          return errorResponse(paymentResolution.error, 400);
        }

        let resolvedCreditCustomerName: string | null = body.credit_customer_name || null;
        if (paymentResolution.credit_cents > 0 && body.credit_customer_id) {
          const dbCust = await env.DB.prepare(
            'SELECT id, name, active FROM credit_customers WHERE id = ? AND negocio_id = ?'
          )
            .bind(body.credit_customer_id, auth.negocioId)
            .first<{ id: string; name: string; active: number }>();
          if (!dbCust) {
            return errorResponse('Cliente de fiado no encontrado en este local.', 404);
          }
          resolvedCreditCustomerName = dbCust.name;
        }

        const saleId = `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const batchStatements: any[] = [];

        let loyaltyAccountId: string | null = dbLoyaltyAccount?.id ?? null;
        let nextLoyaltyBalance: number | null = null;
        if (normalizedPhone) {
          const prevPoints = Number(dbLoyaltyAccount?.points_balance) || 0;
          nextLoyaltyBalance = Math.max(0, prevPoints - settlement.points_redeemed + settlement.points_earned);
          if (!loyaltyAccountId) {
            loyaltyAccountId = `loy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          }
        }

        const breakdownJson = JSON.stringify(paymentResolution.breakdown);

        // 1. Insertar la venta
        batchStatements.push(
          env.DB.prepare(
            `INSERT INTO sales (
              id, negocio_id, total_cents, subtotal_cents, coupon_code, coupon_discount_cents,
              loyalty_account_id, loyalty_phone, loyalty_points_redeemed, loyalty_discount_cents, loyalty_points_earned,
              payment_method, payment_breakdown_json, status, credit_customer_id, credit_customer_name,
              total_cost_cents, created_by_uid, created_by_role, schema_version, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, 2, datetime('now'))`
          ).bind(
            saleId,
            auth.negocioId,
            finalTotalCents,
            computedTotalCents,
            settlement.coupon_code,
            settlement.coupon_discount_cents,
            loyaltyAccountId,
            normalizedPhone || null,
            settlement.points_redeemed,
            settlement.points_discount_cents,
            settlement.points_earned,
            paymentResolution.db_payment_method,
            breakdownJson,
            paymentResolution.credit_cents > 0 ? body.credit_customer_id || null : null,
            paymentResolution.credit_cents > 0 ? resolvedCreditCustomerName : null,
            computedTotalCostCents,
            auth.user.id,
            auth.user.role
          )
        );

        // 2. Insertar cada ítem, descontar stock y registrar en Kardex
        const saleActorName = auth.user.displayName || auth.user.email;
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

          const stockBefore = runningStockMap.get(it.product_id) ?? 0;
          const stockAfter = roundQuantity(stockBefore - it.quantity, true);
          runningStockMap.set(it.product_id, stockAfter);

          batchStatements.push(
            buildKardexStatement(env.DB, {
              negocioId: auth.negocioId,
              productId: it.product_id,
              productName: it.product_name,
              unit: it.unit,
              movementType: 'sale',
              quantityDelta: -it.quantity,
              stockBefore,
              stockAfter,
              unitCostCents: it.unit_cost_cents,
              unitPriceCents: it.price_cents,
              totalValueCents: it.subtotal_cents,
              referenceId: saleId,
              notes: 'Venta en mostrador',
              actorUid: auth.user.id,
              actorName: saleActorName,
            })
          );
        }

        // 3. Si incluyó fiado (total o parcial en pago mixto), crear cargo exacto por la porción fiada
        if (paymentResolution.credit_cents > 0 && body.credit_customer_id) {
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
              paymentResolution.credit_cents,
              paymentResolution.is_mixed ? 'Saldo fiado en venta mixta' : 'Venta a crédito en mostrador',
              saleId,
              auth.user.id,
              auth.user.role
            )
          );

          batchStatements.push(
            env.DB.prepare(
              "UPDATE credit_customers SET balance_cents = balance_cents + ?, last_entry_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
            ).bind(paymentResolution.credit_cents, body.credit_customer_id, auth.negocioId)
          );
        }

        // 4. Actualizar usos del cupón si se aplicó
        if (settlement.coupon_code && dbCoupon) {
          batchStatements.push(
            env.DB.prepare(
              "UPDATE discount_coupons SET used_count = used_count + 1, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
            ).bind(dbCoupon.id, auth.negocioId)
          );
        }

        // 5. Actualizar cuenta y movimientos del Club de Puntos
        if (normalizedPhone && loyaltyAccountId) {
          if (dbLoyaltyAccount) {
            batchStatements.push(
              env.DB.prepare(
                `UPDATE loyalty_accounts
                 SET points_balance = points_balance - ? + ?,
                     lifetime_points_earned = lifetime_points_earned + ?,
                     lifetime_points_redeemed = lifetime_points_redeemed + ?,
                     total_purchases_count = total_purchases_count + 1,
                     total_spent_cents = total_spent_cents + ?,
                     last_activity_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ? AND negocio_id = ?`
              ).bind(
                settlement.points_redeemed,
                settlement.points_earned,
                settlement.points_earned,
                settlement.points_redeemed,
                finalTotalCents,
                loyaltyAccountId,
                auth.negocioId
              )
            );
          } else {
            const customerNameToUse =
              String(body.loyalty_customer_name || body.credit_customer_name || '').trim() ||
              `Vecino ${normalizedPhone.slice(-4)}`;
            batchStatements.push(
              env.DB.prepare(
                `INSERT INTO loyalty_accounts (
                  id, negocio_id, phone, customer_name, points_balance, lifetime_points_earned, lifetime_points_redeemed,
                  total_purchases_count, total_spent_cents, active, last_activity_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 1, datetime('now'), datetime('now'), datetime('now'))`
              ).bind(
                loyaltyAccountId,
                auth.negocioId,
                normalizedPhone,
                customerNameToUse,
                settlement.points_earned,
                settlement.points_earned,
                finalTotalCents
              )
            );
          }

          if (settlement.points_redeemed > 0 && dbLoyaltyAccount) {
            const redeemMovId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const afterRedeemBalance = Math.max(0, (Number(dbLoyaltyAccount.points_balance) || 0) - settlement.points_redeemed);
            batchStatements.push(
              env.DB.prepare(
                `INSERT INTO loyalty_movements (
                  id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, sale_id, created_by_uid, created_by_role, created_at
                ) VALUES (?, ?, ?, 'redeem', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
              ).bind(
                redeemMovId,
                auth.negocioId,
                loyaltyAccountId,
                -settlement.points_redeemed,
                afterRedeemBalance,
                settlement.points_discount_cents,
                `Canje de puntos en venta #${saleId.slice(0, 8)}`,
                saleId,
                auth.user.id,
                auth.user.role
              )
            );
          }

          if (settlement.points_earned > 0) {
            const earnMovId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            batchStatements.push(
              env.DB.prepare(
                `INSERT INTO loyalty_movements (
                  id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, sale_id, created_by_uid, created_by_role, created_at
                ) VALUES (?, ?, ?, 'earn', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
              ).bind(
                earnMovId,
                auth.negocioId,
                loyaltyAccountId,
                settlement.points_earned,
                nextLoyaltyBalance ?? settlement.points_earned,
                settlement.paid_merchandise_cents,
                `Puntos ganados en venta #${saleId.slice(0, 8)}`,
                saleId,
                auth.user.id,
                auth.user.role
              )
            );
          }
        }

        // Ejecutar toda la venta de manera atómica
        await env.DB.batch(batchStatements);

        return jsonResponse(
          {
            id: saleId,
            saleId,
            negocio_id: auth.negocioId,
            total_cents: finalTotalCents,
            subtotal_cents: computedTotalCents,
            coupon_code: settlement.coupon_code,
            coupon_discount_cents: settlement.coupon_discount_cents,
            loyalty_account_id: loyaltyAccountId,
            loyalty_phone: normalizedPhone || null,
            loyalty_points_redeemed: settlement.points_redeemed,
            loyalty_discount_cents: settlement.points_discount_cents,
            loyalty_points_earned: settlement.points_earned,
            loyalty_balance_after: nextLoyaltyBalance,
            total_cost_cents: computedTotalCostCents,
            payment_method: paymentResolution.effective_payment_method,
            payment_breakdown: paymentResolution.breakdown,
            status: 'completed',
            credit_customer_id: paymentResolution.credit_cents > 0 ? body.credit_customer_id || null : null,
            credit_customer_name: paymentResolution.credit_cents > 0 ? resolvedCreditCustomerName : null,
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
          expenses_cash_cents INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      ).run().catch(() => {});

      await env.DB.prepare(
        'ALTER TABLE cash_closings ADD COLUMN expenses_cash_cents INTEGER NOT NULL DEFAULT 0'
      ).run().catch(() => {});

      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS cash_expenses (
          id TEXT PRIMARY KEY,
          negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
          category TEXT NOT NULL DEFAULT 'otro',
          description TEXT NOT NULL,
          beneficiary TEXT,
          amount_cents INTEGER NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          created_by_uid TEXT NOT NULL DEFAULT 'system',
          created_by_name TEXT,
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

        const {
          salesCashCents,
          salesCashCount,
          creditPaymentsCashCents,
          creditPaymentsCashCount,
          otherSales,
        } = await aggregateShiftSalesAndCredits(env.DB, auth.negocioId, openedAt);

        // 3. Salidas de caja menor en efectivo desde el último cierre
        const expensesCashRow = await env.DB.prepare(
          "SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_expenses_cash_cents FROM cash_expenses WHERE negocio_id = ? AND payment_method = 'cash' AND created_at >= ?"
        ).bind(auth.negocioId, openedAt).first<{ count: number; total_expenses_cash_cents: number }>();

        const expensesCashCents = expensesCashRow?.total_expenses_cash_cents || 0;
        const expensesCashCount = expensesCashRow?.count || 0;

        const expectedCashCents = initialCashCents + salesCashCents + creditPaymentsCashCents - expensesCashCents;

        return jsonResponse({
          opened_at: openedAt,
          initial_cash_cents: initialCashCents,
          sales_cash_cents: salesCashCents,
          sales_cash_count: salesCashCount,
          credit_payments_cash_cents: creditPaymentsCashCents,
          credit_payments_cash_count: creditPaymentsCashCount,
          expenses_cash_cents: expensesCashCents,
          expenses_cash_count: expensesCashCount,
          expected_cash_cents: expectedCashCents,
          other_sales: otherSales,
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

        const {
          salesCashCents,
          salesCashCount: totalSalesCount,
          creditPaymentsCashCents,
        } = await aggregateShiftSalesAndCredits(env.DB, auth.negocioId, openedAt);

        const expensesCashRow = await env.DB.prepare(
          "SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_expenses_cash_cents FROM cash_expenses WHERE negocio_id = ? AND payment_method = 'cash' AND created_at >= ?"
        ).bind(auth.negocioId, openedAt).first<{ count: number; total_expenses_cash_cents: number }>();

        const expensesCashCents = expensesCashRow?.total_expenses_cash_cents || 0;

        const expectedCashCents = initialCashCents + salesCashCents + creditPaymentsCashCents - expensesCashCents;
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
            counted_cash_cents, difference_cents, status, breakdown_json, notes, total_sales_count, expenses_cash_cents, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
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
          totalSalesCount,
          expensesCashCents
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

    // 5.2 Caja Menor y Gastos Operativos del Turno (/cash-expenses)
    if (path === '/cash-expenses' || path.startsWith('/cash-expenses/')) {
      const auth = await authenticateRequest(request, env);

      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS cash_expenses (
          id TEXT PRIMARY KEY,
          negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
          category TEXT NOT NULL DEFAULT 'otro',
          description TEXT NOT NULL,
          beneficiary TEXT,
          amount_cents INTEGER NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          created_by_uid TEXT NOT NULL DEFAULT 'system',
          created_by_name TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      ).run().catch(() => {});

      if (method === 'GET' && path === '/cash-expenses') {
        const sinceParam = url.searchParams.get('since');
        const shiftOnly = url.searchParams.get('shift_only') === 'true';

        let sinceFilter = sinceParam || '';
        if (!sinceFilter && shiftOnly) {
          const lastClosing = await env.DB.prepare(
            'SELECT closed_at FROM cash_closings WHERE negocio_id = ? ORDER BY closed_at DESC LIMIT 1'
          )
            .bind(auth.negocioId)
            .first<{ closed_at: string }>();
          const now = new Date();
          const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          sinceFilter = lastClosing?.closed_at || startOfTodayIso;
        }

        let query = 'SELECT * FROM cash_expenses WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];
        if (sinceFilter) {
          query += ' AND created_at >= ?';
          params.push(sinceFilter);
        }
        query += ' ORDER BY created_at DESC LIMIT 100';

        const rows = await env.DB.prepare(query).bind(...params).all<any>();
        return jsonResponse(rows.results || []);
      }

      if (method === 'POST' && path === '/cash-expenses') {
        const body = (await request.json()) as {
          category?: string;
          description?: string;
          beneficiary?: string;
          amount_cents?: number;
          payment_method?: string;
        };

        const VALID_CATEGORIES = new Set([
          'proveedor_contado',
          'insumos_bolsas',
          'domicilios_transporte',
          'servicios_aseo',
          'alimentacion_turno',
          'otro',
        ]);

        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description) {
          return errorResponse('La descripción o concepto del gasto es obligatoria.', 400);
        }

        const amountCents = Math.floor(Number(body.amount_cents));
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          return errorResponse('El monto del gasto debe ser un valor mayor a 0.', 400);
        }

        const category = body.category && VALID_CATEGORIES.has(body.category) ? body.category : 'otro';
        const paymentMethod = body.payment_method === 'transfer' ? 'transfer' : 'cash';
        const beneficiary = typeof body.beneficiary === 'string' && body.beneficiary.trim()
          ? body.beneficiary.trim()
          : null;
        const expenseId = `cexp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const createdAt = new Date().toISOString();
        const createdByName = auth.user.displayName || auth.user.email;

        await env.DB.prepare(
          `INSERT INTO cash_expenses (
            id, negocio_id, category, description, beneficiary, amount_cents,
            payment_method, created_by_uid, created_by_name, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            expenseId,
            auth.negocioId,
            category,
            description,
            beneficiary,
            amountCents,
            paymentMethod,
            auth.user.id,
            createdByName,
            createdAt
          )
          .run();

        const created = await env.DB.prepare(
          'SELECT * FROM cash_expenses WHERE id = ? AND negocio_id = ?'
        )
          .bind(expenseId, auth.negocioId)
          .first<any>();

        return jsonResponse(
          created || {
            id: expenseId,
            negocio_id: auth.negocioId,
            category,
            description,
            beneficiary,
            amount_cents: amountCents,
            payment_method: paymentMethod,
            created_by_uid: auth.user.id,
            created_by_name: createdByName,
            created_at: createdAt,
          },
          201
        );
      }

      if (method === 'DELETE' && path.startsWith('/cash-expenses/')) {
        const expenseId = decodeURIComponent(path.replace(/^\/cash-expenses\//, ''));
        if (!expenseId) {
          return errorResponse('ID de gasto inválido.', 400);
        }

        const existing = await env.DB.prepare(
          'SELECT id FROM cash_expenses WHERE id = ? AND negocio_id = ?'
        )
          .bind(expenseId, auth.negocioId)
          .first<{ id: string }>();

        if (!existing) {
          return errorResponse('Gasto de caja menor no encontrado.', 404);
        }

        await env.DB.prepare('DELETE FROM cash_expenses WHERE id = ? AND negocio_id = ?')
          .bind(expenseId, auth.negocioId)
          .run();

        return jsonResponse({ success: true, deletedId: expenseId });
      }
    }

    // 5.3 Control de Mermas, Averías y Bajas de Inventario (/shrinkage)
    if (path === '/shrinkage' || path.startsWith('/shrinkage/')) {
      const auth = await authenticateRequest(request, env);

      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS inventory_shrinkage (
          id TEXT PRIMARY KEY,
          negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          product_name TEXT NOT NULL,
          category TEXT,
          unit TEXT DEFAULT 'unidad',
          quantity INTEGER NOT NULL,
          unit_cost_cents INTEGER NOT NULL,
          total_cost_loss_cents INTEGER NOT NULL,
          retail_value_cents INTEGER NOT NULL DEFAULT 0,
          cost_source TEXT NOT NULL DEFAULT 'purchase',
          reason TEXT NOT NULL DEFAULT 'damaged',
          notes TEXT,
          created_by_uid TEXT NOT NULL DEFAULT 'system',
          created_by_name TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      ).run().catch(() => {});

      const VALID_REASONS = new Set(['damaged', 'expired', 'spoiled_fruver', 'internal_use', 'other']);

      if (method === 'GET' && path === '/shrinkage') {
        const sinceParam = url.searchParams.get('since') || '';
        const reasonParam = url.searchParams.get('reason') || '';
        const productIdParam = url.searchParams.get('product_id') || '';

        let query = 'SELECT * FROM inventory_shrinkage WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];

        if (sinceParam) {
          query += ' AND created_at >= ?';
          params.push(sinceParam);
        }
        if (reasonParam && VALID_REASONS.has(reasonParam)) {
          query += ' AND reason = ?';
          params.push(reasonParam);
        }
        if (productIdParam) {
          query += ' AND product_id = ?';
          params.push(productIdParam);
        }

        query += ' ORDER BY created_at DESC LIMIT 100';
        const rows = await env.DB.prepare(query).bind(...params).all<any>();
        return jsonResponse(rows.results || []);
      }

      if (method === 'GET' && path === '/shrinkage/summary') {
        const sinceParam = url.searchParams.get('since') || '';
        let query = 'SELECT * FROM inventory_shrinkage WHERE negocio_id = ?';
        const params: unknown[] = [auth.negocioId];
        if (sinceParam) {
          query += ' AND created_at >= ?';
          params.push(sinceParam);
        }
        const rows = await env.DB.prepare(query).bind(...params).all<any>();
        const entries = rows.results || [];
        const byReason: Record<string, { count: number; units: number; cost_loss_cents: number }> = {};
        let totalUnits = 0;
        let totalCostLossCents = 0;
        let totalRetailValueCents = 0;

        for (const item of entries) {
          const qty = Number(item.quantity || 0);
          const costLoss = Number(item.total_cost_loss_cents || 0);
          const retailVal = Number(item.retail_value_cents || 0);
          totalUnits += qty;
          totalCostLossCents += costLoss;
          totalRetailValueCents += retailVal;
          const rKey = item.reason || 'other';
          if (!byReason[rKey]) {
            byReason[rKey] = { count: 0, units: 0, cost_loss_cents: 0 };
          }
          byReason[rKey].count += 1;
          byReason[rKey].units += qty;
          byReason[rKey].cost_loss_cents += costLoss;
        }

        return jsonResponse({
          total_records: entries.length,
          total_units: totalUnits,
          total_cost_loss_cents: totalCostLossCents,
          total_retail_value_cents: totalRetailValueCents,
          by_reason: byReason,
        });
      }

      if (method === 'POST' && path === '/shrinkage') {
        if (auth.user.role !== 'admin' && auth.user.role !== 'manager') {
          return errorResponse('Solo administradores y gerentes pueden registrar mermas e inventario dañado.', 403);
        }

        const body = (await request.json()) as {
          product_id?: string;
          quantity?: number;
          reason?: string;
          notes?: string;
        };

        const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
        if (!productId) {
          return errorResponse('Debes seleccionar un producto válido para registrar la merma.', 400);
        }

        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!VALID_REASONS.has(reason)) {
          return errorResponse('Motivo de merma inválido.', 400);
        }

        const product = await env.DB.prepare(
          'SELECT id, name, category, unit, stock, price_cents, last_cost_cents, allow_fractional FROM products WHERE id = ? AND negocio_id = ?'
        )
          .bind(productId, auth.negocioId)
          .first<{
            id: string;
            name: string;
            category?: string | null;
            unit?: string | null;
            stock: number;
            price_cents: number;
            last_cost_cents?: number | null;
            allow_fractional?: number | boolean;
          }>();

        if (!product) {
          return errorResponse('Producto no encontrado en tu negocio.', 404);
        }

        const qtyCheck = validateItemQuantity(body.quantity, Boolean(product.allow_fractional));
        if (!qtyCheck.ok) {
          return errorResponse(
            Boolean(product.allow_fractional)
              ? qtyCheck.error
              : 'La cantidad a dar de baja debe ser un número entero mayor a 0.',
            400
          );
        }
        const rawQty = qtyCheck.quantity;

        const currentStock = roundQuantity(Number(product.stock || 0), true);
        if (rawQty > currentStock) {
          return errorResponse(
            `Stock insuficiente para "${product.name}": disponible ${currentStock}, solicitado ${rawQty}.`,
            400
          );
        }

        const priceCents = Math.max(0, Math.round(Number(product.price_cents || 0)));
        const hasPurchaseCost = typeof product.last_cost_cents === 'number' && product.last_cost_cents > 0;
        const unitCostCents = hasPurchaseCost
          ? Math.round(product.last_cost_cents as number)
          : Math.round(priceCents * 0.7);
        const costSource = hasPurchaseCost ? 'purchase' : 'estimated_fallback';
        const totalCostLossCents = computeLineSubtotalCents(unitCostCents, rawQty);
        const retailValueCents = computeLineSubtotalCents(priceCents, rawQty);
        const nextStock = roundQuantity(Math.max(0, currentStock - rawQty), true);
        const notes =
          typeof body.notes === 'string' && body.notes.trim()
            ? body.notes.trim().slice(0, 250)
            : null;
        const shrinkageId = `shk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const createdAt = new Date().toISOString();
        const createdByName = auth.user.displayName || auth.user.email;

        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO inventory_shrinkage (
              id, negocio_id, product_id, product_name, category, unit, quantity,
              unit_cost_cents, total_cost_loss_cents, retail_value_cents, cost_source,
              reason, notes, created_by_uid, created_by_name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            shrinkageId,
            auth.negocioId,
            product.id,
            product.name,
            product.category || 'General',
            product.unit || 'unidad',
            rawQty,
            unitCostCents,
            totalCostLossCents,
            retailValueCents,
            costSource,
            reason,
            notes,
            auth.user.id,
            createdByName,
            createdAt
          ),
          env.DB.prepare(
            "UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
          ).bind(rawQty, product.id, auth.negocioId),
          buildKardexStatement(env.DB, {
            negocioId: auth.negocioId,
            productId: product.id,
            productName: product.name,
            unit: product.unit || 'unidad',
            movementType: 'shrinkage',
            quantityDelta: -rawQty,
            stockBefore: currentStock,
            stockAfter: nextStock,
            unitCostCents,
            unitPriceCents: priceCents,
            totalValueCents: totalCostLossCents,
            referenceId: shrinkageId,
            notes: notes ? `Merma (${reason}): ${notes}` : `Merma registrada (${reason})`,
            actorUid: auth.user.id,
            actorName: createdByName,
          }),
        ]);

        const created = await env.DB.prepare(
          'SELECT * FROM inventory_shrinkage WHERE id = ? AND negocio_id = ?'
        )
          .bind(shrinkageId, auth.negocioId)
          .first<any>();

        return jsonResponse(
          {
            ...(created || {
              id: shrinkageId,
              negocio_id: auth.negocioId,
              product_id: product.id,
              product_name: product.name,
              category: product.category || 'General',
              unit: product.unit || 'unidad',
              quantity: rawQty,
              unit_cost_cents: unitCostCents,
              total_cost_loss_cents: totalCostLossCents,
              retail_value_cents: retailValueCents,
              cost_source: costSource,
              reason,
              notes,
              created_by_uid: auth.user.id,
              created_by_name: createdByName,
              created_at: createdAt,
            }),
            updated_stock: nextStock,
          },
          201
        );
      }

      if (method === 'DELETE' && path.startsWith('/shrinkage/')) {
        if (auth.user.role !== 'admin' && auth.user.role !== 'manager') {
          return errorResponse('Solo administradores y gerentes pueden revertir bajas de inventario.', 403);
        }

        const shrinkageId = decodeURIComponent(path.replace(/^\/shrinkage\//, ''));
        if (!shrinkageId || shrinkageId === 'summary') {
          return errorResponse('ID de merma inválido.', 400);
        }

        const existing = await env.DB.prepare(
          'SELECT * FROM inventory_shrinkage WHERE id = ? AND negocio_id = ?'
        )
          .bind(shrinkageId, auth.negocioId)
          .first<{
            id: string;
            product_id: string;
            product_name: string;
            unit?: string;
            quantity: number;
            unit_cost_cents?: number;
            total_cost_loss_cents?: number;
          }>();

        if (!existing) {
          return errorResponse('Registro de merma no encontrado.', 404);
        }

        const currentProd = await env.DB.prepare(
          'SELECT stock, price_cents, unit, name FROM products WHERE id = ? AND negocio_id = ?'
        )
          .bind(existing.product_id, auth.negocioId)
          .first<{ stock: number; price_cents?: number; unit?: string; name?: string }>();

        const stockBefore = roundQuantity(Number(currentProd?.stock) || 0, true);
        const restoredQty = roundQuantity(Number(existing.quantity) || 0, true);
        const stockAfter = roundQuantity(stockBefore + restoredQty, true);

        await env.DB.batch([
          env.DB.prepare('DELETE FROM inventory_shrinkage WHERE id = ? AND negocio_id = ?').bind(
            shrinkageId,
            auth.negocioId
          ),
          env.DB.prepare(
            "UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
          ).bind(restoredQty, existing.product_id, auth.negocioId),
          buildKardexStatement(env.DB, {
            negocioId: auth.negocioId,
            productId: existing.product_id,
            productName: existing.product_name || currentProd?.name || 'Producto',
            unit: existing.unit || currentProd?.unit || 'unidad',
            movementType: 'shrinkage_revert',
            quantityDelta: restoredQty,
            stockBefore,
            stockAfter,
            unitCostCents: existing.unit_cost_cents || 0,
            unitPriceCents: currentProd?.price_cents || 0,
            totalValueCents: existing.total_cost_loss_cents || 0,
            referenceId: shrinkageId,
            notes: 'Reversión de baja / merma',
            actorUid: auth.user.id,
            actorName: auth.user.displayName || auth.user.email,
          }),
        ]);

        return jsonResponse({
          success: true,
          deletedId: shrinkageId,
          restored_stock_units: existing.quantity,
          product_id: existing.product_id,
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
                const prodRow = await env.DB.prepare(
                  'SELECT stock, unit, price_cents, name FROM products WHERE id = ? AND negocio_id = ?'
                )
                  .bind(it.product_id, auth.negocioId)
                  .first<{ stock: number; unit?: string; price_cents?: number; name?: string }>();
                const stockBefore = roundQuantity(Number(prodRow?.stock) || 0, true);
                const stockAfter = roundQuantity(stockBefore + r.received_quantity, true);
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
                batch.push(
                  buildKardexStatement(env.DB, {
                    negocioId: auth.negocioId,
                    productId: it.product_id,
                    productName: it.name || prodRow?.name || 'Producto',
                    unit: prodRow?.unit || 'unidad',
                    movementType: 'purchase',
                    quantityDelta: r.received_quantity,
                    stockBefore,
                    stockAfter,
                    unitCostCents: finalCost,
                    unitPriceCents: prodRow?.price_cents || 0,
                    totalValueCents: computeLineSubtotalCents(finalCost, r.received_quantity),
                    referenceId: orderId,
                    notes: 'Recepción orden de compra',
                    actorUid: auth.user.id,
                    actorName: auth.user.displayName || auth.user.email,
                  })
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
            .all<{ product_id: string | null; name?: string | null; quantity: number; unit_cost_cents: number }>();

          for (const it of items.results || []) {
            if (it.product_id) {
              const prodRow = await env.DB.prepare(
                'SELECT stock, unit, price_cents, name FROM products WHERE id = ? AND negocio_id = ?'
              )
                .bind(it.product_id, auth.negocioId)
                .first<{ stock: number; unit?: string; price_cents?: number; name?: string }>();
              const stockBefore = roundQuantity(Number(prodRow?.stock) || 0, true);
              const stockAfter = roundQuantity(stockBefore + it.quantity, true);
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
              batch.push(
                buildKardexStatement(env.DB, {
                  negocioId: auth.negocioId,
                  productId: it.product_id,
                  productName: it.name || prodRow?.name || 'Producto',
                  unit: prodRow?.unit || 'unidad',
                  movementType: 'purchase',
                  quantityDelta: it.quantity,
                  stockBefore,
                  stockAfter,
                  unitCostCents: it.unit_cost_cents,
                  unitPriceCents: prodRow?.price_cents || 0,
                  totalValueCents: computeLineSubtotalCents(it.unit_cost_cents, it.quantity),
                  referenceId: orderId,
                  notes: 'Recepción completa orden de compra',
                  actorUid: auth.user.id,
                  actorName: auth.user.displayName || auth.user.email,
                })
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
        const body = (await request.json()) as {
          email: string;
          display_name?: string;
          role?: string;
          password?: string;
        };
        const cleanEmail = (body.email || '').trim().toLowerCase();
        if (!cleanEmail) {
          return errorResponse('El correo electrónico es obligatorio.', 400);
        }
        const role = (body.role || 'cashier').trim();
        if (!VALID_STAFF_ROLES.has(role)) {
          return errorResponse('Rol de empleado no válido.', 400);
        }
        const rawPassword = body.password !== undefined && body.password !== null ? String(body.password).trim() : '';
        if (rawPassword.length > 0 && rawPassword.length < 6) {
          return errorResponse('La contraseña debe tener al menos 6 caracteres.', 400);
        }

        const existingUser = await env.DB.prepare(
          'SELECT id, negocio_id FROM users WHERE lower(email) = ? AND deleted_at IS NULL'
        )
          .bind(cleanEmail)
          .first<{ id: string; negocio_id: string }>();
        if (existingUser) {
          return errorResponse('Este correo electrónico ya está registrado.', 409);
        }

        const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const pwdHash = rawPassword ? await hashPassword(rawPassword) : null;
        await env.DB.prepare(
          `INSERT INTO users (
            id, negocio_id, email, display_name, role, is_super_admin, active, password_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, 1, ?, datetime('now'))`
        )
          .bind(id, auth.negocioId, cleanEmail, body.display_name || null, role, pwdHash)
          .run();

        const created = await env.DB.prepare('SELECT id, negocio_id, email, display_name, role, active FROM users WHERE id = ?')
          .bind(id)
          .first();

        return jsonResponse(created, 201);
      }

      if (method === 'PUT' && targetUserId) {
        const body = (await request.json()) as {
          role?: string;
          active?: boolean;
          display_name?: string;
          password?: string;
        };
        if (body.role !== undefined && !VALID_STAFF_ROLES.has(body.role)) {
          return errorResponse('Rol de empleado no válido.', 400);
        }
        const rawPassword = body.password !== undefined && body.password !== null ? String(body.password).trim() : '';
        if (rawPassword.length > 0 && rawPassword.length < 6) {
          return errorResponse('La contraseña debe tener al menos 6 caracteres.', 400);
        }
        const pwdHash = rawPassword ? await hashPassword(rawPassword) : null;

        await env.DB.prepare(
          `UPDATE users SET
            role = COALESCE(?, role),
            active = COALESCE(?, active),
            display_name = COALESCE(?, display_name),
            password_hash = COALESCE(?, password_hash)
          WHERE id = ? AND negocio_id = ?`
        )
          .bind(
            body.role || null,
            body.active !== undefined ? (body.active ? 1 : 0) : null,
            body.display_name || null,
            pwdHash,
            targetUserId,
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare(
          'SELECT id, email, display_name, role, active FROM users WHERE id = ? AND negocio_id = ?'
        )
          .bind(targetUserId, auth.negocioId)
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
          const prodId = String(item.product_id || '');

          // Consultar producto
          const dbProd = await env.DB.prepare(
            'SELECT id, name, price_cents, en_oferta, precio_oferta_cents, wholesale_tiers_json, allow_fractional, unit, image_url, stock FROM products WHERE id = ? AND negocio_id = ?'
          )
            .bind(prodId, negocio.id)
            .first<any>();

          if (dbProd) {
            const qtyCheck = validateItemQuantity(item.quantity, Boolean(dbProd.allow_fractional));
            if (!qtyCheck.ok) {
              return errorResponse(qtyCheck.error, 400);
            }
            const qty = qtyCheck.quantity;
            const pricing = resolveProductUnitPricing(dbProd, qty);
            totalCents += pricing.subtotal_cents;
            verifiedItems.push({
              product_id: dbProd.id,
              product_name: dbProd.name,
              quantity: qty,
              unit_price_cents: pricing.unit_price_cents,
              subtotal_cents: pricing.subtotal_cents,
              regular_unit_price_cents: pricing.regular_unit_price_cents,
              applied_wholesale_tier: pricing.applied_tier,
              wholesale_savings_cents: pricing.wholesale_savings_cents,
              unit: dbProd.unit,
              allow_fractional: Boolean(dbProd.allow_fractional),
              image_url: dbProd.image_url,
            });
          } else {
            const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
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

        // Liquidar cupones, canje de puntos y cálculo de domicilio en el servidor
        const itemsSubtotalCents = totalCents;
        const deliveryFeeCents =
          deliveryType === 'delivery' && (negocio.costo_domicilio_cents || 0) > 0
            ? Number(negocio.costo_domicilio_cents) || 0
            : 0;

        let parsedNegocioConfig: Record<string, any> = {};
        try {
          parsedNegocioConfig = negocio.config_json ? JSON.parse(negocio.config_json) : {};
        } catch {
          parsedNegocioConfig = {};
        }
        const loyaltyConfig = normalizeLoyaltyConfig((parsedNegocioConfig as any).loyalty);

        const rawCustomerPhone = body.customer_phone ? String(body.customer_phone).trim() : '';
        const normalizedCustomerPhone = rawCustomerPhone ? normalizeLoyaltyPhone(rawCustomerPhone) : '';
        const hasValidPhone = Boolean(normalizedCustomerPhone && isValidLoyaltyPhone(normalizedCustomerPhone));

        let dbCoupon: CouponRecord | null = null;
        const requestedCouponCode = normalizeCouponCode(body.coupon_code || '');
        if (requestedCouponCode) {
          dbCoupon = await env.DB.prepare(
            'SELECT * FROM discount_coupons WHERE negocio_id = ? AND code = ?'
          )
            .bind(negocio.id, requestedCouponCode)
            .first<CouponRecord>();
        }

        let dbLoyaltyAccount: any = null;
        if (hasValidPhone) {
          dbLoyaltyAccount = await env.DB.prepare(
            'SELECT * FROM loyalty_accounts WHERE negocio_id = ? AND phone = ? AND active = 1'
          )
            .bind(negocio.id, normalizedCustomerPhone)
            .first<any>();
        }

        const settlement = settleOrderLoyaltyAndCoupon({
          itemsSubtotalCents,
          deliveryFeeCents,
          config: loyaltyConfig,
          coupon: dbCoupon,
          couponCodeRequested: requestedCouponCode || null,
          hasValidPhone,
          accountPointsBalance: Number(dbLoyaltyAccount?.points_balance) || 0,
          pointsToRedeemRequested: body.loyalty_points_redeemed ?? 0,
        });

        if (!settlement.ok) {
          return errorResponse(settlement.error, 400);
        }

        const finalOrderTotalCents = settlement.final_total_cents;

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

        const orderBatch: any[] = [];
        orderBatch.push(
          env.DB.prepare(
            `INSERT INTO customer_orders (
              id, negocio_id, order_code, source, customer_name, customer_phone,
              delivery_type, delivery_address, delivery_neighborhood, payment_method,
              items_json, subtotal_cents, coupon_code, coupon_discount_cents,
              loyalty_account_id, loyalty_points_redeemed, loyalty_discount_cents, loyalty_points_earned, loyalty_settled,
              total_cents, status, tracking_token, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?, datetime('now'), datetime('now'))`
          ).bind(
            orderId,
            negocio.id,
            orderCode,
            source,
            customerName,
            hasValidPhone ? normalizedCustomerPhone : rawCustomerPhone || null,
            deliveryType,
            body.delivery_address?.trim() || null,
            body.delivery_neighborhood?.trim() || null,
            paymentMethod,
            JSON.stringify(verifiedItems),
            itemsSubtotalCents,
            settlement.coupon_code,
            settlement.coupon_discount_cents,
            dbLoyaltyAccount?.id ?? null,
            settlement.points_redeemed,
            settlement.points_discount_cents,
            settlement.points_earned,
            finalOrderTotalCents,
            trackingToken
          )
        );

        if (settlement.coupon_code && dbCoupon) {
          orderBatch.push(
            env.DB.prepare(
              "UPDATE discount_coupons SET used_count = used_count + 1, updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
            ).bind(dbCoupon.id, negocio.id)
          );
        }

        if (settlement.points_redeemed > 0 && dbLoyaltyAccount) {
          const afterReserveBalance = Math.max(0, (Number(dbLoyaltyAccount.points_balance) || 0) - settlement.points_redeemed);
          orderBatch.push(
            env.DB.prepare(
              `UPDATE loyalty_accounts
               SET points_balance = MAX(0, points_balance - ?),
                   lifetime_points_redeemed = lifetime_points_redeemed + ?,
                   last_activity_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ? AND negocio_id = ?`
            ).bind(settlement.points_redeemed, settlement.points_redeemed, dbLoyaltyAccount.id, negocio.id)
          );
          const redeemMovId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          orderBatch.push(
            env.DB.prepare(
              `INSERT INTO loyalty_movements (
                id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, order_id, created_by_uid, created_by_role, created_at
              ) VALUES (?, ?, ?, 'redeem', ?, ?, ?, ?, ?, 'customer', 'customer', datetime('now'))`
            ).bind(
              redeemMovId,
              negocio.id,
              dbLoyaltyAccount.id,
              -settlement.points_redeemed,
              afterReserveBalance,
              settlement.points_discount_cents,
              `Canje en pedido ${orderCode}`,
              orderId
            )
          );
        }

        await env.DB.batch(orderBatch);

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

        const existingOrder = await env.DB.prepare(
          'SELECT * FROM customer_orders WHERE id = ? AND negocio_id = ?'
        )
          .bind(orderId, auth.negocioId)
          .first<any>();

        if (!existingOrder) {
          return errorResponse('Pedido no encontrado en este local.', 404);
        }

        const statusBatch: any[] = [];
        let markSettled = existingOrder.loyalty_settled === 1;
        let resolvedLoyaltyAccId: string | null = existingOrder.loyalty_account_id ?? null;

        if (nextStatus === 'cancelled' && existingOrder.status !== 'cancelled' && existingOrder.loyalty_settled !== 1) {
          if (Number(existingOrder.loyalty_points_redeemed) > 0 && existingOrder.loyalty_account_id) {
            const acc = await env.DB.prepare(
              'SELECT * FROM loyalty_accounts WHERE id = ? AND negocio_id = ?'
            )
              .bind(existingOrder.loyalty_account_id, auth.negocioId)
              .first<any>();
            const refundedPoints = Math.round(Number(existingOrder.loyalty_points_redeemed) || 0);
            if (acc && refundedPoints > 0) {
              const nextBalance = (Number(acc.points_balance) || 0) + refundedPoints;
              statusBatch.push(
                env.DB.prepare(
                  `UPDATE loyalty_accounts
                   SET points_balance = points_balance + ?,
                       lifetime_points_redeemed = MAX(0, lifetime_points_redeemed - ?),
                       updated_at = datetime('now')
                   WHERE id = ? AND negocio_id = ?`
                ).bind(refundedPoints, refundedPoints, acc.id, auth.negocioId)
              );
              const refundMovId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              statusBatch.push(
                env.DB.prepare(
                  `INSERT INTO loyalty_movements (
                    id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, order_id, created_by_uid, created_by_role, created_at
                  ) VALUES (?, ?, ?, 'adjust', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
                ).bind(
                  refundMovId,
                  auth.negocioId,
                  acc.id,
                  refundedPoints,
                  nextBalance,
                  Number(existingOrder.loyalty_discount_cents) || 0,
                  `Reintegro por pedido cancelado ${existingOrder.order_code}`,
                  existingOrder.id,
                  auth.user.id,
                  auth.user.role
                )
              );
            }
          }
          if (existingOrder.coupon_code) {
            statusBatch.push(
              env.DB.prepare(
                "UPDATE discount_coupons SET used_count = MAX(0, used_count - 1), updated_at = datetime('now') WHERE negocio_id = ? AND code = ?"
              ).bind(auth.negocioId, existingOrder.coupon_code)
            );
          }
          markSettled = true;
        } else if (nextStatus === 'completed' && existingOrder.status !== 'completed' && existingOrder.loyalty_settled !== 1) {
          resolvedLoyaltyAccId = await appendOrderLoyaltyEarnStatements(
            env.DB,
            auth.negocioId,
            existingOrder,
            statusBatch,
            { id: auth.user.id, role: auth.user.role },
            existingOrder.sale_id || null
          );
          markSettled = true;
        }

        statusBatch.unshift(
          env.DB.prepare(
            `UPDATE customer_orders
             SET status = ?,
                 loyalty_settled = ?,
                 loyalty_account_id = COALESCE(?, loyalty_account_id),
                 updated_at = datetime('now')
             WHERE id = ? AND negocio_id = ?`
          ).bind(nextStatus, markSettled ? 1 : 0, resolvedLoyaltyAccId, orderId, auth.negocioId)
        );

        await env.DB.batch(statusBatch);

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
        const resolvedLoyaltyAccId = await appendOrderLoyaltyEarnStatements(
          env.DB,
          auth.negocioId,
          order,
          batchStatements,
          { id: auth.user.id, role: auth.user.role },
          saleId
        );

        const normalizedOrderPhone = order.customer_phone ? normalizeLoyaltyPhone(String(order.customer_phone)) : '';

        // 1. Insertar venta
        batchStatements.unshift(
          env.DB.prepare(
            `INSERT INTO sales (
              id, negocio_id, total_cents, subtotal_cents, coupon_code, coupon_discount_cents,
              loyalty_account_id, loyalty_phone, loyalty_points_redeemed, loyalty_discount_cents, loyalty_points_earned,
              payment_method, credit_customer_id, credit_customer_name,
              created_by_uid, created_by_role, schema_version, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, datetime('now'))`
          ).bind(
            saleId,
            auth.negocioId,
            order.total_cents,
            order.subtotal_cents || order.total_cents,
            order.coupon_code || null,
            order.coupon_discount_cents || 0,
            resolvedLoyaltyAccId,
            isValidLoyaltyPhone(normalizedOrderPhone) ? normalizedOrderPhone : null,
            order.loyalty_points_redeemed || 0,
            order.loyalty_discount_cents || 0,
            order.loyalty_points_earned || 0,
            paymentMethod,
            creditCustomerId,
            creditCustomerName,
            auth.user.id,
            auth.user.role
          )
        );

        // 2. Insertar items, descontar stock y registrar en Kardex
        const convProdIds = Array.from(new Set(items.map((it: any) => it.product_id).filter(Boolean)));
        const convStockMap = new Map<string, { stock: number; unit: string; cost: number; price: number }>();
        if (convProdIds.length > 0) {
          const ph = convProdIds.map(() => '?').join(',');
          const convProds = await env.DB.prepare(
            `SELECT id, stock, unit, last_cost_cents, price_cents FROM products WHERE negocio_id = ? AND id IN (${ph})`
          )
            .bind(auth.negocioId, ...convProdIds)
            .all<{ id: string; stock: number; unit?: string; last_cost_cents?: number | null; price_cents?: number }>();
          for (const p of convProds.results || []) {
            convStockMap.set(p.id, {
              stock: roundQuantity(Number(p.stock) || 0, true),
              unit: p.unit || 'unidad',
              cost: p.last_cost_cents ?? Math.round((Number(p.price_cents) || 0) * 0.7),
              price: Number(p.price_cents) || 0,
            });
          }
        }

        for (const item of items) {
          const itemId = `si-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const subtotal = item.subtotal_cents || computeLineSubtotalCents(item.unit_price_cents, item.quantity);
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

          const pInfo = convStockMap.get(item.product_id);
          if (pInfo) {
            const stockBefore = pInfo.stock;
            const stockAfter = roundQuantity(Math.max(0, stockBefore - Number(item.quantity)), true);
            pInfo.stock = stockAfter;
            batchStatements.push(
              buildKardexStatement(env.DB, {
                negocioId: auth.negocioId,
                productId: item.product_id,
                productName: item.product_name,
                unit: item.unit || pInfo.unit,
                movementType: 'sale',
                quantityDelta: -Number(item.quantity),
                stockBefore,
                stockAfter,
                unitCostCents: pInfo.cost,
                unitPriceCents: item.unit_price_cents,
                totalValueCents: subtotal,
                referenceId: saleId,
                notes: `Facturación pedido ${order.order_code}`,
                actorUid: auth.user.id,
                actorName: auth.user.displayName || auth.user.email,
              })
            );
          }
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

        // 4. Actualizar estado de customer_orders y marcar puntos liquidados
        batchStatements.push(
          env.DB.prepare(
            "UPDATE customer_orders SET status = 'completed', sale_id = ?, loyalty_settled = 1, loyalty_account_id = COALESCE(?, loyalty_account_id), updated_at = datetime('now') WHERE id = ? AND negocio_id = ?"
          ).bind(saleId, resolvedLoyaltyAccId, orderId, auth.negocioId)
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

    // 10.4 Club de Puntos del Barrio (/loyalty/*) — Privado Multi-Tenant
    if (path === '/loyalty' || path.startsWith('/loyalty/')) {
      const auth = await authenticateRequest(request, env);
      const subPath = path.replace(/^\/loyalty\/?/, '');

      // GET /api/loyalty/config
      if (method === 'GET' && subPath === 'config') {
        const { config } = await loadNegocioLoyaltyConfig(env.DB, auth.negocioId);
        return jsonResponse(config);
      }

      // PUT /api/loyalty/config (Solo Admin / Gerente)
      if (method === 'PUT' && subPath === 'config') {
        if (auth.user.role === 'cashier') {
          return errorResponse('Solo administradores y gerentes pueden modificar las reglas del Club de Puntos.', 403);
        }
        const body = (await request.json().catch(() => ({}))) as Partial<LoyaltyConfig>;
        const { configObj } = await loadNegocioLoyaltyConfig(env.DB, auth.negocioId);
        const nextConfig = normalizeLoyaltyConfig({
          ...(configObj.loyalty || DEFAULT_LOYALTY_CONFIG),
          ...body,
        });
        const mergedConfig = {
          ...configObj,
          loyalty: nextConfig,
        };
        await env.DB.prepare(
          "UPDATE negocios SET config_json = ?, updated_at = datetime('now') WHERE id = ?"
        )
          .bind(JSON.stringify(mergedConfig), auth.negocioId)
          .run();

        return jsonResponse(nextConfig);
      }

      // GET /api/loyalty/summary
      if (method === 'GET' && subPath === 'summary') {
        const { config } = await loadNegocioLoyaltyConfig(env.DB, auth.negocioId);
        const accStats = await env.DB.prepare(
          `SELECT COUNT(*) as total_members,
                  COALESCE(SUM(points_balance), 0) as active_points_balance,
                  COALESCE(SUM(lifetime_points_earned), 0) as lifetime_points_earned,
                  COALESCE(SUM(lifetime_points_redeemed), 0) as lifetime_points_redeemed
           FROM loyalty_accounts
           WHERE negocio_id = ? AND active = 1`
        )
          .bind(auth.negocioId)
          .first<any>();

        const coupStats = await env.DB.prepare(
          `SELECT SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_coupons_count,
                  COALESCE(SUM(used_count), 0) as total_coupon_redemptions
           FROM discount_coupons
           WHERE negocio_id = ?`
        )
          .bind(auth.negocioId)
          .first<any>();

        const activePointsBalance = Number(accStats?.active_points_balance) || 0;
        return jsonResponse({
          total_members: Number(accStats?.total_members) || 0,
          active_points_balance: activePointsBalance,
          active_points_value_cents: activePointsBalance * config.point_value_cents,
          lifetime_points_earned: Number(accStats?.lifetime_points_earned) || 0,
          lifetime_points_redeemed: Number(accStats?.lifetime_points_redeemed) || 0,
          active_coupons_count: Number(coupStats?.active_coupons_count) || 0,
          total_coupon_redemptions: Number(coupStats?.total_coupon_redemptions) || 0,
          config,
        });
      }

      // GET /api/loyalty/accounts/lookup?phone=...
      if (method === 'GET' && subPath === 'accounts/lookup') {
        const rawPhone = url.searchParams.get('phone') || '';
        const normalizedPhone = normalizeLoyaltyPhone(rawPhone);
        if (!isValidLoyaltyPhone(normalizedPhone)) {
          return errorResponse('Ingresa un número celular válido (7 a 15 dígitos).', 400);
        }

        const { config } = await loadNegocioLoyaltyConfig(env.DB, auth.negocioId);
        const account = await env.DB.prepare(
          'SELECT * FROM loyalty_accounts WHERE negocio_id = ? AND phone = ? AND active = 1'
        )
          .bind(auth.negocioId, normalizedPhone)
          .first<any>();

        if (!account) {
          return jsonResponse({
            enrolled: false,
            phone: normalizedPhone,
            account: null,
            redeemable_value_cents: 0,
            config,
          });
        }

        return jsonResponse({
          enrolled: true,
          phone: normalizedPhone,
          account,
          redeemable_value_cents: (Number(account.points_balance) || 0) * config.point_value_cents,
          config,
        });
      }

      // GET /api/loyalty/accounts
      if (method === 'GET' && subPath === 'accounts') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        const result = await env.DB.prepare(
          'SELECT * FROM loyalty_accounts WHERE negocio_id = ? AND active = 1 ORDER BY points_balance DESC, updated_at DESC'
        )
          .bind(auth.negocioId)
          .all();

        let rows = result.results || [];
        if (q) {
          const digitsQ = q.replace(/\D/g, '');
          rows = rows.filter((r: any) => {
            const nameMatch = String(r.customer_name || '').toLowerCase().includes(q);
            const phoneMatch = digitsQ
              ? String(r.phone || '').includes(digitsQ)
              : String(r.phone || '').toLowerCase().includes(q);
            return nameMatch || phoneMatch;
          });
        }

        return jsonResponse(rows);
      }

      // POST /api/loyalty/accounts (Inscribir vecino)
      if (method === 'POST' && subPath === 'accounts') {
        const body = (await request.json().catch(() => ({}))) as {
          phone?: string;
          customer_name?: string;
          welcome_bonus_points?: number;
        };
        const normalizedPhone = normalizeLoyaltyPhone(body.phone || '');
        const customerName = String(body.customer_name || '').trim();
        const welcomeBonus = Math.round(Number(body.welcome_bonus_points || 0));

        if (!isValidLoyaltyPhone(normalizedPhone)) {
          return errorResponse('Número celular inválido (debe tener entre 7 y 15 dígitos).', 400);
        }
        if (!customerName) {
          return errorResponse('El nombre del vecino es obligatorio.', 400);
        }
        if (welcomeBonus < 0) {
          return errorResponse('El bono de bienvenida no puede ser negativo.', 400);
        }
        if (welcomeBonus > 0 && auth.user.role === 'cashier') {
          return errorResponse('Solo administradores y gerentes pueden otorgar bonos de bienvenida.', 403);
        }

        const existing = await env.DB.prepare(
          'SELECT id FROM loyalty_accounts WHERE negocio_id = ? AND phone = ?'
        )
          .bind(auth.negocioId, normalizedPhone)
          .first<any>();

        if (existing) {
          return errorResponse('Ya existe un vecino inscrito con este número celular.', 409);
        }

        const accountId = `loy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const batch: any[] = [
          env.DB.prepare(
            `INSERT INTO loyalty_accounts (
              id, negocio_id, phone, customer_name, points_balance, lifetime_points_earned, lifetime_points_redeemed,
              total_purchases_count, total_spent_cents, active, last_activity_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 1, datetime('now'), datetime('now'), datetime('now'))`
          ).bind(accountId, auth.negocioId, normalizedPhone, customerName, welcomeBonus, welcomeBonus),
        ];

        if (welcomeBonus > 0) {
          const movId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          batch.push(
            env.DB.prepare(
              `INSERT INTO loyalty_movements (
                id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, created_by_uid, created_by_role, created_at
              ) VALUES (?, ?, ?, 'bonus', ?, ?, 0, 'Bono de bienvenida Club de Puntos', ?, ?, datetime('now'))`
            ).bind(movId, auth.negocioId, accountId, welcomeBonus, welcomeBonus, auth.user.id, auth.user.role)
          );
        }

        await env.DB.batch(batch);
        const created = await env.DB.prepare('SELECT * FROM loyalty_accounts WHERE id = ? AND negocio_id = ?')
          .bind(accountId, auth.negocioId)
          .first();

        return jsonResponse(created, 201);
      }

      // GET /api/loyalty/accounts/:id/movements
      if (method === 'GET' && subPath.startsWith('accounts/') && subPath.endsWith('/movements')) {
        const accountId = subPath.replace(/^accounts\//, '').replace(/\/movements$/, '').trim();
        const account = await env.DB.prepare(
          'SELECT id FROM loyalty_accounts WHERE id = ? AND negocio_id = ?'
        )
          .bind(accountId, auth.negocioId)
          .first();
        if (!account) {
          return errorResponse('Cuenta de puntos no encontrada en este local.', 404);
        }
        const result = await env.DB.prepare(
          'SELECT * FROM loyalty_movements WHERE negocio_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT 50'
        )
          .bind(auth.negocioId, accountId)
          .all();
        return jsonResponse(result.results || []);
      }

      // POST /api/loyalty/accounts/:id/adjust (Bono o ajuste manual — Solo Admin / Gerente)
      if (method === 'POST' && subPath.startsWith('accounts/') && subPath.endsWith('/adjust')) {
        if (auth.user.role === 'cashier') {
          return errorResponse('Solo administradores y gerentes pueden ajustar puntos manualmente.', 403);
        }
        const accountId = subPath.replace(/^accounts\//, '').replace(/\/adjust$/, '').trim();
        const body = (await request.json().catch(() => ({}))) as {
          points_delta?: number;
          description?: string;
        };
        const pointsDelta = Math.round(Number(body.points_delta || 0));
        const description = String(body.description || '').trim();

        if (!Number.isInteger(pointsDelta) || pointsDelta === 0) {
          return errorResponse('El ajuste de puntos debe ser un número entero distinto de 0.', 400);
        }
        if (!description) {
          return errorResponse('Indica el motivo del ajuste o bono.', 400);
        }

        const account = await env.DB.prepare(
          'SELECT * FROM loyalty_accounts WHERE id = ? AND negocio_id = ?'
        )
          .bind(accountId, auth.negocioId)
          .first<any>();
        if (!account) {
          return errorResponse('Cuenta de puntos no encontrada en este local.', 404);
        }

        const nextBalance = (Number(account.points_balance) || 0) + pointsDelta;
        if (nextBalance < 0) {
          return errorResponse('El saldo resultante de puntos no puede ser negativo.', 400);
        }

        const movType = pointsDelta > 0 ? 'bonus' : 'adjust';
        const movId = `lmov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        await env.DB.batch([
          env.DB.prepare(
            `UPDATE loyalty_accounts
             SET points_balance = ?,
                 lifetime_points_earned = lifetime_points_earned + ?,
                 last_activity_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE id = ? AND negocio_id = ?`
          ).bind(nextBalance, pointsDelta > 0 ? pointsDelta : 0, accountId, auth.negocioId),
          env.DB.prepare(
            `INSERT INTO loyalty_movements (
              id, negocio_id, account_id, type, points_delta, balance_after, amount_cents, description, created_by_uid, created_by_role, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))`
          ).bind(movId, auth.negocioId, accountId, movType, pointsDelta, nextBalance, description, auth.user.id, auth.user.role),
        ]);

        const updatedAccount = await env.DB.prepare(
          'SELECT * FROM loyalty_accounts WHERE id = ? AND negocio_id = ?'
        )
          .bind(accountId, auth.negocioId)
          .first();

        return jsonResponse(updatedAccount);
      }
    }

    // 10.5 Cupones de Descuento (/coupons/*) — Privado Multi-Tenant
    if (path === '/coupons' || path.startsWith('/coupons/')) {
      const auth = await authenticateRequest(request, env);
      const subPath = path.replace(/^\/coupons\/?/, '');

      // GET /api/coupons
      if (method === 'GET' && !subPath) {
        const result = await env.DB.prepare(
          'SELECT * FROM discount_coupons WHERE negocio_id = ? ORDER BY active DESC, created_at DESC'
        )
          .bind(auth.negocioId)
          .all();
        return jsonResponse(result.results || []);
      }

      // POST /api/coupons/validate (Todos los roles para POS)
      if (method === 'POST' && subPath === 'validate') {
        const body = (await request.json().catch(() => ({}))) as {
          code?: string;
          subtotal_cents?: number;
        };
        const code = normalizeCouponCode(body.code || '');
        const subtotalCents = Math.max(0, Math.round(Number(body.subtotal_cents) || 0));
        if (!code) {
          return errorResponse('Ingresa un código de cupón.', 400);
        }

        const coupon = await env.DB.prepare(
          'SELECT * FROM discount_coupons WHERE negocio_id = ? AND code = ?'
        )
          .bind(auth.negocioId, code)
          .first<CouponRecord>();

        const validation = validateCouponForSubtotal(coupon, subtotalCents);
        if (!validation.valid) {
          return jsonResponse({ valid: false, error: validation.error }, 400);
        }

        return jsonResponse({
          valid: true,
          coupon,
          discount_cents: validation.discount_cents,
          final_subtotal_cents: validation.final_subtotal_cents,
        });
      }

      // Operaciones de escritura de cupones: Solo Admin / Gerente
      if (auth.user.role === 'cashier') {
        return errorResponse('Solo administradores y gerentes pueden crear o modificar cupones.', 403);
      }

      // POST /api/coupons
      if (method === 'POST' && !subPath) {
        const body = (await request.json().catch(() => ({}))) as {
          code?: string;
          description?: string;
          discount_type?: CouponDiscountType;
          discount_value?: number;
          min_purchase_cents?: number;
          max_discount_cents?: number | null;
          max_uses?: number | null;
          expires_at?: string | null;
        };

        const code = normalizeCouponCode(body.code || '');
        if (!isValidCouponCode(code)) {
          return errorResponse('El código debe tener 3 a 24 caracteres alfanuméricos (A-Z, 0-9, _ o -).', 400);
        }

        const discountType: CouponDiscountType =
          body.discount_type === 'fixed_cents' ? 'fixed_cents' : 'percentage';
        const discountValue = Math.round(Number(body.discount_value || 0));
        if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
          return errorResponse('El porcentaje de descuento debe estar entre 1% y 100%.', 400);
        }
        if (discountType === 'fixed_cents' && discountValue < 100) {
          return errorResponse('El descuento fijo debe ser al menos de $ 1 COP (100 centavos).', 400);
        }

        const minPurchaseCents = Math.max(0, Math.round(Number(body.min_purchase_cents || 0)));
        const maxDiscountCents =
          body.max_discount_cents !== null && body.max_discount_cents !== undefined && Number(body.max_discount_cents) > 0
            ? Math.round(Number(body.max_discount_cents))
            : null;
        const maxUses =
          body.max_uses !== null && body.max_uses !== undefined && Number(body.max_uses) > 0
            ? Math.round(Number(body.max_uses))
            : null;

        const normalizedExp = normalizeExpirationDate(body.expires_at);
        if (normalizedExp === 'INVALID') {
          return errorResponse('La fecha de vencimiento del cupón no es válida (usa YYYY-MM-DD).', 400);
        }

        const duplicate = await env.DB.prepare(
          'SELECT id FROM discount_coupons WHERE negocio_id = ? AND code = ?'
        )
          .bind(auth.negocioId, code)
          .first();
        if (duplicate) {
          return errorResponse(`Ya existe un cupón con el código ${code} en este local.`, 409);
        }

        const couponId = `coup-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await env.DB.prepare(
          `INSERT INTO discount_coupons (
            id, negocio_id, code, description, discount_type, discount_value,
            min_purchase_cents, max_discount_cents, max_uses, used_count, expires_at, active, created_by_uid, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, datetime('now'), datetime('now'))`
        )
          .bind(
            couponId,
            auth.negocioId,
            code,
            body.description?.trim() || null,
            discountType,
            discountValue,
            minPurchaseCents,
            maxDiscountCents,
            maxUses,
            normalizedExp,
            auth.user.id
          )
          .run();

        const created = await env.DB.prepare(
          'SELECT * FROM discount_coupons WHERE id = ? AND negocio_id = ?'
        )
          .bind(couponId, auth.negocioId)
          .first();
        return jsonResponse(created, 201);
      }

      // PUT /api/coupons/:id
      if (method === 'PUT' && subPath) {
        const couponId = subPath.trim();
        const existing = await env.DB.prepare(
          'SELECT * FROM discount_coupons WHERE id = ? AND negocio_id = ?'
        )
          .bind(couponId, auth.negocioId)
          .first<any>();
        if (!existing) {
          return errorResponse('Cupón no encontrado en este local.', 404);
        }

        const body = (await request.json().catch(() => ({}))) as {
          active?: boolean | number;
          description?: string | null;
          min_purchase_cents?: number;
          max_discount_cents?: number | null;
          max_uses?: number | null;
          expires_at?: string | null;
        };

        let nextExpires = existing.expires_at;
        if (body.expires_at !== undefined) {
          const norm = normalizeExpirationDate(body.expires_at);
          if (norm === 'INVALID') {
            return errorResponse('La fecha de vencimiento del cupón no es válida.', 400);
          }
          nextExpires = norm;
        }

        await env.DB.prepare(
          `UPDATE discount_coupons
           SET active = ?,
               description = ?,
               min_purchase_cents = ?,
               max_discount_cents = ?,
               max_uses = ?,
               expires_at = ?,
               updated_at = datetime('now')
           WHERE id = ? AND negocio_id = ?`
        )
          .bind(
            body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
            body.description !== undefined ? (body.description?.trim() || null) : existing.description,
            body.min_purchase_cents !== undefined
              ? Math.max(0, Math.round(Number(body.min_purchase_cents) || 0))
              : existing.min_purchase_cents,
            body.max_discount_cents !== undefined
              ? (body.max_discount_cents && Number(body.max_discount_cents) > 0
                  ? Math.round(Number(body.max_discount_cents))
                  : null)
              : existing.max_discount_cents,
            body.max_uses !== undefined
              ? (body.max_uses && Number(body.max_uses) > 0 ? Math.round(Number(body.max_uses)) : null)
              : existing.max_uses,
            nextExpires,
            couponId,
            auth.negocioId
          )
          .run();

        const updated = await env.DB.prepare(
          'SELECT * FROM discount_coupons WHERE id = ? AND negocio_id = ?'
        )
          .bind(couponId, auth.negocioId)
          .first();
        return jsonResponse(updated);
      }

      // DELETE /api/coupons/:id
      if (method === 'DELETE' && subPath) {
        const couponId = subPath.trim();
        const existing = await env.DB.prepare(
          'SELECT id FROM discount_coupons WHERE id = ? AND negocio_id = ?'
        )
          .bind(couponId, auth.negocioId)
          .first();
        if (!existing) {
          return errorResponse('Cupón no encontrado en este local.', 404);
        }
        await env.DB.prepare('DELETE FROM discount_coupons WHERE id = ? AND negocio_id = ?')
          .bind(couponId, auth.negocioId)
          .run();
        return jsonResponse({ success: true, id: couponId });
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

        const configuredToken =
          typeof env.WHATSAPP_VERIFY_TOKEN === 'string' ? env.WHATSAPP_VERIFY_TOKEN.trim() : '';
        const expectedToken =
          configuredToken || (isDevOrTestAuthAllowed(request, env) ? 'surtifacil-webhook-secret' : '');
        if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        return errorResponse('Verificación de webhook fallida.', 403);
      }

      // 11.2 Recepción de Mensajes Entrantes (Meta POST con verificación HMAC X-Hub-Signature-256)
      if (method === 'POST') {
        const rawBody = await request.text();
        const appSecret =
          typeof env.WHATSAPP_APP_SECRET === 'string' ? env.WHATSAPP_APP_SECRET.trim() : '';
        if (appSecret.length > 0) {
          const signatureHeader =
            request.headers.get('X-Hub-Signature-256') || request.headers.get('x-hub-signature-256');
          const validSignature = await verifyWhatsAppWebhookSignature(rawBody, signatureHeader, appSecret);
          if (!validSignature) {
            return errorResponse('Firma HMAC de webhook WhatsApp inválida.', 401);
          }
        }

        let body: any = {};
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return errorResponse('Payload JSON inválido en webhook de WhatsApp.', 400);
        }
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
        const rawWhatsAppToken = env.WHATSAPP_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
        const hasWhatsAppToken = Boolean(rawWhatsAppToken && String(rawWhatsAppToken).trim().length > 10);
        const hasWhatsAppPhoneId = Boolean(env.WHATSAPP_PHONE_ID && String(env.WHATSAPP_PHONE_ID).trim().length > 5);
        const hasWhatsAppAppSecret = Boolean(
          env.WHATSAPP_APP_SECRET && String(env.WHATSAPP_APP_SECRET).trim().length > 8
        );
        const demoConfig = await getDemoSecurityConfig(env.DB, request, env);
        const hasEnvJwtSecret = Boolean(env.JWT_SECRET && String(env.JWT_SECRET).trim().length >= 16);

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
            app_secret_configured: hasWhatsAppAppSecret,
          },
          database: {
            status: 'connected',
            engine: 'Cloudflare D1 (SQLite Edge)',
            multi_tenant: true,
          },
          security: {
            session_signing: 'HMAC-SHA256',
            jwt_secret_source: hasEnvJwtSecret ? 'cloudflare_env' : 'd1_auto_managed',
            password_hashing: 'PBKDF2-SHA256 (100.000 iteraciones)',
            mock_tokens_blocked_in_prod: true,
            whatsapp_hmac_configured: hasWhatsAppAppSecret,
            demo_quick_access_enabled: demoConfig.demo_quick_access_enabled,
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

    // 15. Estado de Resultados de Utilidad Neta Real (/api/reports/net-profit)
    if (path === '/reports/net-profit' && method === 'GET') {
      const auth = await authenticateRequest(request, env);
      const daysParam = Number(url.searchParams.get('days') || '30');
      const safeDays = Math.min(Math.max(Math.floor(Number.isFinite(daysParam) ? daysParam : 30), 1), 365);

      const nowDate = new Date();
      const sinceDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
      sinceDate.setDate(sinceDate.getDate() - (safeDays - 1));
      const sinceIso = sinceDate.toISOString();

      const [salesRows, shrinkageRows, expenseRows] = await Promise.all([
        env.DB.prepare('SELECT * FROM sales WHERE negocio_id = ? AND created_at >= ? ORDER BY created_at DESC')
          .bind(auth.negocioId, sinceIso)
          .all<any>(),
        env.DB.prepare('SELECT * FROM inventory_shrinkage WHERE negocio_id = ? AND created_at >= ?')
          .bind(auth.negocioId, sinceIso)
          .all<any>(),
        env.DB.prepare('SELECT * FROM cash_expenses WHERE negocio_id = ? AND created_at >= ?')
          .bind(auth.negocioId, sinceIso)
          .all<any>(),
      ]);

      const rawSales = salesRows.results || [];
      const enrichedSales = await Promise.all(
        rawSales.map(async (sale: any) => {
          const itemsRes = await env.DB.prepare('SELECT * FROM sale_items WHERE sale_id = ?')
            .bind(sale.id)
            .all<any>();
          return enrichSaleRow(sale, itemsRes.results || []);
        })
      );

      const statement = calculateNetProfitStatement({
        sales: enrichedSales,
        shrinkageEntries: shrinkageRows.results || [],
        cashExpenses: expenseRows.results || [],
        days: safeDays,
        now: nowDate,
      });

      return jsonResponse(statement);
    }

    return errorResponse(`Ruta API no encontrada: ${method} /api${path}`, 404);
  } catch (error: any) {
    console.error('Error en Pages Functions API:', error);
    const message = error?.message || 'Error interno en el servidor.';
    const lowerMsg = message.toLowerCase();
    const status =
      lowerMsg.includes('token') ||
      lowerMsg.includes('autorización') ||
      lowerMsg.includes('denegado') ||
      lowerMsg.includes('expirado') ||
      lowerMsg.includes('firma')
        ? 401
        : 500;
    return errorResponse(message, status);
  }
};
