import { useEffect, useMemo, useState } from 'react';
import { getRestockSuggestions, RestockSuggestion, Urgency } from '../services/restockService';
import { formatCurrency } from '../services/reportService';
import { Supplier } from '../firebase/db';
import PurchaseOrderModal from './PurchaseOrderModal';
import { createOrder, getSuppliers } from '../services/supplierService';

const URGENCY_LABELS: Record<Urgency, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
};

const URGENCY_BADGE: Record<Urgency, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

const ALL_URGENCIES: Urgency[] = ['critical', 'high', 'medium', 'low'];

function formatDays(value: number): string {
  if (!isFinite(value)) return '—';
  return value.toFixed(1);
}

const Restock = () => {
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterUrgencies, setFilterUrgencies] = useState<Urgency[]>([...ALL_URGENCIES]);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderInitial, setOrderInitial] = useState<Array<{ product_id: string; quantity: number; unit_cost_cents: number }> | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orderSupplierId, setOrderSupplierId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [data, suppliersData] = await Promise.all([
          getRestockSuggestions(),
          getSuppliers(),
        ]);
        if (!cancelled) {
          setSuggestions(data);
          setSuppliers(suppliersData);
        }
      } catch (error) {
        console.error('Error loading restock data:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of suggestions) {
      if (s.category) set.add(s.category);
    }
    return Array.from(set).sort();
  }, [suggestions]);

  const filteredSuggestions = useMemo(() => {
    const sorted = [...suggestions].sort((a, b) => {
      if (a.days_remaining === Infinity && b.days_remaining !== Infinity) return 1;
      if (b.days_remaining === Infinity && a.days_remaining !== Infinity) return -1;
      if (a.days_remaining === Infinity && b.days_remaining === Infinity) return 0;
      return a.days_remaining - b.days_remaining;
    });
    return sorted.filter((s) => {
      if (filterCategory && s.category !== filterCategory) return false;
      if (!filterUrgencies.includes(s.urgency)) return false;
      return true;
    });
  }, [suggestions, filterCategory, filterUrgencies]);

  const criticalCount = useMemo(
    () => suggestions.filter((s) => s.urgency === 'critical').length,
    [suggestions]
  );
  const highCount = useMemo(
    () => suggestions.filter((s) => s.urgency === 'high').length,
    [suggestions]
  );
  const noSupplierCount = useMemo(
    () => suggestions.filter((s) => s.supplier_id === null).length,
    [suggestions]
  );
  const totalEstimatedCents = useMemo(
    () =>
      suggestions
        .filter((s) => s.supplier_id !== null)
        .reduce((sum, s) => sum + s.estimated_cost_cents, 0),
    [suggestions]
  );

  const toggleUrgency = (urgency: Urgency) => {
    setFilterUrgencies((prev) =>
      prev.includes(urgency) ? prev.filter((u) => u !== urgency) : [...prev, urgency]
    );
  };

  const handleCreateOrder = (suggestion: RestockSuggestion) => {
    if (!suggestion.supplier_id) return;
    setOrderSupplierId(suggestion.supplier_id);
    const unitCost = suggestion.suggested_quantity > 0
      ? Math.floor(suggestion.estimated_cost_cents / suggestion.suggested_quantity)
      : 0;
    setOrderInitial([{
      product_id: suggestion.product_id,
      quantity: suggestion.suggested_quantity,
      unit_cost_cents: unitCost,
    }]);
    setOrderModalOpen(true);
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">Reposición Sugerida</h2>
        <div className="text-center py-8 text-gray-500">Cargando sugerencias...</div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sf-text">Reposición Sugerida</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <h3 className="text-sm text-gray-600">Críticos</h3>
          <p className="text-xl font-semibold text-red-600 mt-2">{criticalCount}</p>
        </article>
        <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <h3 className="text-sm text-gray-600">Altos</h3>
          <p className="text-xl font-semibold text-orange-600 mt-2">{highCount}</p>
        </article>
        <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <h3 className="text-sm text-gray-600">Sin proveedor</h3>
          <p className="text-xl font-semibold text-gray-700 mt-2">{noSupplierCount}</p>
        </article>
        <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <h3 className="text-sm text-gray-600">Total estimado</h3>
          <p className="text-xl font-semibold text-sf-primary mt-2">
            {formatCurrency(totalEstimatedCents)}
          </p>
        </article>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Urgencia</label>
            <div className="flex gap-3 flex-wrap">
              {ALL_URGENCIES.map((u) => (
                <label key={u} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={filterUrgencies.includes(u)}
                    onChange={() => toggleUrgency(u)}
                    className="rounded border-gray-300 text-sf-primary focus:ring-sf-primary"
                  />
                  {URGENCY_LABELS[u]}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold mb-4 text-sf-text">Sugerencias</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Producto
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Categoría
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Stock
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Vel (ud/día)
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Días restantes
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Sugerido
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Costo estimado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Urgencia
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredSuggestions.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    No hay sugerencias que mostrar
                  </td>
                </tr>
              ) : (
                filteredSuggestions.map((s) => (
                  <tr key={s.product_id} className="bg-white">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {s.product_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {s.category ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {s.current_stock}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {s.velocity_per_day.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {formatDays(s.days_remaining)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {s.suggested_quantity}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-sf-primary">
                      {formatCurrency(s.estimated_cost_cents)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_BADGE[s.urgency]}`}
                        >
                          {URGENCY_LABELS[s.urgency]}
                        </span>
                        {s.supplier_id === null && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Sin proveedor
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        type="button"
                        disabled={s.supplier_id === null}
                        onClick={() => handleCreateOrder(s)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-sf-primary text-white hover:opacity-90 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Crear orden
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PurchaseOrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        suppliers={suppliers.filter((s) => s.id === orderSupplierId)}
        initialItems={orderInitial ?? undefined}
        onSave={(data) => {
          createOrder(data).then(() => {
            setOrderModalOpen(false);
          });
        }}
      />
    </section>
  );
};

export default Restock;
