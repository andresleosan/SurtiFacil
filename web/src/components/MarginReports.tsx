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
} from 'recharts';
import {
  getMarginSummary,
  getMarginDaily,
  MarginSummary,
  MarginDaily,
} from '../services/marginService';
import { formatCurrency } from '../services/reportService';

const MarginReports = () => {
  const [summary, setSummary] = useState<MarginSummary | null>(null);
  const [dailyMargin, setDailyMargin] = useState<MarginDaily[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<7 | 14 | 30>(7);

  useEffect(() => {
    loadReportData();
  }, [dateRange]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      const [summaryData, dailyData] = await Promise.all([
        getMarginSummary(),
        getMarginDaily(dateRange),
      ]);
      setSummary(summaryData);
      setDailyMargin(dailyData);
    } catch (error) {
      console.error('Error loading margin reports:', error);
    } finally {
      setLoading(false);
    }
  };

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
    </section>
  );
};

export default MarginReports;
