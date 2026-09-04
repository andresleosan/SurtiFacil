import { useCallback, useEffect, useState } from 'react';
import { Sale } from '../firebase/db';
import { getRecentSales } from '../services/saleService';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Icon } from './ui/Icon';
import { PageHeader } from './ui/PageHeader';

const PAGE_SIZE = 50;

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatDate = (timestamp: any) => {
  if (!timestamp) return 'N/A';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: '💵 Efectivo',
  card: '💳 Tarjeta',
  other: '📱 Otro',
  credit: '📒 Fiado',
};

const getPaymentMethodLabel = (method: string) => PAYMENT_LABELS[method] ?? method;

const Sales = () => {
  const isMobile = useIsMobile();
  const [sales, setSales] = useState<Sale[]>([]);
  const [cursor, setCursor] = useState<unknown | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const page = await getRecentSales(PAGE_SIZE);
      setSales(page.sales);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch {
      console.error('Error loading sales.');
      setError('Error al cargar historial de ventas');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    try {
      setLoadingMore(true);
      const page = await getRecentSales(PAGE_SIZE, cursor);
      setSales((current) => [...current, ...page.sales]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch {
      console.error('Error loading more sales.');
      setError('Error al cargar más ventas');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const toggleExpanded = (saleId: string) => {
    setExpandedSaleId((current) => (current === saleId ? null : saleId));
  };

  const header = (
    <PageHeader
      title="Historial de ventas"
      actions={
        <button type="button" onClick={() => void loadFirstPage()} disabled={loading} className="btn-secondary">
          <Icon name="refresh" size={18} />
          Actualizar
        </button>
      }
    />
  );

  if (loading && sales.length === 0) {
    return (
      <section className="space-y-4">
        {header}
        <div className="py-8 text-center text-gray-500">Cargando ventas...</div>
      </section>
    );
  }

  if (error && sales.length === 0) {
    return (
      <section className="space-y-4">
        {header}
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {header}

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {sales.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">No hay ventas registradas</div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label="Ventas">
          {sales.map((sale) => {
            const expanded = expandedSaleId === sale.id;
            return (
              <li key={sale.id} className="card">
                <button
                  type="button"
                  onClick={() => toggleExpanded(sale.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-sf-text">{formatDate(sale.date)}</p>
                    <p className="text-xs text-gray-500">
                      {sale.items?.length || 0} {sale.items?.length === 1 ? 'producto' : 'productos'} · {getPaymentMethodLabel(sale.payment_method)}
                    </p>
                  </div>
                  <span className="font-semibold text-sf-primary">{formatPrice(sale.total)}</span>
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} className="text-gray-400" size={18} />
                </button>
                {expanded && <SaleDetails sale={sale} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-sf-primary text-white">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">ID</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">Fecha</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide">Items</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide">Total</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">Método</th>
                  <th scope="col" className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sales.map((sale) => {
                  const expanded = expandedSaleId === sale.id;
                  return (
                    <tr key={sale.id} className="transition hover:bg-sf-light">
                      <td className="px-4 py-2 font-mono text-sm text-sf-text">{sale.id?.slice(0, 8)}</td>
                      <td className="px-4 py-2 text-sm text-sf-text">{formatDate(sale.date)}</td>
                      <td className="px-4 py-2 text-right text-sm text-sf-text">{sale.items?.length || 0}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-sf-primary">{formatPrice(sale.total)}</td>
                      <td className="px-4 py-2 text-sm text-sf-text">{getPaymentMethodLabel(sale.payment_method)}</td>
                      <td className="px-4 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(sale.id)}
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Ocultar detalles' : 'Ver detalles'}
                          className="icon-btn h-10 w-10 text-sf-primary hover:bg-sf-light"
                        >
                          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {expandedSaleId && (() => {
            const selected = sales.find((sale) => sale.id === expandedSaleId);
            return selected ? <SaleDetails sale={selected} /> : null;
          })()}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-secondary">
            {loadingMore ? 'Cargando...' : 'Cargar más ventas'}
          </button>
        </div>
      )}
    </section>
  );
};

function SaleDetails({ sale }: { sale: Sale }) {
  return (
    <div className="space-y-3 border-t border-gray-200 bg-sf-light px-4 py-4">
      <h4 className="font-semibold text-sf-text">Detalles de la venta</h4>
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <dt className="text-gray-600">ID Venta</dt>
          <dd className="break-all font-mono text-sf-text">{sale.id}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Fecha</dt>
          <dd className="text-sf-text">{formatDate(sale.date)}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Método de pago</dt>
          <dd className="text-sf-text">{getPaymentMethodLabel(sale.payment_method)}</dd>
        </div>
        <div>
          <dt className="text-gray-600">Total</dt>
          <dd className="text-lg font-bold text-sf-primary">{formatPrice(sale.total)}</dd>
        </div>
      </dl>
      <div>
        <h5 className="mb-2 text-sm font-semibold text-sf-text">Productos</h5>
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {sale.items?.map((item, index) => (
            <li key={`${item.product_id}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-sf-text">{item.product_name}</p>
                <p className="text-xs text-gray-500">
                  {item.quantity} × {formatPrice(item.price_cents)}
                </p>
              </div>
              <span className="font-medium text-sf-primary">{formatPrice(item.subtotal)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default Sales;
