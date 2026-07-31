import { useEffect, useState } from 'react';
import { PurchaseOrder } from '../firebase/db';
import { receiveOrderItems, ReceiveItem } from '../services/supplierService';

interface ReceiveOrderProps {
  order: PurchaseOrder;
  onClose: () => void;
  onReceived: () => void;
}

const ReceiveOrder = ({ order, onClose, onReceived }: ReceiveOrderProps) => {
  const [inputs, setInputs] = useState<Record<number, { received: number; final_cost: number }>>(
    () => {
      const init: Record<number, { received: number; final_cost: number }> = {};
      order.items.forEach((item, idx) => {
        init[idx] = {
          received: 0,
          final_cost: item.unit_cost_cents,
        };
      });
      return init;
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setError('');
  }, []);

  const formatCents = (cents: number) => `$${(cents / 100).toLocaleString()}`;

  const updateInput = (idx: number, patch: Partial<{ received: number; final_cost: number }>) => {
    setInputs({ ...inputs, [idx]: { ...inputs[idx], ...patch } });
  };

  const getMaxReceive = (idx: number) => {
    const item = order.items[idx];
    return item.quantity - item.received_quantity;
  };

  const getRowStatus = (idx: number): { label: string; className: string } => {
    const item = order.items[idx];
    const input = inputs[idx]?.received || 0;
    const cumulative = item.received_quantity + input;
    if (cumulative >= item.quantity && item.quantity > 0) {
      return { label: '✅ Completo', className: 'bg-green-100 text-green-700' };
    }
    if (cumulative > 0) {
      return { label: '🟠 Parcial', className: 'bg-orange-100 text-orange-700' };
    }
    return { label: '⚪ Pendiente', className: 'bg-gray-100 text-gray-700' };
  };

  const hasAnyReceive = order.items.some((_, idx) => (inputs[idx]?.received || 0) > 0);
  const overReceive = order.items.some((_, idx) => {
    const input = inputs[idx]?.received || 0;
    return input > getMaxReceive(idx);
  });

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const receives: ReceiveItem[] = order.items
        .map((_, idx) => ({
          index: idx,
          received_quantity: inputs[idx]?.received || 0,
          final_cost_cents: inputs[idx]?.final_cost || 0,
        }))
        .filter((r) => r.received_quantity > 0);

      if (receives.length === 0) {
        setError('Debes recibir al menos un ítem');
        setLoading(false);
        return;
      }

      await receiveOrderItems(order.id, receives);
      onReceived();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al confirmar recepción');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-sf-text flex items-center gap-2">
            <span>📥</span> Recepción de Orden
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">
            ×
          </button>
        </div>

        <div className="mb-4 p-3 bg-sf-light rounded-lg border border-gray-200">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Proveedor:</span> {order.supplierName}
          </div>
          <div className="text-sm text-gray-700">
            <span className="font-medium">Total pedido:</span> {formatCents(order.total_cents)}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                  Producto
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                  Pedida
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                  Recibida prev.
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                  Nueva recibida
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                  Costo final (centavos)
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {order.items.map((item, idx) => {
                const status = getRowStatus(idx);
                const max = getMaxReceive(idx);
                return (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-sm font-medium text-sf-text">
                      {item.name || `Producto ${item.product_id}`}
                      {item.isNewProduct && (
                        <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                          Nuevo
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-sm text-right text-gray-600">
                      {item.received_quantity}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={max}
                        value={inputs[idx]?.received || 0}
                        onChange={(e) =>
                          updateInput(idx, { received: parseInt(e.target.value) || 0 })
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-sf-primary"
                      />
                      <div className="text-xs text-gray-500 mt-1">máx: {max}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={inputs[idx]?.final_cost || 0}
                        onChange={(e) =>
                          updateInput(idx, { final_cost: parseInt(e.target.value) || 0 })
                        }
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-sf-primary"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !hasAnyReceive || overReceive}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Procesando...' : '✅ Confirmar Recepción'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiveOrder;
