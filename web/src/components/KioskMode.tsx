import { useEffect, useMemo, useState } from 'react';
import { getPublicStore, createCustomerOrder } from '../services/customerOrderService';
import type { PublicStoreData, CustomerOrderItem } from '../types/customerOrder';
import { formatCentsCOP, formatCOP } from '../utils/currency';
import { Icon } from './ui/Icon';
import { ProductImage } from './ui/ProductImage';
import { BulkWeightCalculatorModal, type BulkCalculableProduct } from './ui/BulkWeightCalculatorModal';
import {
  formatQuantityNumber,
  formatQuantityWithUnit,
  getBulkStep,
  getUnitShortLabel,
  roundQuantity,
} from '../utils/bulkWeight';
import {
  getPrimaryWholesaleTier,
  resolveProductUnitPricing,
  type WholesaleTier,
} from '../utils/wholesalePricing';
import { lookupPublicLoyaltyByPhone, validatePublicCoupon } from '../services/loyaltyService';
import type { DiscountCoupon, PublicLoyaltyLookupResponse } from '../types/loyalty';
import {
  calculateMaxRedeemablePoints,
  DEFAULT_LOYALTY_CONFIG,
  isValidLoyaltyPhone,
  normalizeCouponCode,
  normalizeLoyaltyPhone,
  settleOrderLoyaltyAndCoupon,
} from '../utils/loyaltyEngine';

const AISLES = [
  { id: 'todos', label: 'Todos', emoji: '🌟' },
  { id: 'combos', label: 'Combos del Barrio', emoji: '📦' },
  { id: 'Fruver', label: 'Frutas y Verduras', emoji: '🥑' },
  { id: 'Panadería', label: 'Panadería y Arepas', emoji: '🥖' },
  { id: 'Lácteos', label: 'Lácteos y Huevos', emoji: '🥚' },
  { id: 'Granos', label: 'Granos y Despensa', emoji: '🍚' },
  { id: 'Carnes', label: 'Carnes y Salsas', emoji: '🥩' },
  { id: 'Snacks', label: 'Snacks y Dulces', emoji: '🍟' },
  { id: 'Bebidas', label: 'Bebidas y Jugos', emoji: '🥤' },
  { id: 'Aseo', label: 'Aseo del Hogar', emoji: '🧼' },
  { id: 'Cuidado Personal', label: 'Cuidado Personal', emoji: '🧻' },
];

interface CartItem extends CustomerOrderItem {
  stock: number;
  allow_fractional?: boolean;
}

interface KioskModeProps {
  slug?: string;
  onExit?: () => void;
}

