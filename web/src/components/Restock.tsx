import { useEffect, useMemo, useState } from 'react';
import { getRestockSuggestions, RestockSuggestion, Urgency } from '../services/restockService';
import { formatCurrency } from '../services/reportService';
import { Supplier } from '../firebase/db';
import { useIsMobile } from '../hooks/useMediaQuery';
import PurchaseOrderModal from './PurchaseOrderModal';
import { createOrder, getSuppliers } from '../services/supplierService';
import { PageHeader } from './ui/PageHeader';

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
  const isMobile = useIsMobile();
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      } catch {
        console.error('Error loading restock data');
        if (!cancelled) setError('Error al cargar sugerencias');
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

  const urgencyChips = (s: RestockSuggestion) => (
    <div className="flex flex-wrap gap-1">
      <span className={`chip rounded-full ${URGENCY_BADGE[s.urgency]}`}>{URGENCY_LABELS[s.urgency]}</span>
      {s.supplier_id === null && (
        <span className="chip rounded-full bg-gray-100 text-gray-700">Sin proveedor</span>
      )}
    </div>
  );

  const createOrderButton = (s: RestockSuggestion, className = '') => (
    <button
      type="button"
      disabled={s.supplier_id === null}
      onClick={() => handleCreateOrder(s)}
      aria-label={`Crear orden para ${s.product_name}`}
      className={`btn-primary disabled:bg-gray-300 ${className}`}
    >
      Crear orden
    </button>
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <PageHeader title="Reposición Sugerida" />
        <div className="py-8 text-center text-gray-500">Cargando sugerencias...</div>
      </section>
    );
  }

  return (
    <section className="space-y-4 md:space-y-6">
      <PageHeader title="Reposición Sugerida" />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <article className="card p-4">
          <h3 className="text-sm text-gray-600">Críticos</h3>
          <p className="mt-2 text-xl font-semibold text-red-600">{criticalCount}</p>
        </article>
        <article className="card p-4">
          <h3 className="text-sm text-gray-600">Altos</h3>
          <p className="mt-2 text-xl font-semibold text-orange-600">{highCount}</p>
        </article>
        <article className="card p-4">
          <h3 className="text-sm text-gray-600">Sin proveedor</h3>
          <p className="mt-2 text-xl font-semibold text-gray-700">{noSupplierCount}</p>
        </article>
        <article className="card p-4">
          <h3 className="text-sm text-gray-600">Total estimado</h3>
          <p className="mt-2 truncate text-xl font-semibold text-sf-primary">
            {formatCurrency(totalEstimatedCents)}
          </p>
        </article>
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="sm:w-56">
            <label htmlFor="restock-filter-category" className="mb-1 block text-sm font-medium text-gray-700">
              Categoría
            </label>
            <select
              id="restock-filter-category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="min-w-0">
            <legend className="mb-1 block text-sm font-medium text-gray-700">Urgencia</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {ALL_URGENCIES.map((u) => (
                <label key={u} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={filterUrgencies.includes(u)}
                    onChange={() => toggleUrgency(u)}
                    className="h-5 w-5 rounded border-gray-300 text-sf-primary focus:ring-sf-primary"
                  />
                  {URGENCY_LABELS[u]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-sf-text">Sugerencias</h3>
        {filteredSuggestions.length === 0 ? (
          <div className="card py-8 text-center text-sm text-gray-500">No hay sugerencias que mostrar</div>
        ) : isMobile ? (
          <ul className="space-y-2" aria-label="Sugerencias de reposición">
            {filteredSuggestions.map((s) => (
              <li key={s.product_id} className="card p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">{s.product_name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{s.category ?? '—'}</p>
                  </div>
                  {urgencyChips(s)}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Stock</dt>
                    <dd className="font-medium text-gray-700">{s.current_stock}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Vel (ud/día)</dt>
                    <dd className="font-medium text-gray-700">{s.velocity_per_day.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Días restantes</dt>
                    <dd className="font-medium text-gray-700">{formatDays(s.days_remaining)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Sugerido</dt>
                    <dd className="font-medium text-gray-700">{s.suggested_quantity}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Costo estimado</p>
                    <p className="font-semibold text-sf-primary">{formatCurrency(s.estimated_cost_cents)}</p>
                  </div>
                  {createOrderButton(s)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Producto</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Categoría</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Stock</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Vel (ud/día)</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Días restantes</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Sugerido</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Costo estimado</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Urgencia</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredSuggestions.map((s) => (
                  <tr key={s.product_id} className="bg-white">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.product_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">{s.current_stock}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">{s.velocity_per_day.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">{formatDays(s.days_remaining)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">{s.suggested_quantity}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-sf-primary">{formatCurrency(s.estimated_cost_cents)}</td>
                    <td className="px-4 py-3 text-sm">{urgencyChips(s)}</td>
                    <td className="px-4 py-2 text-sm">{createOrderButton(s, 'min-h-[40px] px-3')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PurchaseOrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        suppliers={suppliers.filter((s) => s.id === orderSupplierId)}
        initialItems={orderInitial ?? undefined}
        onSave={(data) => {
          createOrder(data)
            .then(() => {
              setOrderModalOpen(false);
            })
            .catch(() => {
              setError('Error al crear orden');
            });
        }}
      />
    </section>
  );
};

export default Restock;
