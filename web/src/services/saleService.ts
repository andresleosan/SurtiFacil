import { PaymentBreakdownEntry, PaymentMethod, Product, SaleItem, Sale } from '../firebase/db';
import { mockProducts, addLocalSale, getLocalSales, mockCreditCustomers, addLocalCreditEntry } from './mockData';
import { mapProductRow, refreshProducts } from './productService';
import { apiClient, ApiError, emitDataChange, hasAuthSession } from './apiClient';
import {
  cacheProductsForTenant,
  enqueueOfflineSale,
  getCachedProductsForTenant,
  isOfflineModeActive,
} from './offlineSyncService';
import { resolveProductUnitPricing } from '../utils/wholesalePricing';
import {
  extractSalePaymentBuckets,
  isSaleVoided,
  parsePaymentBreakdown,
  resolveSalePaymentBreakdown,
} from '../utils/saleAccounting';
import {
  isValidLoyaltyPhone,
  normalizeCouponCode,
  normalizeLoyaltyPhone,
  settleOrderLoyaltyAndCoupon,
} from '../utils/loyaltyEngine';
import {
  getMockCouponsSnapshot,
  getMockLoyaltyAccountsSnapshot,
  getMockLoyaltyConfigSnapshot,
} from './loyaltyService';
import type { CreateSaleLoyaltyOptions } from '../types/loyalty';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function mapSale(row: any): Sale {
  const createdDate = row.created_at ? new Date(row.created_at) : new Date();
  const totalCents = row.total_cents ?? row.total ?? 0;
  const breakdown = parsePaymentBreakdown(
    row.payment_breakdown ?? row.payment_breakdown_json,
    row.payment_method || 'cash',
    Number(totalCents) || 0,
  );
  const resolvedMethod: PaymentMethod =
    breakdown.length > 1 ? 'mixed' : (row.payment_method || breakdown[0]?.method || 'cash');

  return {
    id: row.id,
    date: {
      toMillis: () => createdDate.getTime(),
      toDate: () => createdDate,
      toISOString: () => createdDate.toISOString(),
    },
    total: totalCents,
    subtotal_cents: row.subtotal_cents ?? undefined,
    coupon_code: row.coupon_code ?? undefined,
    coupon_discount_cents: row.coupon_discount_cents ?? undefined,
    loyalty_account_id: row.loyalty_account_id ?? undefined,
    loyalty_phone: row.loyalty_phone ?? undefined,
    loyalty_points_redeemed: row.loyalty_points_redeemed ?? undefined,
    loyalty_discount_cents: row.loyalty_discount_cents ?? undefined,
    loyalty_points_earned: row.loyalty_points_earned ?? undefined,
    total_cost_cents: row.total_cost_cents ?? 0,
    payment_method: resolvedMethod,
    payment_breakdown: breakdown,
    status: row.status === 'voided' ? 'voided' : 'completed',
    voided_at: row.voided_at ?? null,
    voided_by_uid: row.voided_by_uid ?? null,
    voided_by_name: row.voided_by_name ?? null,
    void_reason: row.void_reason ?? null,
    credit_customer_id: row.credit_customer_id || undefined,
    credit_customer_name: row.credit_customer_name || undefined,
    schema_version: row.schema_version ?? 2,
    created_by_uid: row.created_by_uid || undefined,
    created_by_role: row.created_by_role || undefined,
    createdAt: createdDate,
    items: (row.items || []).map((it: any) => ({
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      price_cents: it.price_cents,
      subtotal: it.subtotal_cents ?? it.subtotal ?? (it.price_cents * it.quantity),
      regular_price_cents: it.regular_price_cents ?? undefined,
      applied_wholesale_tier: it.applied_wholesale_tier ?? undefined,
      wholesale_savings_cents: it.wholesale_savings_cents ?? undefined,
      unit_cost_cents: it.unit_cost_cents ?? undefined,
      cost_subtotal_cents: it.cost_subtotal_cents ?? undefined,
      category: it.category || undefined,
    })),
  };
}

