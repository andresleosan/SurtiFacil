import { useEffect, useRef, useState } from 'react';
import {
  getCustomerOrders,
  convertOrderToSale,
  updateCustomerOrderStatus,
} from '../services/customerOrderService';
import { onDataChange } from '../services/apiClient';
import type { CustomerOrder } from '../types/customerOrder';
import { formatCentsCOP } from '../utils/currency';
import { playNewOrderChime } from '../utils/audioAlerts';
import { notifyNewCustomerOrder } from '../services/notificationService';
import { Icon } from './ui/Icon';

interface LiveOrdersTrayProps {
  onLoadOrderToCart?: (order: CustomerOrder) => void;
  onSaleCreated?: () => void;
}

export function LiveOrdersTray({ onLoadOrderToCart, onSaleCreated }: LiveOrdersTrayProps) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const prevPendingIdsRef = useRef<Set<string>>(new Set());

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const fetched = await getCustomerOrders();
      setOrders(fetched);
      setError(null);

      // Detectar si hay pedidos nuevos con status 'pending' para tocar el timbre y emitir notificación
      const currentPending = fetched.filter((o) => o.status === 'pending');
      const currentPendingIds = new Set(currentPending.map((o) => o.id));

      if (prevPendingIdsRef.current.size > 0) {
        let newestOrder: CustomerOrder | null = null;
        for (const o of currentPending) {
          if (!prevPendingIdsRef.current.has(o.id)) {
            newestOrder = o;
            break;
          }
        }
        if (newestOrder) {
          void notifyNewCustomerOrder({
            order_code: newestOrder.order_code,
            customer_name: newestOrder.customer_name,
            total_cents: newestOrder.total_cents,
            source: newestOrder.source as any,
          });
        }
      }

      prevPendingIdsRef.current = currentPendingIds;
    } catch (err: unknown) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Error al cargar pedidos.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders(false);

    // Sondeo de mostrador cada 10 segundos
    const interval = setInterval(() => {
      void fetchOrders(true);
    }, 10000);

    // Escucha de bus reactivo
    const unsubscribe = onDataChange('sales', () => {
      void fetchOrders(true);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const handleFastInvoice = async (order: CustomerOrder) => {
    try {
      setActionLoadingId(order.id);
      const res = await convertOrderToSale(order.id);
      setSuccessMessage(`✅ ${order.order_code} facturado exitosamente.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchOrders(true);
      if (onSaleCreated) onSaleCreated();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al facturar pedido.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStatusChange = async (orderId: string, nextStatus: any) => {
    try {
      setActionLoadingId(orderId);
      await updateCustomerOrderStatus(orderId, nextStatus);
      await fetchOrders(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error actualizando estado.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'preparing');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <h2 className="text-lg font-bold text-sf-text">
            Bandeja de Pedidos en Vivo ({pendingOrders.length})
          </h2>
        </div>

        <button
          type="button"
          onClick={() => fetchOrders(false)}
          className="icon-btn text-slate-500 hover:text-sf-primary"
          aria-label="Actualizar pedidos"
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>

      {successMessage && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Verificando pedidos del kiosco...</p>
      ) : pendingOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-slate-400">
          <span className="text-3xl mb-1 block">🛎️</span>
          <p className="text-sm font-semibold text-slate-600">No hay turnos pendientes en este momento</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Los pedidos del Kiosco iPad afuera del local o de la vitrina web sonarán aquí al instante.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingOrders.map((order) => {
            const isLoading = actionLoadingId === order.id;
            const items = order.items || [];

            return (
              <div
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sf-primary/60 transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-xl bg-sf-primary/10 border border-sf-primary/30 px-3 py-1 font-black text-sf-primary text-base tracking-wide">
                      {order.order_code}
                    </span>
                    <span
                      className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                        order.source === 'kiosk'
                          ? 'bg-purple-100 text-purple-700'
                          : order.source === 'whatsapp'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {order.source === 'kiosk'
                        ? '🖥️ Kiosco iPad'
                        : order.source === 'whatsapp'
                        ? '💬 WhatsApp'
                        : '🌐 Tienda Web'}
                    </span>
                  </div>

                  <span className="text-lg font-black text-slate-900 tabular-nums">
                    {formatCentsCOP(order.total_cents)}
                  </span>
                </div>

                <div className="text-sm font-bold text-slate-800 mb-1">
                  Cliente: <span className="font-semibold text-slate-700">{order.customer_name}</span>
                  {order.customer_phone && (
                    <span className="ml-2 font-normal text-xs text-slate-500">({order.customer_phone})</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-500 mb-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    {order.delivery_type === 'delivery' ? '🛵 Domicilio' : '🏪 En Mostrador'}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 capitalize">
                    {order.payment_method === 'cash'
                      ? '💵 Efectivo'
                      : order.payment_method === 'transfer'
                      ? '📱 Transferencia'
                      : '📒 Fiado'}
                  </span>
                  {order.delivery_address && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 truncate max-w-xs">
                      📍 {order.delivery_address}
                    </span>
                  )}
                </div>

                {/* Ítems del pedido */}
                <div className="rounded-xl bg-slate-50 p-2.5 mb-3 text-xs divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <div key={idx} className="py-1 flex justify-between items-center">
                      <span className="font-medium text-slate-700">
                        {item.quantity}× {item.product_name}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        {formatCentsCOP(item.subtotal_cents || item.unit_price_cents * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Botones de acción */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleFastInvoice(order)}
                    className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-sm shadow-sm transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Icon name="check" size={18} />
                    <span>Facturar y Despachar</span>
                  </button>

                  {onLoadOrderToCart && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onLoadOrderToCart(order)}
                      title="Cargar al carrito del mostrador para editar ítems"
                      className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cargar a Carrito
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleStatusChange(order.id, 'cancelled')}
                    title="Cancelar pedido"
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 p-2 text-slate-400 hover:text-red-600 hover:border-red-200 transition flex items-center justify-center"
                    aria-label={`Cancelar pedido ${order.order_code}`}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
