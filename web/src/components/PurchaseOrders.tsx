import { useEffect, useState } from 'react';
import { PurchaseOrder, OrderStatus, Supplier } from '../firebase/db';
import { useIsMobile } from '../hooks/useMediaQuery';
import { getOrders, getSuppliers, createOrder, updateOrderStatus, cancelOrder } from '../services/supplierService';
import PurchaseOrderModal from './PurchaseOrderModal';
import ReceiveOrder from './ReceiveOrder';
import { Icon } from './ui/Icon';
import { PageHeader } from './ui/PageHeader';
import { useConfirm } from './ui/ConfirmDialog';

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

const shortId = (order: PurchaseOrder) => order.id?.slice(0, 6) ?? '';
const itemCount = (order: PurchaseOrder) => order.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;

const PurchaseOrders = () => {
  const isMobile = useIsMobile();
  const { confirm, confirmDialog } = useConfirm();
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
    } catch {
      console.error('Error loading orders');
      setError('Error al cargar órdenes de compra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus, filterSupplier]);

  const handleOrder = async (orderId: string) => {
    try {
      await updateOrderStatus(orderId, 'ordered');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Error al ordenar');
    }
  };

  const handleCancel = async (orderId: string) => {
    const accepted = await confirm({
      title: 'Cancelar orden',
      message: '¿Estás seguro de cancelar esta orden?',
      confirmLabel: 'Cancelar orden',
      cancelLabel: 'Volver',
      danger: true,
    });
    if (!accepted) return;
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

  const canReceive = (order: PurchaseOrder) => order.status === 'ordered' || order.status === 'partial';
  const canOrder = (order: PurchaseOrder) => order.status === 'draft';
  const canCancel = (order: PurchaseOrder) => order.status === 'draft' || order.status === 'ordered';

  const renderCardActions = (order: PurchaseOrder) => {
    if (!canReceive(order) && !canOrder(order) && !canCancel(order)) return null;
    const id = shortId(order);
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {canReceive(order) && (
          <button
            type="button"
            onClick={() => handleReceive(order.id)}
            aria-label={`Recibir orden ${id}`}
            className="btn-success flex-1"
          >
            <Icon name="check" size={18} />
            Recibir
          </button>
        )}
        {canOrder(order) && (
          <button
            type="button"
            onClick={() => handleOrder(order.id)}
            aria-label={`Ordenar orden ${id}`}
            className="btn-primary flex-1"
          >
            <Icon name="truck" size={18} />
            Ordenar
          </button>
        )}
        {canCancel(order) && (
          <button
            type="button"
            onClick={() => handleCancel(order.id)}
            aria-label={`Cancelar orden ${id}`}
            className="btn-secondary flex-1 text-red-600"
          >
            <Icon name="close" size={18} />
            Cancelar
          </button>
        )}
      </div>
    );
  };

  const renderTableActions = (order: PurchaseOrder) => {
    const id = shortId(order);
    return (
      <div className="flex justify-center gap-1">
        {canReceive(order) && (
          <button
            type="button"
            onClick={() => handleReceive(order.id)}
            aria-label={`Recibir orden ${id}`}
            className="icon-btn h-10 w-10 text-green-600 hover:bg-green-50"
          >
            <Icon name="check" size={18} />
          </button>
        )}
        {canOrder(order) && (
          <button
            type="button"
            onClick={() => handleOrder(order.id)}
            aria-label={`Ordenar orden ${id}`}
            className="icon-btn h-10 w-10 text-blue-600 hover:bg-blue-50"
          >
            <Icon name="truck" size={18} />
          </button>
        )}
        {canCancel(order) && (
          <button
            type="button"
            onClick={() => handleCancel(order.id)}
            aria-label={`Cancelar orden ${id}`}
            className="icon-btn h-10 w-10 text-red-600 hover:bg-red-50"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    );
  };

  if (loading && orders.length === 0) {
    return (
      <section className="space-y-4">
        <PageHeader title="Órdenes de Compra" />
        <div className="py-8 text-center text-gray-500">Cargando órdenes...</div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Órdenes de Compra"
        actions={
          <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Icon name="plus" size={18} />
            Nueva Orden
          </button>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="orders-filter-status" className="mb-1 block text-sm font-medium text-gray-700">
            Estado
          </label>
          <select
            id="orders-filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as OrderStatus | 'all')}
            className="input"
          >
            <option value="all">Todos</option>
            <option value="draft">Borrador</option>
            <option value="ordered">Ordenada</option>
            <option value="partial">Parcial</option>
            <option value="received">Recibida</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div>
          <label htmlFor="orders-filter-supplier" className="mb-1 block text-sm font-medium text-gray-700">
            Proveedor
          </label>
          <select
            id="orders-filter-supplier"
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="input"
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

      {orders.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">
          No hay órdenes de compra registradas
        </div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label="Órdenes de compra">
          {orders.map((order) => (
            <li key={order.id} className="card p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sf-text">{order.supplierName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    <span className="font-mono">#{shortId(order)}</span> · {formatDate(order.date)} · {itemCount(order)} items
                  </p>
                </div>
                <span className={`chip ${getStatusBadgeStyle(order.status)}`}>{getStatusLabel(order.status)}</span>
              </div>
              <div className="mt-2 flex items-end justify-between text-sm">
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-semibold text-sf-primary">{formatCents(order.total_cents)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Recibido</p>
                  <p className="font-medium text-gray-700">{formatCents(order.received_total_cents || 0)}</p>
                </div>
              </div>
              {renderCardActions(order)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-sf-primary text-white">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">#</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Proveedor</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Fecha</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Items</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Total</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Recibido</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Estado</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {orders.map((order) => (
                <tr key={order.id} className="transition hover:bg-sf-light">
                  <td className="px-4 py-3 font-mono text-sm text-sf-text">{shortId(order)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-sf-text">{order.supplierName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(order.date)}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-700">{itemCount(order)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-sf-primary">{formatCents(order.total_cents)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">{formatCents(order.received_total_cents || 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`chip ${getStatusBadgeStyle(order.status)}`}>{getStatusLabel(order.status)}</span>
                  </td>
                  <td className="px-4 py-2 text-center">{renderTableActions(order)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      {confirmDialog}
    </section>
  );
};

export default PurchaseOrders;