export default function KioskMode({ slug = 'surtifacil', onExit }: KioskModeProps) {
  const [storeData, setStoreData] = useState<PublicStoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAisle, setSelectedAisle] = useState('todos');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [bulkProduct, setBulkProduct] = useState<BulkCalculableProduct | null>(null);
  const [bulkInitialQty, setBulkInitialQty] = useState<number | undefined>(undefined);

  // Modal de checkout
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup_counter' | 'delivery'>('pickup_counter');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'credit'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Club de Puntos y Cupones en Kiosco
  const [loyaltyLookup, setLoyaltyLookup] = useState<PublicLoyaltyLookupResponse | null>(null);
  const [loyaltyLookupLoading, setLoyaltyLookupLoading] = useState(false);
  const [loyaltyLookupError, setLoyaltyLookupError] = useState<string | null>(null);
  const [redeemMaxPoints, setRedeemMaxPoints] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<DiscountCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Pantalla de Turno Gigante
  const [turnResult, setTurnResult] = useState<{
    orderCode: string;
    customerName: string;
    totalCents: number;
    paymentMethod: string;
    couponCode?: string | null;
    couponDiscountCents?: number;
    pointsRedeemed?: number;
    pointsDiscountCents?: number;
    pointsEarned?: number;
  } | null>(null);
  const [countdown, setCountdown] = useState(15);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Carga de catálogo de la tienda
  const loadCatalog = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPublicStore(slug);
      setStoreData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo del kiosco.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, [slug]);

  // Fullscreen tracking
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen no disponible o bloqueado:', err);
    }
  };

  // Cuenta regresiva de turno
  useEffect(() => {
    if (!turnResult) return;
    setCountdown(15);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleResetKiosk();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [turnResult]);

  const handleResetKiosk = () => {
    setTurnResult(null);
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setDeliveryNeighborhood('');
    setPaymentMethod('cash');
    setDeliveryType('pickup_counter');
    setCheckoutStep(null);
    setCheckoutError(null);
    setLoyaltyLookup(null);
    setLoyaltyLookupError(null);
    setRedeemMaxPoints(false);
    setCouponInput('');
    setAppliedCoupon(null);
    setCouponError(null);
    setSelectedAisle('todos');
    setSearch('');
  };

  // Filtrado de productos y combos
  const filteredProducts = useMemo(() => {
    if (!storeData) return [];
    const term = search.trim().toLowerCase();

    return storeData.products.filter((prod) => {
      if (prod.visible_kiosco === 0 || prod.stock <= 0) return false;
      if (selectedAisle === 'combos') return false;
      if (selectedAisle !== 'todos') {
        const prodCat = (prod.category || '').toLowerCase();
        const aisleLabel = selectedAisle.toLowerCase();
        if (!prodCat.includes(aisleLabel)) return false;
      }
      if (term) {
        const nameMatch = prod.name.toLowerCase().includes(term);
        const catMatch = (prod.category || '').toLowerCase().includes(term);
        const barMatch = (prod.barcode || '').toLowerCase().includes(term);
        if (!nameMatch && !catMatch && !barMatch) return false;
      }
      return true;
    });
  }, [storeData, selectedAisle, search]);

  const filteredCombos = useMemo(() => {
    if (!storeData) return [];
    if (selectedAisle !== 'todos' && selectedAisle !== 'combos') return [];
    const term = search.trim().toLowerCase();

    return storeData.combos.filter((combo) => {
      if (combo.visible_kiosco === 0) return false;
      if (term) {
        const nameMatch = combo.name.toLowerCase().includes(term);
        const descMatch = (combo.description || '').toLowerCase().includes(term);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    });
  }, [storeData, selectedAisle, search]);

  // Manejo de carrito
  const resolveCartLinePricing = (
    product: {
      id: string;
      price_cents: number;
      en_oferta?: number | boolean;
      precio_oferta_cents?: number | null;
      wholesale_tiers?: WholesaleTier[];
      wholesale_tiers_json?: string | null;
    },
    quantity: number
  ) => {
    const storeProduct = storeData?.products.find((p) => p.id === product.id);
    return resolveProductUnitPricing(storeProduct ?? product, quantity);
  };

  const addToCart = (product: {
    id: string;
    name: string;
    price_cents: number;
    stock: number;
    unit?: string;
    image_url?: string;
    en_oferta?: number | boolean;
    precio_oferta_cents?: number | null;
    wholesale_tiers?: WholesaleTier[];
    wholesale_tiers_json?: string | null;
    allow_fractional?: boolean | number;
  }) => {
    const existingIndex = cart.findIndex((i) => i.product_id === product.id);
    if (existingIndex >= 0) {
      const existing = cart[existingIndex];
      if (existing.quantity >= product.stock) return;
      const nextQty = roundQuantity(existing.quantity + 1, Boolean(product.allow_fractional));
      const pricing = resolveCartLinePricing(product, nextQty);
      const updated = [...cart];
      updated[existingIndex] = {
        ...existing,
        quantity: nextQty,
        unit_price_cents: pricing.unit_price_cents,
        subtotal_cents: pricing.subtotal_cents,
        regular_unit_price_cents: pricing.regular_unit_price_cents,
        applied_wholesale_tier: pricing.applied_tier,
        wholesale_savings_cents: pricing.wholesale_savings_cents,
      };
      setCart(updated);
    } else {
      const pricing = resolveCartLinePricing(product, 1);
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price_cents: pricing.unit_price_cents,
          subtotal_cents: pricing.subtotal_cents,
          regular_unit_price_cents: pricing.regular_unit_price_cents,
          applied_wholesale_tier: pricing.applied_tier,
          wholesale_savings_cents: pricing.wholesale_savings_cents,
          stock: product.stock,
          unit: product.unit || 'unidad',
          allow_fractional: Boolean(product.allow_fractional),
          image_url: product.image_url,
        },
      ]);
    }
  };

  const setCartProductQuantity = (product: BulkCalculableProduct, nextQty: number) => {
    const cleanQty = roundQuantity(nextQty, Boolean(product.allow_fractional));
    if (cleanQty <= 0) {
      setCart(cart.filter((i) => i.product_id !== product.id));
      return;
    }
    const cappedQty = Math.min(cleanQty, product.stock);
    const pricing = resolveCartLinePricing(product, cappedQty);
    const existingIndex = cart.findIndex((i) => i.product_id === product.id);
    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: cappedQty,
        unit_price_cents: pricing.unit_price_cents,
        subtotal_cents: pricing.subtotal_cents,
        regular_unit_price_cents: pricing.regular_unit_price_cents,
        applied_wholesale_tier: pricing.applied_tier,
        wholesale_savings_cents: pricing.wholesale_savings_cents,
        allow_fractional: Boolean(product.allow_fractional),
      };
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: cappedQty,
          unit_price_cents: pricing.unit_price_cents,
          subtotal_cents: pricing.subtotal_cents,
          regular_unit_price_cents: pricing.regular_unit_price_cents,
          applied_wholesale_tier: pricing.applied_tier,
          wholesale_savings_cents: pricing.wholesale_savings_cents,
          stock: product.stock,
          unit: product.unit || 'unidad',
          allow_fractional: Boolean(product.allow_fractional),
          image_url: product.image_url,
        },
      ]);
    }
  };

  const updateCartQty = (productId: string, delta: number) => {
    const existingIndex = cart.findIndex((i) => i.product_id === productId);
    if (existingIndex < 0) return;
    const existing = cart[existingIndex];
    const storeProduct = storeData?.products.find((p) => p.id === productId);
    const isFrac = Boolean(existing.allow_fractional || storeProduct?.allow_fractional);
    const stepDelta = isFrac ? delta * getBulkStep(existing.unit) : delta;
    const nextQty = roundQuantity(existing.quantity + stepDelta, isFrac);

    if (nextQty <= 0) {
      setCart(cart.filter((i) => i.product_id !== productId));
    } else if (nextQty <= existing.stock) {
      const pricing = storeProduct ? resolveProductUnitPricing(storeProduct, nextQty) : null;
      const nextUnitPrice = pricing ? pricing.unit_price_cents : existing.unit_price_cents;
      const nextSubtotal = pricing ? pricing.subtotal_cents : nextQty * existing.unit_price_cents;
      const updated = [...cart];
      updated[existingIndex] = {
        ...existing,
        quantity: nextQty,
        unit_price_cents: nextUnitPrice,
        subtotal_cents: nextSubtotal,
        regular_unit_price_cents: pricing?.regular_unit_price_cents ?? existing.regular_unit_price_cents,
        applied_wholesale_tier: pricing ? pricing.applied_tier : existing.applied_wholesale_tier,
        wholesale_savings_cents: pricing ? pricing.wholesale_savings_cents : existing.wholesale_savings_cents,
      };
      setCart(updated);
    }
  };

  const removeCartItem = (productId: string) => {
    setCart(cart.filter((i) => i.product_id !== productId));
  };

  const cartWholesaleSavingsCents = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.wholesale_savings_cents || 0), 0);
  }, [cart]);

  const itemsSubtotalCents = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.subtotal_cents, 0);
  }, [cart]);

  const deliveryCostCents = useMemo(() => {
    return deliveryType === 'delivery' ? (storeData?.costo_domicilio_cents || 0) : 0;
  }, [deliveryType, storeData]);

  const loyaltyConfig = storeData?.loyalty_config || loyaltyLookup?.config || DEFAULT_LOYALTY_CONFIG;
  const normalizedKioskPhone = normalizeLoyaltyPhone(customerPhone);
  const hasValidKioskPhone = isValidLoyaltyPhone(normalizedKioskPhone);

  const couponEval = useMemo(() => {
    if (!appliedCoupon || itemsSubtotalCents <= 0) {
      return { coupon: null as DiscountCoupon | null, discountCents: 0, warning: null as string | null };
    }
    const res = settleOrderLoyaltyAndCoupon({
      itemsSubtotalCents,
      deliveryFeeCents: 0,
      config: loyaltyConfig,
      coupon: appliedCoupon,
      couponCodeRequested: appliedCoupon.code,
      hasValidPhone: false,
      accountPointsBalance: 0,
      pointsToRedeemRequested: 0,
    });
    if (!res.ok) {
      return { coupon: null as DiscountCoupon | null, discountCents: 0, warning: res.error };
    }
    return { coupon: appliedCoupon, discountCents: res.coupon_discount_cents, warning: null };
  }, [appliedCoupon, itemsSubtotalCents, loyaltyConfig]);

  const afterCouponSubtotalCents = Math.max(0, itemsSubtotalCents - couponEval.discountCents);
  const redeemPolicy = useMemo(
    () =>
      calculateMaxRedeemablePoints(
        loyaltyLookup?.points_balance ?? 0,
        afterCouponSubtotalCents,
        loyaltyConfig
      ),
    [loyaltyLookup?.points_balance, afterCouponSubtotalCents, loyaltyConfig]
  );

  const pointsToRedeem =
    hasValidKioskPhone && redeemMaxPoints && redeemPolicy.can_redeem ? redeemPolicy.max_points : 0;

  const orderSettlement = useMemo(() => {
    const res = settleOrderLoyaltyAndCoupon({
      itemsSubtotalCents,
      deliveryFeeCents: deliveryCostCents,
      config: loyaltyConfig,
      coupon: couponEval.coupon,
      couponCodeRequested: couponEval.coupon?.code || null,
      hasValidPhone: hasValidKioskPhone,
      accountPointsBalance: loyaltyLookup?.points_balance ?? 0,
      pointsToRedeemRequested: pointsToRedeem,
    });
    if (res.ok) return res;
    return {
      ok: true as const,
      items_subtotal_cents: itemsSubtotalCents,
      coupon_code: null,
      coupon_discount_cents: 0,
      after_coupon_subtotal_cents: itemsSubtotalCents,
      points_redeemed: 0,
      points_discount_cents: 0,
      paid_merchandise_cents: itemsSubtotalCents,
      delivery_fee_cents: deliveryCostCents,
      final_total_cents: itemsSubtotalCents + deliveryCostCents,
      points_earned: 0,
      config: loyaltyConfig,
    };
  }, [
    itemsSubtotalCents,
    deliveryCostCents,
    loyaltyConfig,
    couponEval.coupon,
    hasValidKioskPhone,
    loyaltyLookup?.points_balance,
    pointsToRedeem,
  ]);

  const cartTotalCents = orderSettlement.final_total_cents;

  const cartUnitsCount = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (item.allow_fractional || !Number.isInteger(item.quantity)) {
        return sum + 1;
      }
      return sum + item.quantity;
    }, 0);
  }, [cart]);

  const handleLookupKioskPoints = async () => {
    setLoyaltyLookupError(null);
    try {
      setLoyaltyLookupLoading(true);
      const res = await lookupPublicLoyaltyByPhone(storeData?.slug || slug, customerPhone);
      setLoyaltyLookup(res);
      setRedeemMaxPoints(false);
      if (res.enrolled && res.display_name && !customerName.trim()) {
        setCustomerName(res.display_name);
      }
    } catch (err: unknown) {
      setLoyaltyLookup(null);
      setRedeemMaxPoints(false);
      setLoyaltyLookupError(err instanceof Error ? err.message : 'No se pudo consultar tus puntos.');
    } finally {
      setLoyaltyLookupLoading(false);
    }
  };

  const handleApplyKioskCoupon = async () => {
    setCouponError(null);
    const code = normalizeCouponCode(couponInput);
    if (!code) {
      setCouponError('Escribe el código de tu cupón.');
      return;
    }
    try {
      setCouponLoading(true);
      const res = await validatePublicCoupon(storeData?.slug || slug, code, itemsSubtotalCents);
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

  // Envío del pedido y generación de turno
  const handleConfirmOrder = async () => {
    setCheckoutError(null);
    if (!customerName.trim()) {
      setCheckoutError('Por favor escribe tu nombre para llamarte por el turno.');
      return;
    }
    if (cart.length === 0) return;

    try {
      setSubmitting(true);
      const res = await createCustomerOrder({
        slug: storeData?.slug || slug,
        negocio_id: storeData?.id,
        customer_name: customerName.trim(),
        customer_phone: hasValidKioskPhone ? normalizedKioskPhone : customerPhone.trim() || undefined,
        delivery_type: deliveryType,
        delivery_address: deliveryAddress.trim() || undefined,
        delivery_neighborhood: deliveryNeighborhood.trim() || undefined,
        payment_method: paymentMethod,
        coupon_code: orderSettlement.coupon_code || undefined,
        loyalty_points_redeemed: orderSettlement.points_redeemed > 0 ? orderSettlement.points_redeemed : undefined,
        items: cart.map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price_cents: i.unit_price_cents,
          unit: i.unit,
          image_url: i.image_url,
        })),
        source: 'kiosk',
      });

      setCheckoutStep(null);
      setCartDrawerOpen(false);
      setTurnResult({
        orderCode: res.order.order_code,
        customerName: customerName.trim(),
        totalCents: res.order.total_cents,
        paymentMethod,
        couponCode: res.order.coupon_code ?? orderSettlement.coupon_code,
        couponDiscountCents: res.order.coupon_discount_cents ?? orderSettlement.coupon_discount_cents,
        pointsRedeemed: res.order.loyalty_points_redeemed ?? orderSettlement.points_redeemed,
        pointsDiscountCents: res.order.loyalty_discount_cents ?? orderSettlement.points_discount_cents,
        pointsEarned: res.order.loyalty_points_earned ?? orderSettlement.points_earned,
      });
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : 'Error al registrar el pedido en el Kiosco.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Pantalla de Turno Gigante emitida
  if (turnResult) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-sf-dark p-6 text-white font-poppins">
        <div className="relative mx-auto w-full max-w-xl rounded-3xl bg-slate-900/90 border border-slate-700/80 p-8 md:p-12 text-center shadow-2xl backdrop-blur-md">
          {/* Badge superior */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-1.5 text-emerald-400 font-semibold text-sm">
            <Icon name="check" size={18} />
            <span>¡Pedido Registrado con Éxito!</span>
          </div>

          <h2 className="text-xl md:text-2xl font-medium text-slate-300">Tu número de atención es:</h2>

          {/* Turno Gigante Hero */}
          <div
            className="my-6 rounded-2xl bg-sf-primary/20 border-2 border-sf-primary py-6 px-4 shadow-inner"
            aria-live="polite"
          >
            <span className="text-6xl md:text-7xl font-black tracking-wider text-sf-cyan">
              {turnResult.orderCode}
            </span>
          </div>

          <p className="text-xl md:text-2xl font-semibold text-white mb-2">
            ¡Listo {turnResult.customerName}!
          </p>
          <p className="text-slate-300 text-base md:text-lg mb-6 leading-relaxed">
            Tu pedido ya está en la pantalla del mostrador. Por favor acércate a la caja cuando escuches tu turno.
          </p>

          <div className="mb-8 rounded-xl bg-slate-800/80 p-4 text-left border border-slate-700">
            <div className="flex justify-between items-center text-slate-300 text-sm mb-1">
              <span>Forma de Pago en Caja:</span>
              <span className="font-semibold text-white capitalize">
                {turnResult.paymentMethod === 'cash'
                  ? '💵 Efectivo en Mostrador'
                  : turnResult.paymentMethod === 'transfer'
                  ? '📱 Transferencia Bancaria'
                  : '📒 Anotar a mi Fiado'}
              </span>
            </div>
            <div className="flex justify-between items-center text-base font-bold text-white pt-2 border-t border-slate-700">
              <span>Total a Pagar:</span>
              <span className="text-xl text-emerald-400 font-black tabular-nums">
                {formatCentsCOP(turnResult.totalCents)}
              </span>
            </div>
            {((turnResult.couponDiscountCents || 0) > 0 ||
              (turnResult.pointsDiscountCents || 0) > 0 ||
              (turnResult.pointsEarned || 0) > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-700 text-xs font-bold">
                {(turnResult.couponDiscountCents || 0) > 0 && turnResult.couponCode && (
                  <span className="rounded-lg bg-blue-500/20 px-2.5 py-1 text-blue-300">
                    🎟️ Cupón {turnResult.couponCode}: -{formatCentsCOP(turnResult.couponDiscountCents || 0)}
                  </span>
                )}
                {(turnResult.pointsDiscountCents || 0) > 0 && (
                  <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-amber-300">
                    ⭐ Canje {turnResult.pointsRedeemed} pts: -{formatCentsCOP(turnResult.pointsDiscountCents || 0)}
                  </span>
                )}
                {(turnResult.pointsEarned || 0) > 0 && (
                  <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-emerald-300">
                    ✨ Acumulas +{turnResult.pointsEarned} pts en tu Club
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Cuenta regresiva de reinicio automático */}
          <div className="space-y-3">
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-sf-cyan h-full transition-all duration-1000 ease-linear"
                style={{ width: `${(countdown / 15) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Esta pantalla se reiniciará en <span className="font-bold text-sf-cyan">{countdown} segundos</span> para el siguiente vecino.
            </p>

            <button
              type="button"
              onClick={handleResetKiosk}
              className="mt-4 w-full min-h-[56px] rounded-2xl bg-sf-primary hover:bg-blue-600 active:scale-98 text-white font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Icon name="refresh" size={22} />
              <span>Hacer Otro Pedido Ahora</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 2. Pantalla Principal del Kiosco
  return (
    <div className="flex h-screen w-full flex-col bg-sf-light text-sf-text font-poppins overflow-hidden">
      {/* Cabecera Ergonómica de Kiosco (Alto Contraste) */}
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-700 bg-sf-dark px-4 md:px-8 text-white select-none">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sf-primary text-white shadow-md">
            <Icon name="store" size={26} />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              {storeData?.nombre || 'SurtiFácil Kiosco iPad'}
            </h1>
            <p className="text-xs text-slate-300 flex items-center gap-2">
              <span>📍 {storeData?.barrio || 'Medellín'}</span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-semibold">Mostrador de Autoatención</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Botón de Pantalla Completa */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Activar pantalla completa'}
            className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition active:scale-95 border border-slate-700"
          >
            <Icon name={isFullscreen ? 'minimize' : 'maximize'} size={24} />
          </button>

          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="flex min-h-[56px] items-center gap-2 rounded-2xl bg-slate-800 px-4 text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition border border-slate-700"
            >
              <Icon name="logout" size={20} />
              <span className="hidden sm:inline">Cerrar Kiosco</span>
            </button>
          )}

          {/* Botón Flotante/Header de Carrito */}
          <button
            type="button"
            onClick={() => setCartDrawerOpen(true)}
            aria-label={`Ver canasta con ${cartUnitsCount} productos`}
            className="flex min-h-[56px] items-center gap-3 rounded-2xl bg-emerald-600 px-5 text-white shadow-lg hover:bg-emerald-500 active:scale-95 transition"
          >
            <div className="relative">
              <Icon name="cart" size={24} />
              {cartUnitsCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-[11px] font-black text-slate-900">
                  {cartUnitsCount}
                </span>
              )}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-100">Mi Canasta</p>
              <p className="text-sm font-black tabular-nums">{formatCentsCOP(cartTotalCents)}</p>
            </div>
          </button>
        </div>
      </header>

      {/* Cuerpo Dividido: Catálogo + Riel de Pasillos + Carrito Docked en Pantalla Ancha */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Columna Izquierda / Central: Buscador, Pasillos y Catálogo */}
        <main className="flex flex-1 flex-col min-w-0 overflow-y-auto p-4 md:p-6 lg:p-8">
          {/* Barra de Búsqueda Gigante */}
          <div className="mb-4">
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={24}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Busca por nombre (ej: Arroz, Leche, Arepas, Huevos...)"
                className="w-full min-h-[56px] rounded-2xl border-2 border-slate-200 bg-white pl-12 pr-12 text-lg font-medium text-slate-800 placeholder-slate-400 focus:border-sf-primary focus:outline-none focus:ring-4 focus:ring-sf-primary/10 shadow-sm transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600"
                >
                  <Icon name="close" size={20} />
                </button>
              )}
            </div>
          </div>

          {/* Riel Horizontal Táctil de Pasillos (Patrón Rappi Aisles) */}
          <div className="mb-6 overflow-x-auto pb-2 scrollbar-none">
            <div className="flex gap-2.5 min-w-max">
              {AISLES.map((aisle) => {
                const isActive = selectedAisle === aisle.id;
                return (
                  <button
                    key={aisle.id}
                    type="button"
                    onClick={() => setSelectedAisle(aisle.id)}
                    className={`flex min-h-[56px] items-center gap-2.5 rounded-2xl px-5 text-base font-semibold transition active:scale-95 ${
                      isActive
                        ? 'bg-sf-primary text-white shadow-md'
                        : 'bg-white text-slate-700 border border-slate-200/90 hover:border-sf-primary/50 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl">{aisle.emoji}</span>
                    <span>{aisle.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Estados de Carga y Error */}
          {loading && (
            <div className="flex flex-1 items-center justify-center p-12 text-slate-500">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-sf-primary border-t-transparent" />
                <p className="text-lg font-medium">Cargando catálogo del mostrador...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
              <p className="text-lg font-bold mb-2">No se pudo cargar el catálogo</p>
              <p className="text-sm mb-4">{error}</p>
              <button
                type="button"
                onClick={loadCatalog}
                className="min-h-[48px] rounded-xl bg-red-600 px-6 font-semibold text-white hover:bg-red-700"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Cuadrícula de Productos */}
          {!loading && !error && (
            <div className="flex-1">
              {filteredProducts.length === 0 && filteredCombos.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                  <span className="text-5xl mb-3 block">🔍</span>
                  <p className="text-xl font-bold text-slate-700">No encontramos productos en este pasillo</p>
                  <p className="text-sm text-slate-500 mt-1">Intenta con otro término o selecciona "Todos".</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-20 lg:pb-6">
                  {/* Combos destacados */}
                  {filteredCombos.map((combo) => (
                    <article
                      key={combo.id}
                      className="group flex flex-col justify-between rounded-3xl border-2 border-amber-200 bg-amber-50/40 p-4 shadow-sm hover:border-amber-400 hover:shadow-md transition overflow-hidden"
                    >
                      <div>
                        {/* Imagen del combo */}
                        <ProductImage
                          src={combo.image_url}
                          alt={combo.name}
                          productName={combo.name}
                          isOffer={true}
                          offerBadgeText="🔥 Combo Ahorro"
                          containerClassName="relative mb-3 flex h-36 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-amber-100/60 to-amber-50 p-2 overflow-hidden border border-amber-200/60"
                          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />

                        <h3 className="text-lg font-bold text-slate-800 line-clamp-2 mb-1">{combo.name}</h3>
                        {combo.description && (
                          <p className="text-xs text-slate-600 line-clamp-2 mb-3">{combo.description}</p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-amber-200/80 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Precio Combo</p>
                          <p className="text-2xl font-black text-slate-900 tabular-nums">
                            {formatCentsCOP(combo.price_cents)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            addToCart({
                              id: combo.id,
                              name: combo.name,
                              price_cents: combo.price_cents,
                              stock: 50,
                              unit: 'combo',
                              image_url: combo.image_url,
                            })
                          }
                          aria-label={`Agregar combo ${combo.name} al pedido`}
                          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl bg-amber-500 text-white font-bold hover:bg-amber-600 active:scale-95 transition shadow-sm px-4"
                        >
                          <Icon name="plus" size={24} />
                          <span className="ml-1 text-base">Agregar</span>
                        </button>
                      </div>
                    </article>
                  ))}

                  {/* Productos estándar */}
                  {filteredProducts.map((prod) => {
                    const inCartItem = cart.find((i) => i.product_id === prod.id);
                    const isOffer = prod.en_oferta === 1 && prod.precio_oferta_cents;
                    const cardPricing = resolveProductUnitPricing(prod, inCartItem?.quantity ?? 1);
                    const primaryWholesale = getPrimaryWholesaleTier(prod);

                    return (
                      <article
                        key={prod.id}
                        className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sf-primary hover:shadow-md transition overflow-hidden"
                      >
                        <div>
                          {/* Fotografía o Gráfico Realista del Producto */}
                          <ProductImage
                            src={prod.image_url}
                            alt={prod.name}
                            productName={prod.name}
                            barcode={prod.barcode}
                            category={prod.category}
                            isOffer={Boolean(isOffer)}
                            offerBadgeText="🔥 Oferta"
                            containerClassName="relative mb-3 flex h-36 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70 p-2 overflow-hidden border border-slate-100"
                            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />

                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 capitalize">
                                {prod.unit || 'unidad'}
                              </span>
                              {Boolean(prod.allow_fractional) && (
                                <span className="rounded-lg bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                  ⚖️ Venta a Granel
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 capitalize">{prod.category || 'General'}</span>
                          </div>

                          <h3 className="text-lg font-bold text-slate-800 line-clamp-2 leading-snug">
                            {prod.name}
                          </h3>

                          {inCartItem?.applied_wholesale_tier ? (
                            <p className="mt-2 inline-flex items-center gap-1 rounded-xl bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-800 tabular-nums">
                              ✅ Promo {inCartItem.applied_wholesale_tier.min_quantity}+ activa · Ahorras{' '}
                              {formatCentsCOP(inCartItem.wholesale_savings_cents || 0)}
                            </p>
                          ) : primaryWholesale ? (
                            <p className="mt-2 inline-flex items-center gap-1 rounded-xl bg-amber-100 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900 tabular-nums">
                              🏷️ Lleva {primaryWholesale.min_quantity}+ a {formatCentsCOP(primaryWholesale.unit_price_cents)} c/u
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                              {inCartItem?.applied_wholesale_tier ? 'Precio Mayorista' : 'Precio'}
                            </p>
                            <div className="flex items-baseline gap-1.5">
                              <p className="text-2xl font-black text-sf-primary tabular-nums">
                                {formatCentsCOP(cardPricing.unit_price_cents)}
                              </p>
                              {(isOffer || inCartItem?.applied_wholesale_tier) &&
                                cardPricing.unit_price_cents < prod.price_cents && (
                                  <p className="text-xs text-slate-400 line-through tabular-nums">
                                    {formatCentsCOP(prod.price_cents)}
                                  </p>
                                )}
                            </div>
                          </div>

                          {inCartItem ? (
                            <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200">
                              {Boolean(prod.allow_fractional) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBulkProduct(prod);
                                    setBulkInitialQty(inCartItem.quantity);
                                  }}
                                  aria-label={`Recalcular peso de ${prod.name}`}
                                  className="flex min-h-[48px] min-w-[44px] items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold hover:bg-emerald-200"
                                >
                                  ⚖️
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => updateCartQty(prod.id, -1)}
                                aria-label={`Quitar una unidad de ${prod.name}`}
                                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm hover:bg-slate-200 active:scale-95"
                              >
                                <Icon name="minus" size={20} />
                              </button>
                              <span className="min-w-[2.5rem] px-1 text-center font-black text-base text-slate-800 tabular-nums">
                                {Boolean(prod.allow_fractional)
                                  ? `${formatQuantityNumber(inCartItem.quantity)}${getUnitShortLabel(prod.unit)}`
                                  : inCartItem.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateCartQty(prod.id, 1)}
                                aria-label={`Agregar otra unidad de ${prod.name}`}
                                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-sf-primary text-white shadow-sm hover:bg-blue-600 active:scale-95"
                              >
                                <Icon name="plus" size={20} />
                              </button>
                            </div>
                          ) : Boolean(prod.allow_fractional) ? (
                            <button
                              type="button"
                              onClick={() => {
                                setBulkProduct(prod);
                                setBulkInitialQty(undefined);
                              }}
                              aria-label={`Pesar y agregar ${prod.name} al pedido`}
                              className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 active:scale-95 transition shadow-sm px-4"
                            >
                              <span className="text-lg">⚖️</span>
                              <span className="ml-1.5 text-base">Pesar</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                addToCart({
                                  id: prod.id,
                                  name: prod.name,
                                  price_cents: prod.price_cents,
                                  stock: prod.stock,
                                  unit: prod.unit,
                                  image_url: prod.image_url,
                                  en_oferta: prod.en_oferta,
                                  precio_oferta_cents: prod.precio_oferta_cents,
                                  wholesale_tiers: prod.wholesale_tiers,
                                  wholesale_tiers_json: prod.wholesale_tiers_json,
                                  allow_fractional: prod.allow_fractional,
                                })
                              }
                              aria-label={`Agregar ${prod.name} al pedido`}
                              className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 active:scale-95 transition shadow-sm px-4"
                            >
                              <Icon name="plus" size={24} />
                              <span className="ml-1 text-base">Agregar</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Panel Lateral de Carrito Docked (visible en pantallas grandes desktop/iPad Pro) */}
        <aside className="hidden lg:flex w-96 flex-col border-l border-slate-200 bg-white p-6 shadow-sm select-none">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Icon name="cart" size={24} className="text-sf-primary" />
              <h2 className="text-xl font-bold text-slate-800">Mi Canasta</h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs font-semibold text-red-500 hover:text-red-700"
              >
                Vaciar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400 p-6">
                <span className="text-5xl mb-3">🛒</span>
                <p className="text-base font-bold text-slate-600">Tu canasta está vacía</p>
                <p className="text-xs mt-1">Toca "+ Agregar" en los productos que deseas llevar.</p>
              </div>
            ) : (
              cart.map((item) => {
                const storeProd = storeData?.products.find((p) => p.id === item.product_id);
                const livePricing = storeProd ? resolveProductUnitPricing(storeProd, item.quantity) : null;
                return (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800 text-sm">{item.product_name}</p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {formatCentsCOP(item.unit_price_cents)} c/u · {formatCentsCOP(item.subtotal_cents)}
                      </p>
                      {item.applied_wholesale_tier ? (
                        <span className="mt-1 inline-flex items-center rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          🏷️ Mayorista {item.applied_wholesale_tier.min_quantity}+ · Ahorras{' '}
                          {formatCentsCOP(item.wholesale_savings_cents || 0)}
                        </span>
                      ) : livePricing?.next_tier ? (
                        <span className="mt-1 inline-flex items-center rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          +{livePricing.units_to_next_tier} más a {formatCentsCOP(livePricing.next_tier.unit_price_cents)} c/u
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-xl bg-white border border-slate-200">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.product_id, -1)}
                          aria-label={`Quitar una unidad de ${item.product_name} en carrito`}
                          className="flex h-11 w-11 items-center justify-center text-slate-600 hover:bg-slate-100 rounded-l-xl"
                        >
                          <Icon name="minus" size={16} />
                        </button>
                        <span className="min-w-[2.5rem] px-1 text-center text-sm font-bold text-slate-800 tabular-nums">
                          {Boolean(item.allow_fractional || storeProd?.allow_fractional) || !Number.isInteger(item.quantity)
                            ? formatQuantityWithUnit(item.quantity, item.unit, true)
                            : item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.product_id, 1)}
                          aria-label={`Agregar otra unidad de ${item.product_name} en carrito`}
                          className="flex h-11 w-11 items-center justify-center text-sf-primary hover:bg-slate-100 rounded-r-xl"
                        >
                          <Icon name="plus" size={16} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeCartItem(item.product_id)}
                        aria-label={`Eliminar ${item.product_name} del carrito`}
                        className="p-2 text-slate-400 hover:text-red-500"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pie de Carrito con Total y Botón Hero */}
          <div className="border-t border-slate-200 pt-4 space-y-4">
            {cartWholesaleSavingsCents > 0 && (
              <div className="flex justify-between items-center rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800">
                <span>🏷️ Ahorro mayorista aplicado:</span>
                <span className="tabular-nums">-{formatCentsCOP(cartWholesaleSavingsCents)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="text-slate-500 font-semibold">Total a pagar:</span>
              <span className="text-3xl font-black text-sf-primary tabular-nums">
                {formatCentsCOP(cartTotalCents)}
              </span>
            </div>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => setCheckoutStep(1)}
              className="w-full min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white font-bold text-lg shadow-lg transition flex items-center justify-center gap-2"
            >
              <Icon name="check" size={22} />
              <span>CONTINUAR PEDIDO</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Drawer Móvil/Tablet para el Carrito cuando no está en desktop */}
      {cartDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm lg:hidden"
        >
          <div className="max-h-[85vh] w-full rounded-t-3xl bg-white p-6 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Icon name="cart" size={24} className="text-sf-primary" />
                <h2 className="text-xl font-bold text-slate-800">Mi Canasta ({cartUnitsCount})</h2>
              </div>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-800"
              >
                <Icon name="close" size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {cart.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ProductImage
                      src={item.image_url}
                      alt={item.product_name}
                      productName={item.product_name}
                      showOfferBadge={false}
                      containerClassName="h-12 w-12 rounded-xl bg-white p-1 border border-slate-200 shrink-0"
                      className="h-full w-full object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">{item.product_name}</p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {formatCentsCOP(item.unit_price_cents)} c/u · {formatCentsCOP(item.subtotal_cents)}
                      </p>
                      {item.applied_wholesale_tier && (
                        <span className="mt-1 inline-flex items-center rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          🏷️ Mayorista {item.applied_wholesale_tier.min_quantity}+ · Ahorras{' '}
                          {formatCentsCOP(item.wholesale_savings_cents || 0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-xl bg-white border border-slate-200">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product_id, -1)}
                        className="flex h-11 w-11 items-center justify-center text-slate-600"
                      >
                        <Icon name="minus" size={18} />
                      </button>
                      <span className="min-w-[2.5rem] px-1 text-center font-bold text-slate-800 text-xs tabular-nums">
                        {Boolean(item.allow_fractional) || !Number.isInteger(item.quantity)
                          ? formatQuantityWithUnit(item.quantity, item.unit, true)
                          : item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product_id, 1)}
                        className="flex h-11 w-11 items-center justify-center text-sf-primary"
                      >
                        <Icon name="plus" size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-4">
              {cartWholesaleSavingsCents > 0 && (
                <div className="flex justify-between items-center rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800">
                  <span>🏷️ Ahorro mayorista aplicado:</span>
                  <span className="tabular-nums">-{formatCentsCOP(cartWholesaleSavingsCents)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500 font-semibold">Total a pagar:</span>
                <span className="text-2xl font-black text-sf-primary tabular-nums">
                  {formatCentsCOP(cartTotalCents)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCartDrawerOpen(false);
                  setCheckoutStep(1);
                }}
                className="w-full min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg shadow-lg flex items-center justify-center gap-2"
              >
                <span>CONTINUAR PEDIDO</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Checkout sin Fricción en 2 Pasos */}
      {checkoutStep && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 md:p-8 shadow-2xl border border-slate-100">
            {/* Cabecera del Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-sf-primary">Paso {checkoutStep} de 2</p>
                <h3 className="text-xl md:text-2xl font-black text-slate-800">
                  {checkoutStep === 1 ? '¿A nombre de quién?' : '¿Cómo vas a pagar?'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCheckoutStep(null);
                  setCheckoutError(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <Icon name="close" size={24} />
              </button>
            </div>

            {checkoutError && (
              <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {checkoutError}
              </div>
            )}

            {/* Paso 1: Datos del Vecino */}
            {checkoutStep === 1 && (
              <div className="py-6 space-y-5">
                <div>
                  <label htmlFor="kiosk-customer-name" className="block text-sm font-bold text-slate-700 mb-2">
                    Tu Nombre o Apellido <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="kiosk-customer-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej: Don Roberto, Doña Marta..."
                    className="w-full min-h-[56px] rounded-2xl border-2 border-slate-200 px-4 text-xl font-semibold text-slate-800 focus:border-sf-primary focus:outline-none"
                    autoFocus
                  />
                  <p className="text-xs text-slate-500 mt-1">Con este nombre te llamaremos en el mostrador.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="kiosk-customer-phone" className="block text-sm font-bold text-slate-700">
                    Teléfono WhatsApp (Para Puntos del Club)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="kiosk-customer-phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value);
                        setLoyaltyLookupError(null);
                        if (!e.target.value.trim()) {
                          setLoyaltyLookup(null);
                          setRedeemMaxPoints(false);
                        }
                      }}
                      placeholder="300 123 4567"
                      className="flex-1 min-h-[56px] rounded-2xl border-2 border-slate-200 px-4 text-lg font-semibold text-slate-800 focus:border-sf-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleLookupKioskPoints()}
                      disabled={loyaltyLookupLoading || !customerPhone.trim()}
                      className="min-h-[56px] rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 text-sm font-bold text-white transition shrink-0"
                    >
                      {loyaltyLookupLoading ? 'Consultando...' : '⭐ Consultar mis Puntos'}
                    </button>
                  </div>

                  {loyaltyLookupError && (
                    <p className="text-xs font-semibold text-red-600">{loyaltyLookupError}</p>
                  )}

                  {loyaltyLookup && (
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-3.5 space-y-2 text-sm">
                      {loyaltyLookup.enrolled ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800">
                              👋 {loyaltyLookup.display_name}
                            </span>
                            <span className="font-black text-amber-900 tabular-nums">
                              ⭐ {loyaltyLookup.points_balance} pts ({formatCentsCOP(loyaltyLookup.redeemable_value_cents)})
                            </span>
                          </div>
                          {redeemPolicy.can_redeem ? (
                            <button
                              type="button"
                              onClick={() => setRedeemMaxPoints((prev) => !prev)}
                              className={`w-full min-h-[56px] rounded-xl font-bold text-sm transition border-2 ${
                                redeemMaxPoints
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-amber-400 bg-white text-amber-900 hover:bg-amber-100'
                              }`}
                            >
                              {redeemMaxPoints
                                ? `✅ Canjeando ${redeemPolicy.max_points} pts (-${formatCentsCOP(redeemPolicy.max_discount_cents)}) · Toca para quitar`
                                : `Usar ${redeemPolicy.max_points} puntos (-${formatCentsCOP(redeemPolicy.max_discount_cents)})`}
                            </button>
                          ) : (
                            <p className="text-xs text-slate-600">
                              Necesitas mínimo {loyaltyConfig.min_redeem_points} puntos para canjear en este pedido.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs font-semibold text-amber-950">
                          ✨ ¡Bienvenido! Acumularás +{orderSettlement.points_earned} puntos al completar tu pedido.
                        </p>
                      )}
                    </div>
                  )}

                  {hasValidKioskPhone && !loyaltyLookup && orderSettlement.points_earned > 0 && (
                    <p className="text-xs font-semibold text-emerald-700">
                      ✨ Acumularás +{orderSettlement.points_earned} puntos con este pedido
                    </p>
                  )}
                </div>

                {storeData?.config.permite_domicilio && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Modalidad de Entrega</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDeliveryType('pickup_counter')}
                        className={`min-h-[56px] rounded-2xl border-2 p-3 text-left font-bold transition flex items-center gap-2.5 ${
                          deliveryType === 'pickup_counter'
                            ? 'border-sf-primary bg-blue-50/60 text-sf-primary'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <span className="text-2xl">🏪</span>
                        <div>
                          <p className="text-sm">En Mostrador</p>
                          <p className="text-[11px] font-normal text-slate-500">Llevar ya</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeliveryType('delivery')}
                        className={`min-h-[56px] rounded-2xl border-2 p-3 text-left font-bold transition flex items-center gap-2.5 ${
                          deliveryType === 'delivery'
                            ? 'border-sf-primary bg-blue-50/60 text-sf-primary'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <span className="text-2xl">🛵</span>
                        <div>
                          <p className="text-sm">Domicilio</p>
                          <p className="text-[11px] font-normal text-slate-500">
                            +{formatCentsCOP(storeData.costo_domicilio_cents)}
                          </p>
                        </div>
                      </button>
                    </div>

                    {deliveryType === 'delivery' && (
                      <div className="mt-3 space-y-3">
                        <input
                          type="text"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Dirección exacta (ej: Calle 50 # 50-20 apto 201)"
                          className="w-full min-h-[50px] rounded-xl border border-slate-200 px-3 text-sm"
                        />
                        <input
                          type="text"
                          value={deliveryNeighborhood}
                          onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                          placeholder="Barrio en Medellín"
                          className="w-full min-h-[50px] rounded-xl border border-slate-200 px-3 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!customerName.trim()}
                  onClick={() => setCheckoutStep(2)}
                  className="w-full min-h-[56px] rounded-2xl bg-sf-primary hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-lg shadow-lg transition flex items-center justify-center gap-2"
                >
                  <span>Siguiente: Forma de Pago ➔</span>
                </button>
              </div>
            )}

            {/* Paso 2: Medio de Pago */}
            {checkoutStep === 2 && (
              <div className="py-6 space-y-5">
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`w-full min-h-[56px] rounded-2xl border-2 p-4 text-left transition flex items-center justify-between ${
                      paymentMethod === 'cash'
                        ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">💵</span>
                      <div>
                        <p className="font-bold text-base">Efectivo en Mostrador</p>
                        <p className="text-xs text-slate-500">Pagas en caja cuando te entreguemos tu compra</p>
                      </div>
                    </div>
                    {paymentMethod === 'cash' && <Icon name="check" size={22} className="text-emerald-600" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transfer')}
                    className={`w-full min-h-[56px] rounded-2xl border-2 p-4 text-left transition flex items-center justify-between ${
                      paymentMethod === 'transfer'
                        ? 'border-sf-primary bg-blue-50/60 text-sf-primary'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">📱</span>
                      <div>
                        <p className="font-bold text-base">Transferencia Nequi / Bancolombia</p>
                        <p className="text-xs text-slate-500">
                          {storeData?.datos_pago_offline || 'Muestra comprobante en mostrador'}
                        </p>
                      </div>
                    </div>
                    {paymentMethod === 'transfer' && <Icon name="check" size={22} className="text-sf-primary" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('credit')}
                    className={`w-full min-h-[56px] rounded-2xl border-2 p-4 text-left transition flex items-center justify-between ${
                      paymentMethod === 'credit'
                        ? 'border-amber-500 bg-amber-50/60 text-amber-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">📒</span>
                      <div>
                        <p className="font-bold text-base">Anotar a mi Fiado</p>
                        <p className="text-xs text-slate-500">El tendero confirmará tu cupo en la caja</p>
                      </div>
                    </div>
                    {paymentMethod === 'credit' && <Icon name="check" size={22} className="text-amber-500" />}
                  </button>
                </div>

                {/* Bloque de Cupón de Descuento en Kiosco */}
                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50/70 p-4 space-y-2">
                  <label htmlFor="kiosk-coupon-code" className="block text-sm font-bold text-slate-700">
                    🎟️ ¿Tienes un cupón de descuento?
                  </label>
                  {couponEval.coupon ? (
                    <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm">
                      <span className="font-bold text-blue-900">
                        🎟️ {couponEval.coupon.code} (-{formatCentsCOP(orderSettlement.coupon_discount_cents)})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedCoupon(null);
                          setCouponInput('');
                          setCouponError(null);
                        }}
                        className="min-h-[44px] px-3 text-xs font-bold text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        id="kiosk-coupon-code"
                        type="text"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value.toUpperCase());
                          setCouponError(null);
                        }}
                        placeholder="Ej: VECINO10"
                        className="flex-1 min-h-[56px] rounded-xl border-2 border-slate-200 bg-white px-4 font-mono text-base font-bold uppercase text-slate-800 focus:border-sf-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleApplyKioskCoupon()}
                        disabled={couponLoading || !couponInput.trim()}
                        className="min-h-[56px] rounded-xl bg-sf-primary hover:bg-blue-600 disabled:opacity-50 px-5 text-sm font-bold text-white"
                      >
                        {couponLoading ? '...' : 'Aplicar'}
                      </button>
                    </div>
                  )}
                  {(couponError || couponEval.warning) && (
                    <p className="text-xs font-semibold text-red-600">
                      {couponError || couponEval.warning}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-600 tabular-nums">
                    <span>Subtotal productos:</span>
                    <span className="font-semibold">{formatCentsCOP(itemsSubtotalCents)}</span>
                  </div>
                  {orderSettlement.coupon_discount_cents > 0 && orderSettlement.coupon_code && (
                    <div className="flex justify-between text-xs font-bold text-blue-700 tabular-nums">
                      <span>Cupón {orderSettlement.coupon_code}:</span>
                      <span>-{formatCentsCOP(orderSettlement.coupon_discount_cents)}</span>
                    </div>
                  )}
                  {orderSettlement.points_discount_cents > 0 && (
                    <div className="flex justify-between text-xs font-bold text-amber-800 tabular-nums">
                      <span>Canje {orderSettlement.points_redeemed} pts:</span>
                      <span>-{formatCentsCOP(orderSettlement.points_discount_cents)}</span>
                    </div>
                  )}
                  {deliveryCostCents > 0 && (
                    <div className="flex justify-between text-xs text-slate-600 tabular-nums">
                      <span>Domicilio:</span>
                      <span className="font-semibold">{formatCentsCOP(deliveryCostCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                    <span className="font-semibold text-slate-700">Total a facturar:</span>
                    <span className="text-2xl font-black text-slate-900 tabular-nums">
                      {formatCentsCOP(cartTotalCents)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(1)}
                    className="min-h-[56px] rounded-2xl border-2 border-slate-200 px-5 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmOrder}
                    className="flex-1 min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-lg shadow-lg transition flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <span>Generando Turno...</span>
                    ) : (
                      <>
                        <Icon name="check" size={22} />
                        <span>Confirmar y Sacar Turno 🚀</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <BulkWeightCalculatorModal
        open={bulkProduct !== null}
        onClose={() => setBulkProduct(null)}
        product={bulkProduct}
        initialQuantity={bulkInitialQty}
        kioskMode={true}
        onConfirm={(qty) => {
          if (bulkProduct) setCartProductQuantity(bulkProduct, qty);
        }}
      />
    </div>
  );
}

