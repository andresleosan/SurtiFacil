import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { canAccessPage, type Page } from '../../auth/accessControl';
import type { User } from '../../firebase/db';
import { useIsMobile, useIsWideScreen } from '../../hooks/useMediaQuery';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { findNavItem, MOBILE_TAB_LABELS, MOBILE_TAB_PAGES, NAV_ITEMS } from './navItems';

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
 * Estructura responsiva de la aplicación autenticada:
 * - teléfonos: barra superior compacta + barra de pestañas inferior + hoja "Más";
 * - tablets y escritorio: barra lateral colapsable con el menú completo.
 * Solo una de las dos navegaciones existe en el DOM a la vez.
 */
export function AppShell({ user, page, onNavigate, onLogout, children }: AppShellProps) {
  const isMobile = useIsMobile();
  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => canAccessPage(user.role, item.page)),
    [user.role],
  );

  return (
    <div className="min-h-screen bg-sf-light font-poppins text-sf-text md:flex">
      {!isMobile && (
        <Sidebar user={user} page={page} items={visibleItems} onNavigate={onNavigate} onLogout={onLogout} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {isMobile && <MobileTopBar user={user} page={page} />}
        <main className={`container mx-auto w-full flex-1 px-4 py-4 md:px-6 md:py-8 ${isMobile ? 'pb-tabbar' : ''}`}>
          {children}
        </main>
      </div>
      {isMobile && (
        <MobileTabBar user={user} page={page} items={visibleItems} onNavigate={onNavigate} onLogout={onLogout} />
      )}
    </div>
  );
}

interface NavProps {
  user: User;
  page: Page;
  items: readonly (typeof NAV_ITEMS)[number][];
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

function Sidebar({ user, page, items, onNavigate, onLogout }: NavProps) {
  const isWide = useIsWideScreen();
  const [storedCollapsed, setStoredCollapsed] = useState<boolean | null>(() => readStoredCollapsed());
  const collapsed = storedCollapsed ?? !isWide;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setStoredCollapsed(next);
    storeCollapsed(next);
  };

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-sf-dark text-white transition-[width] duration-200 md:flex ${collapsed ? 'w-[76px]' : 'w-64'}`}
      aria-label="Menú principal"
    >
      <div className={`flex h-16 items-center border-b border-white/10 px-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <span className="truncate text-lg font-bold">
            <span aria-hidden="true">🛒</span> Surti Fácil
          </span>
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

      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-2">
          {items.map((item) => {
            const active = item.page === page;
            return (
              <li key={item.page}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.page)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                    collapsed ? 'justify-center' : ''
                  } ${active ? 'bg-sf-primary text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                >
                  <Icon name={item.icon} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 p-2">
        {!collapsed && (
          <div className="mb-1 flex items-center gap-3 px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sf-cyan text-sm font-bold text-sf-dark">
              {initials(user)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.displayName || user.email}</p>
              <p className="truncate text-xs text-white/60">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          aria-label={collapsed ? 'Cerrar sesión' : undefined}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Icon name="logout" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}

function MobileTopBar({ user, page }: { user: User; page: Page }) {
  const current = findNavItem(page);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-sf-primary px-4 text-white shadow-md">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true">🛒</span>
        <span className="truncate text-base font-bold">{current?.label ?? 'Surti Fácil'}</span>
      </div>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold"
        aria-label={`${user.displayName || user.email}, ${ROLE_LABELS[user.role]}`}
        role="img"
      >
        {initials(user)}
      </span>
    </header>
  );
}

function MobileTabBar({ user, page, items, onNavigate, onLogout }: NavProps) {
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
