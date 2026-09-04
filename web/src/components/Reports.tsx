import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  getSalesSummary,
  getDailySales,
  getTopProducts,
  SalesSummary,
  DailySales,
  TopProduct,
  formatCurrency,
  formatNumber,
} from '../services/reportService';
import { useIsMobile } from '../hooks/useMediaQuery';
import { PageHeader } from './ui/PageHeader';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

/** Etiqueta corta de eje Y (en pesos) para que no choque en pantallas de 360px. */
const compactCurrency = (cents: number): string => {
  const pesos = cents / 100;
  if (Math.abs(pesos) >= 1_000_000) return `$${(pesos / 1_000_000).toFixed(1)}M`;
  if (Math.abs(pesos) >= 1_000) return `$${Math.round(pesos / 1_000)}k`;
  return `$${Math.round(pesos)}`;
};

const Reports = () => {
  const isMobile = useIsMobile();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<7 | 14 | 30>(7);

  useEffect(() => {
    loadReportData();
  }, [dateRange]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryData, dailyData, topData] = await Promise.all([
        getSalesSummary(),
        getDailySales(dateRange),
        getTopProducts(5),
      ]);
      setSummary(summaryData);
      setDailySales(dailyData);
      setTopProducts(topData);
    } catch {
      console.error('Error loading reports.');
      setError('No se pudieron cargar los reportes.');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Fecha', 'Total', 'Ventas'];
    const rows = dailySales.map(d => [d.date, String(d.total), String(d.count)]);
    const esc = (v: string): string => {
      const FORMULA = ['=', '+', '-', '@', '\t', '\r'];
      const needsPrefix = FORMULA.some((ch) => v.startsWith(ch));
      const escaped = v.replace(/"/g, '""').replace(/\n/g, ' ');
      return needsPrefix ? `"'${escaped}"` : `"${escaped}"`;
    };
    const csvContent = [headers, ...rows].map(row => row.map(esc).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <PageHeader title="Reportes" />
        <div className="py-8 text-center text-gray-500">Cargando reportes...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <PageHeader title="Reportes" />
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 md:space-y-6">
      <PageHeader
        title="Reportes"
        actions={
          <>
            <label htmlFor="reports-range" className="sr-only">Rango de fechas</label>
            <select
              id="reports-range"
              value={dateRange}
              onChange={(e) => setDateRange(Number(e.target.value) as 7 | 14 | 30)}
              className="input w-auto"
            >
              <option value={7}>Últimos 7 días</option>
              <option value={14}>Últimos 14 días</option>
              <option value={30}>Últimos 30 días</option>
            </select>
            <button type="button" onClick={exportToCSV} className="btn-success">
              Exportar CSV
            </button>
          </>
        }
      />

      {/* Tarjetas de resumen */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Ventas Hoy</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {formatCurrency(summary.today)}
            </p>
          </article>
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Esta Semana</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {formatCurrency(summary.thisWeek)}
            </p>
          </article>
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Este Mes</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {formatCurrency(summary.thisMonth)}
            </p>
          </article>
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Promedio por Venta</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {formatCurrency(summary.averageSale)}
            </p>
          </article>
        </div>
      )}

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Gráfica de ventas diarias */}
        <div className="card p-4">
          <h3 className="mb-4 font-semibold text-sf-text">Ventas Diarias</h3>
          {dailySales.length > 0 ? (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySales} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={isMobile ? 48 : 64} tickFormatter={compactCurrency} />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    labelFormatter={(label) => `Fecha: ${label}`}
                  />
                  <Bar dataKey="total" fill="#0088FE" name="Total Ventas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">Sin datos de ventas</div>
          )}
        </div>

        {/* Gráfica de productos más vendidos */}
        <div className="card p-4">
          <h3 className="mb-4 font-semibold text-sf-text">Productos Más Vendidos</h3>
          {topProducts.length > 0 ? (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topProducts}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={isMobile ? false : ({ name, percent }: any) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={isMobile ? 72 : 100}
                    fill="#8884d8"
                    dataKey="quantity"
                    nameKey="name"
                  >
                    {topProducts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => `${value} unidades`}
                  />
                  {isMobile && <Legend wrapperStyle={{ fontSize: 11 }} />}
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">Sin datos de productos</div>
          )}
        </div>
      </div>

      {/* Detalle de productos más vendidos */}
      <div className="card p-4">
        <h3 className="mb-4 font-semibold text-sf-text">Detalle de Productos Más Vendidos</h3>
        {topProducts.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">Sin datos de productos</div>
        ) : isMobile ? (
          <ul className="space-y-2" aria-label="Productos más vendidos">
            {topProducts.map((product, index) => (
              <li key={index} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sf-primary/10 text-sm font-semibold text-sf-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                  <p className="text-xs text-gray-500">{formatNumber(product.quantity)} unidades</p>
                </div>
                <p className="shrink-0 text-sm font-medium text-sf-primary">{formatCurrency(product.revenue)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">#</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Producto</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Unidades Vendidas</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {topProducts.map((product, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{index + 1}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{product.name}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatNumber(product.quantity)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-sf-primary">
                      {formatCurrency(product.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default Reports;
