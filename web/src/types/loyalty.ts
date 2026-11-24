import type { CouponDiscountType, LoyaltyConfig } from '../utils/loyaltyEngine';

export type { LoyaltyConfig, CouponDiscountType };

export interface LoyaltyAccount {
  id: string;
  negocio_id: string;
  phone: string;
  customer_name: string;
  points_balance: number;
  lifetime_points_earned: number;
  lifetime_points_redeemed: number;
  total_purchases_count: number;
  total_spent_cents: number;
  active: number;
  last_activity_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type LoyaltyMovementType = 'earn' | 'redeem' | 'adjust' | 'bonus';

export interface LoyaltyMovement {
  id: string;
  negocio_id: string;
  account_id: string;
  type: LoyaltyMovementType;
  points_delta: number;
  balance_after: number;
  amount_cents: number;
  description?: string | null;
  sale_id?: string | null;
  order_id?: string | null;
  created_by_uid?: string;
  created_by_role?: string;
  created_at?: string;
}

export interface LoyaltySummary {
  total_members: number;
  active_points_balance: number;
  active_points_value_cents: number;
  lifetime_points_earned: number;
  lifetime_points_redeemed: number;
  active_coupons_count: number;
  total_coupon_redemptions: number;
  config: LoyaltyConfig;
}

export interface LoyaltyLookupResponse {
  enrolled: boolean;
  phone: string;
  account: LoyaltyAccount | null;
  redeemable_value_cents: number;
  config: LoyaltyConfig;
}

export interface PublicLoyaltyLookupResponse {
  enrolled: boolean;
  phone: string;
  display_name: string | null;
  points_balance: number;
  redeemable_value_cents: number;
  config: LoyaltyConfig;
}

export interface DiscountCoupon {
  id: string;
  negocio_id: string;
  code: string;
  description?: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_purchase_cents: number;
  max_discount_cents?: number | null;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  active: number;
  created_by_uid?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCouponInput {
  code: string;
  description?: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_purchase_cents?: number;
  max_discount_cents?: number | null;
  max_uses?: number | null;
  expires_at?: string | null;
}

export interface CouponValidationResponse {
  valid: boolean;
  error?: string;
  coupon?: DiscountCoupon;
  discount_cents: number;
  final_subtotal_cents: number;
}

export interface CreateSaleLoyaltyOptions {
  loyalty_phone?: string;
  loyalty_customer_name?: string;
  loyalty_points_redeemed?: number;
  coupon_code?: string;
}
