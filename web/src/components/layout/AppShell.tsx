import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { canAccessPage, type Page } from '../../auth/accessControl';
import type { User } from '../../firebase/db';
import { useIsMobile, useIsWideScreen } from '../../hooks/useMediaQuery';
import { getActiveNegocioId, setActiveNegocioId } from '../../services/apiClient';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { findNavItem, MOBILE_TAB_LABELS, MOBILE_TAB_PAGES, NAV_GROUPS, NAV_ITEMS } from './navItems';
import { SarinBusinessCopilot } from '../SarinBusinessCopilot';

const SIDEBAR_STORAGE_KEY = 'surtifacil.sidebar.collapsed';

const ROLE_LABELS: Record<User['role'], string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  cashier: 'Cajero',
};

interface AppShellProps {
  user: User;
  page: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  children: ReactNode;
}

function readStoredCollapsed(): boolean | null {
  try {
    const value = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return value === null ? null : value === 'true';
  } catch {
    return null;
  }
}

function storeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
  } catch {
    // El almacenamiento puede estar bloqueado; la preferencia solo dura la sesión.
  }
}

function initials(user: User): string {
  const source = user.displayName?.trim() || user.email;
  return source.slice(0, 1).toUpperCase();
}

/**
 * Estructura responsiva de la aplicación autenticada inspirada en HoneyBook:
 * - Teléfonos: barra superior compacta + barra de pestañas inferior + hoja "Más";
 * - Tablets y escritorio: barra lateral jerárquica oscura (bg-sf-dark) con subgrupos desplegables
 *   y barra superior con acción hero "+ Nueva Venta" y menú de perfil.
 */
