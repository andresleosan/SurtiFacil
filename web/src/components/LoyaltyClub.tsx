import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { onDataChange } from '../services/apiClient';
import {
  adjustLoyaltyPoints,
  createCoupon,
  deleteCoupon,
  enrollLoyaltyMember,
  generateCouponWhatsAppText,
  getCoupons,
  getLoyaltyAccounts,
  getLoyaltyMovements,
  getLoyaltySummary,
  openCouponShareWhatsApp,
  openLoyaltyBalanceWhatsApp,
  updateCoupon,
  updateLoyaltyConfig,
} from '../services/loyaltyService';
import { getStoreSettings } from '../services/settingsService';
import type {
  DiscountCoupon,
  LoyaltyAccount,
  LoyaltyConfig,
  LoyaltyMovement,
  LoyaltySummary,
} from '../types/loyalty';
import type { StoreSettings } from '../types/storeSettings';
import { formatCentsCOP } from '../utils/currency';
import {
  calculateMaxRedeemablePoints,
  calculatePointsEarned,
  DEFAULT_LOYALTY_CONFIG,
  formatLoyaltyPhone,
} from '../utils/loyaltyEngine';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';

type ClubTab = 'members' | 'coupons' | 'rules';

const MOVEMENT_BADGES: Record<LoyaltyMovement['type'], { label: string; cls: string }> = {
  earn: { label: 'Acumulación', cls: 'bg-emerald-100 text-emerald-800' },
  redeem: { label: 'Canje', cls: 'bg-blue-100 text-blue-800' },
  bonus: { label: 'Bono', cls: 'bg-amber-100 text-amber-900' },
  adjust: { label: 'Ajuste', cls: 'bg-slate-200 text-slate-800' },
};

