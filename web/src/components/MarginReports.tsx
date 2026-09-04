import { useEffect, useState } from 'react';
import {
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
import { useIsMobile } from '../hooks/useMediaQuery';
import { PageHeader } from './ui/PageHeader';

const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FF6B6B', '#4ECDC4'];

/** Etiqueta corta de eje Y (en pesos) para que no choque en pantallas de 360px. */
const compactCurrency = (cents: number): string => {
  const pesos = cents / 100;
  if (Math.abs(pesos) >= 1_000_000) return `$${(pesos / 1_000_000).toFixed(1)}M`;
  if (Math.abs(pesos) >= 1_000) return `$${Math.round(pesos / 1_000)}k`;
  return `$${Math.round(pesos)}`;
};

const EstimatedChip = () => (
  <span className="chip bg-yellow-200 font-semibold text-yellow-900">estimated</span>
);

const MarginReports = () => {
  const isMobile = useIsMobile();
  const [summary, setSummary] = useState<MarginSummary | null>(null);
  const [dailyMargin, setDailyMargin] = useState<MarginDaily[]>([]);
  const [topByAbsolute, setTopByAbsolute] = useState<ProductMargin[]>([]);
  const [topByPercent, setTopByPercent] = useState<ProductMargin[]>([]);
  const [categoryMargin, setCategoryMargin] = useState<CategoryMargin[]>([]);
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
    } catch {
      console.error('Error loading margin reports.');
      setError('No se pudieron cargar los márgenes.');
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
    <div className="card p-4">
      <h3 className="mb-4 font-semibold text-sf-text">{title}</h3>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">Sin datos para este ranking</div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label={title}>
          {rows.map((p, index) => (
            <li key={p.product_id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sf-primary/10 text-sm font-semibold text-sf-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{p.product_name}</p>
                  <p className="text-xs text-gray-500">{p.units_sold} unidades</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-sf-primary">{formatCurrency(p.margin_cents)}</p>
                  <p className={`text-xs ${valueKey === 'percent' ? 'font-semibold text-sf-primary' : 'text-gray-700'}`}>
                    {p.margin_percent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-gray-600">
                <div className="flex justify-between">
                  <dt>Ingresos</dt>
                  <dd className="font-medium text-gray-900">{formatCurrency(p.revenue_cents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Costo</dt>
                  <dd className="font-medium text-gray-900">{formatCurrency(p.cost_cents)}</dd>
                </div>
              </dl>
              {p.isEstimated && <div className="mt-2"><EstimatedChip /></div>}
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
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Unidades</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Ingresos</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Costo</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Margen $</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Margen %</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-600">Estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((p, index) => (
                <tr key={p.product_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{index + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{p.product_name}</td>
                  <td className="px-4 py-3 text-right text-sm">{p.units_sold}</td>
                  <td className="px-4 py-3 text-right text-sm">{formatCurrency(p.revenue_cents)}</td>
                  <td className="px-4 py-3 text-right text-sm">{formatCurrency(p.cost_cents)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-sf-primary">
                    {formatCurrency(p.margin_cents)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className={valueKey === 'percent' ? 'font-semibold text-sf-primary' : 'text-gray-700'}>
                      {p.margin_percent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.isEstimated ? <EstimatedChip /> : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <PageHeader title="Márgenes de Ganancia" />
        <div className="py-8 text-center text-gray-500">Cargando márgenes...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <PageHeader title="Márgenes de Ganancia" />
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 md:space-y-6">
      <PageHeader
        title="Márgenes de Ganancia"
        actions={
          <>
            <label htmlFor="margin-range" className="sr-only">Rango de fechas</label>
            <select
              id="margin-range"
              value={dateRange}
              onChange={(e) => setDateRange(Number(e.target.value) as 7 | 14 | 30)}
              className="input w-auto"
            >
              <option value={7}>Últimos 7 días</option>
              <option value={14}>Últimos 14 días</option>
              <option value={30}>Últimos 30 días</option>
            </select>
            <button
              type="button"
              onClick={exportTopToCSV}
              disabled={topByAbsolute.length === 0}
              className="btn-success"
            >
              Exportar CSV
            </button>
          </>
        }
      />

      {/* Tarjetas de KPIs */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Margen Hoy</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {formatCurrency(summary.today.margin_cents)}
            </p>
          </article>
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Margen Semana</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {formatCurrency(summary.thisWeek.margin_cents)}
            </p>
          </article>
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Margen Mes</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {formatCurrency(summary.thisMonth.margin_cents)}
            </p>
          </article>
          <article className="card p-4">
            <h3 className="text-sm text-gray-600">Margen Hoy %</h3>
            <p className="mt-2 text-lg font-semibold text-sf-primary md:text-xl">
              {summary.today.margin_percent.toFixed(1)}%
            </p>
          </article>
        </div>
      )}

      {/* Gráfica diaria de ingresos vs costos */}
      <div className="card p-4">
        <h3 className="mb-4 font-semibold text-sf-text">Ingresos vs Costos (diario)</h3>
        {dailyMargin.length > 0 ? (
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyMargin} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="marginFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0088FE" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0088FE" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} width={isMobile ? 48 : 64} tickFormatter={compactCurrency} />
                <Tooltip
                  formatter={(value: any) => formatCurrency(Number(value))}
                  labelFormatter={(label) => `Fecha: ${label}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
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
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">Sin datos de márgenes</div>
        )}
      </div>

      {/* Aviso de costos estimados */}
      {summary && summary.estimatedCostCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-yellow-800 shadow-sm">
          <span className="text-xl" aria-hidden="true">⚠️</span>
          <div>
            <p className="font-semibold">Costos estimados</p>
            <p className="text-sm">
              {summary.estimatedCostCount} ítem(ns) se calcularon usando fallback
              (precio ÷ 2) porque aún no registran un costo real de compra. Registra
              recepciones de pedidos para obtener márgenes más precisos.
            </p>
            <div className="mt-2"><EstimatedChip /></div>
          </div>
        </div>
      )}

      {/* Margen por categoría: pie chart + tabla */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-4 font-semibold text-sf-text">Margen por Categoría</h3>
          {categoryMargin.length > 0 ? (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryMargin}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={isMobile ? false : ({ category, percent }: any) =>
                      `${category} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={isMobile ? 72 : 100}
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
                  {isMobile && <Legend wrapperStyle={{ fontSize: 11 }} />}
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">Sin datos por categoría</div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-4 font-semibold text-sf-text">Detalle por Categoría</h3>
          {categoryMargin.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">Sin datos por categoría</div>
          ) : isMobile ? (
            <ul className="space-y-2" aria-label="Detalle por categoría">
              {categoryMargin.map((c) => (
                <li key={c.category} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-gray-900">{c.category}</p>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-sf-primary">{formatCurrency(c.margin_cents)}</p>
                      <p className="text-xs text-gray-700">{c.margin_percent.toFixed(1)}%</p>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <dt>Ingresos</dt>
                      <dd className="font-medium text-gray-900">{formatCurrency(c.revenue_cents)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Costo</dt>
                      <dd className="font-medium text-gray-900">{formatCurrency(c.cost_cents)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Categoría</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Ingresos</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Costo</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Margen $</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Margen %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {categoryMargin.map((c, index) => (
                    <tr key={c.category} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-900">{c.category}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatCurrency(c.revenue_cents)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatCurrency(c.cost_cents)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-sf-primary">
                        {formatCurrency(c.margin_cents)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{c.margin_percent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
