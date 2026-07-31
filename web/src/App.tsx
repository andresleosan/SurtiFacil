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
import { isAdminAsync } from './services/authService';

type Page = 'dashboard' | 'inventory' | 'sales' | 'create-sale' | 'whatsapp' | 'employees' | 'reports' | 'suppliers' | 'orders' | 'margins';

const ADMIN_ONLY_PAGES: Page[] = ['margins'];

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

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
    isAdminAsync().then((v) => { if (!cancelled) setIsAdmin(v); });
    return () => { cancelled = true; };
  }, []);

  const pageComponent = useMemo(() => {
    if (ADMIN_ONLY_PAGES.includes(page) && !isAdmin) {
      return (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-sf-text">🔒 Acceso restringido</h2>
          <div className="text-gray-600">
            Esta sección requiere rol de administrador.
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

    return <Dashboard />;
  }, [page, isAdmin]);

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
              📦 Pedidos
            </button>
            <button onClick={() => setPage('reports')} className="hover:underline">
              📊 Reportes
            </button>
            {isAdmin && (
              <button onClick={() => setPage('margins')} className="hover:underline">
                💰 Márgenes
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
