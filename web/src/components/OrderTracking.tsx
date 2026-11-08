import { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { trackCustomerOrder } from '../services/customerOrderService';
import type { CustomerOrder, CustomerOrderStatus } from '../types/customerOrder';
import { formatCOP } from '../utils/currency';

export interface OrderTrackingProps {
  token?: string;
  onExit?: () => void;
}

interface StoreInfo {
  nombre?: string;
  slug?: string;
  barrio?: string;
  direccion?: string;
  telefono_whatsapp?: string;
  datos_pago_offline?: string;
}

const STATUS_STEPS: Array<{
  key: CustomerOrderStatus;
  stepNumber: number;
  label: string;
  descriptionDelivery: string;
  descriptionPickup: string;
  icon: string;
}> = [
  {
    key: 'pending',
    stepNumber: 1,
    label: 'Recibido',
    descriptionDelivery: 'Tu pedido llegó al mostrador de la tienda.',
    descriptionPickup: 'Tu pedido llegó al mostrador de la tienda.',
    icon: '📋',
  },
  {
    key: 'preparing',
    stepNumber: 2,
    label: 'Alistando',
    descriptionDelivery: 'El tendero está empacando tus productos frescos.',
    descriptionPickup: 'El tendero está empacando tus productos en mostrador.',
    icon: '🛒',
  },
  {
    key: 'ready_or_on_way',
    stepNumber: 3,
    label: 'En Camino / Listo',
    descriptionDelivery: '¡Tu domicilio va en camino a tu dirección!',
    descriptionPickup: '¡Tu mercado está listo para recoger en la tienda!',
    icon: '🛵',
  },
  {
    key: 'completed',
    stepNumber: 4,
    label: 'Entregado',
    descriptionDelivery: 'Pedido entregado. ¡Muchas gracias por tu compra!',
    descriptionPickup: 'Pedido entregado en mostrador. ¡Vuelve pronto!',
    icon: '✅',
  },
];

function getStatusStepIndex(status: CustomerOrderStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'preparing':
      return 1;
    case 'ready_or_on_way':
      return 2;
    case 'completed':
      return 3;
    default:
      return 0;
  }
}