export default function LoyaltyClub() {
  const currentUser = useCurrentUser();
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [activeTab, setActiveTab] = useState<ClubTab>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [storeInfo, setStoreInfo] = useState<Partial<StoreSettings>>({
    nombre: 'SurtiFácil Abastos',
    slug: 'surtifacil',
  });
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([]);
  const [coupons, setCoupons] = useState<DiscountCoupon[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Inscribir Vecino
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollPhone, setEnrollPhone] = useState('');
  const [enrollName, setEnrollName] = useState('');
  const [enrollBonus, setEnrollBonus] = useState('0');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSaving, setEnrollSaving] = useState(false);

  // Modal Historial de Movimientos
  const [movementsAccount, setMovementsAccount] = useState<LoyaltyAccount | null>(null);
  const [movements, setMovements] = useState<LoyaltyMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  // Modal Bono / Ajuste
  const [adjustAccount, setAdjustAccount] = useState<LoyaltyAccount | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('10');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Modal Nuevo Cupón
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDesc, setCouponDesc] = useState('');
  const [couponType, setCouponType] = useState<'percentage' | 'fixed_cents'>('percentage');
  const [couponValuePesosOrPct, setCouponValuePesosOrPct] = useState('10');
  const [couponMinPesos, setCouponMinPesos] = useState('10000');
  const [couponMaxDiscPesos, setCouponMaxDiscPesos] = useState('10000');
  const [couponMaxUses, setCouponMaxUses] = useState('50');
  const [couponExpires, setCouponExpires] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSaving, setCouponSaving] = useState(false);

  // Eliminación en 2 toques y Modal Compartir Cupón WhatsApp
  const [confirmDeleteCouponId, setConfirmDeleteCouponId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [shareCoupon, setShareCoupon] = useState<DiscountCoupon | null>(null);
  const [sharePhone, setSharePhone] = useState('');

  // Formulario Reglas del Club
  const [rulesForm, setRulesForm] = useState<{
    enabled: boolean;
    pesosPerPointPesos: string;
    pointValuePesos: string;
    minRedeemPoints: string;
    maxRedeemPercent: string;
  }>({
    enabled: true,
    pesosPerPointPesos: '1000',
    pointValuePesos: '50',
    minRedeemPoints: '10',
    maxRedeemPercent: '50',
  });
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  const syncRulesForm = (cfg: LoyaltyConfig) => {
    setRulesForm({
      enabled: cfg.enabled,
      pesosPerPointPesos: String(Math.round(cfg.pesos_per_point_cents / 100)),
      pointValuePesos: String(Math.round(cfg.point_value_cents / 100)),
      minRedeemPoints: String(cfg.min_redeem_points),
      maxRedeemPercent: String(cfg.max_redeem_percent),
    });
  };

  const loadAll = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const [sumData, accData, coupData, settingsData] = await Promise.all([
        getLoyaltySummary(),
        getLoyaltyAccounts(),
        getCoupons(),
        getStoreSettings().catch(() => ({ nombre: 'SurtiFácil Abastos', slug: 'surtifacil' })),
      ]);
      setSummary(sumData);
      setAccounts(accData);
      setCoupons(coupData);
      setStoreInfo(settingsData);
      syncRulesForm(sumData.config || DEFAULT_LOYALTY_CONFIG);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el Club de Puntos.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(false);
    const unsub = onDataChange('loyalty', () => {
      void loadAll(true);
    });
    return unsub;
  }, [loadAll]);

  const activeConfig: LoyaltyConfig = summary?.config || DEFAULT_LOYALTY_CONFIG;

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return accounts;
    const digitsQ = q.replace(/\D/g, '');
    return accounts.filter((a) => {
      const nameMatch = a.customer_name.toLowerCase().includes(q);
      const phoneMatch = digitsQ ? a.phone.includes(digitsQ) : a.phone.includes(q);
      return nameMatch || phoneMatch;
    });
  }, [accounts, searchQuery]);

  // Simulador en vivo para reglas del Club (mercado de $ 20.000 COP)
  const simulatedRulesConfig = useMemo<LoyaltyConfig>(() => {
    return {
      enabled: rulesForm.enabled,
      pesos_per_point_cents: Math.max(100, Math.round(Number(rulesForm.pesosPerPointPesos) || 1000)) * 100,
      point_value_cents: Math.max(1, Math.round(Number(rulesForm.pointValuePesos) || 50)) * 100,
      min_redeem_points: Math.max(1, Math.round(Number(rulesForm.minRedeemPoints) || 10)),
      max_redeem_percent: Math.max(5, Math.min(100, Math.round(Number(rulesForm.maxRedeemPercent) || 50))),
    };
  }, [rulesForm]);

  const simulatedEarnedOn20k = useMemo(
    () => calculatePointsEarned(2000000, simulatedRulesConfig),
    [simulatedRulesConfig]
  );
  const simulatedMaxRedeemOn20k = useMemo(
    () => calculateMaxRedeemablePoints(1000, 2000000, simulatedRulesConfig),
    [simulatedRulesConfig]
  );

  // Handlers
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnrollError(null);
    try {
      setEnrollSaving(true);
      await enrollLoyaltyMember({
        phone: enrollPhone,
        customer_name: enrollName,
        welcome_bonus_points: canManage ? Math.max(0, Math.round(Number(enrollBonus) || 0)) : 0,
      });
      setEnrollOpen(false);
      setEnrollPhone('');
      setEnrollName('');
      setEnrollBonus('0');
      showToast('Vecino inscrito exitosamente en el Club de Puntos.');
      await loadAll(true);
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : 'No se pudo inscribir al vecino.');
    } finally {
      setEnrollSaving(false);
    }
  };

  const openMovementsModal = async (account: LoyaltyAccount) => {
    setMovementsAccount(account);
    setMovements([]);
    setMovementsError(null);
    setMovementsLoading(true);
    try {
      const list = await getLoyaltyMovements(account.id);
      setMovements(list);
    } catch (err: unknown) {
      setMovementsError(err instanceof Error ? err.message : 'Error al cargar movimientos.');
    } finally {
      setMovementsLoading(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustAccount) return;
    setAdjustError(null);
    try {
      setAdjustSaving(true);
      const delta = Math.round(Number(adjustDelta) || 0);
      await adjustLoyaltyPoints(adjustAccount.id, delta, adjustReason);
      setAdjustAccount(null);
      setAdjustDelta('10');
      setAdjustReason('');
      showToast('Saldo de puntos actualizado exitosamente.');
      await loadAll(true);
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : 'No se pudo ajustar los puntos.');
    } finally {
      setAdjustSaving(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);
    try {
      setCouponSaving(true);
      const rawVal = Math.round(Number(couponValuePesosOrPct) || 0);
      const discountValue = couponType === 'percentage' ? rawVal : rawVal * 100;
      const minPurchaseCents = Math.max(0, Math.round(Number(couponMinPesos) || 0)) * 100;
      const maxDiscCents =
        couponType === 'percentage' && Number(couponMaxDiscPesos) > 0
          ? Math.round(Number(couponMaxDiscPesos)) * 100
          : null;
      const maxUses = Number(couponMaxUses) > 0 ? Math.round(Number(couponMaxUses)) : null;

      await createCoupon({
        code: couponCode,
        description: couponDesc.trim() || undefined,
        discount_type: couponType,
        discount_value: discountValue,
        min_purchase_cents: minPurchaseCents,
        max_discount_cents: maxDiscCents,
        max_uses: maxUses,
        expires_at: couponExpires.trim() || null,
      });

      setCouponModalOpen(false);
      setCouponCode('');
      setCouponDesc('');
      setCouponExpires('');
      showToast('Cupón creado y listo para compartir por WhatsApp.');
      await loadAll(true);
    } catch (err: unknown) {
      setCouponError(err instanceof Error ? err.message : 'No se pudo crear el cupón.');
    } finally {
      setCouponSaving(false);
    }
  };

  const handleToggleCouponActive = async (coupon: DiscountCoupon) => {
    try {
      await updateCoupon(coupon.id, { active: coupon.active !== 1 });
      showToast(coupon.active === 1 ? `Cupón ${coupon.code} pausado.` : `Cupón ${coupon.code} activado.`);
      await loadAll(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado del cupón.');
    }
  };

  const handleConfirmDeleteCoupon = async (couponId: string) => {
    try {
      await deleteCoupon(couponId);
      setConfirmDeleteCouponId(null);
      showToast('Cupón eliminado.');
      await loadAll(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el cupón.');
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(code);
      }
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      setCopiedCode(code);
    }
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setRulesError(null);
    try {
      setRulesSaving(true);
      await updateLoyaltyConfig(simulatedRulesConfig);
      showToast('Reglas del Club de Puntos guardadas exitosamente.');
      await loadAll(true);
    } catch (err: unknown) {
      setRulesError(err instanceof Error ? err.message : 'Error al guardar reglas.');
    } finally {
      setRulesSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <PageHeader
        title="Club de Puntos del Barrio"
        badge={
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
              activeConfig.enabled
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {activeConfig.enabled ? '⭐ Activo' : '⏸️ Pausado'}
          </span>
        }
        description="Fideliza a tus vecinos por número celular, canjea puntos en pesos COP y comparte cupones por WhatsApp."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEnrollOpen(true)}
              className="btn-primary min-h-[44px] px-4 text-sm font-bold"
            >
              <Icon name="plus" size={18} />
              <span>Inscribir Vecino</span>
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setCouponModalOpen(true)}
                className="btn-success min-h-[44px] px-4 text-sm font-bold"
              >
                <Icon name="gift" size={18} />
                <span>Nuevo Cupón WhatsApp</span>
              </button>
            )}
          </div>
        }
      />

      {statusMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          ✅ {statusMessage}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadAll(false)}
            className="btn-secondary min-h-[44px] px-4 text-xs font-bold shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* 4 Tarjetas KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vecinos Inscritos</p>
          <p className="mt-1 text-2xl font-black text-sf-text tabular-nums">
            {summary?.total_members ?? accounts.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Identificados por número celular</p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Puntos Activos en Calle</p>
          <p className="mt-1 text-2xl font-black text-sf-primary tabular-nums">
            {summary?.active_points_balance ?? 0} pts
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-700 tabular-nums">
            Equivale a {formatCentsCOP(summary?.active_points_value_cents ?? 0)}
          </p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cupones Activos</p>
          <p className="mt-1 text-2xl font-black text-amber-600 tabular-nums">
            {summary?.active_coupons_count ?? coupons.filter((c) => c.active === 1).length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary?.total_coupon_redemptions ?? 0} redenciones totales
          </p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Regla Vigente</p>
          <p className="mt-1 text-lg font-black text-sf-text tabular-nums">
            1 pt / {formatCentsCOP(activeConfig.pesos_per_point_cents)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Cada punto vale {formatCentsCOP(activeConfig.point_value_cents)} (máx. {activeConfig.max_redeem_percent}%)
          </p>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2" role="tablist" aria-label="Secciones del Club de Puntos">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'members'}
          onClick={() => setActiveTab('members')}
          className={`min-h-[44px] rounded-xl px-4 text-sm font-bold transition ${
            activeTab === 'members'
              ? 'bg-sf-primary text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          👥 Vecinos del Club ({accounts.length})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'coupons'}
          onClick={() => setActiveTab('coupons')}
          className={`min-h-[44px] rounded-xl px-4 text-sm font-bold transition ${
            activeTab === 'coupons'
              ? 'bg-sf-primary text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          🎟️ Cupones WhatsApp ({coupons.length})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'rules'}
          onClick={() => setActiveTab('rules')}
          className={`min-h-[44px] rounded-xl px-4 text-sm font-bold transition ${
            activeTab === 'rules'
              ? 'bg-sf-primary text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          ⚙️ Reglas del Club
        </button>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-slate-500" role="status">
          Cargando datos del Club de Puntos...
        </div>
      ) : activeTab === 'members' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar vecino por nombre o número celular..."
                aria-label="Buscar vecino en el Club de Puntos"
                className="input pl-10 min-h-[44px]"
              />
            </div>
          </div>

          {filteredAccounts.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 space-y-2">
              <p className="text-3xl">⭐</p>
              <p className="font-bold text-slate-700">No encontramos vecinos con ese criterio</p>
              <p className="text-xs">Inscribe clientes frecuentes con su celular o registra ventas con su número en el POS.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredAccounts.map((acc) => {
                const valueCents = acc.points_balance * activeConfig.point_value_cents;
                return (
                  <article key={acc.id} className="card p-4 flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-sf-text truncate">{acc.customer_name}</h3>
                        <p className="text-xs font-medium text-slate-500 tabular-nums">
                          📱 {formatLoyaltyPhone(acc.phone)} · {acc.total_purchases_count} compras (
                          {formatCentsCOP(acc.total_spent_cents)})
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center rounded-xl bg-amber-100 px-3 py-1 text-sm font-black text-amber-900 tabular-nums">
                          ⭐ {acc.points_balance} pts
                        </span>
                        <p className="mt-1 text-xs font-bold text-emerald-700 tabular-nums">
                          Vale {formatCentsCOP(valueCents)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => openLoyaltyBalanceWhatsApp(acc, activeConfig, storeInfo)}
                        className="btn-success min-h-[44px] px-3 text-xs font-bold"
                      >
                        📲 Enviar Saldo WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={() => void openMovementsModal(acc)}
                        className="btn-secondary min-h-[44px] px-3 text-xs font-semibold"
                      >
                        📜 Historial
                      </button>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustAccount(acc);
                            setAdjustDelta('10');
                            setAdjustReason('');
                            setAdjustError(null);
                          }}
                          className="btn-secondary min-h-[44px] px-3 text-xs font-semibold"
                        >
                          ✨ Bono / Ajuste
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'coupons' ? (
        <div className="space-y-4">
          {coupons.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 space-y-2">
              <p className="text-3xl">🎟️</p>
              <p className="font-bold text-slate-700">Aún no has creado cupones promocionales</p>
              <p className="text-xs">Crea códigos para fechas especiales o quincenas y compártelos por WhatsApp.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {coupons.map((coupon) => {
                const isActive = coupon.active === 1;
                const isConfirmingDelete = confirmDeleteCouponId === coupon.id;
                const benefitText =
                  coupon.discount_type === 'percentage'
                    ? `${coupon.discount_value}% DCTO`
                    : `${formatCentsCOP(coupon.discount_value)} DCTO`;

                return (
                  <article
                    key={coupon.id}
                    className={`card p-4 flex flex-col justify-between gap-3 ${
                      !isActive ? 'opacity-75 bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-lg bg-sf-dark px-2.5 py-1 font-mono text-sm font-black tracking-wider text-sf-cyan">
                            {coupon.code}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isActive ? 'Activo' : 'Pausado'}
                          </span>
                        </div>
                        {coupon.description && (
                          <p className="mt-1.5 text-sm font-medium text-slate-700">{coupon.description}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 tabular-nums">
                          <span>Compra mín: {formatCentsCOP(coupon.min_purchase_cents)}</span>
                          <span>
                            • Usos: {coupon.used_count}
                            {coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                          </span>
                          {coupon.expires_at && <span>• Vence: {coupon.expires_at}</span>}
                        </div>
                      </div>

                      <span className="shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-900 tabular-nums">
                        {benefitText}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShareCoupon(coupon);
                          setSharePhone('');
                        }}
                        className="btn-success min-h-[44px] px-3 text-xs font-bold"
                      >
                        📲 Compartir WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopyCode(coupon.code)}
                        className="btn-secondary min-h-[44px] px-3 text-xs font-semibold"
                      >
                        {copiedCode === coupon.code ? '✅ Copiado' : '📋 Copiar'}
                      </button>

                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleToggleCouponActive(coupon)}
                            className="btn-secondary min-h-[44px] px-3 text-xs font-semibold"
                          >
                            {isActive ? '⏸️ Pausar' : '▶️ Activar'}
                          </button>

                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleConfirmDeleteCoupon(coupon.id)}
                                className="min-h-[44px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCouponId(null)}
                                className="btn-secondary min-h-[44px] px-3 text-xs font-semibold"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCouponId(coupon.id)}
                              aria-label={`Eliminar cupón ${coupon.code}`}
                              className="min-h-[44px] min-w-[44px] rounded-xl border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              🗑️
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSaveRules} className="card p-5 space-y-5 max-w-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-sf-text">Configuración del Club de Puntos</h3>
              <p className="text-xs text-slate-500">
                Define cuántos puntos ganan tus vecinos y el valor en pesos COP al canjear.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={rulesForm.enabled}
                disabled={!canManage}
                onChange={(e) => setRulesForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="h-5 w-5 rounded border-slate-300 text-sf-primary"
              />
              <span>Programa Activo</span>
            </label>
          </div>

          {rulesError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {rulesError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rule-pesos-per-point" className="block text-xs font-bold text-slate-700 mb-1">
                Pesos COP por cada 1 punto ganado
              </label>
              <input
                id="rule-pesos-per-point"
                type="number"
                min={100}
                step={1}
                disabled={!canManage}
                value={rulesForm.pesosPerPointPesos}
                onChange={(e) => setRulesForm((f) => ({ ...f, pesosPerPointPesos: e.target.value }))}
                className="input min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="rule-point-value" className="block text-xs font-bold text-slate-700 mb-1">
                Valor en pesos COP de 1 punto al canjear
              </label>
              <input
                id="rule-point-value"
                type="number"
                min={1}
                step={1}
                disabled={!canManage}
                value={rulesForm.pointValuePesos}
                onChange={(e) => setRulesForm((f) => ({ ...f, pointValuePesos: e.target.value }))}
                className="input min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="rule-min-redeem" className="block text-xs font-bold text-slate-700 mb-1">
                Mínimo de puntos para canjear
              </label>
              <input
                id="rule-min-redeem"
                type="number"
                min={1}
                disabled={!canManage}
                value={rulesForm.minRedeemPoints}
                onChange={(e) => setRulesForm((f) => ({ ...f, minRedeemPoints: e.target.value }))}
                className="input min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="rule-max-percent" className="block text-xs font-bold text-slate-700 mb-1">
                % máximo de compra pagable con puntos
              </label>
              <input
                id="rule-max-percent"
                type="number"
                min={5}
                max={100}
                disabled={!canManage}
                value={rulesForm.maxRedeemPercent}
                onChange={(e) => setRulesForm((f) => ({ ...f, maxRedeemPercent: e.target.value }))}
                className="input min-h-[44px]"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950 space-y-1">
            <p className="font-bold">🧮 Simulador en vivo (Mercado de $ 20.000 COP):</p>
            <p className="tabular-nums">
              • El vecino acumula <strong>+{simulatedEarnedOn20k} puntos</strong>.
            </p>
            <p className="tabular-nums">
              • Si tiene puntos suficientes, puede canjear hasta{' '}
              <strong>{simulatedMaxRedeemOn20k.max_points} puntos</strong> (ahorro de{' '}
              <strong>{formatCentsCOP(simulatedMaxRedeemOn20k.max_discount_cents)}</strong>).
            </p>
          </div>

          {canManage ? (
            <button
              type="submit"
              disabled={rulesSaving}
              className="btn-primary min-h-[44px] px-6 text-sm font-bold"
            >
              {rulesSaving ? 'Guardando...' : 'Guardar Reglas del Club'}
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              Solo el administrador o gerente del local puede modificar estas reglas.
            </p>
          )}
        </form>
      )}

      {/* Modal Inscribir Vecino */}
      <Modal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Inscribir Vecino al Club de Puntos"
        size="sm"
      >
        <form onSubmit={handleEnrollSubmit} className="space-y-4">
          {enrollError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {enrollError}
            </div>
          )}
          <div>
            <label htmlFor="enroll-phone" className="block text-xs font-bold text-slate-700 mb-1">
              Número Celular / WhatsApp *
            </label>
            <input
              id="enroll-phone"
              type="tel"
              required
              value={enrollPhone}
              onChange={(e) => setEnrollPhone(e.target.value)}
              placeholder="Ej: 300 555 8899"
              className="input min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor="enroll-name" className="block text-xs font-bold text-slate-700 mb-1">
              Nombre del Vecino *
            </label>
            <input
              id="enroll-name"
              type="text"
              required
              value={enrollName}
              onChange={(e) => setEnrollName(e.target.value)}
              placeholder="Ej: Doña Lucía Ramírez"
              className="input min-h-[44px]"
            />
          </div>
          {canManage && (
            <div>
              <label htmlFor="enroll-bonus" className="block text-xs font-bold text-slate-700 mb-1">
                Bono de Bienvenida (Puntos opcionales)
              </label>
              <input
                id="enroll-bonus"
                type="number"
                min={0}
                value={enrollBonus}
                onChange={(e) => setEnrollBonus(e.target.value)}
                className="input min-h-[44px]"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEnrollOpen(false)}
              className="btn-secondary min-h-[44px] px-4 text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enrollSaving}
              className="btn-primary min-h-[44px] px-5 text-xs font-bold"
            >
              {enrollSaving ? 'Inscribiendo...' : 'Inscribir Vecino'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Historial de Movimientos */}
      <Modal
        open={Boolean(movementsAccount)}
        onClose={() => setMovementsAccount(null)}
        title={`Historial de Puntos · ${movementsAccount?.customer_name || ''}`}
        size="md"
      >
        <div className="space-y-3">
          {movementsLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">Cargando movimientos...</p>
          ) : movementsError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {movementsError}
            </div>
          ) : movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Este vecino aún no registra movimientos de puntos.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {movements.map((mov) => {
                const badge = MOVEMENT_BADGES[mov.type] || MOVEMENT_BADGES.adjust;
                return (
                  <li key={mov.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">
                          {mov.description || 'Movimiento'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {mov.created_at ? new Date(mov.created_at).toLocaleString('es-CO') : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <span
                        className={`font-black text-sm ${
                          mov.points_delta >= 0 ? 'text-emerald-700' : 'text-blue-700'
                        }`}
                      >
                        {mov.points_delta >= 0 ? `+${mov.points_delta}` : mov.points_delta} pts
                      </span>
                      <p className="text-[11px] text-slate-500">Saldo: {mov.balance_after} pts</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      {/* Modal Bono / Ajuste Manual */}
      <Modal
        open={Boolean(adjustAccount)}
        onClose={() => setAdjustAccount(null)}
        title={`Bono o Ajuste · ${adjustAccount?.customer_name || ''}`}
        size="sm"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          {adjustError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {adjustError}
            </div>
          )}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs flex justify-between">
            <span className="text-slate-600">Saldo actual:</span>
            <span className="font-black text-sf-primary tabular-nums">
              {adjustAccount?.points_balance ?? 0} puntos
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['+10', '+20', '+50', '-10'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAdjustDelta(preset.replace('+', ''))}
                className="btn-secondary min-h-[44px] px-3 text-xs font-bold"
              >
                {preset} pts
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="adjust-delta" className="block text-xs font-bold text-slate-700 mb-1">
              Puntos a sumar o restar
            </label>
            <input
              id="adjust-delta"
              type="number"
              required
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
              className="input min-h-[44px]"
            />
          </div>
          <div>
            <label htmlFor="adjust-reason" className="block text-xs font-bold text-slate-700 mb-1">
              Motivo del ajuste o bono *
            </label>
            <input
              id="adjust-reason"
              type="text"
              required
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Ej: Premio cliente frecuente del mes"
              className="input min-h-[44px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAdjustAccount(null)}
              className="btn-secondary min-h-[44px] px-4 text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={adjustSaving}
              className="btn-primary min-h-[44px] px-5 text-xs font-bold"
            >
              {adjustSaving ? 'Aplicando...' : 'Aplicar Ajuste'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Nuevo Cupón WhatsApp */}
      <Modal
        open={couponModalOpen}
        onClose={() => setCouponModalOpen(false)}
        title="Crear Cupón Promocional WhatsApp"
        size="md"
      >
        <form onSubmit={handleCreateCoupon} className="space-y-4">
          {couponError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {couponError}
            </div>
          )}

          {/* Presets rápidos */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCouponCode('VECINO15');
                setCouponDesc('15% de descuento en tu mercado');
                setCouponType('percentage');
                setCouponValuePesosOrPct('15');
                setCouponMinPesos('15000');
                setCouponMaxDiscPesos('10000');
              }}
              className="btn-secondary min-h-[44px] px-3 text-xs font-bold"
            >
              ⚡ 15% Vecinos
            </button>
            <button
              type="button"
              onClick={() => {
                setCouponCode('QUINCENA3000');
                setCouponDesc('$ 3.000 COP de ahorro en quincena');
                setCouponType('fixed_cents');
                setCouponValuePesosOrPct('3000');
                setCouponMinPesos('20000');
                setCouponMaxDiscPesos('');
              }}
              className="btn-secondary min-h-[44px] px-3 text-xs font-bold"
            >
              ⚡ $ 3.000 Quincena
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="coupon-code" className="block text-xs font-bold text-slate-700 mb-1">
                Código del Cupón *
              </label>
              <input
                id="coupon-code"
                type="text"
                required
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Ej: PAISA10"
                className="input min-h-[44px] font-mono uppercase"
              />
            </div>

            <div>
              <label htmlFor="coupon-type" className="block text-xs font-bold text-slate-700 mb-1">
                Tipo de Descuento
              </label>
              <select
                id="coupon-type"
                value={couponType}
                onChange={(e) => setCouponType(e.target.value as 'percentage' | 'fixed_cents')}
                className="input min-h-[44px]"
              >
                <option value="percentage">Porcentaje (%)</option>
                <option value="fixed_cents">Valor Fijo ($ COP)</option>
              </select>
            </div>

            <div>
              <label htmlFor="coupon-value" className="block text-xs font-bold text-slate-700 mb-1">
                {couponType === 'percentage' ? 'Porcentaje de descuento (%) *' : 'Valor del descuento ($ COP) *'}
              </label>
              <input
                id="coupon-value"
                type="number"
                min={1}
                max={couponType === 'percentage' ? 100 : undefined}
                required
                value={couponValuePesosOrPct}
                onChange={(e) => setCouponValuePesosOrPct(e.target.value)}
                className="input min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="coupon-min" className="block text-xs font-bold text-slate-700 mb-1">
                Compra Mínima ($ COP)
              </label>
              <input
                id="coupon-min"
                type="number"
                min={0}
                step={1}
                value={couponMinPesos}
                onChange={(e) => setCouponMinPesos(e.target.value)}
                className="input min-h-[44px]"
              />
            </div>

            {couponType === 'percentage' && (
              <div>
                <label htmlFor="coupon-max-disc" className="block text-xs font-bold text-slate-700 mb-1">
                  Tope Máximo de Descuento ($ COP)
                </label>
                <input
                  id="coupon-max-disc"
                  type="number"
                  min={0}
                  step={1}
                  value={couponMaxDiscPesos}
                  onChange={(e) => setCouponMaxDiscPesos(e.target.value)}
                  className="input min-h-[44px]"
                />
              </div>
            )}

            <div>
              <label htmlFor="coupon-uses" className="block text-xs font-bold text-slate-700 mb-1">
                Límite de Usos (0 = ilimitado)
              </label>
              <input
                id="coupon-uses"
                type="number"
                min={0}
                value={couponMaxUses}
                onChange={(e) => setCouponMaxUses(e.target.value)}
                className="input min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="coupon-expires" className="block text-xs font-bold text-slate-700 mb-1">
                Fecha de Vencimiento (Opcional)
              </label>
              <input
                id="coupon-expires"
                type="date"
                value={couponExpires}
                onChange={(e) => setCouponExpires(e.target.value)}
                className="input min-h-[44px]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="coupon-desc" className="block text-xs font-bold text-slate-700 mb-1">
              Descripción para el vecino
            </label>
            <input
              id="coupon-desc"
              type="text"
              value={couponDesc}
              onChange={(e) => setCouponDesc(e.target.value)}
              placeholder="Ej: Válido en Fruver, Granos y Lácteos este fin de semana"
              className="input min-h-[44px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCouponModalOpen(false)}
              className="btn-secondary min-h-[44px] px-4 text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={couponSaving}
              className="btn-success min-h-[44px] px-5 text-xs font-bold"
            >
              {couponSaving ? 'Creando...' : 'Crear Cupón'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Compartir Cupón por WhatsApp */}
      <Modal
        open={Boolean(shareCoupon)}
        onClose={() => setShareCoupon(null)}
        title={`Compartir Cupón ${shareCoupon?.code || ''}`}
        size="md"
      >
        {shareCoupon && (
          <div className="space-y-4">
            <div>
              <label htmlFor="share-coupon-phone" className="block text-xs font-bold text-slate-700 mb-1">
                Celular del vecino (Opcional — si lo dejas vacío eliges contacto en WhatsApp)
              </label>
              <input
                id="share-coupon-phone"
                type="tel"
                value={sharePhone}
                onChange={(e) => setSharePhone(e.target.value)}
                placeholder="Ej: 300 456 7890"
                className="input min-h-[44px]"
              />
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs whitespace-pre-wrap text-slate-800 font-sans">
              {generateCouponWhatsAppText(shareCoupon, storeInfo)}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleCopyCode(generateCouponWhatsAppText(shareCoupon, storeInfo))}
                className="btn-secondary min-h-[44px] px-4 text-xs font-bold"
              >
                📋 Copiar Mensaje
              </button>
              <button
                type="button"
                onClick={() => openCouponShareWhatsApp(shareCoupon, storeInfo, sharePhone)}
                className="btn-success min-h-[44px] px-5 text-xs font-bold"
              >
                📲 Abrir en WhatsApp
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
