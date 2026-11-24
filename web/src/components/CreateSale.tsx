import { useMemo, useState } from 'react';
import { CreditCustomer, PaymentMethod, Product, SaleItem, Sale } from '../firebase/db';
import { createSale } from '../services/saleService';
import { useProducts } from '../hooks/useProducts';
import { useCreditCustomers } from '../hooks/useCreditCustomers';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useBarcode } from '../hooks/useBarcode';
import BarcodeScanner from './BarcodeScanner';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { ProductImage } from './ui/ProductImage';
import { formatCentsCOP } from '../utils/currency';
import { LiveOrdersTray } from './LiveOrdersTray';
import type { CustomerOrder } from '../types/customerOrder';
import { SarinVoicePOS } from './SarinVoicePOS';
import type { VoiceSaleCommandResult } from '../utils/sarinVoiceParser';
import ThermalReceiptModal from './ThermalReceiptModal';
import CashClosingModal from './CashClosingModal';
import PettyCashModal from './PettyCashModal';
import { CashChangeCalculator } from './CashChangeCalculator';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from '../services/notificationService';
import { getPrimaryWholesaleTier, resolveProductUnitPricing } from '../utils/wholesalePricing';
import { lookupLoyaltyByPhone, validateCouponStaff } from '../services/loyaltyService';
import type { DiscountCoupon, LoyaltyLookupResponse, CreateSaleLoyaltyOptions } from '../types/loyalty';
import {
  calculateMaxRedeemablePoints,
  DEFAULT_LOYALTY_CONFIG,
  isValidLoyaltyPhone,
  normalizeCouponCode,
  normalizeLoyaltyPhone,
  settleOrderLoyaltyAndCoupon,
} from '../utils/loyaltyEngine';

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; emoji: string }> = [
  { value: 'cash', label: 'Efectivo', emoji: '💵' },
  { value: 'card', label: 'Tarjeta', emoji: '💳' },
  { value: 'other', label: 'Otro', emoji: '📱' },
  { value: 'credit', label: 'Fiado', emoji: '📒' },
];

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildSaleCartItem(product: Product, quantity: number): SaleItem {
  const pricing = resolveProductUnitPricing(product, quantity);
  return {
    product_id: product.id,
    product_name: product.name,
    quantity,
    price_cents: pricing.unit_price_cents,
    subtotal: pricing.subtotal_cents,
    regular_price_cents: pricing.regular_unit_price_cents,
    applied_wholesale_tier: pricing.applied_tier,
    wholesale_savings_cents: pricing.wholesale_savings_cents,
  };
}

