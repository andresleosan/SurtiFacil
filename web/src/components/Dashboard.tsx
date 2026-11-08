import { useCallback, useEffect, useState } from 'react';
import { getSalesSince, getSalesTotals } from '../services/saleService';
import StockAlerts from './StockAlerts';
import SubscriptionBanner from './SubscriptionBanner';
import SarinBusinessCopilot from './SarinBusinessCopilot';
import CashClosingModal from './CashClosingModal';
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
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [closingModalOpen, setClosingModalOpen] = useState(false);

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setClosingModalOpen(true)}
            className="btn-secondary min-h-[44px] px-3 text-xs font-semibold text-slate-800"
          >
            <span>🔒 Arqueo / Cierre COP</span>
          </button>
          <button type="button" onClick={() => void loadDashboardData()} disabled={loading} className="btn-secondary min-h-[44px] px-3 text-xs font-semibold text-slate-800">
            <Icon name="refresh" size={16} />
            <span>Actualizar</span>
          </button>
        </div>
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
      <SubscriptionBanner />

      {/* Widget Copiloto Gerencial Sarin */}
      <div className="card p-4 bg-gradient-to-r from-slate-900 to-sf-dark text-white border-none shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sf-primary text-2xl shadow-inner">
              🤖
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Sarin Copiloto Gerencial</h3>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  En Línea
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Pregúntale por voz o chat: <em>"¿Cuánto vendimos hoy y cuál es la ganancia?"</em> o <em>"¿Quiénes son los clientes que más deben?"</em>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCopilotOpen(true)}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sf-primary px-4 text-sm font-bold text-white hover:bg-sf-primary/90 transition shadow-sm shrink-0 active:scale-95"
          >
            <span>🎙️ Consultar con Sarin</span>
          </button>
        </div>
      </div>

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

      {/* Modal Asesor Sarin Copiloto */}
      <SarinBusinessCopilot isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} />

      {/* Modal Arqueo y Cierre de Caja COP */}
      <CashClosingModal
        isOpen={closingModalOpen}
        onClose={() => setClosingModalOpen(false)}
        onClosedSuccess={() => void loadDashboardData()}
      />
    </section>
  );
};

export default Dashboard;
