import { useEffect, useState } from 'react';
import {
  OfflineQueueItem,
  OfflineSyncSnapshot,
  removeOfflineQueueItem,
  setSimulatedOfflineMode,
  subscribeToOfflineSync,
  syncPendingQueue,
} from '../services/offlineSyncService';
import { formatCentsCOP } from '../utils/currency';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta / Transferencia',
  other: 'Transferencia Nequi/Bancolombia',
  credit: 'Fiado',
};

export function useOfflineSyncState(): OfflineSyncSnapshot {
  const [snapshot, setSnapshot] = useState<OfflineSyncSnapshot>(() => ({
    negocioId: 'surtifacil',
    isOffline: false,
    isSimulatedOffline: false,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    queue: [],
    cachedProductsCount: 0,
    cachedCustomersCount: 0,
    lastSyncedAt: null,
  }));

  useEffect(() => {
    return subscribeToOfflineSync(setSnapshot);
  }, []);

  return snapshot;
}

interface OfflineStatusPillProps {
  onOpenModal: () => void;
}

export function OfflineStatusPill({ onOpenModal }: OfflineStatusPillProps) {
  const snapshot = useOfflineSyncState();
  const totalQueued = snapshot.queue.length;

  return (
    <button
      type="button"
      onClick={onOpenModal}
      aria-label="Inspeccionar cola offline y resiliencia"
      className={`flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition active:scale-95 tabular-nums ${
        snapshot.isOffline
          ? 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
          : totalQueued > 0
            ? 'border-sf-cyan bg-sf-cyan/15 text-sf-dark hover:bg-sf-cyan/25'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          snapshot.isOffline
            ? 'bg-amber-500 animate-pulse'
            : totalQueued > 0
              ? 'bg-sf-cyan animate-ping'
              : 'bg-emerald-500'
        }`}
        aria-hidden="true"
      />
      <span>{snapshot.isOffline ? 'Modo Offline' : 'En Línea'}</span>
      {totalQueued > 0 && (
        <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
          {totalQueued}
        </span>
      )}
    </button>
  );
}

interface OfflineSyncBannerProps {
  onOpenModal: () => void;
}

