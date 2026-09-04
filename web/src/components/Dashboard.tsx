import { useCallback, useEffect, useState } from 'react';
import { getSalesSince, getSalesTotals } from '../services/saleService';
import StockAlerts from './StockAlerts';
import { Icon } from './ui/Icon';
import { PageHeader } from './ui/PageHeader';

interface DashboardMetrics {
  todayCents: number;
  weekCents: number;
  totalCents: number;
  totalCount: number;
  topProducts: string[];
}

const EMPTY_METRICS: DashboardMetrics = {
  todayCents: 0,
  weekCents: 0,
  totalCents: 0,
  totalCount: 0,
  topProducts: [],
};

function saleDate(value: any): Date {
  return value?.toDate ? value.toDate() : new Date(value);
}

const Dashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

      // Solo se descargan las ventas de la semana; el histórico llega agregado desde el servidor.
      const [weekSales, totals] = await Promise.all([getSalesSince(startOfWeek), getSalesTotals()]);

      const todayCents = weekSales
        .filter((sale) => saleDate(sale.date) >= startOfToday)
        .reduce((sum, sale) => sum + sale.total, 0);
      const weekCents = weekSales.reduce((sum, sale) => sum + sale.total, 0);

      const productCounts = new Map<string, number>();
      weekSales.forEach((sale) => {
        sale.items?.forEach((item) => {
          productCounts.set(item.product_name, (productCounts.get(item.product_name) || 0) + item.quantity);
        });
      });
      const topProducts = [...productCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      setMetrics({
        todayCents,
        weekCents,
        totalCents: totals.totalCents,
        totalCount: totals.count,
        topProducts,
      });
    } catch {
      console.error('Error loading dashboard.');
      setError('No se pudieron cargar los datos del panel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
    // Refresca al volver a la pestaña o a la app instalada, sin sondeo continuo.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadDashboardData();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadDashboardData]);

  const formatCents = (cents: number) => `$${(cents / 100).toLocaleString()}`;

  const stats = [
    { title: 'Ventas hoy', value: formatCents(metrics.todayCents) },
    { title: 'Ventas semana', value: formatCents(metrics.weekCents) },
    { title: 'Más vendidos (semana)', value: metrics.topProducts.length > 0 ? metrics.topProducts.join(', ') : 'Sin datos' },
    { title: 'Ingresos totales', value: formatCents(metrics.totalCents) },
  ];

  const header = (
    <PageHeader
      title="Panel de Control"
      actions={
        <button type="button" onClick={() => void loadDashboardData()} disabled={loading} className="btn-secondary">
          <Icon name="refresh" size={18} />
          Actualizar
        </button>
      }
    />
  );

  if (error) {
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
      {loading && (
        <p className="text-sm text-gray-500" role="status">Cargando datos...</p>
      )}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {stats.map((card) => (
          <article key={card.title} className="card p-3 transition hover:shadow-md md:p-4">
            <h3 className="text-xs text-gray-600 md:text-sm">{card.title}</h3>
            <p className="mt-1 break-words text-lg font-semibold text-sf-primary md:mt-2 md:text-xl">{card.value}</p>
          </article>
        ))}
      </div>
      <div className="card p-4">
        <h3 className="mb-2 font-semibold text-sf-text">Resumen del negocio</h3>
        <p className="mb-3 text-sm text-gray-600">
          {metrics.totalCount} ventas registradas en total
        </p>
        <a
          href="#/reports"
          onClick={(event) => {
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('navigate', { detail: 'reports' }));
          }}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-sf-primary hover:text-sf-dark"
        >
          📊 Ver reportes completos →
        </a>
      </div>

      <StockAlerts />
    </section>
  );
};

export default Dashboard;
