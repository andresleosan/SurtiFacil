import { useState, useEffect, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { ProductImage } from './ui/ProductImage';
import { getPublicStore, createCustomerOrder } from '../services/customerOrderService';
import type {
  PublicStoreData,
  CustomerOrderDeliveryType,
  CustomerOrderPaymentMethod,
} from '../types/customerOrder';
import { formatCOP } from '../utils/currency';

export interface PublicStorefrontProps {
  slug?: string;
  onExit?: () => void;
}

interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  unit: string;
  image_url?: string;
}

const AISLE_FILTERS = [
  { id: 'all', label: 'Todos', icon: '✨' },
  { id: 'Frutas y Verduras', label: 'Fruver', icon: '🥑' },
  { id: 'Lácteos y Huevos', label: 'Lácteos', icon: '🥚' },
  { id: 'Granos y Despensa', label: 'Despensa', icon: '🍚' },
  { id: 'Panadería y Arepas', label: 'Panadería', icon: '🥖' },
  { id: 'Carnes y Salsamentaria', label: 'Carnes', icon: '🥩' },
  { id: 'Bebidas y Licores', label: 'Bebidas', icon: '🥤' },
  { id: 'Snacks y Confitería', label: 'Snacks', icon: '🍟' },
  { id: 'Aseo y Hogar', label: 'Aseo', icon: '🧼' },
  { id: 'Cuidado Personal', label: 'Cuidado', icon: '🧻' },
];

