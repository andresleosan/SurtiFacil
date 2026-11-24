import { apiClient, ApiError, emitDataChange } from './apiClient';
import {
  DEFAULT_LOYALTY_CONFIG,
  isValidCouponCode,
  isValidLoyaltyPhone,
  maskPublicCustomerName,
  normalizeCouponCode,
  normalizeLoyaltyConfig,
  normalizeLoyaltyPhone,
  validateCouponForSubtotal,
  type LoyaltyConfig,
} from '../utils/loyaltyEngine';
import { formatCentsCOP } from '../utils/currency';
import { buildWhatsAppClickToChatUrl } from '../utils/debtReminder';
import type {
  CouponValidationResponse,
  CreateCouponInput,
  DiscountCoupon,
  LoyaltyAccount,
  LoyaltyLookupResponse,
  LoyaltyMovement,
  LoyaltySummary,
  PublicLoyaltyLookupResponse,
} from '../types/loyalty';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

// ==========================================
// Estado en Memoria para Modo Mock / Pruebas
// ==========================================
let mockConfig: LoyaltyConfig = { ...DEFAULT_LOYALTY_CONFIG };

let mockAccounts: LoyaltyAccount[] = [
  {
    id: 'loy-don-carlos',
    negocio_id: 'surtifacil',
    phone: '3004567890',
    customer_name: 'Don Carlos Restrepo',
    points_balance: 85,
    lifetime_points_earned: 120,
    lifetime_points_redeemed: 35,
    total_purchases_count: 9,
    total_spent_cents: 12000000,
    active: 1,
    last_activity_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'loy-dona-marta',
    negocio_id: 'surtifacil',
    phone: '3112345678',
    customer_name: 'Doña Marta Gómez',
    points_balance: 40,
    lifetime_points_earned: 40,
    lifetime_points_redeemed: 0,
    total_purchases_count: 4,
    total_spent_cents: 4000000,
    active: 1,
    last_activity_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let mockMovements: LoyaltyMovement[] = [
  {
    id: 'lmov-seed-carlos',
    negocio_id: 'surtifacil',
    account_id: 'loy-don-carlos',
    type: 'bonus',
    points_delta: 85,
    balance_after: 85,
    amount_cents: 0,
    description: 'Saldo inicial Club de Puntos del Barrio',
    created_by_uid: 'system',
    created_by_role: 'admin',
    created_at: new Date().toISOString(),
  },
];

let mockCoupons: DiscountCoupon[] = [
  {
    id: 'coup-vecino10',
    negocio_id: 'surtifacil',
    code: 'VECINO10',
    description: '10% de descuento para vecinos del barrio',
    discount_type: 'percentage',
    discount_value: 10,
    min_purchase_cents: 1000000,
    max_discount_cents: 1000000,
    max_uses: 100,
    used_count: 3,
    expires_at: null,
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'coup-mercado2000',
    negocio_id: 'surtifacil',
    code: 'MERCADO2000',
    description: '$ 2.000 COP de regalo en tu mercado',
    discount_type: 'fixed_cents',
    discount_value: 200000,
    min_purchase_cents: 1200000,
    max_discount_cents: null,
    max_uses: 50,
    used_count: 1,
    expires_at: null,
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function getMockCouponsSnapshot(): DiscountCoupon[] {
  return mockCoupons;
}

export function getMockLoyaltyAccountsSnapshot(): LoyaltyAccount[] {
  return mockAccounts;
}

export function getMockLoyaltyConfigSnapshot(): LoyaltyConfig {
  return mockConfig;
}

function handleLoyaltyApiError(error: unknown, fallbackMessage: string): never {
  if (error instanceof ApiError) {
    throw error;
  }
  if (error instanceof Error && error.message) {
    throw error;
  }
  throw new Error(fallbackMessage);
}

// ==========================================
// Consultas y Gestión del Club de Puntos
// ==========================================

export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  if (isMockMode()) {
    return { ...mockConfig };
  }
  try {
    const res = await apiClient.get<LoyaltyConfig>('/loyalty/config');
    return normalizeLoyaltyConfig(res);
  } catch (err) {
    handleLoyaltyApiError(err, 'Error al cargar la configuración del Club de Puntos.');
  }
}

export async function updateLoyaltyConfig(input: Partial<LoyaltyConfig>): Promise<LoyaltyConfig> {
  if (isMockMode()) {
    mockConfig = normalizeLoyaltyConfig({ ...mockConfig, ...input });
    emitDataChange('loyalty');
    return { ...mockConfig };
  }
  try {
    const res = await apiClient.put<LoyaltyConfig>('/loyalty/config', input);
    emitDataChange('loyalty');
    return normalizeLoyaltyConfig(res);
  } catch (err) {
    handleLoyaltyApiError(err, 'Error al guardar la configuración del Club de Puntos.');
  }
}

export async function getLoyaltySummary(): Promise<LoyaltySummary> {
  if (isMockMode()) {
    const activeAccounts = mockAccounts.filter((a) => a.active === 1);
    const activePointsBalance = activeAccounts.reduce((s, a) => s + a.points_balance, 0);
    return {
      total_members: activeAccounts.length,
      active_points_balance: activePointsBalance,
      active_points_value_cents: activePointsBalance * mockConfig.point_value_cents,
      lifetime_points_earned: activeAccounts.reduce((s, a) => s + a.lifetime_points_earned, 0),
      lifetime_points_redeemed: activeAccounts.reduce((s, a) => s + a.lifetime_points_redeemed, 0),
      active_coupons_count: mockCoupons.filter((c) => c.active === 1).length,
      total_coupon_redemptions: mockCoupons.reduce((s, c) => s + c.used_count, 0),
      config: { ...mockConfig },
    };
  }
  try {
    return await apiClient.get<LoyaltySummary>('/loyalty/summary');
  } catch (err) {
    handleLoyaltyApiError(err, 'Error al cargar el resumen del Club de Puntos.');
  }
}

export async function getLoyaltyAccounts(query = ''): Promise<LoyaltyAccount[]> {
  if (isMockMode()) {
    const q = query.trim().toLowerCase();
    return mockAccounts
      .filter((a) => a.active === 1)
      .filter((a) => {
        if (!q) return true;
        return a.customer_name.toLowerCase().includes(q) || a.phone.includes(q.replace(/\D/g, ''));
      })
      .sort((a, b) => b.points_balance - a.points_balance);
  }
  try {
    const endpoint = query.trim()
      ? `/loyalty/accounts?q=${encodeURIComponent(query.trim())}`
      : '/loyalty/accounts';
    return await apiClient.get<LoyaltyAccount[]>(endpoint);
  } catch (err) {
    handleLoyaltyApiError(err, 'Error al cargar los vecinos inscritos.');
  }
}

export async function lookupLoyaltyByPhone(phone: string): Promise<LoyaltyLookupResponse> {
  const normalized = normalizeLoyaltyPhone(phone);
  if (!isValidLoyaltyPhone(normalized)) {
    throw new Error('Ingresa un número celular válido (7 a 15 dígitos).');
  }

  if (isMockMode()) {
    const acc = mockAccounts.find((a) => a.phone === normalized && a.active === 1) || null;
    return {
      enrolled: Boolean(acc),
      phone: normalized,
      account: acc,
      redeemable_value_cents: (acc?.points_balance || 0) * mockConfig.point_value_cents,
      config: { ...mockConfig },
    };
  }

  try {
    return await apiClient.get<LoyaltyLookupResponse>(
      `/loyalty/accounts/lookup?phone=${encodeURIComponent(normalized)}`
    );
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo consultar el saldo de puntos.');
  }
}

export async function lookupPublicLoyaltyByPhone(
  slug: string,
  phone: string
): Promise<PublicLoyaltyLookupResponse> {
  const normalized = normalizeLoyaltyPhone(phone);
  if (!isValidLoyaltyPhone(normalized)) {
    throw new Error('Ingresa un número celular válido (7 a 15 dígitos).');
  }

  if (isMockMode()) {
    const acc = mockAccounts.find((a) => a.phone === normalized && a.active === 1) || null;
    return {
      enrolled: Boolean(acc),
      phone: normalized,
      display_name: acc ? maskPublicCustomerName(acc.customer_name) : null,
      points_balance: acc?.points_balance || 0,
      redeemable_value_cents: (acc?.points_balance || 0) * mockConfig.point_value_cents,
      config: { ...mockConfig },
    };
  }

  try {
    return await apiClient.get<PublicLoyaltyLookupResponse>(
      `/public/loyalty/lookup?slug=${encodeURIComponent(slug)}&phone=${encodeURIComponent(normalized)}`
    );
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo consultar tus puntos en este momento.');
  }
}

export async function enrollLoyaltyMember(input: {
  phone: string;
  customer_name: string;
  welcome_bonus_points?: number;
}): Promise<LoyaltyAccount> {
  const normalized = normalizeLoyaltyPhone(input.phone);
  if (!isValidLoyaltyPhone(normalized)) {
    throw new Error('Número celular inválido (7 a 15 dígitos).');
  }
  const name = input.customer_name.trim();
  if (!name) {
    throw new Error('El nombre del vecino es obligatorio.');
  }

  if (isMockMode()) {
    if (mockAccounts.some((a) => a.phone === normalized)) {
      throw new ApiError('Ya existe un vecino inscrito con este número celular.', 409);
    }
    const bonus = Math.max(0, Math.round(input.welcome_bonus_points || 0));
    const created: LoyaltyAccount = {
      id: `loy-${Date.now()}`,
      negocio_id: 'surtifacil',
      phone: normalized,
      customer_name: name,
      points_balance: bonus,
      lifetime_points_earned: bonus,
      lifetime_points_redeemed: 0,
      total_purchases_count: 0,
      total_spent_cents: 0,
      active: 1,
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockAccounts = [created, ...mockAccounts];
    if (bonus > 0) {
      mockMovements = [
        {
          id: `lmov-${Date.now()}`,
          negocio_id: 'surtifacil',
          account_id: created.id,
          type: 'bonus',
          points_delta: bonus,
          balance_after: bonus,
          amount_cents: 0,
          description: 'Bono de bienvenida Club de Puntos',
          created_at: new Date().toISOString(),
        },
        ...mockMovements,
      ];
    }
    emitDataChange('loyalty');
    return created;
  }

  try {
    const res = await apiClient.post<LoyaltyAccount>('/loyalty/accounts', {
      phone: normalized,
      customer_name: name,
      welcome_bonus_points: Math.max(0, Math.round(input.welcome_bonus_points || 0)),
    });
    emitDataChange('loyalty');
    return res;
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo inscribir al vecino en el Club de Puntos.');
  }
}

export async function getLoyaltyMovements(accountId: string): Promise<LoyaltyMovement[]> {
  if (isMockMode()) {
    return mockMovements.filter((m) => m.account_id === accountId);
  }
  try {
    return await apiClient.get<LoyaltyMovement[]>(
      `/loyalty/accounts/${encodeURIComponent(accountId)}/movements`
    );
  } catch (err) {
    handleLoyaltyApiError(err, 'Error al consultar historial de puntos.');
  }
}

export async function adjustLoyaltyPoints(
  accountId: string,
  pointsDelta: number,
  description: string
): Promise<LoyaltyAccount> {
  if (isMockMode()) {
    const idx = mockAccounts.findIndex((a) => a.id === accountId);
    if (idx < 0) throw new ApiError('Cuenta no encontrada.', 404);
    const nextBalance = mockAccounts[idx].points_balance + pointsDelta;
    if (nextBalance < 0) {
      throw new ApiError('El saldo resultante de puntos no puede ser negativo.', 400);
    }
    const updated: LoyaltyAccount = {
      ...mockAccounts[idx],
      points_balance: nextBalance,
      lifetime_points_earned:
        mockAccounts[idx].lifetime_points_earned + (pointsDelta > 0 ? pointsDelta : 0),
      updated_at: new Date().toISOString(),
    };
    mockAccounts[idx] = updated;
    mockMovements = [
      {
        id: `lmov-${Date.now()}`,
        negocio_id: 'surtifacil',
        account_id: accountId,
        type: pointsDelta > 0 ? 'bonus' : 'adjust',
        points_delta: pointsDelta,
        balance_after: nextBalance,
        amount_cents: 0,
        description,
        created_at: new Date().toISOString(),
      },
      ...mockMovements,
    ];
    emitDataChange('loyalty');
    return updated;
  }

  try {
    const res = await apiClient.post<LoyaltyAccount>(
      `/loyalty/accounts/${encodeURIComponent(accountId)}/adjust`,
      { points_delta: pointsDelta, description }
    );
    emitDataChange('loyalty');
    return res;
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo ajustar el saldo de puntos.');
  }
}

// ==========================================
// Gestión y Validación de Cupones WhatsApp
// ==========================================

export async function getCoupons(): Promise<DiscountCoupon[]> {
  if (isMockMode()) {
    return [...mockCoupons];
  }
  try {
    return await apiClient.get<DiscountCoupon[]>('/coupons');
  } catch (err) {
    handleLoyaltyApiError(err, 'Error al cargar cupones de descuento.');
  }
}

export async function createCoupon(input: CreateCouponInput): Promise<DiscountCoupon> {
  const code = normalizeCouponCode(input.code);
  if (!isValidCouponCode(code)) {
    throw new Error('El código debe tener 3 a 24 caracteres alfanuméricos (A-Z, 0-9, _ o -).');
  }

  if (isMockMode()) {
    if (mockCoupons.some((c) => c.code === code)) {
      throw new ApiError(`Ya existe un cupón con el código ${code}.`, 409);
    }
    const created: DiscountCoupon = {
      id: `coup-${Date.now()}`,
      negocio_id: 'surtifacil',
      code,
      description: input.description?.trim() || null,
      discount_type: input.discount_type,
      discount_value: Math.round(input.discount_value),
      min_purchase_cents: Math.max(0, Math.round(input.min_purchase_cents || 0)),
      max_discount_cents: input.max_discount_cents ? Math.round(input.max_discount_cents) : null,
      max_uses: input.max_uses ? Math.round(input.max_uses) : null,
      used_count: 0,
      expires_at: input.expires_at || null,
      active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockCoupons = [created, ...mockCoupons];
    emitDataChange('loyalty');
    return created;
  }

  try {
    const res = await apiClient.post<DiscountCoupon>('/coupons', {
      ...input,
      code,
    });
    emitDataChange('loyalty');
    return res;
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo crear el cupón.');
  }
}

export async function updateCoupon(
  couponId: string,
  updates: Partial<{
    active: boolean;
    description: string | null;
    min_purchase_cents: number;
    max_discount_cents: number | null;
    max_uses: number | null;
    expires_at: string | null;
  }>
): Promise<DiscountCoupon> {
  if (isMockMode()) {
    const idx = mockCoupons.findIndex((c) => c.id === couponId);
    if (idx < 0) throw new ApiError('Cupón no encontrado.', 404);
    const updated: DiscountCoupon = {
      ...mockCoupons[idx],
      active: updates.active !== undefined ? (updates.active ? 1 : 0) : mockCoupons[idx].active,
      description: updates.description !== undefined ? updates.description : mockCoupons[idx].description,
      min_purchase_cents:
        updates.min_purchase_cents !== undefined
          ? updates.min_purchase_cents
          : mockCoupons[idx].min_purchase_cents,
      max_discount_cents:
        updates.max_discount_cents !== undefined
          ? updates.max_discount_cents
          : mockCoupons[idx].max_discount_cents,
      max_uses: updates.max_uses !== undefined ? updates.max_uses : mockCoupons[idx].max_uses,
      expires_at: updates.expires_at !== undefined ? updates.expires_at : mockCoupons[idx].expires_at,
      updated_at: new Date().toISOString(),
    };
    mockCoupons[idx] = updated;
    emitDataChange('loyalty');
    return updated;
  }

  try {
    const res = await apiClient.put<DiscountCoupon>(
      `/coupons/${encodeURIComponent(couponId)}`,
      updates
    );
    emitDataChange('loyalty');
    return res;
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo actualizar el cupón.');
  }
}

export async function deleteCoupon(couponId: string): Promise<void> {
  if (isMockMode()) {
    mockCoupons = mockCoupons.filter((c) => c.id !== couponId);
    emitDataChange('loyalty');
    return;
  }
  try {
    await apiClient.delete(`/coupons/${encodeURIComponent(couponId)}`);
    emitDataChange('loyalty');
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo eliminar el cupón.');
  }
}

export async function validateCouponStaff(
  code: string,
  subtotalCents: number
): Promise<CouponValidationResponse> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) {
    throw new Error('Ingresa un código de cupón.');
  }

  if (isMockMode()) {
    const coupon = mockCoupons.find((c) => c.code === normalized) || null;
    const outcome = validateCouponForSubtotal(coupon, subtotalCents);
    if (!outcome.valid) {
      throw new ApiError(outcome.error, 400);
    }
    return {
      valid: true,
      coupon: coupon!,
      discount_cents: outcome.discount_cents,
      final_subtotal_cents: outcome.final_subtotal_cents,
    };
  }

  try {
    return await apiClient.post<CouponValidationResponse>('/coupons/validate', {
      code: normalized,
      subtotal_cents: subtotalCents,
    });
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo validar el cupón.');
  }
}

export async function validatePublicCoupon(
  slug: string,
  code: string,
  subtotalCents: number
): Promise<CouponValidationResponse> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) {
    throw new Error('Ingresa un código de cupón.');
  }

  if (isMockMode()) {
    const coupon = mockCoupons.find((c) => c.code === normalized) || null;
    const outcome = validateCouponForSubtotal(coupon, subtotalCents);
    if (!outcome.valid) {
      throw new ApiError(outcome.error, 400);
    }
    return {
      valid: true,
      coupon: coupon!,
      discount_cents: outcome.discount_cents,
      final_subtotal_cents: outcome.final_subtotal_cents,
    };
  }

  try {
    return await apiClient.post<CouponValidationResponse>('/public/coupons/validate', {
      slug,
      code: normalized,
      subtotal_cents: subtotalCents,
    });
  } catch (err) {
    handleLoyaltyApiError(err, 'No se pudo validar el cupón.');
  }
}

// ==========================================
// Mensajes y Compartido por WhatsApp
// ==========================================

export function generateLoyaltyBalanceWhatsAppText(
  account: LoyaltyAccount,
  config: LoyaltyConfig,
  store: { nombre?: string; slug?: string } = {}
): string {
  const storeName = store.nombre?.trim() || 'SurtiFácil Abastos';
  const redeemableValue = account.points_balance * config.point_value_cents;
  const storeLink =
    typeof window !== 'undefined' && store.slug
      ? `${window.location.origin}/#/tienda/${store.slug}`
      : store.slug
      ? `#/tienda/${store.slug}`
      : '';

  let msg = `⭐ *CLUB DE PUNTOS DEL BARRIO — ${storeName.toUpperCase()}*\n\n`;
  msg += `¡Hola *${account.customer_name}*! Gracias por mercar con nosotros en el barrio. 🛒\n\n`;
  msg += `🏆 *Tu saldo actual:* *${account.points_balance} puntos*\n`;
  msg += `💵 *Equivalente en descuento:* *${formatCentsCOP(redeemableValue)} COP*\n\n`;
  msg += `📌 *¿Cómo funciona?*\n`;
  msg += `▪ Ganas *1 punto* por cada *${formatCentsCOP(config.pesos_per_point_cents)}* de compra.\n`;
  msg += `▪ Cada punto vale *${formatCentsCOP(config.point_value_cents)}* para pagar tus próximos mercados (mínimo ${config.min_redeem_points} pts).\n`;

  if (storeLink) {
    msg += `\n🛍️ Pide fácil desde tu celular aquí: ${storeLink}\n`;
  }
  msg += `\n¡Te esperamos en el mostrador! ✨`;
  return msg;
}

export function generateCouponWhatsAppText(
  coupon: DiscountCoupon,
  store: { nombre?: string; slug?: string } = {}
): string {
  const storeName = store.nombre?.trim() || 'SurtiFácil Abastos';
  const benefitLabel =
    coupon.discount_type === 'percentage'
      ? `*${coupon.discount_value}% de descuento*`
      : `*${formatCentsCOP(coupon.discount_value)} COP de descuento*`;

  const storeLink =
    typeof window !== 'undefined' && store.slug
      ? `${window.location.origin}/#/tienda/${store.slug}`
      : store.slug
      ? `#/tienda/${store.slug}`
      : '';

  let msg = `🎟️ *CUPÓN DE REGALO — ${storeName.toUpperCase()}*\n\n`;
  msg += `¡Hola vecino(a)! Te regalamos ${benefitLabel} en tu próximo mercado con el código:\n\n`;
  msg += `👉 *${coupon.code}*\n\n`;

  if (coupon.description) {
    msg += `📝 ${coupon.description}\n`;
  }
  if (coupon.min_purchase_cents > 0) {
    msg += `🛒 Compra mínima: ${formatCentsCOP(coupon.min_purchase_cents)}\n`;
  }
  if (coupon.discount_type === 'percentage' && coupon.max_discount_cents) {
    msg += `🎯 Tope máximo de ahorro: ${formatCentsCOP(coupon.max_discount_cents)}\n`;
  }
  if (coupon.expires_at) {
    msg += `⏳ Válido hasta: ${coupon.expires_at}\n`;
  }
  if (storeLink) {
    msg += `\n🛍️ Úsalo en nuestra Tienda Vecinal: ${storeLink}\n`;
  }
  msg += `\nTambién puedes dictar el código *${coupon.code}* en caja o en el Kiosco iPad. ¡Te esperamos! 🙌`;
  return msg;
}

export function openLoyaltyBalanceWhatsApp(
  account: LoyaltyAccount,
  config: LoyaltyConfig,
  store: { nombre?: string; slug?: string } = {}
): void {
  const text = generateLoyaltyBalanceWhatsAppText(account, config, store);
  const url = buildWhatsAppClickToChatUrl(account.phone, text);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openCouponShareWhatsApp(
  coupon: DiscountCoupon,
  store: { nombre?: string; slug?: string } = {},
  targetPhone?: string
): void {
  const text = generateCouponWhatsAppText(coupon, store);
  const url = buildWhatsAppClickToChatUrl(targetPhone, text);
  window.open(url, '_blank', 'noopener,noreferrer');
}
