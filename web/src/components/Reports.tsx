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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const Reports = () => {
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
        <h2 className="text-2xl font-bold text-sf-text">📊 Reportes</h2>
        <div className="text-center py-8 text-gray-500">Cargando reportes...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">📊 Reportes</h2>
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sf-text flex items-center gap-2">
          <span>📊</span> Reportes
        </h2>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value) as 7 | 14 | 30)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
          <button
            onClick={exportToCSV}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <span>📥</span> Exportar CSV
          </button>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Ventas Hoy</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {formatCurrency(summary.today)}
            </p>
          </article>
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Esta Semana</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {formatCurrency(summary.thisWeek)}
            </p>
          </article>
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Este Mes</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {formatCurrency(summary.thisMonth)}
            </p>
          </article>
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Promedio por Venta</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {formatCurrency(summary.averageSale)}
            </p>
          </article>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gráfica de ventas diarias */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold mb-4 text-sf-text">Ventas Diarias</h3>
          {dailySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value: any) => formatCurrency(Number(value))}
                  labelFormatter={(label) => `Fecha: ${label}`}
                />
                <Bar dataKey="total" fill="#0088FE" name="Total Ventas" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-gray-500">Sin datos de ventas</div>
          )}
        </div>

        {/* Gráfica de productos más vendidos */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold mb-4 text-sf-text">Productos Más Vendidos</h3>
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={topProducts}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                  outerRadius={100}
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
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-gray-500">Sin datos de productos</div>
          )}
        </div>
      </div>

      {/* Tabla de productos más vendidos */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold mb-4 text-sf-text">Detalle de Productos Más Vendidos</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Producto
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Unidades Vendidas
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Ingresos
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {topProducts.map((product, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{index + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{product.name}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(product.quantity)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-sf-primary">
                    {formatCurrency(product.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default Reports;
