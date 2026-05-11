import { useMemo, useState } from 'react';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import CreateSale from './components/CreateSale';
import WhatsAppChat from './components/WhatsAppChat';

type Page = 'dashboard' | 'inventory' | 'sales' | 'create-sale' | 'whatsapp';

function App() {
  const [page, setPage] = useState<Page>('dashboard');

  const pageComponent = useMemo(() => {
    if (page === 'inventory') return <Inventory />;
    if (page === 'sales') return <Sales />;
    if (page === 'create-sale') return <CreateSale />;
  
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
