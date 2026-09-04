import { useEffect, useId, useState } from 'react';
import { PurchaseOrder } from '../firebase/db';
import { useIsMobile } from '../hooks/useMediaQuery';
import { receiveOrderItems, ReceiveItem } from '../services/supplierService';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';

interface ReceiveOrderProps {
  order: PurchaseOrder;
  onClose: () => void;
  onReceived: () => void;
}

type RowInput = { received: number; final_cost: number };

const formatCents = (cents: number) => `$${(cents / 100).toLocaleString()}`;

const ReceiveOrder = ({ order, onClose, onReceived }: ReceiveOrderProps) => {
  const isMobile = useIsMobile();
  const idPrefix = useId();
  const [inputs, setInputs] = useState<Record<number, RowInput>>(() => {
    const init: Record<number, RowInput> = {};
    order.items.forEach((item, idx) => {
      init[idx] = {
        received: 0,
        final_cost: item.unit_cost_cents,
      };
    });
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setError('');
  }, []);

  const updateInput = (idx: number, patch: Partial<RowInput>) => {
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

  const fieldId = (name: string, idx: number) => `${idPrefix}-${name}-${idx}`;
  const itemLabel = (idx: number) => order.items[idx].name || `Producto ${order.items[idx].product_id}`;

  const receivedInput = (idx: number, compact: boolean) => {
    const max = getMaxReceive(idx);
    const value = inputs[idx]?.received || 0;
    const setValue = (next: number) => updateInput(idx, { received: Math.max(0, next) });
    if (compact) {
      return (
        <input
          id={fieldId('received', idx)}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          onChange={(e) => updateInput(idx, { received: parseInt(e.target.value) || 0 })}
          className="input w-24 text-right"
        />
      );
    }
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setValue(value - 1)}
          aria-label={`Disminuir recibida de ${itemLabel(idx)}`}
          className="icon-btn border border-gray-300 bg-white text-sf-text hover:bg-gray-50"
        >
          <Icon name="minus" size={18} />
        </button>
        <input
          id={fieldId('received', idx)}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          onChange={(e) => updateInput(idx, { received: parseInt(e.target.value) || 0 })}
          className="input text-center"
        />
        <button
          type="button"
          onClick={() => setValue(value + 1)}
          aria-label={`Aumentar recibida de ${itemLabel(idx)}`}
          className="icon-btn border border-gray-300 bg-white text-sf-text hover:bg-gray-50"
        >
          <Icon name="plus" size={18} />
        </button>
      </div>
    );
  };

  const costInput = (idx: number, compact: boolean) => (
    <input
      id={fieldId('cost', idx)}
      type="number"
      inputMode="numeric"
      min={0}
      value={inputs[idx]?.final_cost || 0}
      onChange={(e) => updateInput(idx, { final_cost: parseInt(e.target.value) || 0 })}
      className={`input ${compact ? 'w-32 text-right' : ''}`}
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Recepción de Orden"
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !hasAnyReceive || overReceive}
            className="btn-success"
          >
            {loading ? 'Procesando...' : '✅ Confirmar Recepción'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-sf-light p-3">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Proveedor:</span> {order.supplierName}
          </div>
          <div className="text-sm text-gray-700">
            <span className="font-medium">Total pedido:</span> {formatCents(order.total_cents)}
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isMobile ? (
          <ul className="space-y-2" aria-label="Ítems de la orden">
            {order.items.map((item, idx) => {
              const status = getRowStatus(idx);
              const max = getMaxReceive(idx);
              return (
                <li key={idx} className="card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sf-text">
                        {itemLabel(idx)}
                        {item.isNewProduct && <span className="chip ml-2 bg-blue-100 text-blue-700">Nuevo</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Pedida: {item.quantity} · Recibida prev.: {item.received_quantity} · máx: {max}
                      </p>
                    </div>
                    <span className={`chip ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={fieldId('received', idx)} className="mb-1 block text-xs text-gray-600">
                        Nueva recibida
                      </label>
                      {receivedInput(idx, false)}
                    </div>
                    <div>
                      <label htmlFor={fieldId('cost', idx)} className="mb-1 block text-xs text-gray-600">
                        Costo final (centavos)
                      </label>
                      {costInput(idx, false)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Producto</th>
                  <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Pedida</th>
                  <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Recibida prev.</th>
                  <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Nueva recibida</th>
                  <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Costo final (centavos)</th>
                  <th scope="col" className="px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {order.items.map((item, idx) => {
                  const status = getRowStatus(idx);
                  const max = getMaxReceive(idx);
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-sm font-medium text-sf-text">
                        {itemLabel(idx)}
                        {item.isNewProduct && <span className="chip ml-2 bg-blue-100 text-blue-700">Nuevo</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-sm">{item.quantity}</td>
                      <td className="px-3 py-2 text-right text-sm text-gray-600">{item.received_quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <label htmlFor={fieldId('received', idx)} className="sr-only">
                          Nueva recibida de {itemLabel(idx)}
                        </label>
                        <div className="flex flex-col items-end">
                          {receivedInput(idx, true)}
                          <div className="mt-1 text-xs text-gray-500">máx: {max}</div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <label htmlFor={fieldId('cost', idx)} className="sr-only">
                          Costo final de {itemLabel(idx)}
                        </label>
                        <div className="flex justify-end">{costInput(idx, true)}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`chip ${status.className}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ReceiveOrder;