export function OfflineSyncBanner({ onOpenModal }: OfflineSyncBannerProps) {
  const snapshot = useOfflineSyncState();
  const totalQueued = snapshot.queue.length;

  if (!snapshot.isOffline && totalQueued === 0) {
    return null;
  }

  const handleReconnectAndSync = async () => {
    if (snapshot.isSimulatedOffline) {
      setSimulatedOfflineMode(false);
    }
    await syncPendingQueue(snapshot.negocioId);
  };

  return (
    <div
      role="region"
      aria-label="Estado de modo offline y cola de sincronización"
      className={`border-b px-4 py-2.5 text-xs sm:text-sm transition-colors ${
        snapshot.failedCount > 0
          ? 'border-red-300 bg-red-50 text-red-950'
          : 'border-amber-300 bg-amber-50 text-amber-950'
      }`}
    >
      <div className="container mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-2.5">
          <span className="text-lg shrink-0" aria-hidden="true">
            {snapshot.isOffline ? '📡' : '🔄'}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">
                {snapshot.isOffline
                  ? 'Modo Offline Resiliente Activo (Mostrador sin Internet)'
                  : 'Cola Offline Pendiente de Sincronización'}
              </span>
              <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-900 tabular-nums">
                {totalQueued} en cola FIFO
              </span>
            </div>
            <p className="text-xs text-amber-800 mt-0.5 tabular-nums">
              Aislamiento Multi-Tenant ({snapshot.negocioId}): {snapshot.cachedProductsCount} productos y{' '}
              {snapshot.cachedCustomersCount} clientes de fiado respaldados en IndexedDB local.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenModal}
            className="min-h-[44px] rounded-lg border border-amber-400 bg-white px-3.5 py-2 text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-100 transition"
          >
            📋 Inspeccionar Cola ({totalQueued})
          </button>

          {snapshot.isSimulatedOffline ? (
            <button
              type="button"
              onClick={() => void handleReconnectAndSync()}
              disabled={snapshot.isSyncing}
              className="min-h-[44px] rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-60"
            >
              🌐 Reconectar y Sincronizar
            </button>
          ) : (
            !snapshot.isOffline &&
            totalQueued > 0 && (
              <button
                type="button"
                onClick={() => void syncPendingQueue(snapshot.negocioId)}
                disabled={snapshot.isSyncing}
                className="min-h-[44px] rounded-lg bg-sf-primary px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-sf-dark transition disabled:opacity-60"
              >
                {snapshot.isSyncing ? '🔄 Sincronizando...' : '🔄 Sincronizar Ahora'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

interface OfflineQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OfflineQueueModal({ isOpen, onClose }: OfflineQueueModalProps) {
  const snapshot = useOfflineSyncState();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSyncMessage(null);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleOfflineSimulation = () => {
    setSyncMessage(null);
    setSimulatedOfflineMode(!snapshot.isSimulatedOffline);
  };

  const handleManualSync = async () => {
    setSyncMessage(null);
    if (snapshot.isSimulatedOffline) {
      setSimulatedOfflineMode(false);
    }
    const result = await syncPendingQueue(snapshot.negocioId);
    if (result.synced > 0 && result.failed === 0) {
      setSyncMessage(`✅ Se sincronizaron ${result.synced} operación(es) exitosamente con Cloudflare D1.`);
    } else if (result.failed > 0) {
      setSyncMessage(
        `⚠️ Sincronizadas: ${result.synced} · Con error: ${result.failed}. Revisa el detalle en la cola.`,
      );
    } else {
      setSyncMessage('ℹ️ No había operaciones pendientes por sincronizar.');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    await removeOfflineQueueItem(itemId, snapshot.negocioId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-queue-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        {/* Cabecera */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-sf-dark px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl">
              📡
            </span>
            <div>
              <h2 id="offline-queue-modal-title" className="text-base sm:text-lg font-bold">
                Resiliencia Offline y Cola FIFO Multi-Tenant
              </h2>
              <p className="text-xs text-slate-300">
                IndexedDB Local · Negocio aislado:{' '}
                <span className="font-bold text-sf-cyan">{snapshot.negocioId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar inspector de cola offline"
            className="min-h-[44px] min-w-[44px] rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </header>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Tarjeta de estado y simulador de desconexión */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    snapshot.isOffline ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                <span className="font-bold text-sm text-slate-900">
                  {snapshot.isOffline
                    ? 'Mostrador Operando Sin Internet (IndexedDB)'
                    : 'Conectado en Vivo a Cloudflare D1'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Si falla el internet del barrio, las ventas y abonos se encolan en orden FIFO y se sincronizan al volver la red.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleOfflineSimulation}
              aria-pressed={snapshot.isSimulatedOffline}
              className={`min-h-[44px] shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition shadow-2xs ${
                snapshot.isSimulatedOffline
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {snapshot.isSimulatedOffline
                ? '🌐 Reconectar a Internet'
                : '🔌 Simular Corte de Internet'}
            </button>
          </div>

          {/* KPIs de Caché IndexedDB por Tenant */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Productos en Caché
              </span>
              <span className="mt-1 text-xl font-bold text-slate-900 tabular-nums block">
                {snapshot.cachedProductsCount}
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">Lectura instantánea sin red</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Clientes de Fiado en Caché
              </span>
              <span className="mt-1 text-xl font-bold text-slate-900 tabular-nums block">
                {snapshot.cachedCustomersCount}
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">Saldos protegidos offline</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Operaciones en Cola FIFO
              </span>
              <span className="mt-1 text-xl font-bold text-amber-700 tabular-nums block">
                {snapshot.queue.length}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {snapshot.lastSyncedAt
                  ? `Últ. sync: ${new Date(snapshot.lastSyncedAt).toLocaleTimeString('es-CO')}`
                  : 'Sincronización automática'}
              </span>
            </div>
          </div>

          {syncMessage && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-semibold text-emerald-900"
            >
              {syncMessage}
            </div>
          )}

          {/* Lista de Cola FIFO */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cola FIFO de Ventas y Abonos ({snapshot.queue.length})
            </h3>

            {snapshot.queue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  ✅ Cola FIFO vacía — Todo está sincronizado
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Todas las ventas de mostrador y abonos del libro de fiados están respaldados en Cloudflare D1.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5" aria-label="Operaciones pendientes en cola offline">
                {snapshot.queue.map((item: OfflineQueueItem, idx: number) => {
                  const isSale = item.type === 'sale' && item.sale_payload;
                  const amountCents = isSale
                    ? item.sale_payload!.total_cents
                    : item.credit_payload?.amount_cents || 0;

                  return (
                    <li
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-700 tabular-nums">
                            #{idx + 1}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              isSale
                                ? 'bg-blue-50 text-sf-primary'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {isSale
                              ? '🛒 Venta POS'
                              : item.credit_payload?.type === 'payment'
                                ? '💵 Abono de Fiado'
                                : '📒 Cargo de Fiado'}
                          </span>
                          <span className="text-sm font-bold text-slate-900 tabular-nums">
                            {formatCentsCOP(amountCents)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              item.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : item.status === 'syncing'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {item.status === 'failed'
                              ? '❌ Error'
                              : item.status === 'syncing'
                                ? '🔄 Sincronizando'
                                : '⏳ Pendiente'}
                          </span>
                        </div>

                        {isSale && item.sale_payload && (
                          <p className="text-xs text-slate-600">
                            {item.sale_payload.items
                              .map((i) => `${i.quantity}x ${i.product_name}`)
                              .join(', ')}{' '}
                            · Pago: {PAYMENT_LABELS[item.sale_payload.payment_method] || item.sale_payload.payment_method}
                            {item.sale_payload.credit_customer_name
                              ? ` (${item.sale_payload.credit_customer_name})`
                              : ''}
                          </p>
                        )}

                        {!isSale && item.credit_payload && (
                          <p className="text-xs text-slate-600">
                            Cliente: {item.credit_payload.customer_name || item.credit_payload.customer_id}
                            {item.credit_payload.description
                              ? ` · "${item.credit_payload.description}"`
                              : ''}
                          </p>
                        )}

                        {item.last_error && (
                          <p className="text-xs font-medium text-red-600">
                            Motivo: {item.last_error}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleRemoveItem(item.id)}
                          aria-label={`Descartar operación ${idx + 1}`}
                          className="min-h-[40px] rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                        >
                          Descartar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Pie del Modal */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={() => void handleManualSync()}
            disabled={snapshot.queue.length === 0 || snapshot.isSyncing}
            className="min-h-[44px] rounded-xl bg-sf-primary px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-sf-dark transition disabled:opacity-50"
          >
            {snapshot.isSyncing
              ? '🔄 Sincronizando Cola FIFO...'
              : `🔄 Sincronizar Cola Ahora (${snapshot.queue.length})`}
          </button>
        </footer>
      </div>
    </div>
  );
}
