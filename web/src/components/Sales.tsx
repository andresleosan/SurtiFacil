import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sale } from '../firebase/db';
import { getRecentSales, voidSale } from '../services/saleService';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useHasRole } from '../auth/CurrentUserContext';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { formatCentsCOP } from '../utils/currency';
import { exportSalesToCSV } from '../utils/csvExporter';
import { extractSalePaymentBuckets, isSaleVoided, parsePaymentBreakdown } from '../utils/saleAccounting';
import ThermalReceiptModal from './ThermalReceiptModal';
import CashClosingModal from './CashClosingModal';
import PettyCashModal from './PettyCashModal';

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
  other: '📱 Nequi / Otro',
  credit: '📒 Fiado',
  mixed: '🔀 Pago Mixto',
};

const QUICK_VOID_REASONS = [
  'Error de digitación en caja',
  'Devolución del cliente',
  'Producto en mal estado',
  'Venta duplicada',
];

type SalesFilter = 'all' | 'completed' | 'voided' | 'mixed';

const getPaymentMethodLabel = (method: string) => PAYMENT_LABELS[method] ?? method;

const Sales = () => {
  const isMobile = useIsMobile();
  const canVoidSales = useHasRole(['admin', 'manager']);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cursor, setCursor] = useState<unknown | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  const [filter, setFilter] = useState<SalesFilter>('all');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [pettyCashModalOpen, setPettyCashModalOpen] = useState(false);

  // Estado del modal de anulación atómica
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [voidError, setVoidError] = useState('');

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

  const handleExportCSV = () => {
    if (sales.length === 0) return;
    exportSalesToCSV(sales);
  };

  const openVoidModal = (sale: Sale) => {
    setSaleToVoid(sale);
    setVoidReason('');
    setVoidError('');
  };

  const closeVoidModal = () => {
    if (voidSubmitting) return;
    setSaleToVoid(null);
    setVoidReason('');
    setVoidError('');
  };

  const handleConfirmVoid = async () => {
    if (!saleToVoid) return;
    const trimmed = voidReason.trim();
    if (trimmed.length < 3) {
      setVoidError('Escribe o selecciona un motivo válido (mínimo 3 caracteres).');
      return;
    }
    try {
      setVoidSubmitting(true);
      setVoidError('');
      const result = await voidSale(saleToVoid.id, trimmed);
      setSales((current) =>
        current.map((item) => (item.id === saleToVoid.id ? { ...item, ...result.sale } : item)),
      );
      setStatusNotice(
        `✅ Venta #${saleToVoid.id.slice(0, 8)} anulada. Se reintegraron ${result.restocked_units} unidades al inventario${
          result.credit_reversed_cents > 0
            ? ` y se reversaron ${formatCentsCOP(result.credit_reversed_cents)} de fiado`
            : ''
        }.`,
      );
      setSaleToVoid(null);
      setVoidReason('');
    } catch (err: unknown) {
      setVoidError(err instanceof Error && err.message ? err.message : 'No se pudo anular la venta.');
    } finally {
      setVoidSubmitting(false);
    }
  };

  const filteredSales = useMemo(() => {
    if (filter === 'completed') return sales.filter((s) => !isSaleVoided(s));
    if (filter === 'voided') return sales.filter((s) => isSaleVoided(s));
    if (filter === 'mixed') {
      return sales.filter((s) => {
        const breakdown = parsePaymentBreakdown(s.payment_breakdown, s.payment_method, s.total);
        return s.payment_method === 'mixed' || breakdown.length > 1;
      });
    }
    return sales;
  }, [sales, filter]);

  const voidedCount = useMemo(() => sales.filter((s) => isSaleVoided(s)).length, [sales]);
  const mixedCount = useMemo(
    () =>
      sales.filter((s) => {
        const breakdown = parsePaymentBreakdown(s.payment_breakdown, s.payment_method, s.total);
        return s.payment_method === 'mixed' || breakdown.length > 1;
      }).length,
    [sales],
  );

  const header = (
    <PageHeader
      title="Historial de ventas"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPettyCashModalOpen(true)}
            className="btn-secondary min-h-[44px] px-3 text-xs font-semibold text-slate-800"
          >
            <span>💸 Caja Menor</span>
          </button>
          <button
            type="button"
            onClick={() => setClosingModalOpen(true)}
            className="btn-secondary min-h-[44px] px-3 text-xs font-semibold text-slate-800"
          >
            <span>🔒 Arqueo / Cierre COP</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={sales.length === 0}
            className="btn-secondary min-h-[44px] px-3 text-xs font-semibold text-slate-800"
          >
            <Icon name="clipboard" size={16} />
            <span>📥 Exportar Excel</span>
          </button>
          <button
            type="button"
            onClick={() => void loadFirstPage()}
            disabled={loading}
            className="btn-secondary min-h-[44px] px-3 text-xs font-semibold text-slate-800"
          >
            <Icon name="refresh" size={16} />
            <span>Actualizar</span>
          </button>
        </div>
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

      {statusNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-semibold text-emerald-900"
        >
          <span>{statusNotice}</span>
          <button
            type="button"
            onClick={() => setStatusNotice('')}
            aria-label="Cerrar aviso"
            className="min-h-[36px] px-2 text-emerald-800 hover:text-emerald-950"
          >
            ✕
          </button>
        </div>
      )}

      {sales.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar ventas">
          {(
            [
              { id: 'all' as SalesFilter, label: `Todas (${sales.length})` },
              { id: 'completed' as SalesFilter, label: `Vigentes (${sales.length - voidedCount})` },
              { id: 'voided' as SalesFilter, label: `🚫 Anuladas (${voidedCount})` },
              { id: 'mixed' as SalesFilter, label: `🔀 Pago Mixto (${mixedCount})` },
            ]
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
              className={`min-h-[44px] rounded-xl border px-3 text-xs font-bold transition ${
                filter === chip.id
                  ? 'border-sf-primary bg-sf-primary text-white shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {sales.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">No hay ventas registradas</div>
      ) : filteredSales.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">No hay ventas que coincidan con este filtro</div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label="Ventas">
          {filteredSales.map((sale) => {
            const expanded = expandedSaleId === sale.id;
            const voided = isSaleVoided(sale);
            return (
              <li key={sale.id} className={`card ${voided ? 'border-rose-200 bg-rose-50/30' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(sale.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-sf-text">{formatDate(sale.date)}</p>
                      {voided && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                          🚫 Anulada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {sale.items?.length || 0} {sale.items?.length === 1 ? 'producto' : 'productos'} · {getPaymentMethodLabel(sale.payment_method)}
                    </p>
                  </div>
                  <span className={`font-semibold ${voided ? 'line-through text-slate-400' : 'text-sf-primary'}`}>
                    {formatPrice(sale.total)}
                  </span>
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} className="text-gray-400" size={18} />
                </button>
                {expanded && (
                  <SaleDetails
                    sale={sale}
                    canVoid={canVoidSales}
                    onViewReceipt={setSelectedSaleForReceipt}
                    onVoidRequest={openVoidModal}
                  />
                )}
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
                {filteredSales.map((sale) => {
                  const expanded = expandedSaleId === sale.id;
                  const voided = isSaleVoided(sale);
                  return (
                    <tr key={sale.id} className={`transition ${voided ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-sf-light'}`}>
                      <td className="px-4 py-2 font-mono text-sm text-sf-text">
                        <span>{sale.id?.slice(0, 8)}</span>
                        {voided && (
                          <span className="ml-2 inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            🚫 Anulada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-sf-text">{formatDate(sale.date)}</td>
                      <td className="px-4 py-2 text-right text-sm text-sf-text">{sale.items?.length || 0}</td>
                      <td className={`px-4 py-2 text-right text-sm font-medium ${voided ? 'line-through text-slate-400' : 'text-sf-primary'}`}>
                        {formatPrice(sale.total)}
                      </td>
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
            const selected = filteredSales.find((sale) => sale.id === expandedSaleId);
            return selected ? (
              <SaleDetails
                sale={selected}
                canVoid={canVoidSales}
                onViewReceipt={setSelectedSaleForReceipt}
                onVoidRequest={openVoidModal}
              />
            ) : null;
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

      {selectedSaleForReceipt && (
        <ThermalReceiptModal
          isOpen={Boolean(selectedSaleForReceipt)}
          onClose={() => setSelectedSaleForReceipt(null)}
          sale={selectedSaleForReceipt}
        />
      )}

      {closingModalOpen && (
        <CashClosingModal
          isOpen={closingModalOpen}
          onClose={() => setClosingModalOpen(false)}
          onClosedSuccess={() => void loadFirstPage()}
        />
      )}

      {pettyCashModalOpen && (
        <PettyCashModal
          isOpen={pettyCashModalOpen}
          onClose={() => setPettyCashModalOpen(false)}
        />
      )}

      {saleToVoid && (
        <Modal
          open={Boolean(saleToVoid)}
          onClose={closeVoidModal}
          title={`Anular Venta #${saleToVoid.id.slice(0, 8)}`}
          size="md"
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2 w-full">
              <button
                type="button"
                onClick={closeVoidModal}
                disabled={voidSubmitting}
                className="btn-secondary min-h-[44px] px-4 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmVoid()}
                disabled={voidSubmitting || voidReason.trim().length < 3}
                className="btn-danger min-h-[44px] px-4 text-xs font-bold"
              >
                {voidSubmitting ? 'Anulando...' : 'Confirmar Anulación y Reintegrar Stock'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 space-y-1.5">
              <p className="font-bold text-amber-900">
                Impacto atómico de la anulación ({formatCentsCOP(saleToVoid.total)}):
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  Reintegrará{' '}
                  <strong>
                    {(saleToVoid.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)} unidades
                  </strong>{' '}
                  al inventario del negocio.
                </li>
                {(() => {
                  const buckets = extractSalePaymentBuckets({ ...saleToVoid, status: 'completed' });
                  if (buckets.credit_cents <= 0) return null;
                  return (
                    <li>
                      Descontará <strong>{formatCentsCOP(buckets.credit_cents)}</strong> de la deuda en Libro de Fiados
                      {saleToVoid.credit_customer_name ? ` (${saleToVoid.credit_customer_name})` : ''}.
                    </li>
                  );
                })()}
                {(saleToVoid.coupon_code ||
                  (saleToVoid.loyalty_points_earned || 0) > 0 ||
                  (saleToVoid.loyalty_points_redeemed || 0) > 0) && (
                  <li>Revertirá los puntos del Club de Puntos y/o uso del cupón asociado.</li>
                )}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">Motivos frecuentes:</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_VOID_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={voidReason === preset}
                    onClick={() => {
                      setVoidReason(preset);
                      setVoidError('');
                    }}
                    className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition ${
                      voidReason === preset
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="void-sale-reason" className="block text-xs font-bold text-slate-700 mb-1">
                Motivo de la anulación o devolución:
              </label>
              <textarea
                id="void-sale-reason"
                rows={2}
                value={voidReason}
                onChange={(e) => {
                  setVoidReason(e.target.value);
                  setVoidError('');
                }}
                placeholder="Ej: Devolución del cliente o error de digitación en mostrador..."
                className="input min-h-[64px] py-2 text-sm"
              />
            </div>

            {voidError && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {voidError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
};

function SaleDetails({
  sale,
  canVoid,
  onViewReceipt,
  onVoidRequest,
}: {
  sale: Sale;
  canVoid: boolean;
  onViewReceipt: (sale: Sale) => void;
  onVoidRequest: (sale: Sale) => void;
}) {
  const voided = isSaleVoided(sale);
  const breakdown = parsePaymentBreakdown(sale.payment_breakdown, sale.payment_method, sale.total);
  const isMixed = breakdown.length > 1 || sale.payment_method === 'mixed';

  return (
    <div className="space-y-3 border-t border-gray-200 bg-sf-light px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-sf-text">Detalles de la venta</h4>
        <div className="flex flex-wrap items-center gap-2">
          {canVoid && !voided && (
            <button
              type="button"
              onClick={() => onVoidRequest(sale)}
              className="btn-danger min-h-[44px] px-3 text-xs font-bold flex items-center gap-1.5"
            >
              <span>🚫 Anular / Devolver Venta</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onViewReceipt(sale)}
            className="btn-primary min-h-[44px] px-3 text-xs flex items-center gap-1.5"
          >
            <Icon name="receipt" size={16} />
            <span>🖨️ Ver Tirilla Térmica</span>
          </button>
        </div>
      </div>

      {voided && (
        <div role="status" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950 space-y-1">
          <p className="font-bold text-rose-800">🚫 Venta Anulada / Devuelta</p>
          {sale.void_reason && (
            <p>
              <strong>Motivo:</strong> {sale.void_reason}
            </p>
          )}
          <p className="text-rose-800/80">
            Responsable: {sale.voided_by_name || 'Administrador'}
            {sale.voided_at ? ` · ${formatDate(sale.voided_at)}` : ''}
          </p>
        </div>
      )}

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
          <dd className={`text-lg font-bold ${voided ? 'line-through text-slate-400' : 'text-sf-primary'}`}>
            {formatPrice(sale.total)}
          </dd>
        </div>
      </dl>

      {isMixed && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-xs">
          <p className="font-bold text-purple-950 mb-1.5">🔀 Desglose de Pago Mixto</p>
          <div className="flex flex-wrap gap-2">
            {breakdown.map((entry) => (
              <span
                key={entry.method}
                className="rounded-lg border border-purple-200 bg-white px-2.5 py-1 font-semibold text-slate-800 tabular-nums"
              >
                {getPaymentMethodLabel(entry.method)}: {formatCentsCOP(entry.amount_cents)}
              </span>
            ))}
          </div>
          {sale.credit_customer_name && (
            <p className="mt-1.5 text-slate-700">
              Cliente fiado: <strong>{sale.credit_customer_name}</strong>
            </p>
          )}
        </div>
      )}

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