export default function PublicStorefront({ slug = 'surtifacil', onExit }: PublicStorefrontProps) {
  const [store, setStore] = useState<PublicStoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros y búsqueda
  const [selectedAisle, setSelectedAisle] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyOffers, setOnlyOffers] = useState(false);

  // Canasta y Checkout
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Formulario de Checkout
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<CustomerOrderDeliveryType>('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CustomerOrderPaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Carga inicial de datos de la tienda
  const loadStore = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicStore(slug);
      setStore(data);
      // Ajustar tipo de entrega por defecto según configuración
      if (data.config?.permite_domicilio === false && data.config?.permite_retiro !== false) {
        setDeliveryType('pickup_counter');
      } else {
        setDeliveryType('delivery');
      }
      setDeliveryNeighborhood(data.barrio || 'Medellín');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la tienda vecinal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStore();
  }, [slug]);

  // Manejo de la canasta
  const addToCart = (product: {
    id: string;
    name: string;
    price_cents: number;
    unit: string;
    image_url?: string;
    en_oferta?: number;
    precio_oferta_cents?: number | null;
  }) => {
    const finalPrice =
      product.en_oferta && product.precio_oferta_cents && product.precio_oferta_cents > 0
        ? product.precio_oferta_cents
        : product.price_cents;

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price_cents: finalPrice,
          unit: product.unit || 'unidad',
          image_url: product.image_url,
        },
      ];
    });
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product_id === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  // Cálculos financieros
  const subtotalCents = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
  }, [cart]);

  const deliveryCostCents = useMemo(() => {
    if (deliveryType !== 'delivery') return 0;
    return store?.costo_domicilio_cents || 0;
  }, [deliveryType, store]);

  const totalCents = subtotalCents + deliveryCostCents;

  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Productos filtrados visibles en tienda
  const filteredProducts = useMemo(() => {
    if (!store?.products) return [];
    return store.products.filter((p) => {
      if (p.visible_tienda === 0) return false;
      if (onlyOffers && (!p.en_oferta || !p.precio_oferta_cents)) return false;
      if (selectedAisle !== 'all') {
        const prodCat = (p.category || '').toLowerCase();
        const targetAisle = selectedAisle.toLowerCase();
        if (!prodCat.includes(targetAisle) && !targetAisle.includes(prodCat)) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesCat = (p.category || '').toLowerCase().includes(q);
        const matchesBarcode = (p.barcode || '').includes(q);
        if (!matchesName && !matchesCat && !matchesBarcode) return false;
      }
      return true;
    });
  }, [store?.products, selectedAisle, searchQuery, onlyOffers]);

  // Combos de mercado visibles en tienda
  const visibleCombos = useMemo(() => {
    if (!store?.combos) return [];
    return store.combos.filter((c) => c.visible_tienda === 1);
  }, [store?.combos]);

  // Envío del pedido vecinal
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError('Tu canasta está vacía. Agrega al menos un producto.');
      return;
    }
    if (!customerName.trim()) {
      setCheckoutError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (deliveryType === 'delivery' && !deliveryAddress.trim()) {
      setCheckoutError('Por favor ingresa tu dirección exacta para el domicilio.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const fullAddress =
        deliveryType === 'delivery'
          ? `${deliveryAddress.trim()}${deliveryNotes ? ` (${deliveryNotes.trim()})` : ''}`
          : 'Retiro en mostrador / tienda';

      const result = await createCustomerOrder({
        slug,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        delivery_type: deliveryType,
        delivery_address: fullAddress,
        delivery_neighborhood: deliveryNeighborhood.trim() || store?.barrio,
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          unit: item.unit,
          image_url: item.image_url,
        })),
        source: 'web',
      });

      if (result.success && result.order.tracking_token) {
        // Redirigir inmediatamente al rastreo en vivo del pedido
        window.location.hash = `#/pedido/${result.order.tracking_token}`;
      } else {
        setCheckoutError('No se pudo generar el turno de pedido. Intenta nuevamente.');
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Error al procesar el pedido.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Estados de Carga y Error
  if (loading) {
    return (
      <div className="min-h-screen bg-sf-light flex flex-col items-center justify-center p-6 text-center">
        <div className="h-12 w-12 rounded-full border-4 border-sf-primary border-t-transparent animate-spin mb-4" />
        <h2 className="text-xl font-bold text-sf-text">Cargando la tienda de tu barrio...</h2>
        <p className="text-sm text-gray-500 mt-1">Consultando productos frescos y ofertas del día.</p>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-screen bg-sf-light flex flex-col items-center justify-center p-6 text-center">
        <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="text-4xl mb-3">🏪</div>
          <h2 className="text-xl font-bold text-sf-text">Tienda no disponible</h2>
          <p className="text-sm text-gray-600 mt-2">{error || 'No pudimos encontrar el catálogo de este comercio.'}</p>
          <button
            type="button"
            onClick={loadStore}
            className="btn-primary mt-4 w-full min-h-[44px]"
          >
            Reintentar Cargar
          </button>
        </div>
      </div>
    );
  }

  const allowsDelivery = store.config?.permite_domicilio !== false;
  const allowsPickup = store.config?.permite_retiro !== false;

  return (
    <div className="min-h-screen bg-sf-light pb-28">
      {/* Cabecera Pública del Negocio */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-sf-dark text-white shadow-md">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            {/* Identidad del Negocio */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sf-primary text-xl font-bold text-white shadow-inner">
                🏪
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold truncate text-white">
                    {store.nombre}
                  </h1>
                  <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                    Abierto
                  </span>
                </div>
                <p className="text-xs text-slate-300 truncate">
                  📍 {store.barrio || 'Medellín'} • {store.horario || 'Lunes a Domingo'}
                </p>
              </div>
            </div>

            {/* Acciones de Cabecera */}
            <div className="flex items-center gap-2 shrink-0">
              {store.telefono_whatsapp && (() => {
                const rawDigits = store.telefono_whatsapp.replace(/[^0-9]/g, '');
                const normalized = rawDigits.length === 10 ? `57${rawDigits}` : rawDigits;
                return (
                  <a
                    href={`https://wa.me/${normalized}?text=${encodeURIComponent(
                      `Hola ${store.nombre}, estoy viendo su tienda vecinal y tengo una consulta.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    <Icon name="chat" size={16} />
                    <span>WhatsApp</span>
                  </a>
                );
              })()}

              {onExit && (
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition"
                  aria-label="Cerrar tienda vecinal"
                >
                  <Icon name="close" size={20} />
                </button>
              )}
            </div>
          </div>

          {/* Badges de Modalidades de Entrega */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-2 border-t border-white/10 text-xs">
            {allowsDelivery && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-slate-200">
                <span>🛵 Domicilios en el barrio:</span>
                <span className="font-bold text-emerald-400">
                  {store.costo_domicilio_cents > 0 ? formatCOP(store.costo_domicilio_cents) : 'Gratis'}
                </span>
              </span>
            )}
            {allowsPickup && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-slate-200">
                <span>🏪 Retiro en mostrador:</span>
                <span className="font-bold text-emerald-400">Sin costo</span>
              </span>
            )}
            {store.config?.slogan && (
              <span className="hidden md:inline text-slate-400 italic ml-auto truncate max-w-xs">
                "{store.config.slogan}"
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 space-y-6">
        {/* Barra de Búsqueda y Filtro de Ofertas */}
        <section aria-label="Búsqueda de productos" className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 pointer-events-none">
              <Icon name="search" size={18} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busca por nombre, categoría o producto..."
              className="input pl-10 pr-10 text-sm bg-white shadow-xs"
              aria-label="Buscar productos en la tienda vecinal"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                aria-label="Limpiar búsqueda"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOnlyOffers(!onlyOffers)}
            aria-pressed={onlyOffers}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 ${
              onlyOffers
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-gray-700 hover:bg-slate-50'
            }`}
          >
            <span>🏷️ Solo Ofertas</span>
          </button>
        </section>

        {/* Carrusel de Pasillos estilo Rappi Aisles */}
        <nav aria-label="Pasillos de abastos" className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
            {AISLE_FILTERS.map((aisle) => {
              const active = selectedAisle === aisle.id;
              return (
                <button
                  key={aisle.id}
                  type="button"
                  onClick={() => setSelectedAisle(aisle.id)}
                  aria-pressed={active}
                  className={`snap-start min-h-[44px] shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold transition flex items-center gap-2 border ${
                    active
                      ? 'border-sf-primary bg-sf-primary text-white shadow-sm'
                      : 'border-slate-200 bg-white text-gray-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-base" aria-hidden="true">{aisle.icon}</span>
                  <span>{aisle.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Sección de Combos y Kits de Mercado (si existen) */}
        {visibleCombos.length > 0 && selectedAisle === 'all' && !searchQuery && (
          <section aria-labelledby="combos-heading" className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">📦</span>
              <h2 id="combos-heading" className="text-base font-bold text-sf-text">
                Combos y Kits de Mercado del Barrio
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleCombos.map((combo) => {
                let itemsList: any[] = [];
                try {
                  itemsList = JSON.parse(combo.items_json);
                } catch {}

                return (
                  <div
                    key={combo.id}
                    className="card p-4 flex flex-col justify-between border-2 border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-white to-white"
                  >
                    <div>
                      <ProductImage
                        src={combo.image_url}
                        alt={combo.name}
                        productName={combo.name}
                        isOffer={true}
                        offerBadgeText="Combo Especial"
                        containerClassName="relative mb-2.5 flex h-28 w-full items-center justify-center rounded-xl bg-amber-100/50 p-2 overflow-hidden border border-amber-200/50"
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />

                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          Combo Especial
                        </span>
                        <span className="text-base font-bold text-sf-primary tabular-nums">
                          {formatCOP(combo.price_cents)}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-sf-text">{combo.name}</h3>
                      {combo.description && (
                        <p className="mt-1 text-xs text-gray-600 line-clamp-2">{combo.description}</p>
                      )}

                      {itemsList.length > 0 && (
                        <div className="mt-2.5 rounded-lg bg-amber-50/80 p-2 text-[11px] text-amber-900/90 space-y-0.5">
                          {itemsList.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>• {item.product_name}</span>
                              <span className="font-semibold">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        addToCart({
                          id: combo.id,
                          name: combo.name,
                          price_cents: combo.price_cents,
                          unit: 'combo',
                          image_url: combo.image_url,
                        })
                      }
                      className="btn-primary mt-3 w-full min-h-[44px] text-xs font-bold bg-amber-600 hover:bg-amber-700"
                    >
                      <Icon name="plus" size={16} />
                      <span>Agregar Combo a la Canasta</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Cuadrícula de Productos de Abastos (Patrón Blinkit) */}
        <section aria-labelledby="products-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="products-heading" className="text-base font-bold text-sf-text">
              Productos Disponibles ({filteredProducts.length})
            </h2>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="card p-8 text-center text-gray-500">
              <span className="text-3xl block mb-2">🔍</span>
              <p className="font-semibold">No se encontraron productos en esta categoría.</p>
              <p className="text-xs mt-1">Prueba con otra palabra clave o selecciona "Todos".</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredProducts.map((product) => {
                const inCartItem = cart.find((i) => i.product_id === product.id);
                const hasOffer = Boolean(product.en_oferta && product.precio_oferta_cents && product.precio_oferta_cents > 0);
                const activePrice = hasOffer ? product.precio_oferta_cents! : product.price_cents;

                return (
                  <div
                    key={product.id}
                    className="card flex flex-col justify-between p-3 transition hover:shadow-md border border-slate-200/90"
                  >
                    <div>
                      {/* Imagen o Icono Realista */}
                      <div className="relative mb-2 flex h-28 w-full items-center justify-center rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 p-1.5 overflow-hidden border border-slate-100">
                        <ProductImage
                          src={product.image_url}
                          alt={product.name}
                          productName={product.name}
                          category={product.category}
                          isOffer={hasOffer}
                          offerBadgeText="OFERTA"
                          containerClassName="h-full w-full"
                          className="h-full w-full object-contain transition-transform duration-200 hover:scale-105"
                          loading="lazy"
                        />

                        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white capitalize backdrop-blur-xs">
                          {product.unit || 'unidad'}
                        </span>
                      </div>

                      {/* Nombre y Precio */}
                      <h3 className="text-xs sm:text-sm font-semibold text-sf-text line-clamp-2 min-h-[2.5rem]">
                        {product.name}
                      </h3>

                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-sm sm:text-base font-bold text-sf-primary tabular-nums">
                          {formatCOP(activePrice)}
                        </span>
                        {hasOffer && (
                          <span className="text-[11px] text-gray-400 line-through tabular-nums">
                            {formatCOP(product.price_cents)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Controles de Canasta */}
                    <div className="mt-3 pt-2 border-t border-slate-100">
                      {inCartItem ? (
                        <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-1">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(product.id, -1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-xs hover:bg-emerald-100 transition"
                            aria-label={`Restar una unidad de ${product.name}`}
                          >
                            <Icon name="minus" size={14} />
                          </button>
                          <span className="text-xs font-bold text-emerald-900 tabular-nums">
                            {inCartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(product.id, 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 transition"
                            aria-label={`Añadir una unidad más de ${product.name}`}
                          >
                            <Icon name="plus" size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="btn-primary w-full min-h-[44px] text-xs font-bold py-2 shadow-xs bg-emerald-600 hover:bg-emerald-700"
                          aria-label={`Agregar ${product.name} a la canasta`}
                        >
                          <Icon name="plus" size={16} />
                          <span>AGREGAR</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Barra Flotante de Canasta al Pie */}
      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 bg-gradient-to-t from-slate-900/60 to-transparent pointer-events-none">
          <div className="mx-auto max-w-lg pointer-events-auto">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-sf-primary px-5 py-3.5 text-white shadow-xl hover:bg-sf-primary-hover transition"
              aria-label="Abrir canasta y confirmar pedido"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 font-bold text-sm">
                  {totalItemsCount}
                </span>
                <div className="text-left">
                  <div className="text-xs text-blue-100">Mi Canasta de Mercado</div>
                  <div className="text-base font-bold tabular-nums">{formatCOP(totalCents)}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold bg-white text-sf-primary px-3.5 py-2 rounded-xl shadow-xs">
                <span>Ver Canasta</span>
                <Icon name="chevron-right" size={16} />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Modal / Drawer de Checkout Vecinal */}
      {cartOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
        >
          <div className="flex flex-col max-h-[92vh] w-full max-w-xl rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden animate-slide-up">
            {/* Cabecera del Drawer */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 bg-sf-light/50">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">🛒</span>
                <h2 id="checkout-title" className="text-base font-bold text-sf-text">
                  Canasta y Confirmación de Pedido
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Cerrar canasta"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="overflow-y-auto p-5 space-y-5 flex-1">
              {checkoutError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  {checkoutError}
                </div>
              )}

              {/* Lista de Ítems */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Productos Seleccionados ({totalItemsCount})
                </h3>
                <div className="divide-y divide-gray-100 rounded-xl border border-slate-200 bg-white">
                  {cart.map((item) => (
                    <div key={item.product_id} className="flex items-center justify-between p-3 gap-2.5">
                      <ProductImage
                        src={item.image_url}
                        alt={item.product_name}
                        productName={item.product_name}
                        showOfferBadge={false}
                        containerClassName="h-10 w-10 shrink-0 rounded-lg bg-slate-50 p-1 border border-slate-200"
                        className="h-full w-full object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-sf-text truncate">{item.product_name}</div>
                        <div className="text-[11px] text-gray-500 tabular-nums">
                          {formatCOP(item.unit_price_cents)} × {item.quantity} {item.unit}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-sf-primary tabular-nums">
                          {formatCOP(item.unit_price_cents * item.quantity)}
                        </span>
                        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.product_id, -1)}
                            className="h-7 w-7 flex items-center justify-center rounded bg-white text-gray-700 shadow-xs"
                            aria-label={`Quitar uno de ${item.product_name}`}
                          >
                            <Icon name="minus" size={12} />
                          </button>
                          <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.product_id, 1)}
                            className="h-7 w-7 flex items-center justify-center rounded bg-white text-gray-700 shadow-xs"
                            aria-label={`Sumar uno de ${item.product_name}`}
                          >
                            <Icon name="plus" size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selector de Modalidad de Entrega */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  ¿Cómo deseas recibir tu mercado?
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {allowsDelivery && (
                    <button
                      type="button"
                      onClick={() => setDeliveryType('delivery')}
                      className={`min-h-[52px] rounded-xl border-2 p-3 text-left transition ${
                        deliveryType === 'delivery'
                          ? 'border-sf-primary bg-sf-primary/5 text-sf-primary'
                          : 'border-slate-200 bg-white text-gray-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span>🛵 A Domicilio</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                        {store.costo_domicilio_cents > 0 ? `+ ${formatCOP(store.costo_domicilio_cents)}` : 'Envío gratis'}
                      </div>
                    </button>
                  )}

                  {allowsPickup && (
                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup_counter')}
                      className={`min-h-[52px] rounded-xl border-2 p-3 text-left transition ${
                        deliveryType === 'pickup_counter'
                          ? 'border-sf-primary bg-sf-primary/5 text-sf-primary'
                          : 'border-slate-200 bg-white text-gray-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span>🏪 Retiro en Tienda</span>
                      </div>
                      <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">
                        Listo en mostrador ($0)
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Formulario de Datos del Cliente */}
              <form onSubmit={handleSubmitOrder} className="space-y-3">
                <div>
                  <label htmlFor="customer-name" className="block text-xs font-semibold text-gray-700 mb-1">
                    Tu Nombre y Apellido *
                  </label>
                  <input
                    id="customer-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="ej. Doña Martha González"
                    className="input text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="customer-phone" className="block text-xs font-semibold text-gray-700 mb-1">
                    Teléfono / WhatsApp de Contacto
                  </label>
                  <input
                    id="customer-phone"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="ej. 300 123 4567"
                    className="input text-sm"
                  />
                </div>

                {deliveryType === 'delivery' && (
                  <>
                    <div>
                      <label htmlFor="customer-address" className="block text-xs font-semibold text-gray-700 mb-1">
                        Dirección de Entrega *
                      </label>
                      <input
                        id="customer-address"
                        type="text"
                        required
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="ej. Calle 50 # 50-20 Apto 301"
                        className="input text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="delivery-notes" className="block text-xs font-semibold text-gray-700 mb-1">
                        Puntos de referencia o indicaciones
                      </label>
                      <input
                        id="delivery-notes"
                        type="text"
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        placeholder="ej. Frente a la panadería, reja verde"
                        className="input text-sm"
                      />
                    </div>
                  </>
                )}

                {/* Método de Pago */}
                <div className="space-y-2 pt-1">
                  <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Medio de Pago al Recibir
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`min-h-[44px] rounded-xl border p-2 text-center text-xs font-semibold transition ${
                        paymentMethod === 'cash'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-gray-700'
                      }`}
                    >
                      💵 Efectivo
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transfer')}
                      className={`min-h-[44px] rounded-xl border p-2 text-center text-xs font-semibold transition ${
                        paymentMethod === 'transfer'
                          ? 'border-sf-primary bg-sf-primary/10 text-sf-primary'
                          : 'border-slate-200 bg-white text-gray-700'
                      }`}
                    >
                      📲 Transferencia
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('credit')}
                      className={`min-h-[44px] rounded-xl border p-2 text-center text-xs font-semibold transition ${
                        paymentMethod === 'credit'
                          ? 'border-amber-500 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-white text-gray-700'
                      }`}
                    >
                      📒 Fiado
                    </button>
                  </div>

                  {paymentMethod === 'cash' && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <label htmlFor="cash-tendered" className="block text-[11px] font-medium text-gray-600 mb-1">
                        ¿Con cuánto billete pagas? (Para llevarte las vueltas listas)
                      </label>
                      <input
                        id="cash-tendered"
                        type="text"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        placeholder="ej. 20.000 o 50.000"
                        className="input text-xs py-1.5"
                      />
                    </div>
                  )}

                  {paymentMethod === 'transfer' && store.datos_pago_offline && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900">
                      <span className="font-bold block mb-0.5">Datos para transferir:</span>
                      <span>{store.datos_pago_offline}</span>
                    </div>
                  )}

                  {paymentMethod === 'credit' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900">
                      ℹ️ El cobro a crédito de fiado está sujeto a que tengas cuenta activa con el tendero.
                    </div>
                  )}
                </div>

                {/* Resumen Total */}
                <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5 space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal productos:</span>
                    <span className="font-semibold tabular-nums">{formatCOP(subtotalCents)}</span>
                  </div>
                  {deliveryType === 'delivery' && (
                    <div className="flex justify-between text-gray-600">
                      <span>Costo de domicilio:</span>
                      <span className="font-semibold tabular-nums">
                        {deliveryCostCents > 0 ? formatCOP(deliveryCostCents) : 'Gratis'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-sf-text">
                    <span>Total a Pagar:</span>
                    <span className="text-base text-sf-primary tabular-nums">{formatCOP(totalCents)}</span>
                  </div>
                </div>

                {/* Botón de Confirmación */}
                <button
                  type="submit"
                  disabled={submittingOrder}
                  className="btn-primary w-full min-h-[48px] text-base font-bold shadow-lg"
                >
                  {submittingOrder ? (
                    <>
                      <Icon name="refresh" className="animate-spin" size={20} />
                      <span>Confirmando pedido...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={20} />
                      <span>Confirmar Pedido Vecinal ({formatCOP(totalCents)})</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