/**
 * Obtiene la lista de productos desde Cloudflare D1
 * Solo usa datos mock cuando el modo está habilitado explícitamente.
 */
export async function getProducts(): Promise<Product[]> {
  if (isMockMode()) {
    console.log('ℹ️ Usando datos mock - Firebase no configurado');
    return mockProducts;
  }

  if (isOfflineModeActive()) {
    const cached = await getCachedProductsForTenant();
    if (cached.length > 0) return cached;
  }

  try {
    const list = await apiClient.get<any[]>('/products');
    const mapped = (list || []).map(mapProductRow);
    void cacheProductsForTenant(mapped);
    return mapped;
  } catch {
    if (isOfflineModeActive()) {
      const cached = await getCachedProductsForTenant();
      if (cached.length > 0) return cached;
    }
    console.error('Error getting products from Firebase');
    throw new Error('Error al cargar productos');
  }
}

/**
 * Crea una nueva venta mediante el backend (o datos mock en modo explícito).
 */
export async function createSale(
  cartItems: SaleItem[],
  paymentMethod: PaymentMethod,
  creditCustomerId?: string,
  loyaltyOptions?: CreateSaleLoyaltyOptions,
  paymentBreakdown?: PaymentBreakdownEntry[],
): Promise<string> {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('El carrito está vacío');
  }
  const hasCreditPortion =
    paymentMethod === 'credit' || (paymentBreakdown || []).some((entry) => entry.method === 'credit' && entry.amount_cents > 0);
  if (hasCreditPortion && !creditCustomerId) {
    throw new Error('Selecciona el cliente al que se le fía');
  }

  if (isOfflineModeActive()) {
    const queued = await enqueueOfflineSale(
      cartItems,
      paymentMethod,
      creditCustomerId,
      undefined,
      loyaltyOptions,
      paymentBreakdown,
    );
    return queued.id;
  }

  if (isMockMode()) {
    console.log('ℹ️ Creando venta en datos mock (Firebase no configurado)');
    return createMockSale(cartItems, paymentMethod, creditCustomerId, loyaltyOptions, paymentBreakdown);
  }

  if (!hasAuthSession()) {
    throw new Error('Debes iniciar sesión para crear la venta');
  }

  try {
    const normalizedPhone = loyaltyOptions?.loyalty_phone
      ? normalizeLoyaltyPhone(loyaltyOptions.loyalty_phone)
      : '';
    const normalizedCoupon = loyaltyOptions?.coupon_code
      ? normalizeCouponCode(loyaltyOptions.coupon_code)
      : '';
    const pointsRedeemed =
      loyaltyOptions?.loyalty_points_redeemed && loyaltyOptions.loyalty_points_redeemed > 0
        ? Math.round(loyaltyOptions.loyalty_points_redeemed)
        : 0;

    const payload: Record<string, unknown> = {
      items: cartItems.map(({ product_id, quantity }) => ({ product_id, quantity })),
      payment_method: paymentMethod,
      ...(paymentBreakdown && paymentBreakdown.length > 0 ? { payment_breakdown: paymentBreakdown } : {}),
      ...(hasCreditPortion && creditCustomerId ? { credit_customer_id: creditCustomerId } : {}),
      ...(normalizedPhone ? { loyalty_phone: normalizedPhone } : {}),
      ...(loyaltyOptions?.loyalty_customer_name?.trim()
        ? { loyalty_customer_name: loyaltyOptions.loyalty_customer_name.trim() }
        : {}),
      ...(pointsRedeemed > 0 ? { loyalty_points_redeemed: pointsRedeemed } : {}),
      ...(normalizedCoupon ? { coupon_code: normalizedCoupon } : {}),
    };

    const result = await apiClient.post<{ id?: string; saleId?: string }>('/sales', payload);
    const saleId = result?.saleId || result?.id;
    if (!saleId || typeof saleId !== 'string') {
      throw new Error('Error al crear la venta');
    }

    emitDataChange('sales');
    emitDataChange('products');
    if (hasCreditPortion) {
      emitDataChange('credits');
    }
    if (normalizedPhone || normalizedCoupon || pointsRedeemed > 0) {
      emitDataChange('loyalty');
    }

    return saleId;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      throw error;
    }
    const message = error instanceof Error ? error.message : '';
    const safeMessages = new Set([
      'Debes iniciar sesión para crear la venta',
      'Solicitud inválida',
      'No autorizado',
      'Recurso no encontrado',
      'Demasiadas solicitudes',
    ]);
    if (safeMessages.has(message)) throw error;
    console.error('Error creating sale through backend');
    throw new Error('Error al crear la venta');
  }
}

