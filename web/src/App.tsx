import { useEffect, useMemo, useState } from 'react';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import CreateSale from './components/CreateSale';
import WhatsAppChat from './components/WhatsAppChat';
import UserManagement from './components/UserManagement';
import Reports from './components/Reports';
import Suppliers from './components/Suppliers';
import PurchaseOrders from './components/PurchaseOrders';
import MarginReports from './components/MarginReports';
import Restock from './components/Restock';
import Login from './components/Login';
import { getSafeAuthErrorMessage, logoutUser, subscribeToAuthState } from './services/authService';
import { User } from './firebase/db';
import { canAccessPage, hashForPage, isPage, pageFromHash, Page } from './auth/accessControl';
import { clearPrivateRuntimeCaches } from './services/pwaCacheService';

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
    if (page === 'inventory') return <Inventory />;
    if (page === 'sales') return <Sales />;
    if (page === 'create-sale') return <CreateSale />;
    if (page === 'employees') return <UserManagement />;
    if (page === 'suppliers') return <Suppliers />;
    if (page === 'orders') return <PurchaseOrders />;
    if (page === 'reports') return <Reports />;
    if (page === 'margins') return <MarginReports />;
    if (page === 'restock') return <Restock />;
    if (page === 'whatsapp') return <WhatsAppChat />;
    return <Dashboard />;
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
    <div className="min-h-screen bg-sf-light text-sf-text font-poppins">
      <header className="bg-sf-primary text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">🛒 Surti Fácil</h1>
          <nav className="space-x-3">
            <button onClick={() => navigateToPage('dashboard')} className="hover:underline">Dashboard</button>
            <button onClick={() => navigateToPage('inventory')} className="hover:underline">Inventario</button>
            <button onClick={() => navigateToPage('sales')} className="hover:underline">Ventas</button>
            <button onClick={() => navigateToPage('create-sale')} className="hover:underline">Nueva Venta</button>
            {canAccessPage(currentUser.role, 'employees') && (
              <button onClick={() => navigateToPage('employees')} className="hover:underline">👥 Empleados</button>
            )}
            {canAccessPage(currentUser.role, 'suppliers') && (
              <button onClick={() => navigateToPage('suppliers')} className="hover:underline">🚚 Proveedores</button>
            )}
            {canAccessPage(currentUser.role, 'orders') && (
              <button onClick={() => navigateToPage('orders')} className="hover:underline">Pedidos</button>
            )}
            {canAccessPage(currentUser.role, 'restock') && (
              <button onClick={() => navigateToPage('restock')} className="hover:underline">Reposición</button>
            )}
            <button onClick={() => navigateToPage('reports')} className="hover:underline">Reportes</button>
            {canAccessPage(currentUser.role, 'margins') && (
              <button onClick={() => navigateToPage('margins')} className="hover:underline">Márgenes</button>
            )}
            {canAccessPage(currentUser.role, 'whatsapp') && (
              <button onClick={() => navigateToPage('whatsapp')} className="hover:underline">💬 WhatsApp</button>
            )}
            <button onClick={handleLogout} className="hover:underline">Cerrar sesión</button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        {authError && (
          <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-700">{authError}</div>
        )}
        {pageComponent}
      </main>
    </div>
  );
}

export default App;