export function AppShell({ user, page, onNavigate, onLogout, children }: AppShellProps) {
  const isMobile = useIsMobile();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => canAccessPage(user.role, item.page)),
    [user.role],
  );

  return (
    <div className="min-h-screen bg-sf-light font-poppins text-sf-text md:flex">
      {!isMobile && (
        <Sidebar
          user={user}
          page={page}
          items={visibleItems}
          onNavigate={onNavigate}
          onLogout={onLogout}
          onOpenCopilot={() => setCopilotOpen(true)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile ? (
          <MobileTopBar user={user} page={page} onOpenCopilot={() => setCopilotOpen(true)} />
        ) : (
          <DesktopTopBar
            user={user}
            page={page}
            onNavigate={onNavigate}
            onLogout={onLogout}
            onOpenCopilot={() => setCopilotOpen(true)}
          />
        )}
        <main className={`container mx-auto w-full flex-1 px-4 py-4 md:px-6 md:py-8 ${isMobile ? 'pb-tabbar' : ''}`}>
          {children}
        </main>
      </div>
      {isMobile && (
        <MobileTabBar
          user={user}
          page={page}
          items={visibleItems}
          onNavigate={onNavigate}
          onLogout={onLogout}
          onOpenCopilot={() => setCopilotOpen(true)}
        />
      )}

      {/* Modal / Asesor Copiloto Gerencial Sarin */}
      <SarinBusinessCopilot isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}

interface NavProps {
  user: User;
  page: Page;
  items: readonly (typeof NAV_ITEMS)[number][];
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onOpenCopilot?: () => void;
}

function Sidebar({ user, page, items, onNavigate, onLogout, onOpenCopilot }: NavProps) {
  const isWide = useIsWideScreen();
  const [storedCollapsed, setStoredCollapsed] = useState<boolean | null>(() => readStoredCollapsed());
  const collapsed = storedCollapsed ?? !isWide;

  // Estado de subgrupos desplegables abiertos (por defecto todos abiertos para alta accesibilidad)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    sales: true,
    credits: true,
    catalog: true,
    purchases: true,
    channels: true,
    settings: true,
  }));

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setStoredCollapsed(next);
    storeCollapsed(next);
  };

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-sf-dark text-white transition-[width] duration-200 md:flex ${
        collapsed ? 'w-[76px]' : 'w-64'
      }`}
      aria-label="Menú principal"
    >
      {/* Cabecera Sidebar con Estado de Tienda y Botón Colapsar */}
      <div
        className={`flex h-16 items-center border-b border-white/10 px-3 ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sf-primary text-base shadow-sm">
              🛒
            </span>
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">SurtiFácil</span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Tienda Abierta
              </span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          aria-expanded={!collapsed}
          className="icon-btn text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} />
        </button>
      </div>

      {/* Botón Acceso Rápido a Copiloto Sarin */}
      <div className="px-2 pt-2 pb-1">
        <button
          type="button"
          onClick={onOpenCopilot}
          className={`flex w-full items-center gap-2 rounded-xl bg-gradient-to-r from-sf-primary/40 to-sf-cyan/30 border border-sf-cyan/40 px-2.5 py-2 text-xs font-bold text-white shadow-xs hover:border-sf-cyan transition ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
          aria-label="Abrir Sarin Copiloto Gerencial"
        >
          <span className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            {!collapsed && <span>Sarin Copiloto</span>}
          </span>
          {!collapsed && (
            <span className="rounded-full bg-sf-cyan/20 px-1.5 py-0.5 text-[9px] font-extrabold text-sf-cyan uppercase">
              IA
            </span>
          )}
        </button>
      </div>

      {/* Navegación Jerárquica HoneyBook */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Secciones del sistema">
        {collapsed ? (
          // Modo Colapsado: Iconos individuales con accesibilidad
          <ul className="space-y-1">
            {items.map((item) => {
              const active = item.page === page;
              return (
                <li key={item.page}>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.page)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    title={item.label}
                    className={`flex h-11 w-full items-center justify-center rounded-lg transition ${
                      active ? 'bg-sf-primary text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon name={item.icon} size={20} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          // Modo Expandido: Subgrupos desplegables con chevrons (HoneyBook)
          <div className="space-y-4">
            {NAV_GROUPS.map((group) => {
              // Filtrar solo las páginas permitidas en este grupo para el rol actual
              const groupItems = items.filter((item) => group.pages.includes(item.page));
              if (groupItems.length === 0) return null;

              const isOpen = openGroups[group.id] ?? true;
              const hasActiveChild = groupItems.some((item) => item.page === page);

              return (
                <div key={group.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-white/50 transition hover:text-white/90"
                  >
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">{group.icon}</span>
                      <span>{group.label}</span>
                    </span>
                    <Icon
                      name={isOpen ? 'chevron-down' : 'chevron-right'}
                      size={14}
                      className={hasActiveChild ? 'text-sf-cyan' : 'text-white/40'}
                    />
                  </button>

                  {isOpen && (
                    <ul className="space-y-0.5">
                      {groupItems.map((item) => {
                        const active = item.page === page;
                        return (
                          <li key={item.page}>
                            <button
                              type="button"
                              onClick={() => onNavigate(item.page)}
                              aria-current={active ? 'page' : undefined}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition ${
                                active
                                  ? 'bg-sf-primary text-white shadow-sm'
                                  : 'text-white/80 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <Icon name={item.icon} size={18} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          </li>
                        );
                      })}
                      {group.id === 'channels' && (
                        <>
                          <li key="storefront-mode-launcher">
                            <a
                              href={`#/tienda/${getActiveNegocioId() || 'surtifacil'}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <Icon name="store" size={18} />
                                <span className="truncate">Tienda Vecinal Web</span>
                              </span>
                              <Icon name="external-link" size={14} className="text-white/40" />
                            </a>
                          </li>
                          <li key="kiosk-mode-launcher">
                            <a
                              href={`#/kiosco/${getActiveNegocioId() || 'surtifacil'}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition"
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <Icon name="maximize" size={18} />
                                <span className="truncate">Modo Kiosco iPad</span>
                              </span>
                              <Icon name="external-link" size={14} className="text-white/40" />
                            </a>
                          </li>
                        </>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Pie del Menú Lateral: Perfil y Cerrar Sesión */}
      <div className="border-t border-white/10 p-2">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-3 rounded-lg bg-white/5 px-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sf-cyan text-xs font-bold text-sf-dark">
              {initials(user)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user.displayName || user.email}</p>
              <p className="truncate text-[11px] text-white/60">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          aria-label={collapsed ? 'Cerrar sesión' : undefined}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 hover:text-red-200 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Icon name="logout" size={18} />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}

interface DesktopTopBarProps {
  user: User;
  page: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  onOpenCopilot?: () => void;
}

function DesktopTopBar({ user, page, onNavigate, onLogout, onOpenCopilot }: DesktopTopBarProps) {
  const current = findNavItem(page);
  const [profileOpen, setProfileOpen] = useState(false);
  const isSuperAdmin = user.email.toLowerCase() === 'andres.san1404@gmail.com' || (user as any).isSuperAdmin;
  const operatedId = getActiveNegocioId();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-sf-text">{current?.label ?? 'SurtiFácil'}</h1>
        {operatedId ? (
          <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-900 inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Operando: {operatedId}
            <button
              type="button"
              onClick={() => {
                setActiveNegocioId(null);
                window.location.reload();
              }}
              className="text-[10px] text-amber-700 underline hover:text-amber-900 ml-1"
            >
              Salir
            </button>
          </span>
        ) : (
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 lg:inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Sede Central Medellín
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Botón Sarin Copiloto Gerencial */}
        <button
          type="button"
          onClick={onOpenCopilot}
          className="flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-sf-primary hover:text-sf-primary transition active:scale-95"
          aria-label="Abrir Sarin Copiloto Gerencial"
        >
          <span className="text-base">🤖</span>
          <span className="hidden sm:inline">Copiloto Sarin</span>
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => onNavigate('super-admin')}
            className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition border ${
              page === 'super-admin'
                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
            }`}
          >
            <Icon name="crown" size={16} />
            <span>SuperAdmin</span>
          </button>
        )}

        {/* Botón Hero + Nueva Venta (Patrón HoneyBook) */}
        <button
          type="button"
          onClick={() => onNavigate('create-sale')}
          className="flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
        >
          <Icon name="cart" size={18} />
          <span>+ Nueva Venta</span>
        </button>

        {/* Menú de Perfil de Cajero / Administrador */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            aria-expanded={profileOpen}
            aria-label="Menú de usuario"
            className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-1.5 pl-2 text-left transition hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sf-primary text-xs font-bold text-white">
              {initials(user)}
            </span>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-xs font-bold text-slate-800">{user.displayName || user.email}</p>
              <p className="truncate text-[10px] text-slate-500">{ROLE_LABELS[user.role]}</p>
            </div>
            <Icon name="chevron-down" size={14} className="text-slate-400" />
          </button>

          {profileOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setProfileOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="truncate text-xs font-bold text-slate-900">{user.displayName || 'Tendero'}</p>
                  <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                  <span className="mt-1 inline-block chip bg-sf-primary/10 text-[10px] text-sf-primary font-semibold">
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
                <div className="py-1">
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate('super-admin');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                    >
                      <Icon name="crown" size={16} className="text-purple-600" />
                      Centro SuperAdmin
                    </button>
                  )}
                  {canAccessPage(user.role, 'settings') && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate('settings');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Icon name="settings" size={16} className="text-slate-500" />
                      Configuración del Negocio
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Icon name="logout" size={16} />
                    Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MobileTopBar({ user, page, onOpenCopilot }: { user: User; page: Page; onOpenCopilot?: () => void }) {
  const current = findNavItem(page);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-sf-primary px-4 text-white shadow-md">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true">🛒</span>
        <span className="truncate text-base font-bold">{current?.label ?? 'Surti Fácil'}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCopilot}
          aria-label="Abrir Sarin Copiloto"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-base transition active:scale-95"
        >
          🤖
        </button>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold"
          aria-label={`${user.displayName || user.email}, ${ROLE_LABELS[user.role]}`}
          role="img"
        >
          {initials(user)}
        </span>
      </div>
    </header>
  );
}

function MobileTabBar({ user, page, items, onNavigate, onLogout, onOpenCopilot }: NavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tabItems = items.filter((item) => MOBILE_TAB_PAGES.includes(item.page));
  const moreItems = items.filter((item) => !MOBILE_TAB_PAGES.includes(item.page));
  const moreActive = moreItems.some((item) => item.page === page);

  useEffect(() => {
    setMoreOpen(false);
  }, [page]);

  const handleNavigate = (target: Page) => {
    setMoreOpen(false);
    onNavigate(target);
  };

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white safe-bottom"
      >
        <ul className="flex h-16 items-stretch">
          {tabItems.map((item) => {
            const active = item.page === page;
            return (
              <li key={item.page} className="flex-1">
                <button
                  type="button"
                  onClick={() => handleNavigate(item.page)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                    active ? 'text-sf-primary' : 'text-gray-500 hover:text-sf-text'
                  }`}
                >
                  <Icon name={item.icon} />
                  <span>{MOBILE_TAB_LABELS[item.page] ?? item.label}</span>
                </button>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                moreActive ? 'text-sf-primary' : 'text-gray-500 hover:text-sf-text'
              }`}
            >
              <Icon name="more" />
              <span>Más</span>
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Más opciones" flushBody>
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sf-primary text-base font-bold text-white">
            {initials(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.displayName || user.email}</p>
            <p className="truncate text-xs text-gray-500">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <ul className="divide-y divide-gray-100">
          {moreItems.map((item) => (
            <li key={item.page}>
              <button
                type="button"
                onClick={() => handleNavigate(item.page)}
                aria-current={item.page === page ? 'page' : undefined}
                className={`flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm font-medium transition ${
                  item.page === page ? 'bg-sf-light text-sf-primary' : 'hover:bg-gray-50'
                }`}
              >
                <Icon name={item.icon} className="text-sf-primary" />
                <span className="flex-1">{item.label}</span>
                <Icon name="chevron-right" className="text-gray-400" size={18} />
              </button>
            </li>
          ))}
          <li key="copilot-mobile-launcher">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onOpenCopilot?.();
              }}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm font-semibold hover:bg-gray-50 transition text-sf-primary"
            >
              <span className="text-lg">🤖</span>
              <span className="flex-1">Sarin Copiloto Gerencial (IA)</span>
              <Icon name="chevron-right" className="text-gray-400" size={18} />
            </button>
          </li>
          <li key="storefront-mobile-launcher">
            <a
              href={`#/tienda/${getActiveNegocioId() || 'surtifacil'}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMoreOpen(false)}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm font-medium hover:bg-gray-50 transition text-sf-text"
            >
              <Icon name="store" className="text-sf-primary" />
              <span className="flex-1">Tienda Vecinal Web</span>
              <Icon name="external-link" className="text-gray-400" size={18} />
            </a>
          </li>
          <li key="kiosk-mobile-launcher">
            <a
              href={`#/kiosco/${getActiveNegocioId() || 'surtifacil'}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMoreOpen(false)}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm font-medium hover:bg-gray-50 transition text-sf-text"
            >
              <Icon name="store" className="text-sf-primary" />
              <span className="flex-1">Modo Kiosco iPad</span>
              <Icon name="external-link" className="text-gray-400" size={18} />
            </a>
          </li>
        </ul>
        <div className="border-t border-gray-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              onLogout();
            }}
            className="btn-secondary w-full text-red-600 hover:bg-red-50"
          >
            <Icon name="logout" size={18} />
            Cerrar sesión
          </button>
        </div>
      </Modal>
    </>
  );
}