const CreateSale = () => {
  const { products, loading: productsLoading, error: productsError } = useProducts();
  const { customers: creditCustomers } = useCreditCustomers();
  const isMobile = useIsMobile();

  const [cartItems, setCartItems] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [creditCustomerId, setCreditCustomerId] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'pos' | 'orders'>('pos');
  const [lastCreatedSale, setLastCreatedSale] = useState<Sale | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [pettyCashModalOpen, setPettyCashModalOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => getNotificationPermission());
  const [receivedCashCents, setReceivedCashCents] = useState<number | null>(null);

  // Estado Club de Puntos del Barrio y Cupones
  const [loyaltyPanelOpen, setLoyaltyPanelOpen] = useState(false);
  const [loyaltyPhoneInput, setLoyaltyPhoneInput] = useState('');
  const [loyaltyLookup, setLoyaltyLookup] = useState<LoyaltyLookupResponse | null>(null);
  const [loyaltyLookupLoading, setLoyaltyLookupLoading] = useState(false);
  const [loyaltyLookupError, setLoyaltyLookupError] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<DiscountCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  const handleLoadOrderToCart = (order: CustomerOrder) => {
    const items = order.items || [];
    const newCartItems: SaleItem[] = items.map((i) => {
      const matched = products.find((p) => p.id === i.product_id);
      if (matched) {
        return buildSaleCartItem(matched, i.quantity);
      }
      return {
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        price_cents: i.unit_price_cents,
        subtotal: i.subtotal_cents || i.unit_price_cents * i.quantity,
        applied_wholesale_tier: i.applied_wholesale_tier ?? null,
        wholesale_savings_cents: i.wholesale_savings_cents ?? 0,
      };
    });
    setCartItems(newCartItems);
    if (order.payment_method === 'credit') {
      setPaymentMethod('credit');
    } else if (order.payment_method === 'transfer') {
      setPaymentMethod('other');
    } else {
      setPaymentMethod('cash');
    }
    if (order.customer_phone) {
      setLoyaltyPhoneInput(order.customer_phone);
      setLoyaltyPanelOpen(true);
    }
    if (order.coupon_code) {
      setCouponInput(order.coupon_code);
      setLoyaltyPanelOpen(true);
    }
    setActiveTab('pos');
    if (isMobile) {
      setCartOpen(true);
    }
    setSuccess(false);
    setError('');
  };

  const handleApplyVoiceCommand = (command: VoiceSaleCommandResult) => {
    setError('');
    setSuccess(false);

    // Actualizar método de pago
    setPaymentMethod(command.paymentMethod);
    if (command.paymentMethod === 'cash' && command.receivedCashCents !== null) {
      setReceivedCashCents(command.receivedCashCents);
    }

    // Si es fiado y viene un nombre de cliente, buscar coincidencia en cartera
    if (command.paymentMethod === 'credit' && command.creditCustomerName) {
      const normQuery = normalize(command.creditCustomerName);
      const foundCustomer = creditCustomers.find(
        (c) => normalize(c.name).includes(normQuery) || normQuery.includes(normalize(c.name))
      );
      if (foundCustomer) {
        setCreditCustomerId(foundCustomer.id);
      }
    }

    // Agregar o actualizar ítems interpretados
    setCartItems((prevItems) => {
      const updated = [...prevItems];
      for (const voiceItem of command.items) {
        const prod = voiceItem.product;
        const existingIdx = updated.findIndex((i) => i.product_id === prod.id);
        if (existingIdx >= 0) {
          const nextQty = updated[existingIdx].quantity + voiceItem.quantity;
          const cappedQty = Math.min(nextQty, prod.stock);
          updated[existingIdx] = buildSaleCartItem(prod, cappedQty);
        } else {
          const cappedQty = Math.min(voiceItem.quantity, prod.stock);
          updated.push(buildSaleCartItem(prod, cappedQty));
        }
      }
      return updated;
    });

    if (isMobile) {
      setCartOpen(true);
    }
  };

  const availableProducts = useMemo(() => {
    const term = normalize(search.trim());
    return products.filter((product) => {
      if (product.stock <= 0) return false;
      if (!term) return true;
      return (
        normalize(product.name).includes(term)
        || normalize(product.category || '').includes(term)
        || (product.barcode || '').includes(term)
      );
    });
  }, [products, search]);

  const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const unitCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const activeLoyaltyConfig = loyaltyLookup?.config || DEFAULT_LOYALTY_CONFIG;
  const normalizedPhone = normalizeLoyaltyPhone(loyaltyPhoneInput);
  const hasValidPhone = isValidLoyaltyPhone(normalizedPhone);
  const accountPointsBalance = loyaltyLookup?.account?.points_balance ?? 0;

  const couponEval = useMemo(() => {
    if (!appliedCoupon || subtotal <= 0) {
      return { coupon: null as DiscountCoupon | null, discountCents: 0, warning: '' };
    }
    const res = settleOrderLoyaltyAndCoupon({
      itemsSubtotalCents: subtotal,
      deliveryFeeCents: 0,
      config: activeLoyaltyConfig,
      coupon: appliedCoupon,
      couponCodeRequested: appliedCoupon.code,
      hasValidPhone: false,
      accountPointsBalance: 0,
      pointsToRedeemRequested: 0,
    });
    if (!res.ok) {
      return { coupon: null as DiscountCoupon | null, discountCents: 0, warning: res.error };
    }
    return {
      coupon: appliedCoupon,
      discountCents: res.coupon_discount_cents,
      warning: '',
    };
  }, [appliedCoupon, subtotal, activeLoyaltyConfig]);

  const afterCouponSubtotal = Math.max(0, subtotal - couponEval.discountCents);
  const redeemPolicy = useMemo(
    () => calculateMaxRedeemablePoints(accountPointsBalance, afterCouponSubtotal, activeLoyaltyConfig),
    [accountPointsBalance, afterCouponSubtotal, activeLoyaltyConfig]
  );

  const effectivePointsToRedeem = useMemo(() => {
    if (!hasValidPhone || !redeemPolicy.can_redeem || pointsToRedeem <= 0) return 0;
    const clamped = Math.min(Math.floor(pointsToRedeem), redeemPolicy.max_points);
    return clamped >= activeLoyaltyConfig.min_redeem_points ? clamped : 0;
  }, [hasValidPhone, redeemPolicy, pointsToRedeem, activeLoyaltyConfig.min_redeem_points]);

  const saleSettlement = useMemo(() => {
    const res = settleOrderLoyaltyAndCoupon({
      itemsSubtotalCents: subtotal,
      deliveryFeeCents: 0,
      config: activeLoyaltyConfig,
      coupon: couponEval.coupon,
      couponCodeRequested: couponEval.coupon?.code || null,
      hasValidPhone,
      accountPointsBalance,
      pointsToRedeemRequested: effectivePointsToRedeem,
    });
    if (res.ok) return res;
    return {
      ok: true as const,
      items_subtotal_cents: subtotal,
      coupon_code: null,
      coupon_discount_cents: 0,
      after_coupon_subtotal_cents: subtotal,
      points_redeemed: 0,
      points_discount_cents: 0,
      paid_merchandise_cents: subtotal,
      delivery_fee_cents: 0,
      final_total_cents: subtotal,
      points_earned: 0,
      config: activeLoyaltyConfig,
    };
  }, [subtotal, activeLoyaltyConfig, couponEval.coupon, hasValidPhone, accountPointsBalance, effectivePointsToRedeem]);

  const total = saleSettlement.final_total_cents;

  const handleLookupLoyalty = async () => {
    setLoyaltyLookupError('');
    try {
      setLoyaltyLookupLoading(true);
      const res = await lookupLoyaltyByPhone(loyaltyPhoneInput);
      setLoyaltyLookup(res);
      setPointsToRedeem(0);
    } catch (err: unknown) {
      setLoyaltyLookup(null);
      setPointsToRedeem(0);
      setLoyaltyLookupError(err instanceof Error ? err.message : 'No se pudo consultar el celular.');
    } finally {
      setLoyaltyLookupLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    const code = normalizeCouponCode(couponInput);
    if (!code) {
      setCouponError('Ingresa un código de cupón.');
      return;
    }
    try {
      setCouponLoading(true);
      const res = await validateCouponStaff(code, subtotal);
      if (res.valid && res.coupon) {
        setAppliedCoupon(res.coupon);
        setCouponInput(res.coupon.code);
      } else {
        setCouponError(res.error || 'Cupón no válido.');
      }
    } catch (err: unknown) {
      setCouponError(err instanceof Error ? err.message : 'Cupón no válido.');
    } finally {
      setCouponLoading(false);
    }
  };

  const addToCart = (product: Product, quantity = 1): boolean => {
    setError('');
    setSuccess(false);
    if (product.stock <= 0) {
      setError(`Sin stock disponible para ${product.name}`);
      return false;
    }
    const existing = cartItems.find((item) => item.product_id === product.id);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > product.stock) {
      setError(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}`);
      return false;
    }
    const updatedItem = buildSaleCartItem(product, nextQuantity);
    setCartItems(
      existing
        ? cartItems.map((item) =>
            item.product_id === product.id ? updatedItem : item,
          )
        : [...cartItems, updatedItem],
    );
    return true;
  };

  const changeQuantity = (productId: string, delta: number) => {
    setError('');
    const existing = cartItems.find((item) => item.product_id === productId);
    if (!existing) return;
    const nextQuantity = existing.quantity + delta;
    if (nextQuantity <= 0) {
      setCartItems(cartItems.filter((item) => item.product_id !== productId));
      return;
    }
    const product = products.find((candidate) => candidate.id === productId);
    if (product && nextQuantity > product.stock) {
      setError(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}`);
      return;
    }
    setCartItems(
      cartItems.map((item) => {
        if (item.product_id !== productId) return item;
        if (product) {
          return buildSaleCartItem(product, nextQuantity);
        }
        return { ...item, quantity: nextQuantity, subtotal: nextQuantity * item.price_cents };
      }),
    );
  };

  const removeFromCart = (productId: string) => {
    setCartItems((current) => current.filter((item) => item.product_id !== productId));
  };

  const handleBarcodeScan = (code: string) => {
    const found = products.find((product) => product.barcode === code);
    if (!found) {
      setError(`Código ${code} no registrado. Agrega el producto primero.`);
      return;
    }
    addToCart(found, 1);
  };

  const { isOpen: isScannerOpen, open: openScanner, close: closeScanner, handleScan } = useBarcode(handleBarcodeScan);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    const byBarcode = products.find((product) => product.barcode === term);
    if (byBarcode) {
      if (addToCart(byBarcode, 1)) setSearch('');
      return;
    }
    if (availableProducts.length === 1) {
      if (addToCart(availableProducts[0], 1)) setSearch('');
    }
  };

  const handleConfirmSale = async () => {
    if (cartItems.length === 0) {
      setError('El carrito está vacío');
      return;
    }
    if (paymentMethod === 'credit' && !creditCustomerId) {
      setError('Selecciona el cliente al que se le fía');
      return;
    }
    if (paymentMethod === 'cash' && receivedCashCents !== null && receivedCashCents < total) {
      setError(`Monto recibido insuficiente. Faltan ${formatPrice(total - receivedCashCents)}.`);
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const itemsSnapshot = [...cartItems];
      const methodSnapshot = paymentMethod;
      const creditCust = creditCustomers.find((c) => c.id === creditCustomerId);
      const actualReceivedCents = methodSnapshot === 'cash'
        ? (receivedCashCents !== null ? receivedCashCents : total)
        : undefined;
      const actualChangeCents = methodSnapshot === 'cash' && actualReceivedCents !== undefined
        ? Math.max(0, actualReceivedCents - total)
        : undefined;

      const hasLoyaltyOrCoupon =
        hasValidPhone || Boolean(saleSettlement.coupon_code) || saleSettlement.points_redeemed > 0;
      const loyaltyOptions: CreateSaleLoyaltyOptions | undefined = hasLoyaltyOrCoupon
        ? {
            ...(hasValidPhone ? { loyalty_phone: normalizedPhone } : {}),
            ...(hasValidPhone && (loyaltyLookup?.account?.customer_name || creditCust?.name)
              ? { loyalty_customer_name: loyaltyLookup?.account?.customer_name || creditCust?.name }
              : {}),
            ...(saleSettlement.points_redeemed > 0
              ? { loyalty_points_redeemed: saleSettlement.points_redeemed }
              : {}),
            ...(saleSettlement.coupon_code ? { coupon_code: saleSettlement.coupon_code } : {}),
          }
        : undefined;

      const saleId = loyaltyOptions
        ? await createSale(cartItems, paymentMethod, paymentMethod === 'credit' ? creditCustomerId : undefined, loyaltyOptions)
        : await createSale(cartItems, paymentMethod, paymentMethod === 'credit' ? creditCustomerId : undefined);

      const expectedBalanceAfter = hasValidPhone
        ? Math.max(0, accountPointsBalance - saleSettlement.points_redeemed + saleSettlement.points_earned)
        : null;

      const createdSaleObj: Sale = {
        id: saleId,
        date: new Date(),
        total,
        subtotal_cents: subtotal,
        coupon_code: saleSettlement.coupon_code,
        coupon_discount_cents: saleSettlement.coupon_discount_cents,
        loyalty_phone: hasValidPhone ? normalizedPhone : null,
        loyalty_points_redeemed: saleSettlement.points_redeemed,
        loyalty_discount_cents: saleSettlement.points_discount_cents,
        loyalty_points_earned: saleSettlement.points_earned,
        loyalty_balance_after: expectedBalanceAfter,
        payment_method: methodSnapshot,
        credit_customer_id: creditCust?.id,
        credit_customer_name: creditCust?.name,
        items: itemsSnapshot,
        createdAt: new Date(),
        received_cash_cents: actualReceivedCents,
        change_cents: actualChangeCents,
      };
      setLastCreatedSale(createdSaleObj);
      setSuccess(true);
      setCartItems([]);
      setPaymentMethod('cash');
      setCreditCustomerId('');
      setReceivedCashCents(null);
      setLoyaltyPhoneInput('');
      setLoyaltyLookup(null);
      setLoyaltyLookupError('');
      setPointsToRedeem(0);
      setCouponInput('');
      setAppliedCoupon(null);
      setCouponError('');
      setLoyaltyPanelOpen(false);
      setCartOpen(false);
      window.setTimeout(() => setSuccess(false), 8000);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Error al crear la venta');
    } finally {
      setSubmitting(false);
    }
  };

  const cartPanel = (
    <CartPanel
      items={cartItems}
      products={products}
      total={total}
      unitCount={unitCount}
      paymentMethod={paymentMethod}
      submitting={submitting}
      onChangeQuantity={changeQuantity}
      onRemove={removeFromCart}
      onPaymentChange={(method) => {
        setPaymentMethod(method);
        if (method !== 'cash') {
          setReceivedCashCents(null);
        }
      }}
      onConfirm={handleConfirmSale}
      compact={isMobile}
      creditCustomers={creditCustomers.filter((customer) => customer.active)}
      creditCustomerId={creditCustomerId}
      onCreditCustomerChange={setCreditCustomerId}
      receivedCashCents={receivedCashCents}
      onReceivedCashChange={setReceivedCashCents}
      subtotalCents={subtotal}
      loyaltyPanelOpen={loyaltyPanelOpen}
      onToggleLoyaltyPanel={() => setLoyaltyPanelOpen((prev) => !prev)}
      loyaltyPhoneInput={loyaltyPhoneInput}
      onLoyaltyPhoneChange={(val) => {
        setLoyaltyPhoneInput(val);
        setLoyaltyLookupError('');
        if (!val.trim()) {
          setLoyaltyLookup(null);
          setPointsToRedeem(0);
        }
      }}
      onLookupLoyalty={() => void handleLookupLoyalty()}
      loyaltyLookup={loyaltyLookup}
      loyaltyLookupLoading={loyaltyLookupLoading}
      loyaltyLookupError={loyaltyLookupError}
      pointsToRedeem={effectivePointsToRedeem}
      maxRedeemablePoints={redeemPolicy.can_redeem ? redeemPolicy.max_points : 0}
      minRedeemPoints={activeLoyaltyConfig.min_redeem_points}
      onPointsToRedeemChange={setPointsToRedeem}
      couponInput={couponInput}
      onCouponInputChange={(val) => {
        setCouponInput(val);
        setCouponError('');
      }}
      onApplyCoupon={() => void handleApplyCoupon()}
      onRemoveCoupon={() => {
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError('');
      }}
      appliedCoupon={couponEval.coupon}
      couponDiscountCents={saleSettlement.coupon_discount_cents}
      pointsDiscountCents={saleSettlement.points_discount_cents}
      pointsEarnedPreview={saleSettlement.points_earned}
      couponLoading={couponLoading}
      couponError={couponError || couponEval.warning}
    />
  );

  return (
    <section className="space-y-4 pb-24 md:pb-0">
      <PageHeader
        title="Nueva venta"
        description={isMobile ? undefined : 'Toca un producto para agregarlo al carrito o atiende pedidos en vivo.'}
        actions={
          <div className="flex items-center gap-2">
            {isNotificationSupported() && (
              <button
                type="button"
                onClick={async () => {
                  const granted = await requestNotificationPermission();
                  setNotifPermission(granted ? 'granted' : 'denied');
                }}
                title={
                  notifPermission === 'granted'
                    ? 'Notificaciones de mostrador activas'
                    : 'Activar alertas de pedidos en segundo plano'
                }
                className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition border ${
                  notifPermission === 'granted'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                }`}
                aria-label={
                  notifPermission === 'granted'
                    ? 'Alertas de mostrador activas'
                    : 'Activar alertas de mostrador'
                }
              >
                <span>{notifPermission === 'granted' ? '🔔 Alertas ON' : '🔕 Activar Alertas'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setPettyCashModalOpen(true)}
              className="btn-secondary min-h-[44px] px-3 text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-2"
            >
              <span>💸 Caja Menor</span>
            </button>
            <button
              type="button"
              onClick={() => setClosingModalOpen(true)}
              className="btn-secondary min-h-[44px] px-3 text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-2"
            >
              <span>🔒 Arqueo / Cierre COP</span>
            </button>
          </div>
        }
      />

      {/* Selector de Modo Mostrador / Bandeja de Pedidos */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('pos')}
          className={`flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
            activeTab === 'pos'
              ? 'bg-sf-primary text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Icon name="cart" size={18} />
          <span>Venta Directa en Mostrador</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
            activeTab === 'orders'
              ? 'bg-sf-primary text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Icon name="clipboard" size={18} />
          <span>Bandeja Pedidos Kiosco / Web</span>
        </button>
      </div>

      {activeTab === 'orders' ? (
        <div className="card p-4 md:p-6">
          <LiveOrdersTray
            onLoadOrderToCart={handleLoadOrderToCart}
            onSaleCreated={() => {
              setSuccess(true);
              setTimeout(() => setSuccess(false), 4000);
            }}
          />
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-900 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">✅</span>
                  <div>
                    <span className="font-bold text-sm block">Venta registrada exitosamente</span>
                    {lastCreatedSale && (
                      <div className="space-y-1">
                        <span className="text-xs text-green-800 block">
                          Comprobante #{lastCreatedSale.id.slice(0, 8)} · {formatCentsCOP(lastCreatedSale.total)}
                          {lastCreatedSale.id.startsWith('offline_') ? ' · 📡 Encolada en Modo Offline (FIFO)' : ''}
                        </span>
                        {((lastCreatedSale.loyalty_points_earned || 0) > 0 || lastCreatedSale.coupon_code) && (
                          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                            {(lastCreatedSale.loyalty_points_earned || 0) > 0 && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                                ⭐ +{lastCreatedSale.loyalty_points_earned} pts Club
                              </span>
                            )}
                            {lastCreatedSale.coupon_code && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-900">
                                🎟️ Cupón {lastCreatedSale.coupon_code}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {lastCreatedSale && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptModalOpen(true)}
                      className="btn-primary min-h-[44px] px-3 text-xs font-semibold"
                    >
                      🖨️ Tirilla Térmica
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptModalOpen(true)}
                      className="btn-success min-h-[44px] px-3 text-xs font-semibold"
                    >
                      📲 Enviar WhatsApp
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {productsError && !error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {productsError}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-3 lg:col-span-3">
              {/* Copiloto de Voz Manos Libres Sarin */}
              <SarinVoicePOS
                products={products}
                onApplyCommand={handleApplyVoiceCommand}
                onClearCart={() => setCartItems([])}
                onFinalizeSale={handleConfirmSale}
              />

              <form onSubmit={handleSearchSubmit} className="flex gap-2" role="search">
                <label htmlFor="pos-search" className="sr-only">
                  Buscar producto o código
                </label>
                <div className="relative flex-1">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    id="pos-search"
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    enterKeyHint="done"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar producto o código"
                    className="input pl-10"
                  />
                </div>
                <button type="button" onClick={openScanner} className="btn-primary shrink-0" aria-label="Escanear código de barras">
                  <Icon name="scan" />
                  <span className="hidden sm:inline">Escanear</span>
                </button>
              </form>

              {productsLoading ? (
                <p className="py-8 text-center text-gray-500">Cargando productos...</p>
              ) : availableProducts.length === 0 ? (
                <p className="card px-4 py-8 text-center text-gray-500">
                  {products.length === 0 ? 'No hay productos con stock disponible' : 'Sin resultados para tu búsqueda'}
                </p>
              ) : isMobile ? (
                <ul className="card divide-y divide-gray-100" aria-label="Productos disponibles">
                  {availableProducts.map((product) => {
                    const primaryWholesale = getPrimaryWholesaleTier(product);
                    return (
                      <li key={product.id} className="flex items-center gap-3 px-3 py-2">
                        <ProductImage
                          src={product.image_url}
                          alt={product.name}
                          productName={product.name}
                          barcode={product.barcode}
                          category={product.category}
                          showOfferBadge={false}
                          containerClassName="h-11 w-11 shrink-0 rounded-xl bg-slate-50 p-1 border border-slate-200"
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sf-text">{product.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatPrice(product.price_cents)} · {product.stock} disp.
                          </p>
                          {primaryWholesale && (
                            <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                              🏷️ {primaryWholesale.min_quantity}+ a {formatPrice(primaryWholesale.unit_price_cents)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(product, 1)}
                          aria-label={`Agregar ${product.name}`}
                          className="icon-btn bg-sf-primary text-white hover:bg-sf-dark"
                        >
                          <Icon name="plus" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3" aria-label="Productos disponibles">
                  {availableProducts.map((product) => {
                    const primaryWholesale = getPrimaryWholesaleTier(product);
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => addToCart(product, 1)}
                          aria-label={`Agregar ${product.name}`}
                          className="card flex min-h-[96px] w-full flex-col justify-between p-3 text-left transition hover:border-sf-primary hover:shadow-md active:scale-[0.99]"
                        >
                          <div className="flex items-start gap-2.5">
                            <ProductImage
                              src={product.image_url}
                              alt={product.name}
                              productName={product.name}
                              barcode={product.barcode}
                              category={product.category}
                              showOfferBadge={false}
                              containerClassName="h-11 w-11 shrink-0 rounded-lg bg-slate-50 p-1 border border-slate-200"
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="line-clamp-2 font-medium text-sf-text text-xs sm:text-sm">{product.name}</span>
                              {primaryWholesale && (
                                <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 tabular-nums">
                                  🏷️ {primaryWholesale.min_quantity}+ a {formatPrice(primaryWholesale.unit_price_cents)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="mt-2 flex items-center justify-between text-sm pt-2 border-t border-slate-100">
                            <span className="font-semibold text-sf-primary tabular-nums">{formatPrice(product.price_cents)}</span>
                            <span className="text-xs text-gray-500">{product.stock} disp.</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {!isMobile && (
              <aside className="lg:col-span-2">
                <div className="card p-4">{cartPanel}</div>
              </aside>
            )}
          </div>
        </>
      )}

      {isMobile && (
        <>
          <div className="fixed inset-x-0 z-20 border-t border-gray-200 bg-white px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] bottom-tabbar">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              disabled={cartItems.length === 0}
              className="btn-success w-full justify-between px-4"
              aria-label={`Ver carrito, ${unitCount} artículos, total ${formatPrice(total)}`}
            >
              <span className="flex items-center gap-2">
                <Icon name="cart" />
                <span>{unitCount} {unitCount === 1 ? 'artículo' : 'artículos'}</span>
              </span>
              <span className="text-base font-bold">{formatPrice(total)}</span>
            </button>
          </div>
          <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={`Carrito (${unitCount})`} size="md">
            {cartPanel}
          </Modal>
        </>
      )}

      {isScannerOpen && <BarcodeScanner onScan={handleScan} onClose={closeScanner} />}

      {receiptModalOpen && lastCreatedSale && (
        <ThermalReceiptModal
          isOpen={receiptModalOpen}
          onClose={() => setReceiptModalOpen(false)}
          sale={lastCreatedSale}
        />
      )}

      {closingModalOpen && (
        <CashClosingModal
          isOpen={closingModalOpen}
          onClose={() => setClosingModalOpen(false)}
        />
      )}

      {pettyCashModalOpen && (
        <PettyCashModal
          isOpen={pettyCashModalOpen}
          onClose={() => setPettyCashModalOpen(false)}
        />
      )}
    </section>
  );
};

interface CartPanelProps {
  creditCustomers: CreditCustomer[];
  creditCustomerId: string;
  onCreditCustomerChange: (customerId: string) => void;
  items: SaleItem[];
  products: Product[];
  total: number;
  unitCount: number;
  paymentMethod: PaymentMethod;
  submitting: boolean;
  compact: boolean;
  onChangeQuantity: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onPaymentChange: (method: PaymentMethod) => void;
  onConfirm: () => void;
  receivedCashCents: number | null;
  onReceivedCashChange: (cents: number | null) => void;
  subtotalCents: number;
  loyaltyPanelOpen: boolean;
  onToggleLoyaltyPanel: () => void;
  loyaltyPhoneInput: string;
  onLoyaltyPhoneChange: (val: string) => void;
  onLookupLoyalty: () => void;
  loyaltyLookup: LoyaltyLookupResponse | null;
  loyaltyLookupLoading: boolean;
  loyaltyLookupError: string;
  pointsToRedeem: number;
  maxRedeemablePoints: number;
  minRedeemPoints: number;
  onPointsToRedeemChange: (pts: number) => void;
  couponInput: string;
  onCouponInputChange: (val: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  appliedCoupon: DiscountCoupon | null;
  couponDiscountCents: number;
  pointsDiscountCents: number;
  pointsEarnedPreview: number;
  couponLoading: boolean;
  couponError: string;
}

function CartPanel({
  creditCustomers,
  creditCustomerId,
  onCreditCustomerChange,
  items,
  products,
  total,
  unitCount,
  paymentMethod,
  submitting,
  compact,
  onChangeQuantity,
  onRemove,
  onPaymentChange,
  onConfirm,
  receivedCashCents,
  onReceivedCashChange,
  subtotalCents,
  loyaltyPanelOpen,
  onToggleLoyaltyPanel,
  loyaltyPhoneInput,
  onLoyaltyPhoneChange,
  onLookupLoyalty,
  loyaltyLookup,
  loyaltyLookupLoading,
  loyaltyLookupError,
  pointsToRedeem,
  maxRedeemablePoints,
  minRedeemPoints,
  onPointsToRedeemChange,
  couponInput,
  onCouponInputChange,
  onApplyCoupon,
  onRemoveCoupon,
  appliedCoupon,
  couponDiscountCents,
  pointsDiscountCents,
  pointsEarnedPreview,
  couponLoading,
  couponError,
}: CartPanelProps) {
  const wholesaleSavings = items.reduce((sum, item) => sum + (item.wholesale_savings_cents || 0), 0);
  const hasPhoneDigits = isValidLoyaltyPhone(normalizeLoyaltyPhone(loyaltyPhoneInput));

  return (
    <div className="space-y-4">
      {!compact && <h3 className="font-semibold text-sf-text">Carrito</h3>}

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">El carrito está vacío</p>
      ) : (
        <ul className="divide-y divide-gray-100" aria-label="Artículos en el carrito">
          {items.map((item) => {
            const matchedProduct = products.find((p) => p.id === item.product_id);
            const livePricing = matchedProduct ? resolveProductUnitPricing(matchedProduct, item.quantity) : null;
            return (
              <li key={item.product_id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sf-text">{item.product_name}</p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {formatPrice(item.price_cents)} c/u · <span className="font-semibold text-sf-primary">{formatPrice(item.subtotal)}</span>
                  </p>
                  {item.applied_wholesale_tier ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      🏷️ Mayorista {item.applied_wholesale_tier.min_quantity}+ · Ahorras {formatPrice(item.wholesale_savings_cents || 0)}
                    </span>
                  ) : livePricing?.next_tier ? (
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      +{livePricing.units_to_next_tier} para {livePricing.next_tier.min_quantity}+ a {formatPrice(livePricing.next_tier.unit_price_cents)} c/u
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center rounded-lg border border-gray-300" role="group" aria-label={`Cantidad de ${item.product_name}`}>
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(item.product_id, -1)}
                    aria-label={`Quitar uno de ${item.product_name}`}
                    className="icon-btn h-10 w-10 text-sf-text hover:bg-gray-100"
                  >
                    <Icon name="minus" size={18} />
                  </button>
                  <span className="min-w-[2rem] text-center text-sm font-semibold" aria-live="polite">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(item.product_id, 1)}
                    aria-label={`Agregar uno de ${item.product_name}`}
                    className="icon-btn h-10 w-10 text-sf-text hover:bg-gray-100"
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.product_id)}
                  aria-label={`Eliminar ${item.product_name} del carrito`}
                  className="icon-btn h-10 w-10 text-red-600 hover:bg-red-50"
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bloque Colapsable Club de Puntos / Cupón */}
      {items.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40">
          <button
            type="button"
            aria-expanded={loyaltyPanelOpen}
            onClick={onToggleLoyaltyPanel}
            className="flex min-h-[44px] w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-amber-950"
          >
            <span className="flex items-center gap-1.5">
              <span>⭐ Club de Puntos / Cupón</span>
              {appliedCoupon && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-900">
                  {appliedCoupon.code}
                </span>
              )}
              {pointsToRedeem > 0 && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">
                  -{pointsToRedeem} pts
                </span>
              )}
            </span>
            <Icon name={loyaltyPanelOpen ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>

          {loyaltyPanelOpen && (
            <div className="space-y-3 border-t border-amber-200/80 bg-white p-3 rounded-b-xl">
              {/* Consulta de Puntos por Celular */}
              <div className="space-y-1.5">
                <label htmlFor="pos-loyalty-phone" className="block text-[11px] font-bold text-slate-700">
                  Celular del Vecino (Acumular / Canjear Puntos)
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="pos-loyalty-phone"
                    type="tel"
                    value={loyaltyPhoneInput}
                    onChange={(e) => onLoyaltyPhoneChange(e.target.value)}
                    placeholder="Ej: 300 456 7890"
                    className="input min-h-[44px] flex-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={onLookupLoyalty}
                    disabled={loyaltyLookupLoading || !loyaltyPhoneInput.trim()}
                    className="btn-primary min-h-[44px] px-3 text-xs font-bold shrink-0"
                  >
                    {loyaltyLookupLoading ? '...' : 'Consultar'}
                  </button>
                </div>
                {loyaltyLookupError && (
                  <p className="text-[11px] font-semibold text-red-600">{loyaltyLookupError}</p>
                )}

                {loyaltyLookup && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs space-y-2">
                    {loyaltyLookup.enrolled && loyaltyLookup.account ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800 truncate">
                            {loyaltyLookup.account.customer_name}
                          </span>
                          <span className="font-black text-amber-900 tabular-nums shrink-0">
                            ⭐ {loyaltyLookup.account.points_balance} pts (
                            {formatCentsCOP(loyaltyLookup.redeemable_value_cents)})
                          </span>
                        </div>
                        {maxRedeemablePoints >= minRedeemPoints ? (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onPointsToRedeemChange(0)}
                                className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-bold border ${
                                  pointsToRedeem === 0
                                    ? 'bg-sf-primary text-white border-sf-primary'
                                    : 'bg-white text-slate-700 border-slate-200'
                                }`}
                              >
                                Sin canje
                              </button>
                              <button
                                type="button"
                                onClick={() => onPointsToRedeemChange(maxRedeemablePoints)}
                                className={`min-h-[36px] rounded-lg px-2.5 text-[11px] font-bold border ${
                                  pointsToRedeem === maxRedeemablePoints
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-emerald-800 border-emerald-300'
                                }`}
                              >
                                Canjear máx. ({maxRedeemablePoints} pts)
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <label htmlFor="pos-redeem-points" className="text-[11px] text-slate-600 shrink-0">
                                Puntos a canjear:
                              </label>
                              <input
                                id="pos-redeem-points"
                                type="number"
                                min={0}
                                max={maxRedeemablePoints}
                                value={pointsToRedeem}
                                onChange={(e) =>
                                  onPointsToRedeemChange(
                                    Math.max(0, Math.min(maxRedeemablePoints, Math.round(Number(e.target.value) || 0)))
                                  )
                                }
                                className="input min-h-[36px] w-24 text-xs py-1"
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-600">
                            Necesita al menos {minRedeemPoints} pts disponibles para canjear.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-700">
                        ✨ Celular nuevo: quedará inscrito automáticamente al confirmar esta compra.
                      </p>
                    )}
                  </div>
                )}

                {hasPhoneDigits && pointsEarnedPreview > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    ⭐ Ganará +{pointsEarnedPreview} pts con esta compra
                  </p>
                )}
              </div>

              {/* Aplicación de Cupón */}
              <div className="space-y-1.5 border-t border-slate-100 pt-2">
                <label htmlFor="pos-coupon-code" className="block text-[11px] font-bold text-slate-700">
                  Código de Cupón WhatsApp
                </label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs">
                    <span className="font-bold text-blue-900">
                      🎟️ {appliedCoupon.code} (-{formatCentsCOP(couponDiscountCents)})
                    </span>
                    <button
                      type="button"
                      onClick={onRemoveCoupon}
                      className="text-xs font-bold text-red-600 hover:underline px-2 py-1"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <input
                      id="pos-coupon-code"
                      type="text"
                      value={couponInput}
                      onChange={(e) => onCouponInputChange(e.target.value.toUpperCase())}
                      placeholder="Ej: VECINO10"
                      className="input min-h-[44px] flex-1 font-mono text-sm uppercase"
                    />
                    <button
                      type="button"
                      onClick={onApplyCoupon}
                      disabled={couponLoading || !couponInput.trim() || subtotalCents <= 0}
                      className="btn-secondary min-h-[44px] px-3 text-xs font-bold shrink-0"
                    >
                      {couponLoading ? '...' : 'Aplicar'}
                    </button>
                  </div>
                )}
                {couponError && <p className="text-[11px] font-semibold text-red-600">{couponError}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1 border-t border-gray-200 pt-3 text-sm text-sf-text">
        <div className="flex justify-between">
          <span>Artículos</span>
          <span className="font-medium">{unitCount}</span>
        </div>
        {wholesaleSavings > 0 && (
          <div className="flex justify-between text-xs font-semibold text-emerald-700">
            <span>Ahorro mayorista</span>
            <span className="tabular-nums">-{formatPrice(wholesaleSavings)}</span>
          </div>
        )}
        {couponDiscountCents > 0 && appliedCoupon && (
          <div className="flex justify-between text-xs font-semibold text-blue-700">
            <span>Cupón {appliedCoupon.code}</span>
            <span className="tabular-nums">-{formatCentsCOP(couponDiscountCents)}</span>
          </div>
        )}
        {pointsDiscountCents > 0 && (
          <div className="flex justify-between text-xs font-semibold text-amber-800">
            <span>Canje {pointsToRedeem} pts</span>
            <span className="tabular-nums">-{formatCentsCOP(pointsDiscountCents)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-sf-primary tabular-nums">{formatPrice(total)}</span>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-sf-text">Método de pago</legend>
        <div className="grid grid-cols-4 gap-2" role="radiogroup">
          {PAYMENT_OPTIONS.map((option) => {
            const selected = option.value === paymentMethod;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPaymentChange(option.value)}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-2 text-xs font-medium transition ${
                  selected ? 'border-sf-primary bg-sf-primary/10 text-sf-primary' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {paymentMethod === 'credit' && (
        <div>
          <label htmlFor="credit-customer" className="mb-1 block text-sm font-medium text-sf-text">Cliente al que se le fía</label>
          <select
            id="credit-customer"
            value={creditCustomerId}
            onChange={(event) => onCreditCustomerChange(event.target.value)}
            className="input"
          >
            <option value="">-- Selecciona un cliente --</option>
            {creditCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}{customer.balance_cents > 0 ? ` (debe ${formatPrice(customer.balance_cents)})` : ''}
              </option>
            ))}
          </select>
          {creditCustomers.length === 0 && (
            <p className="mt-1 text-xs text-gray-500">No hay clientes de fiado activos. Créalos en la sección Fiados.</p>
          )}
        </div>
      )}

      {/* Teclado táctil de billetes COP y calculadora visual de vueltas */}
      {paymentMethod === 'cash' && items.length > 0 && (
        <CashChangeCalculator
          totalCents={total}
          receivedCashCents={receivedCashCents}
          onReceivedCashChange={onReceivedCashChange}
          formatPrice={formatPrice}
        />
      )}

      {paymentMethod === 'cash' && receivedCashCents !== null && receivedCashCents < total ? (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="btn-success w-full py-3 text-base opacity-75 cursor-not-allowed bg-rose-600 hover:bg-rose-600 border-rose-600"
        >
          Dinero insuficiente · Faltan {formatPrice(total - receivedCashCents)}
        </button>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting || items.length === 0 || (paymentMethod === 'credit' && !creditCustomerId)}
          className="btn-success w-full py-3 text-base"
        >
          {submitting ? 'Procesando...' : `Confirmar venta · ${formatPrice(total)}`}
        </button>
      )}
    </div>
  );
}

export default CreateSale;
