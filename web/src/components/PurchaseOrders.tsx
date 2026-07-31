import { useEffect, useState } from 'react';
import { PurchaseOrder, OrderStatus, Supplier } from '../firebase/db';
import { getOrders, getSuppliers, createOrder, updateOrderStatus, cancelOrder } from '../services/supplierService';
import PurchaseOrderModal from './PurchaseOrderModal';
import ReceiveOrder from './ReceiveOrder';

const PurchaseOrders = () => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ordersData, suppliersData] = await Promise.all([
        getOrders({
          status: filterStatus !== 'all' ? filterStatus : undefined,
          supplierId: filterSupplier !== 'all' ? filterSupplier : undefined,
        }),
        getSuppliers(),
      ]);
      setOrders(ordersData);
      setSuppliers(suppliersData);
    } catch (err) {
      console.error('Error loading orders:', err);
      setError('Error al cargar órdenes de compra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus, filterSupplier]);

  const formatCents = (cents: number) => `$${(cents / 100).toLocaleString()}`;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const getStatusBadgeStyle = (status: OrderStatus) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'ordered':
        return 'bg-blue-100 text-blue-700';
      case 'partial':
        return 'bg-orange-100 text-orange-700';
      case 'received':
        return 'bg-green-100 text-green-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case 'draft':
        return '✏️ Borrador';
      case 'ordered':
        return '📤 Ordenada';
      case 'partial':
        return '🟠 Parcial';
      case 'received':
        return '✅ Recibida';
      case 'cancelled':
        return '❌ Cancelada';
      default:
        return status;
    }
  };

  const handleOrder = async (orderId: string) => {
    try {
      await updateOrderStatus(orderId, 'ordered');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al ordenar');
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm('¿Estás seguro de cancelar esta orden?')) return;
    try {
      await cancelOrder(orderId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al cancelar');
    }
  };

  const handleReceive = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (order) setReceivingOrder(order);
  };

  const handleSave = async (
    data: {
      supplierId: string;
      supplierName: string;
      items: any[];
      expectedDate?: any;
      notes?: string;
    },
    andOrder: boolean
  ) => {
    try {
      const newOrder = await createOrder(data);
      if (andOrder) {
        await updateOrderStatus(newOrder.id, 'ordered');
      }
      setShowCreateModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al crear orden');
      throw err;
    }
  };

  if (loading && orders.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">📦 Órdenes de Compra</h2>
        <div className="text-center py-8 text-gray-500">Cargando órdenes...</div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sf-text flex items-center gap-2">
          <span>📦</span> Órdenes de Compra
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-sf-primary text-white px-4 py-2 rounded-lg hover:bg-sf-dark font-medium transition flex items-center gap-2"
        >
          <span>➕</span> Nueva Orden
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="flex gap-3 items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Estado:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as OrderStatus | 'all')}
            className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sm"
          >
            <option value="all">Todos</option>
            <option value="draft">Borrador</option>
            <option value="ordered">Ordenada</option>
            <option value="partial">Parcial</option>
            <option value="received">Recibida</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Proveedor:</label>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sm"
          >
            <option value="all">Todos</option>
            {suppliers
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto bg-white shadow-sm rounded-xl border border-gray-200">
        {orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No hay órdenes de compra registradas
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-sf-primary text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Items</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Recibido</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {orders.map((order, index) => (
                <tr
                  key={order.id}
                  className={
                    index % 2 === 0 ? 'bg-white' : 'bg-sf-light hover:bg-gray-50 transition'
                  }
                >
                  <td className="px-4 py-3 text-sm font-mono text-sf-text">
                    {order.id?.slice(0, 6)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-sf-text">
                    {order.supplierName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(order.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-700">
                    {order.items?.reduce((sum, i) => sum + i.quantity, 0) || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-sf-primary">
                    {formatCents(order.total_cents)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    {formatCents(order.received_total_cents || 0)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeStyle(
                        order.status
                      )}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      {(order.status === 'ordered' || order.status === 'partial') && (
                        <button
                          title="Recibir"
                          onClick={() => handleReceive(order.id)}
                          className="px-2 py-1 rounded text-xs hover:bg-green-50 text-green-600 transition"
                        >
                          🟢
                        </button>
                      )}
                      {order.status === 'draft' && (
                        <>
                          <button
                            title="Ordenar"
                            onClick={() => handleOrder(order.id)}
                            className="px-2 py-1 rounded text-xs hover:bg-blue-50 text-blue-600 transition"
                          >
                            📤
                          </button>
                          <button
                            title="Cancelar"
                            onClick={() => handleCancel(order.id)}
                            className="px-2 py-1 rounded text-xs hover:bg-red-50 text-red-600 transition"
                          >
                            ❌
                          </button>
                        </>
                      )}
                      {order.status === 'ordered' && (
                        <button
                          title="Cancelar"
                          onClick={() => handleCancel(order.id)}
                          className="px-2 py-1 rounded text-xs hover:bg-red-50 text-red-600 transition"
                        >
                          ❌
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PurchaseOrderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleSave}
        suppliers={suppliers}
      />

      {receivingOrder && (
        <ReceiveOrder
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onReceived={() => loadData()}
        />
      )}
    </section>
  );
};

export default PurchaseOrders;
