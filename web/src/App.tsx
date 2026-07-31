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
import { isAdminAsync, hasRoleAsync } from './services/authService';
import Restock from './components/Restock';

type Page = 'dashboard' | 'inventory' | 'sales' | 'create-sale' | 'whatsapp' | 'employees' | 'reports' | 'suppliers' | 'orders' | 'margins' | 'restock';

const ADMIN_OR_MANAGER_PAGES: Page[] = ['margins', 'restock'];

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [userRoles, setUserRoles] = useState<{ admin: boolean; manager: boolean }>({ admin: false, manager: false });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Page;
      if (detail) setPage(detail);
    };
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([isAdminAsync(), hasRoleAsync('manager')]).then(([admin, manager]) => {
      if (!cancelled) setUserRoles({ admin, manager });
    });
    return () => { cancelled = true; };
  }, []);

  const canAccessManagerPages = userRoles.admin || userRoles.manager;

  const pageComponent = useMemo(() => {
    if (ADMIN_OR_MANAGER_PAGES.includes(page) && !canAccessManagerPages) {
      return (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-sf-text">Acceso restringido</h2>
          <div className="text-gray-600">
            Esta sección requiere rol de administrador o gerente.
          </div>
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

    return <Dashboard />;
  }, [page, canAccessManagerPages]);

  return (
    <div className="min-h-screen bg-sf-light text-sf-text font-poppins">
      <header className="bg-sf-primary text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">🛒 Surti Fácil</h1>
          <nav className="space-x-3">
            <button onClick={() => setPage('dashboard')} className="hover:underline">
              Dashboard
            </button>
            <button onClick={() => setPage('inventory')} className="hover:underline">
              Inventario
            </button>
            <button onClick={() => setPage('sales')} className="hover:underline">
              Ventas
            </button>
            <button onClick={() => setPage('create-sale')} className="hover:underline">
              Nueva Venta
            </button>
            <button onClick={() => setPage('employees')} className="hover:underline">
              👥 Empleados
            </button>
            <button onClick={() => setPage('suppliers')} className="hover:underline">
              🚚 Proveedores
            </button>
            <button onClick={() => setPage('orders')} className="hover:underline">
              Pedidos
            </button>
            {canAccessManagerPages && (
              <button onClick={() => setPage('restock')} className="hover:underline">
                Reposición
              </button>
            )}
            <button onClick={() => setPage('reports')} className="hover:underline">
              Reportes
            </button>
            {canAccessManagerPages && (
              <button onClick={() => setPage('margins')} className="hover:underline">
                Márgenes
              </button>
            )}
            <button onClick={() => setPage('whatsapp')} className="hover:underline">
              💬 WhatsApp
            </button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">{pageComponent}</main>
    </div>
  );
}

export default App;