/**
 * Crea una venta usando datos mock locales
 */
function createMockSale(
  cartItems: SaleItem[],
  paymentMethod: PaymentMethod,
  creditCustomerId?: string,
  loyaltyOptions?: CreateSaleLoyaltyOptions,
  paymentBreakdown?: PaymentBreakdownEntry[],
): string {
  const usesCredit =
    paymentMethod === 'credit' || (paymentBreakdown || []).some((entry) => entry.method === 'credit' && entry.amount_cents > 0);
  const creditCustomer = usesCredit
    ? mockCreditCustomers.find((candidate) => candidate.id === creditCustomerId && candidate.active)
    : undefined;
  if (usesCredit && !creditCustomer) {
    throw new Error('Cliente de fiado no encontrado');
  }

  // Validar stock disponible
  for (const item of cartItems) {
    const product = mockProducts.find((p) => p.id === item.product_id);
    if (!product) {
      throw new Error(`Producto ${item.product_id} no encontrado`);
    }
    if (item.quantity > product.stock) {
      throw new Error(
        `Stock insuficiente de "${product.name}". Intenta vender ${item.quantity} pero solo hay ${product.stock}`
      );
    }
  }

  const snapshotItems: SaleItem[] = cartItems.map((item) => {
    const product = mockProducts.find((candidate) => candidate.id === item.product_id)!;
    const pricing = resolveProductUnitPricing(product, item.quantity);
    const hasCost = Number.isSafeInteger(product.last_cost_cents) && product.last_cost_cents! >= 0;
    const unitCost = hasCost ? product.last_cost_cents! : Math.floor(product.price_cents / 2);
    const costSource = hasCost ? (product.last_cost_source || 'purchase') : 'fallback_price';
    return {
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      price_cents: pricing.unit_price_cents,
      subtotal: pricing.subtotal_cents,
      regular_price_cents: pricing.regular_unit_price_cents,
      applied_wholesale_tier: pricing.applied_tier,
      wholesale_savings_cents: pricing.wholesale_savings_cents,
      unit_cost_cents: unitCost,
      cost_subtotal_cents: unitCost * item.quantity,
      cost_source: costSource,
      cost_is_estimated: costSource === 'fallback_price',
      category: product.category?.trim() || 'Sin categoría',
    };
  });
  const subtotal = snapshotItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalCost = snapshotItems.reduce((sum, item) => sum + (item.cost_subtotal_cents || 0), 0);
  const normalizedPhone = loyaltyOptions?.loyalty_phone
    ? normalizeLoyaltyPhone(loyaltyOptions.loyalty_phone)
    : '';
  const hasValidPhone = Boolean(normalizedPhone && isValidLoyaltyPhone(normalizedPhone));
  const normalizedCoupon = loyaltyOptions?.coupon_code
    ? normalizeCouponCode(loyaltyOptions.coupon_code)
    : '';
  const mockCoupon = normalizedCoupon
    ? getMockCouponsSnapshot().find((c) => c.code === normalizedCoupon) || null
    : null;
  const mockAcc = hasValidPhone
    ? getMockLoyaltyAccountsSnapshot().find((a) => a.phone === normalizedPhone) || null
    : null;
  const settlement = settleOrderLoyaltyAndCoupon({
    itemsSubtotalCents: subtotal,
    deliveryFeeCents: 0,
    config: getMockLoyaltyConfigSnapshot(),
    coupon: mockCoupon,
    couponCodeRequested: normalizedCoupon || null,
    hasValidPhone,
    accountPointsBalance: mockAcc?.points_balance ?? 0,
    pointsToRedeemRequested: loyaltyOptions?.loyalty_points_redeemed ?? 0,
  });
  if (!settlement.ok) {
    throw new Error(settlement.error);
  }
  const total = settlement.final_total_cents;
  const paymentResolution = resolveSalePaymentBreakdown({
    totalCents: total,
    paymentMethod,
    paymentBreakdown,
    creditCustomerId,
  });
  if (!paymentResolution.ok) {
    throw new Error(paymentResolution.error);
  }
  const saleId = `sale_${Date.now()}`;

  if (mockAcc) {
    mockAcc.points_balance = Math.max(
      0,
      mockAcc.points_balance - settlement.points_redeemed + settlement.points_earned,
    );
    mockAcc.lifetime_points_earned += settlement.points_earned;
    mockAcc.lifetime_points_redeemed += settlement.points_redeemed;
    mockAcc.total_purchases_count += 1;
    mockAcc.total_spent_cents += total;
  }
  if (mockCoupon && settlement.coupon_code) {
    mockCoupon.used_count += 1;
  }

  const newSale: Sale = {
    id: saleId,
    date: new Date(),
    total,
    subtotal_cents: subtotal,
    coupon_code: settlement.coupon_code,
    coupon_discount_cents: settlement.coupon_discount_cents,
    loyalty_account_id: mockAcc?.id ?? null,
    loyalty_phone: hasValidPhone ? normalizedPhone : null,
    loyalty_points_redeemed: settlement.points_redeemed,
    loyalty_discount_cents: settlement.points_discount_cents,
    loyalty_points_earned: settlement.points_earned,
    loyalty_balance_after: mockAcc?.points_balance ?? null,
    total_cost_cents: totalCost,
    payment_method: paymentResolution.effective_payment_method,
    payment_breakdown: paymentResolution.breakdown,
    status: 'completed',
    items: snapshotItems,
    createdAt: new Date(),
    schema_version: 2,
    created_by_uid: 'mock-user',
    created_by_role: 'cashier',
    ...(creditCustomer && paymentResolution.credit_cents > 0
      ? { credit_customer_id: creditCustomer.id, credit_customer_name: creditCustomer.name }
      : {}),
  };

  if (creditCustomer && paymentResolution.credit_cents > 0) {
    creditCustomer.balance_cents += paymentResolution.credit_cents;
    creditCustomer.last_entry_at = new Date();
    addLocalCreditEntry({
      id: `entry_${Date.now()}`,
      customer_id: creditCustomer.id,
      type: 'debt',
      amount_cents: paymentResolution.credit_cents,
      description: paymentResolution.is_mixed ? 'Saldo fiado en venta mixta' : 'Venta fiada',
      sale_id: saleId,
      created_by_uid: 'mock-user',
      created_by_role: 'cashier',
      createdAt: new Date(),
    });
  }

  // Actualizar stock en datos mock
  mockProducts.forEach((product) => {
    const soldItem = cartItems.find((item) => item.product_id === product.id);
    if (soldItem) {
      product.stock -= soldItem.quantity;
    }
  });

  // Guardar venta en datos mock
  addLocalSale(newSale);
  refreshProducts();

  return saleId;
}