export default function OrderTracking({ token = '', onExit }: OrderTrackingProps) {
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchTracking = async (isPolling = false) => {
    if (!token) {
      setError('No se proporcionó un código de rastreo válido.');
      setLoading(false);
      return;
    }
    if (!isPolling) setLoading(true);

    try {
      const data = await trackCustomerOrder(token);
      let parsedItems = data.order.items;
      if (!parsedItems && data.order.items_json) {
        try {
          parsedItems = JSON.parse(data.order.items_json);
        } catch {
          parsedItems = [];
        }
      }
      setOrder({ ...data.order, items: parsedItems });
      setStore(data.store || null);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (!isPolling) {
        setError(err instanceof Error ? err.message : 'No se pudo consultar el pedido.');
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTracking(false);

    // Sondeo en vivo cada 10 segundos para actualizar el estado sin recargar
    const interval = setInterval(() => {
      void fetchTracking(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-sf-light flex flex-col items-center justify-center p-6 text-center">
        <div className="h-12 w-12 rounded-full border-4 border-sf-primary border-t-transparent animate-spin mb-4" />
        <h2 className="text-xl font-bold text-sf-text">Consultando tu pedido en vivo...</h2>
        <p className="text-sm text-gray-500 mt-1">Conectando con el mostrador de la tienda.</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-sf-light flex flex-col items-center justify-center p-6 text-center">
        <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="text-4xl mb-3">📦</div>
          <h2 className="text-xl font-bold text-sf-text">Pedido no encontrado</h2>
          <p className="text-sm text-gray-600 mt-2">
            {error || 'No encontramos un pedido activo asociado a este enlace.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fetchTracking(false)}
              className="btn-primary min-h-[44px]"
            >
              Reintentar
            </button>
            <a
              href="#/landing"
              className="btn-secondary min-h-[44px]"
            >
              Ir al Inicio
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const currentStepIdx = getStatusStepIndex(order.status);
  const isDelivery = order.delivery_type === 'delivery';

  // Enlace directo a WhatsApp del local (normalizado con código país Colombia 57)
  const rawDigits = (store?.telefono_whatsapp || '').replace(/[^0-9]/g, '');
  const storePhone = rawDigits.length === 10 ? `57${rawDigits}` : rawDigits;
  const whatsappUrl = storePhone
    ? `https://wa.me/${storePhone}?text=${encodeURIComponent(
        `Hola ${store?.nombre || 'SurtiFácil'}, tengo una consulta sobre mi pedido ${order.order_code}.`
      )}`
    : null;

  return (
    <div className="min-h-screen bg-sf-light pb-16">
      {/* Barra Superior */}
      <header className="border-b border-slate-200 bg-sf-dark text-white px-4 py-3 shadow-md">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🛵</span>
            <div>
              <h1 className="text-base font-bold text-white">Rastreo de Pedido en Vivo</h1>
              <p className="text-xs text-slate-300">
                {store?.nombre || 'Tienda de Barrio'} • {store?.barrio || 'Medellín'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>En vivo</span>
            </span>
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition"
                aria-label="Volver"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Tarjeta de Código de Pedido y Estado Actual */}
        <div className="card p-5 sm:p-6 text-center space-y-4 border-2 border-sf-primary/20 bg-gradient-to-b from-white via-white to-blue-50/30">
          <div className="inline-flex items-center gap-2 rounded-full bg-sf-primary/10 px-4 py-1.5 text-xs font-bold text-sf-primary">
            <span>Turno del Pedido:</span>
            <span className="text-sm font-extrabold">{order.order_code}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-sf-text">
            {isCancelled
              ? 'Pedido Cancelado'
              : STATUS_STEPS[currentStepIdx].label}
          </h2>

          <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
            {isCancelled
              ? 'Este pedido fue cancelado en el mostrador. Si tienes dudas, contáctanos por WhatsApp.'
              : isDelivery
              ? STATUS_STEPS[currentStepIdx].descriptionDelivery
              : STATUS_STEPS[currentStepIdx].descriptionPickup}
          </p>

          {/* Stepper Visual de 4 Etapas */}
          {!isCancelled && (
            <div className="pt-4 pb-2">
              <div className="relative flex items-center justify-between max-w-lg mx-auto">
                {/* Línea conectora de fondo */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 z-0" />
                {/* Línea de progreso coloreada */}
                <div
                  className="absolute top-1/2 left-0 h-1 bg-emerald-500 -translate-y-1/2 transition-all duration-500 z-0"
                  style={{ width: `${(currentStepIdx / (STATUS_STEPS.length - 1)) * 100}%` }}
                />

                {STATUS_STEPS.map((step, idx) => {
                  const isPassed = idx <= currentStepIdx;
                  const isCurrent = idx === currentStepIdx;

                  return (
                    <div key={step.key} className="relative z-10 flex flex-col items-center">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold transition-all ${
                          isCurrent
                            ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 scale-110 shadow-md'
                            : isPassed
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white border-2 border-gray-300 text-gray-400'
                        }`}
                      >
                        {isPassed ? step.icon : step.stepNumber}
                      </div>
                      <span
                        className={`mt-2 text-[11px] font-bold text-center ${
                          isCurrent ? 'text-emerald-700' : isPassed ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-[11px] text-gray-400 pt-1">
            Última actualización: {lastUpdated.toLocaleTimeString()} (Sondeo automático cada 10s)
          </div>
        </div>

        {/* Resumen del Pedido y Entrega */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Datos del Cliente y Entrega */}
          <div className="card p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">
              Información de Entrega
            </h3>
            <div className="text-xs space-y-1.5">
              <div>
                <span className="text-gray-500">Cliente:</span>{' '}
                <span className="font-semibold text-sf-text">{order.customer_name}</span>
              </div>
              {order.customer_phone && (
                <div>
                  <span className="text-gray-500">Teléfono:</span>{' '}
                  <span className="font-semibold text-sf-text">{order.customer_phone}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Tipo de Entrega:</span>{' '}
                <span className="font-semibold text-sf-primary">
                  {isDelivery ? '🛵 A Domicilio' : '🏪 Retiro en Mostrador'}
                </span>
              </div>
              {isDelivery && order.delivery_address && (
                <div>
                  <span className="text-gray-500">Dirección:</span>{' '}
                  <span className="font-semibold text-sf-text">{order.delivery_address}</span>
                </div>
              )}
              {order.delivery_neighborhood && (
                <div>
                  <span className="text-gray-500">Barrio:</span>{' '}
                  <span className="font-semibold text-sf-text">{order.delivery_neighborhood}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Medio de Pago:</span>{' '}
                <span className="font-semibold text-sf-text capitalize">
                  {order.payment_method === 'cash'
                    ? '💵 Efectivo'
                    : order.payment_method === 'transfer'
                    ? '📲 Transferencia'
                    : '📒 Fiado'}
                </span>
              </div>
            </div>
          </div>

          {/* Información del Local */}
          <div className="card p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">
              Tu Tienda de Barrio
            </h3>
            <div className="text-xs space-y-1.5">
              <div className="font-bold text-sf-text">{store?.nombre || 'SurtiFácil Abastos'}</div>
              {store?.barrio && <div className="text-gray-600">📍 {store.barrio}</div>}
              {store?.direccion && <div className="text-gray-600">🏠 {store.direccion}</div>}
              {store?.telefono_whatsapp && (
                <div className="text-gray-600">💬 {store.telefono_whatsapp}</div>
              )}
            </div>

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary mt-3 w-full min-h-[40px] text-xs font-semibold bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-1.5"
              >
                <Icon name="chat" size={16} />
                <span>Hablar por WhatsApp con la Tienda</span>
              </a>
            )}
          </div>
        </div>

        {/* Desglose de Productos Comprados */}
        <div className="card p-5 space-y-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">
            Productos de tu Mercado
          </h3>

          <div className="divide-y divide-gray-100">
            {(order.items || []).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sf-text truncate">{item.product_name}</div>
                  <div className="text-[11px] text-gray-500 tabular-nums">
                    {formatCOP(item.unit_price_cents)} × {item.quantity} {item.unit || 'unid'}
                  </div>
                </div>
                <div className="font-bold text-sf-text tabular-nums">
                  {formatCOP(item.subtotal_cents || item.unit_price_cents * item.quantity)}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between text-sm font-bold text-sf-text">
              <span>Total General:</span>
              <span className="text-base text-sf-primary tabular-nums">
                {formatCOP(order.total_cents)}
              </span>
            </div>
          </div>
        </div>

        {/* Botón para volver o hacer otro pedido */}
        <div className="flex justify-center pt-2">
          <a
            href={`#/tienda/${store?.slug || 'surtifacil'}`}
            className="btn-primary min-h-[44px] px-6 text-xs font-bold"
          >
            <span>🛒 Hacer Otro Pedido en {store?.nombre || 'la Tienda'}</span>
          </a>
        </div>
      </main>
    </div>
  );
}

