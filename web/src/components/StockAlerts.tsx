import { useEffect, useState } from 'react';
import { Product } from '../firebase/db';
import { getProducts } from '../services/saleService';
import { StockAlert, checkLowStock, getStockAlertCount, getCriticalAlertCount } from '../services/stockAlertService';

const StockAlerts = () => {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(10);

  useEffect(() => {
    loadAlerts();
  }, [threshold]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const products = await getProducts();
      const stockAlerts = checkLowStock(products, threshold);
      setAlerts(stockAlerts);
    } catch {
      console.error('Error loading alerts.');
      setError('No se pudieron cargar las alertas de stock.');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityStyles = (severity: StockAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-400 text-red-800';
      case 'warning':
        return 'bg-orange-100 border-orange-400 text-orange-800';
      default:
        return 'bg-yellow-100 border-yellow-400 text-yellow-800';
    }
  };

  const getSeverityIcon = (severity: StockAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '🟠';
      default:
        return '🟡';
    }
  };

  const criticalCount = getCriticalAlertCount(alerts.map(a => ({ id: a.productId, stock: a.currentStock } as Product)));
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  if (loading) {
    return (
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="text-center text-gray-500">Cargando alertas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-bold text-sf-text flex items-center gap-2">
          <span>⚠️</span> Alertas de Stock
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="stock-threshold" className="text-sm text-gray-600">Umbral:</label>
            <input
              id="stock-threshold"
              type="number"
              inputMode="numeric"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 10)}
              className="w-20 min-h-[40px] px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-sf-primary"
              min="1"
              max="100"
            />
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {criticalCount > 0 && (
              <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-medium">
                🔴 {criticalCount} sin stock
              </span>
            )}
            {warningCount > 0 && (
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded font-medium">
                🟠 {warningCount} críticos
              </span>
            )}
          </div>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-6 text-green-600">
          <span className="text-2xl">✅</span>
          <p className="mt-2 font-medium">Todos los productos tienen stock suficiente</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.productId}
              className={`flex items-center justify-between p-3 rounded-lg border ${getSeverityStyles(alert.severity)}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
                <div>
                  <p className="font-medium">{alert.productName}</p>
                  {alert.category && (
                    <p className="text-xs opacity-75">{alert.category}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">{alert.currentStock}</p>
                <p className="text-xs opacity-75">unidades</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StockAlerts;
