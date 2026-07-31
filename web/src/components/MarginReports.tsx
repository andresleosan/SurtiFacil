import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  getMarginSummary,
  getMarginDaily,
  getTopProductsByMargin,
  getMarginByCategory,
  MarginSummary,
  MarginDaily,
  ProductMargin,
  CategoryMargin,
} from '../services/marginService';
import { formatCurrency } from '../services/reportService';

const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FF6B6B', '#4ECDC4'];

const MarginReports = () => {
  const [summary, setSummary] = useState<MarginSummary | null>(null);
  const [dailyMargin, setDailyMargin] = useState<MarginDaily[]>([]);
  const [topByAbsolute, setTopByAbsolute] = useState<ProductMargin[]>([]);
  const [topByPercent, setTopByPercent] = useState<ProductMargin[]>([]);
  const [categoryMargin, setCategoryMargin] = useState<CategoryMargin[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<7 | 14 | 30>(7);

  useEffect(() => {
    loadReportData();
  }, [dateRange]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      const [summaryData, dailyData, topAbsData, topPctData, categoryData] = await Promise.all([
        getMarginSummary(),
        getMarginDaily(dateRange),
        getTopProductsByMargin(10, 'absolute'),
        getTopProductsByMargin(10, 'percent'),
        getMarginByCategory(),
      ]);
      setSummary(summaryData);
      setDailyMargin(dailyData);
      setTopByAbsolute(topAbsData);
      setTopByPercent(topPctData);
      setCategoryMargin(categoryData);
    } catch (error) {
      console.error('Error loading margin reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportTopToCSV = () => {
    const headers = [
      'Ranking',
      'Producto',
      'Unidades',
      'Ingresos',
      'Costo',
      'Margen $',
      'Margen %',
      'Estimado',
    ];
    const rows = topByAbsolute.map((p, idx) => [
      String(idx + 1),
      p.product_name,
      String(p.units_sold),
      String(p.revenue_cents),
      String(p.cost_cents),
      String(p.margin_cents),
      p.margin_percent.toFixed(2),
      p.isEstimated ? '1' : '0',
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((c) => {
      const s = String(c);
      const FORMULA = ['=', '+', '-', '@', '\t', '\r'];
      const needsPrefix = FORMULA.some((ch) => s.startsWith(ch));
      const escaped = s.replace(/"/g, '""').replace(/\n/g, ' ');
      return needsPrefix ? `"'${escaped}"` : `"${escaped}"`;
    }).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `margenes_top10_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderTopTable = (
    rows: ProductMargin[],
    title: string,
    valueKey: 'absolute' | 'percent'
  ) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
      <h3 className="font-semibold mb-4 text-sf-text">{title}</h3>
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
                Unidades
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                Ingresos
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                Costo
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                Margen $
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                Margen %
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                Estimado
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                  Sin datos para este ranking
                </td>
              </tr>
            ) : (
              rows.map((p, index) => (
                <tr key={p.product_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{index + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{p.product_name}</td>
                  <td className="px-4 py-3 text-sm text-right">{p.units_sold}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(p.revenue_cents)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(p.cost_cents)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-sf-primary">
                    {formatCurrency(p.margin_cents)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span
                      className={
                        valueKey === 'percent'
                          ? 'font-semibold text-sf-primary'
                          : 'text-gray-700'
                      }
                    >
                      {p.margin_percent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.isEstimated ? (
                      <span className="inline-block px-2 py-1 text-xs font-semibold bg-yellow-200 text-yellow-900 rounded">
                        estimated
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">📊 Márgenes de Ganancia</h2>
        <div className="text-center py-8 text-gray-500">Cargando márgenes...</div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sf-text flex items-center gap-2">
          <span>📊</span> Márgenes de Ganancia
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
            onClick={exportTopToCSV}
            disabled={topByAbsolute.length === 0}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>📥</span> Exportar CSV
          </button>
        </div>
      </div>

      {/* Tarjetas de KPIs */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Margen Hoy</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {formatCurrency(summary.today.margin_cents)}
            </p>
          </article>
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Margen Semana</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {formatCurrency(summary.thisWeek.margin_cents)}
            </p>
          </article>
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Margen Mes</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {formatCurrency(summary.thisMonth.margin_cents)}
            </p>
          </article>
          <article className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <h3 className="text-sm text-gray-600">Margen Hoy %</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">
              {summary.today.margin_percent.toFixed(1)}%
            </p>
          </article>
        </div>
      )}

      {/* Gráfica diaria de ingresos vs costos */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-semibold mb-4 text-sf-text">Ingresos vs Costos (diario)</h3>
        {dailyMargin.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={dailyMargin}>
              <defs>
                <linearGradient id="marginFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0088FE" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0088FE" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: any) => formatCurrency(Number(value))}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue_cents"
                stroke="#0088FE"
                strokeWidth={2}
                fill="url(#marginFill)"
                name="Ingresos"
              />
              <Line
                type="monotone"
                dataKey="cost_cents"
                stroke="#94a3b8"
                strokeWidth={2}
                dot={false}
                name="Costos"
              />
              <Line
                type="monotone"
                dataKey="margin_cents"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="Margen"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-gray-500">Sin datos de márgenes</div>
        )}
      </div>

      {/* Aviso de costos estimados */}
      {summary && summary.estimatedCostCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-xl p-4 shadow-sm flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold">Costos estimados</p>
            <p className="text-sm">
              {summary.estimatedCostCount} ítem(ns) se calcularon usando fallback
              (precio ÷ 2) porque aún no registran un costo real de compra. Registra
              recepciones de pedidos para obtener márgenes más precisos.
            </p>
            <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold bg-yellow-200 text-yellow-900 rounded">
              estimated
            </span>
          </div>
        </div>
      )}

      {/* Margen por categoría: pie chart + tabla */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold mb-4 text-sf-text">Margen por Categoría</h3>
          {categoryMargin.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryMargin}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, percent }: any) =>
                    `${category} (${(percent * 100).toFixed(0)}%)`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="margin_cents"
                  nameKey="category"
                >
                  {categoryMargin.map((_, index) => (
                    <Cell key={`cat-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatCurrency(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-gray-500">Sin datos por categoría</div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold mb-4 text-sf-text">Detalle por Categoría</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Categoría
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Ingresos
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Costo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Margen $
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Margen %
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {categoryMargin.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                      Sin datos por categoría
                    </td>
                  </tr>
                ) : (
                  categoryMargin.map((c, index) => (
                    <tr key={c.category} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-900">{c.category}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        {formatCurrency(c.revenue_cents)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {formatCurrency(c.cost_cents)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-sf-primary">
                        {formatCurrency(c.margin_cents)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {c.margin_percent.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top 10 por margen absoluto */}
      {renderTopTable(topByAbsolute, 'Top 10 Productos por Margen $', 'absolute')}

      {/* Top 10 por margen porcentual */}
      {renderTopTable(topByPercent, 'Top 10 Productos por Margen %', 'percent')}
    </section>
  );
};

export default MarginReports;