/**
 * Obtiene el historial de ventas desde Cloudflare D1 (o datos mock en modo explícito)
 */
export async function getSales(): Promise<Sale[]> {
  if (isMockMode()) {
    console.log('ℹ️ Usando historial de ventas mock (Firebase no configurado)');
    const sales = getLocalSales();
    return sales.sort((a, b) => {
      const timeA = saleDateMillis(a);
      const timeB = saleDateMillis(b);
      return timeB - timeA;
    });
  }

  try {
    const list = await apiClient.get<any[]>('/sales');
    const sales = (list || []).map(mapSale);
    return sortSalesDesc(sales);
  } catch {
    console.error('Error getting sales from Firebase');
    throw new Error('Error al cargar ventas');
  }
}

function saleDateMillis(sale: Sale): number {
  const value = sale.date || sale.createdAt;
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortSalesDesc(sales: Sale[]): Sale[] {
  return [...sales].sort((a, b) => saleDateMillis(b) - saleDateMillis(a));
}

export interface SalesPage {
  sales: Sale[];
  cursor: unknown | null;
  hasMore: boolean;
}

/**
 * Historial de ventas paginado (más recientes primero).
 */
export async function getRecentSales(pageSize = 50, cursor: unknown = null): Promise<SalesPage> {
  if (isMockMode()) {
    const all = sortSalesDesc(getLocalSales());
    const offset = typeof cursor === 'number' ? cursor : 0;
    const sales = all.slice(offset, offset + pageSize);
    const nextOffset = offset + sales.length;
    return { sales, cursor: nextOffset < all.length ? nextOffset : null, hasMore: nextOffset < all.length };
  }

  try {
    const cursorParam = typeof cursor === 'string' ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const list = await apiClient.get<any[]>(`/sales?limit=${pageSize + 1}${cursorParam}`);
    const mapped = (list || []).map(mapSale);
    const hasMore = mapped.length > pageSize;
    const sales = hasMore ? mapped.slice(0, pageSize) : mapped;
    const nextCursor = hasMore && sales.length > 0 ? sales[sales.length - 1].id : null;

    return {
      sales,
      cursor: nextCursor,
      hasMore,
    };
  } catch {
    console.error('Error getting recent sales from Firebase');
    throw new Error('Error al cargar ventas');
  }
}

/** Ventas desde una fecha (inclusive), más recientes primero. */
export async function getSalesSince(since: Date): Promise<Sale[]> {
  if (isMockMode()) {
    const threshold = since.getTime();
    return sortSalesDesc(getLocalSales().filter((sale) => saleDateMillis(sale) >= threshold));
  }

  try {
    const list = await apiClient.get<any[]>(`/sales?since=${encodeURIComponent(since.toISOString())}`);
    const sales = (list || []).map(mapSale);
    return sortSalesDesc(sales);
  } catch {
    console.error('Error getting sales since date from Firebase');
    throw new Error('Error al cargar ventas');
  }
}

export interface SalesTotals {
  count: number;
  totalCents: number;
}

/** Totales históricos calculados en el servidor (una sola lectura agregada). */
export async function getSalesTotals(): Promise<SalesTotals> {
  if (isMockMode()) {
    const sales = getLocalSales().filter((sale) => !isSaleVoided(sale));
    return {
      count: sales.length,
      totalCents: sales.reduce((total, sale) => total + (sale.total || 0), 0),
    };
  }

  try {
    const data = await apiClient.get<SalesTotals>('/sales?totals=true');
    return { count: Number(data?.count) || 0, totalCents: Number(data?.totalCents) || 0 };
  } catch {
    console.error('Error getting sales totals from Firebase');
    throw new Error('Error al cargar ventas');
  }
}

export interface VoidSaleResult {
  success: boolean;
  sale: Sale;
  restocked_units: number;
  credit_reversed_cents: number;
  loyalty_points_delta: number;
}

/**
 * Anula o devuelve una venta de forma atómica (reintegra inventario, revierte deuda fiada y fidelización).
 */
export async function voidSale(saleId: string, reason: string): Promise<VoidSaleResult> {
  const cleanId = saleId?.trim();
  if (!cleanId) {
    throw new Error('ID de venta inválido.');
  }

  const trimmedReason = reason?.trim() || '';
  if (trimmedReason.length < 3 || trimmedReason.length > 250) {
    throw new Error('Ingresa un motivo de anulación válido (mínimo 3 caracteres).');
  }

  if (isOfflineModeActive()) {
    throw new Error('No es posible anular ventas sin conexión. Conéctate a internet para sincronizar primero.');
  }

  if (isMockMode()) {
    const sale = getLocalSales().find((candidate) => candidate.id === cleanId);
    if (!sale) {
      throw new Error('Venta no encontrada.');
    }
    if (isSaleVoided(sale)) {
      throw new Error('Esta venta ya fue anulada previamente.');
    }

    const buckets = extractSalePaymentBuckets({ ...sale, status: 'completed' });
    let restockedUnits = 0;
    for (const item of sale.items || []) {
      const prod = mockProducts.find((candidate) => candidate.id === item.product_id);
      const qty = Math.max(0, Number(item.quantity) || 0);
      restockedUnits += qty;
      if (prod && qty > 0) {
        prod.stock += qty;
      }
    }

    if (buckets.credit_cents > 0 && sale.credit_customer_id) {
      const cust = mockCreditCustomers.find((c) => c.id === sale.credit_customer_id);
      if (cust) {
        cust.balance_cents = Math.max(0, cust.balance_cents - buckets.credit_cents);
        cust.last_entry_at = new Date();
        addLocalCreditEntry({
          id: `entry_void_${Date.now()}`,
          customer_id: cust.id,
          type: 'payment',
          amount_cents: buckets.credit_cents,
          description: `Reversión por anulación venta #${sale.id.slice(0, 8)}: ${trimmedReason}`,
          sale_id: sale.id,
          created_by_uid: 'mock-admin',
          created_by_role: 'admin',
          createdAt: new Date(),
        });
      }
    }

    if (sale.coupon_code) {
      const coupon = getMockCouponsSnapshot().find((c) => c.code === normalizeCouponCode(sale.coupon_code || ''));
      if (coupon) {
        coupon.used_count = Math.max(0, coupon.used_count - 1);
      }
    }

    let loyaltyDelta = 0;
    const earned = Math.max(0, Number(sale.loyalty_points_earned) || 0);
    const redeemed = Math.max(0, Number(sale.loyalty_points_redeemed) || 0);
    if (sale.loyalty_phone && (earned > 0 || redeemed > 0)) {
      const acc = getMockLoyaltyAccountsSnapshot().find((a) => a.phone === normalizeLoyaltyPhone(sale.loyalty_phone || ''));
      if (acc) {
        loyaltyDelta = redeemed - earned;
        acc.points_balance = Math.max(0, acc.points_balance + loyaltyDelta);
        acc.lifetime_points_earned = Math.max(0, acc.lifetime_points_earned - earned);
        acc.lifetime_points_redeemed = Math.max(0, acc.lifetime_points_redeemed - redeemed);
        acc.total_purchases_count = Math.max(0, acc.total_purchases_count - 1);
        acc.total_spent_cents = Math.max(0, acc.total_spent_cents - (Number(sale.total) || 0));
      }
    }

    sale.status = 'voided';
    sale.voided_at = new Date().toISOString();
    sale.voided_by_uid = 'mock-admin';
    sale.voided_by_name = 'Administrador Local';
    sale.void_reason = trimmedReason;

    refreshProducts();
    emitDataChange('sales');
    emitDataChange('products');
    if (buckets.credit_cents > 0) emitDataChange('credits');
    if (sale.coupon_code || loyaltyDelta !== 0) emitDataChange('loyalty');

    return {
      success: true,
      sale: { ...sale },
      restocked_units: restockedUnits,
      credit_reversed_cents: buckets.credit_cents,
      loyalty_points_delta: loyaltyDelta,
    };
  }

  if (!hasAuthSession()) {
    throw new Error('Debes iniciar sesión para anular una venta');
  }

  const res = await apiClient.post<{
    success: boolean;
    sale: any;
    restocked_units: number;
    credit_reversed_cents: number;
    loyalty_points_delta: number;
  }>(`/sales/${encodeURIComponent(cleanId)}/void`, { reason: trimmedReason });

  const mappedSale = mapSale(res.sale);
  emitDataChange('sales');
  emitDataChange('products');
  emitDataChange('credits');
  emitDataChange('loyalty');

  return {
    success: Boolean(res.success),
    sale: mappedSale,
    restocked_units: Number(res.restocked_units) || 0,
    credit_reversed_cents: Number(res.credit_reversed_cents) || 0,
    loyalty_points_delta: Number(res.loyalty_points_delta) || 0,
  };
}
