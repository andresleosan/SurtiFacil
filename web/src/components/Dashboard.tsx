import { useEffect, useState } from 'react';
import { getSales } from '../services/saleService';
import { getProducts } from '../services/saleService';
import { Product } from '../firebase/db';
import StockAlerts from './StockAlerts';

const Dashboard = () => {
  const [ventasHoy, setVentasHoy] = useState(0);
  const [ventasSemana, setVentasSemana] = useState(0);
  const [productosVendidos, setProductosVendidos] = useState(0);
  const [ingresosTotales, setIngresosTotales] = useState(0);
  const [topProducts, setTopProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [sales, products] = await Promise.all([getSales(), getProducts()]);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());

      const salesToday = sales.filter(s => {
        const saleDate = new Date(s.date);
        return saleDate >= startOfToday;
      });

      const salesWeek = sales.filter(s => {
        const saleDate = new Date(s.date);
        return saleDate >= startOfWeek;
      });

      const totalToday = salesToday.reduce((sum, s) => sum + s.total, 0);
      const totalWeek = salesWeek.reduce((sum, s) => sum + s.total, 0);
      const totalAll = sales.reduce((sum, s) => sum + s.total, 0);

      // Calcular productos más vendidos
      const productCounts = new Map<string, number>();
      sales.forEach(sale => {
        sale.items?.forEach(item => {
          const current = productCounts.get(item.product_name) || 0;
          productCounts.set(item.product_name, current + item.quantity);
        });
      });

      const sorted = [...productCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      setVentasHoy(totalToday);
      setVentasSemana(totalWeek);
      setIngresosTotales(totalAll);
      setTopProducts(sorted);
      setProductosVendidos(sales.length);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCents = (cents: number) => {
    return `$${(cents / 100).toLocaleString()}`;
  };

  const stats = [
    { title: 'Ventas Hoy', value: formatCents(ventasHoy) },
    { title: 'Ventas Semana', value: formatCents(ventasSemana) },
    { title: 'Productos más vendidos', value: topProducts.length > 0 ? topProducts.join(', ') : 'Sin datos' },
    { title: 'Ingresos Totales', value: formatCents(ingresosTotales) }
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-sf-text">Panel de Control</h2>
      {loading && (
        <p className="text-sm text-gray-500">Cargando datos...</p>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((card) => (
          <article key={card.title} className="rounded-xl bg-white p-4 shadow-sm border border-gray-200 hover:shadow-md transition">
            <h3 className="text-sm text-gray-600">{card.title}</h3>
            <p className="text-xl font-semibold text-sf-primary mt-2">{card.value}</p>
          </article>
        ))}
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold mb-2 text-sf-text">Resumen del Negocio</h3>
        <p className="text-sm text-gray-600 mb-3">
          {productosVendidos} ventas registradas en total
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            const event = new CustomEvent('navigate', { detail: 'reports' });
            window.dispatchEvent(event);
          }}
          className="inline-flex items-center gap-2 text-sf-primary hover:text-sf-dark text-sm font-medium"
        >
          📊 Ver reportes completos →
        </a>
      </div>

      <StockAlerts />
    </section>
  );
};

export default Dashboard;
