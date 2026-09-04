import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import Login from './components/Login';
import { AppShell } from './components/layout/AppShell';
import { getSafeAuthErrorMessage, logoutUser, subscribeToAuthState } from './services/authService';
import { User } from './firebase/db';
import { canAccessPage, hashForPage, isPage, pageFromHash, Page } from './auth/accessControl';
import { CurrentUserProvider } from './auth/CurrentUserContext';
import { clearPrivateRuntimeCaches } from './services/pwaCacheService';

/** Cada página se carga bajo demanda para que el POS no descargue gráficas ni módulos que no usa. */
const PAGE_COMPONENTS: Record<Page, ComponentType> = {
  dashboard: lazy(() => import('./components/Dashboard')),
  inventory: lazy(() => import('./components/Inventory')),
  sales: lazy(() => import('./components/Sales')),
  'create-sale': lazy(() => import('./components/CreateSale')),
  employees: lazy(() => import('./components/UserManagement')),
  suppliers: lazy(() => import('./components/Suppliers')),
  orders: lazy(() => import('./components/PurchaseOrders')),
  reports: lazy(() => import('./components/Reports')),
  margins: lazy(() => import('./components/MarginReports')),
  restock: lazy(() => import('./components/Restock')),
  whatsapp: lazy(() => import('./components/WhatsAppChat')),
};

function PageFallback() {
  return (
    <div className="py-12 text-center text-gray-500" role="status">
      Cargando...
    </div>
  );
}

function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => subscribeToAuthState((user, error) => {
    setCurrentUser(user);
    setAuthLoading(false);
    setAuthError(error ? getSafeAuthErrorMessage(error, 'No se pudo verificar la sesión. Inténtalo de nuevo.') : null);
  }), []);

  useEffect(() => {
    void clearPrivateRuntimeCaches().catch(() => console.error('Error clearing private runtime caches.'));
  }, []);

  useEffect(() => {
    const syncHashRoute = () => {
      const nextPage = pageFromHash(window.location.hash);
      setPage(nextPage);
      const canonicalHash = hashForPage(nextPage);
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${canonicalHash}`);
      }
    };
    const handleLegacyNavigation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!isPage(detail)) return;
      setPage(detail);
      window.location.hash = hashForPage(detail);
    };

    syncHashRoute();
    window.addEventListener('hashchange', syncHashRoute);
    window.addEventListener('navigate', handleLegacyNavigation);
    return () => {
      window.removeEventListener('hashchange', syncHashRoute);
      window.removeEventListener('navigate', handleLegacyNavigation);
    };
  }, []);

  const navigateToPage = (nextPage: Page) => {
    setPage(nextPage);
    window.location.hash = hashForPage(nextPage);
  };

  const handleLogout = async () => {
    try {
      await clearPrivateRuntimeCaches().catch(() => console.error('Error clearing private runtime caches.'));
      await logoutUser();
      navigateToPage('dashboard');
    } catch (error) {
      setAuthError(getSafeAuthErrorMessage(error, 'No se pudo cerrar sesión. Inténtalo de nuevo.'));
    }
  };

  const pageComponent = useMemo(() => {
    if (!currentUser) return null;
    if (!canAccessPage(currentUser.role, page)) {
      return (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-sf-text">Acceso restringido</h2>
          <div className="text-gray-600">Tu rol no tiene permisos para acceder a esta sección.</div>
        </section>
      );
    }
    const PageComponent = PAGE_COMPONENTS[page];
    return (
      <Suspense fallback={<PageFallback />}>
        <PageComponent />
      </Suspense>
    );
  }, [page, currentUser]);

  if (authLoading) {
    return <div className="min-h-screen bg-sf-light p-8 text-center text-gray-600">Cargando sesión...</div>;
  }

  if (!currentUser) {
    if (authError) {
      return (
        <main className="min-h-screen bg-sf-light p-8 text-center text-gray-600">
          <div role="alert" className="mx-auto max-w-md rounded border border-red-200 bg-red-50 p-4 text-red-700">
            {authError}
          </div>
        </main>
      );
    }
    return <Login />;
  }

  return (
    <CurrentUserProvider value={currentUser}>
      <AppShell user={currentUser} page={page} onNavigate={navigateToPage} onLogout={handleLogout}>
        {authError && (
          <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-700">{authError}</div>
        )}
        {pageComponent}
      </AppShell>
    </CurrentUserProvider>
  );
}

export default App;
