import { useEffect, useState, useMemo } from 'react';
import {
  getSuperAdminData,
  renovarNegocio,
  updateNegocio,
  operateStore,
  getOperatingStoreId,
  type SuperAdminData,
} from '../services/tenantService';
import type { Negocio, NegocioEstado, SaaSPlanId } from '../types/tenant';
import { SAAS_PLANS } from '../types/tenant';
import { formatCOP } from '../utils/currency';
import { Icon } from './ui/Icon';
import { PageHeader } from './ui/PageHeader';
import { Modal } from './ui/Modal';

export default function SuperAdminStores() {
  const [data, setData] = useState<SuperAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | NegocioEstado>('todos');
  const [editingStore, setEditingStore] = useState<Negocio | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeOperatedId = getOperatingStoreId();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSuperAdminData();
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Error cargando datos de SuperAdmin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleQuickRenew = async (storeId: string, days: number) => {
    try {
      setActionLoadingId(storeId);
      const updated = await renovarNegocio(storeId, days);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          negocios: prev.negocios.map((n) => (n.id === storeId ? { ...n, ...updated } : n)),
        };
      });
      setSuccessMessage(`¡Tienda renovada con éxito (+${days} días)!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'No se pudo renovar la tienda.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleStatus = async (store: Negocio) => {
    const nextStatus: NegocioEstado = store.estado === 'activo' ? 'suspendido' : 'activo';
    try {
      setActionLoadingId(store.id);
      const updated = await updateNegocio(store.id, { estado: nextStatus });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          negocios: prev.negocios.map((n) => (n.id === store.id ? { ...n, ...updated } : n)),
        };
      });
      setSuccessMessage(`Estado de ${store.nombre} actualizado a "${nextStatus}".`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Error actualizando estado.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOperateStore = (store: Negocio) => {
    operateStore(store.id);
    window.location.hash = '#/dashboard';
    window.location.reload();
  };

  const handleStopOperating = () => {
    operateStore(null);
    window.location.reload();
  };

  const filteredStores = useMemo(() => {
    if (!data) return [];
    return data.negocios.filter((n) => {
      const matchSearch =
        n.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.barrio.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'todos' || n.estado === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [data, searchTerm, statusFilter]);

  return (
    <div className="space-y-6 font-poppins">
      <PageHeader
        title="Centro de Control SuperAdmin"
        actions={
          <div className="flex items-center gap-2">
            {activeOperatedId && (
              <button
                type="button"
                onClick={handleStopOperating}
                className="btn-secondary text-xs min-h-[40px] border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
              >
                Volver a Modo Global
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="btn-secondary text-xs min-h-[40px] flex items-center gap-1.5"
            >
              <Icon name="refresh" size={16} />
              <span>Actualizar</span>
            </button>
          </div>
        }
      />

      {successMessage && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          ✓ {successMessage}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* 4 KPIs de Plataforma Multi-Tenant */}
      {data && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">Total Tiendas</span>
              <Icon name="store" size={18} className="text-sf-primary" />
            </div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">
              {data.kpis.totalTiendas}
            </div>
            <span className="text-[11px] text-slate-400">Locales registrados en SaaS</span>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">Tiendas Activas</span>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 tabular-nums">
              {data.kpis.tiendasActivas} / {data.kpis.totalTiendas}
            </div>
            <span className="text-[11px] text-slate-400">
              {Math.round((data.kpis.tiendasActivas / Math.max(1, data.kpis.totalTiendas)) * 100)}% de operatividad
            </span>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">Recaudo Estimado</span>
              <Icon name="wallet" size={18} className="text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {formatCOP(data.kpis.recaudoEstimadoCOP)}
            </div>
            <span className="text-[11px] text-slate-400">Mensual en suscripciones</span>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold">Consumo Sarin IA</span>
              <Icon name="sparkles" size={18} className="text-purple-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {data.kpis.cuotaIAUsada.toLocaleString('es-CO')}
            </div>
            <span className="text-[11px] text-slate-400">
              de {data.kpis.cuotaIATotal.toLocaleString('es-CO')} turnos globales
            </span>
          </article>
        </section>
      )}

      {/* Buscador y Filtros */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, slug o barrio..."
            className="input min-h-[40px] w-full pl-9 text-xs sm:text-sm"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" size={16} />
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          {(['todos', 'activo', 'pendiente', 'suspendido'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? 'bg-sf-primary text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </section>

      {/* Tabla / Lista de Tiendas */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              <tr>
                <th className="px-4 py-3">Tienda / Local</th>
                <th className="px-4 py-3">Barrio</th>
                <th className="px-4 py-3">Plan / Vencimiento</th>
                <th className="px-4 py-3">Sarin IA</th>
                <th className="px-4 py-3">Métricas</th>
                <th className="px-4 py-3 text-right">Renovación Rápida</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No se encontraron tiendas con los criterios de búsqueda.
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => {
                  const isOperating = activeOperatedId === store.id;
                  const isActionLoading = actionLoadingId === store.id;
                  const plan = SAAS_PLANS.find((p) => p.id === store.plan_id) || SAAS_PLANS[0];

                  let daysLeft: number | null = null;
                  if (store.plan_id !== 'enterprise' && store.suscripcion_vence_en) {
                    const diff = new Date(store.suscripcion_vence_en).getTime() - Date.now();
                    daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
                  }

                  return (
                    <tr
                      key={store.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isOperating ? 'bg-blue-50/60 font-medium' : ''
                      }`}
                    >
                      {/* Tienda */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-sf-primary font-bold text-xs shrink-0">
                            {store.nombre.slice(0, 1)}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{store.nombre}</span>
                              {isOperating && (
                                <span className="rounded bg-sf-primary text-white text-[10px] px-1.5 py-0.2 font-bold">
                                  OPERANDO
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">#{store.slug}</span>
                            {store.telefono_whatsapp && (
                              <a
                                href={`https://wa.me/57${store.telefono_whatsapp}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-[11px] text-emerald-600 hover:underline"
                              >
                                💬 {store.telefono_whatsapp}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Barrio */}
                      <td className="px-4 py-3.5">
                        <span className="text-slate-800 font-medium">{store.barrio}</span>
                        <span className="block text-[11px] text-slate-400">{store.ciudad}</span>
                      </td>

                      {/* Plan y Vencimiento */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              store.plan_id === 'enterprise'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-sf-primary'
                            }`}
                          >
                            {plan.shortName}
                          </span>
                          <div className="text-[11px]">
                            {store.plan_id === 'enterprise' ? (
                              <span className="text-purple-700 font-semibold">Ilimitado</span>
                            ) : daysLeft !== null && daysLeft <= 0 ? (
                              <span className="text-red-600 font-bold">Vencido</span>
                            ) : (
                              <span className="text-slate-600">
                                Vence en <strong className="text-slate-900">{daysLeft}d</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Sarin IA */}
                      <td className="px-4 py-3.5">
                        <div className="w-28 space-y-1">
                          <div className="text-[11px] flex justify-between font-medium">
                            <span className="text-slate-500">Usado:</span>
                            <span className="font-bold tabular-nums">
                              {store.cuota_ia_usada} / {store.cuota_ia_total}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-purple-600 transition-all"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((store.cuota_ia_usada / Math.max(1, store.cuota_ia_total)) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Métricas */}
                      <td className="px-4 py-3.5 text-[11px] text-slate-600">
                        <div>📦 {store.total_products || 0} prods</div>
                        <div>👥 {store.total_users || 1} staff</div>
                      </td>

                      {/* Renovación Rápida */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {[3, 7, 15, 30].map((days) => (
                            <button
                              key={days}
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => void handleQuickRenew(store.id, days)}
                              className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-sf-primary hover:text-white transition disabled:opacity-50"
                              title={`Extender +${days} días`}
                            >
                              +{days}d
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOperateStore(store)}
                            className="btn-primary min-h-[32px] px-2.5 py-1 text-[11px] font-bold shadow-2xs"
                            title="Operar catálogo y mostrador de esta tienda"
                          >
                            Operar
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(store)}
                            disabled={isActionLoading}
                            className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                              store.estado === 'activo'
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            }`}
                          >
                            {store.estado === 'activo' ? 'Suspender' : 'Activar'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingStore(store)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 transition"
                            title="Editar detalles"
                          >
                            <Icon name="pencil" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal de Edición de Tienda */}
      {editingStore && (
        <Modal
          open={true}
          title={`Editar Tienda: ${editingStore.nombre}`}
          onClose={() => setEditingStore(null)}
        >
          <div className="space-y-4 text-xs sm:text-sm">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estado del Negocio</label>
              <select
                value={editingStore.estado}
                onChange={(e) =>
                  setEditingStore({ ...editingStore, estado: e.target.value as NegocioEstado })
                }
                className="input w-full min-h-[40px] bg-white"
              >
                <option value="activo">Activo</option>
                <option value="pendiente">Pendiente</option>
                <option value="suspendido">Suspendido</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Plan SaaS</label>
              <select
                value={editingStore.plan_id}
                onChange={(e) =>
                  setEditingStore({ ...editingStore, plan_id: e.target.value as SaaSPlanId })
                }
                className="input w-full min-h-[40px] bg-white"
              >
                {SAAS_PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cuota Sarin IA Total</label>
              <input
                type="number"
                value={editingStore.cuota_ia_total}
                onChange={(e) =>
                  setEditingStore({
                    ...editingStore,
                    cuota_ia_total: Number(e.target.value),
                  })
                }
                className="input w-full min-h-[40px]"
              />
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingStore(null)}
                className="btn-secondary text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateNegocio(editingStore.id, {
                      estado: editingStore.estado,
                      plan_id: editingStore.plan_id,
                      cuota_ia_total: editingStore.cuota_ia_total,
                    });
                    setEditingStore(null);
                    await loadData();
                  } catch (err: any) {
                    alert(err?.message || 'Error guardando cambios');
                  }
                }}
                className="btn-primary text-xs"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
