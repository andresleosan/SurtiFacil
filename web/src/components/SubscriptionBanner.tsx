import { useEffect, useState } from 'react';
import { getStoreSettings } from '../services/settingsService';
import { SAAS_PLANS, type SaaSPlanId } from '../types/tenant';
import { Icon } from './ui/Icon';

interface StoreSubscriptionInfo {
  plan_id: SaaSPlanId;
  suscripcion_vence_en?: string;
  cuota_ia_total: number;
  cuota_ia_usada: number;
  nombre: string;
  slug: string;
}

export default function SubscriptionBanner() {
  const [subInfo, setSubInfo] = useState<StoreSubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadInfo() {
      try {
        const settings = await getStoreSettings();
        if (isMounted) {
          setSubInfo({
            plan_id: (settings.plan_id as SaaSPlanId) || 'prueba_3d',
            suscripcion_vence_en: settings.suscripcion_vence_en,
            cuota_ia_total: settings.cuota_ia_total || 300,
            cuota_ia_usada: settings.cuota_ia_usada || 0,
            nombre: settings.nombre || 'Mi Tienda',
            slug: settings.slug || 'surtifacil',
          });
        }
      } catch {
        // Fallback default
        if (isMounted) {
          setSubInfo({
            plan_id: 'enterprise',
            suscripcion_vence_en: new Date(Date.now() + 30 * 86400000).toISOString(),
            cuota_ia_total: 999999,
            cuota_ia_usada: 120,
            nombre: 'SurtiFácil Central',
            slug: 'surtifacil',
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void loadInfo();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !subInfo) return null;

  const currentPlan = SAAS_PLANS.find((p) => p.id === subInfo.plan_id) || SAAS_PLANS[0];
  const isEnterprise = subInfo.plan_id === 'enterprise';

  let daysRemaining = 999;
  let isExpired = false;
  if (!isEnterprise && subInfo.suscripcion_vence_en) {
    const diffMs = new Date(subInfo.suscripcion_vence_en).getTime() - Date.now();
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 0) {
      isExpired = true;
    }
  }

  const iaPercent = Math.min(
    100,
    Math.round((subInfo.cuota_ia_usada / Math.max(1, subInfo.cuota_ia_total)) * 100)
  );

  const renewUrl = `https://wa.me/573001234567?text=${encodeURIComponent(
    `Hola, deseo renovar el plan de mi tienda ${subInfo.nombre} (ID: ${subInfo.slug}). Plan actual: ${currentPlan.name}.`
  )}`;

  return (
    <article
      className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-2xs ${
        isExpired
          ? 'border-red-300 bg-red-50/90 text-red-900'
          : daysRemaining <= 3 && !isEnterprise
          ? 'border-amber-300 bg-amber-50/90 text-amber-950'
          : 'border-blue-100 bg-gradient-to-r from-blue-50/70 to-white text-slate-800'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Lado Izquierdo: Plan y Días Restantes */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sf-primary text-white text-xs font-bold">
              ⚡
            </span>
            <span className="font-bold text-sm sm:text-base text-slate-900">
              {currentPlan.name}
            </span>

            {isEnterprise ? (
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700">
                Ilimitado
              </span>
            ) : isExpired ? (
              <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white animate-pulse">
                Suscripción Vencida
              </span>
            ) : daysRemaining <= 3 ? (
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
                Vence en {daysRemaining} {daysRemaining === 1 ? 'día' : 'días'}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                Activo · {daysRemaining} días restantes
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600">
            {isEnterprise
              ? 'Cuenta matriz de SurtiFácil con turnos de IA y herramientas ilimitadas.'
              : isExpired
              ? 'Tu periodo de servicio ha vencido. Renueva para continuar facturando en mostrador y atendiendo pedidos.'
              : `Tu tienda ${subInfo.nombre} cuenta con respaldo en la nube y actualización continua.`}
          </p>
        </div>

        {/* Lado Central: Consumo de Sarin IA */}
        <div className="md:w-64 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1">
              <Icon name="sparkles" size={14} className="text-sf-primary" />
              <span>Sarin IA</span>
            </span>
            <span className="tabular-nums text-slate-600">
              {isEnterprise
                ? `${subInfo.cuota_ia_usada.toLocaleString('es-CO')} turnos`
                : `${subInfo.cuota_ia_usada} / ${subInfo.cuota_ia_total} (${iaPercent}%)`}
            </span>
          </div>

          {!isEnterprise && (
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  iaPercent >= 90 ? 'bg-red-500' : iaPercent >= 75 ? 'bg-amber-500' : 'bg-sf-primary'
                }`}
                style={{ width: `${iaPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Lado Derecho: Botón de Renovación por WhatsApp */}
        <div className="shrink-0 flex items-center">
          <a
            href={renewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary min-h-[40px] px-4 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 transition flex items-center gap-2 shadow-2xs"
          >
            <span>💬 Renovar por WhatsApp</span>
          </a>
        </div>
      </div>
    </article>
  );
}

