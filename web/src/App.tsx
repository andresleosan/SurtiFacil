import { useEffect, useMemo, useState } from 'react';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import CreateSale from './components/CreateSale';
import WhatsAppChat from './components/WhatsAppChat';
import UserManagement from './components/UserManagement';
import Reports from './components/Reports';
import Suppliers from './components/Suppliers';

type Page = 'dashboard' | 'inventory' | 'sales' | 'create-sale' | 'whatsapp' | 'employees' | 'reports' | 'suppliers' | 'orders';

function App() {
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Page;
      if (detail) setPage(detail);
    };
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  const pageComponent = useMemo(() => {
    if (page === 'inventory') return <Inventory />;
    if (page === 'sales') return <Sales />;
    if (page === 'create-sale') return <CreateSale />;
    if (page === 'employees') return <UserManagement />;
    if (page === 'suppliers') return <Suppliers />;
    if (page === 'reports') return <Reports />;
  
    return <Dashboard />;
  }, [page]);

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
            <button onClick={() => setPage('reports')} className="hover:underline">
              📊 Reportes
            </button>
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
