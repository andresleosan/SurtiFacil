import { useEffect, useState } from 'react';
import { Supplier } from '../firebase/db';
import { getSuppliers, addSupplier, updateSupplier, toggleSupplierActive, deleteSupplier } from '../services/supplierService';
import SupplierModal from './SupplierModal';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const formatCents = (cents: number): string => `$${(cents / 100).toLocaleString()}`;

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await getSuppliers();
      setSuppliers(data);
    } catch (err) {
      console.error('Error loading suppliers:', err);
      setError('Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleAdd = async (data: any) => {
    const newSupplier = await addSupplier(data);
    setSuppliers([...suppliers, newSupplier]);
    setShowAddModal(false);
  };

  const handleEdit = async (data: any) => {
    if (!editingSupplier) return;
    if (data.active === undefined) data.active = editingSupplier.active;
    await updateSupplier(editingSupplier.id, data);
    setSuppliers(suppliers.map(s => s.id === editingSupplier.id ? { ...s, ...data } : s));
    setEditingSupplier(null);
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await toggleSupplierActive(id, !currentActive);
      setSuppliers(suppliers.map(s => s.id === id ? { ...s, active: !currentActive } : s));
    } catch (err) {
      setError('Error al actualizar estado');
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm('¿Estás seguro de eliminar este proveedor?')) return;
    try {
      await deleteSupplier(supplier.id);
      setSuppliers(suppliers.filter(s => s.id !== supplier.id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar proveedor');
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">🚚 Gestión de Proveedores</h2>
        <div className="text-center py-8 text-gray-500">Cargando proveedores...</div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sf-text flex items-center gap-2">
          <span>🚚</span> Gestión de Proveedores
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-sf-primary text-white px-4 py-2 rounded-lg hover:bg-sf-dark font-medium transition flex items-center gap-2"
        >
          <span>➕</span> Agregar Proveedor
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary w-full max-w-xs"
          placeholder="🔍 Buscar por nombre..."
        />
      </div>

      <div className="overflow-x-auto bg-white shadow-sm rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-sf-primary text-white">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Contacto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Tel</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Categoría</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Total Comprado</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filteredSuppliers.map((supplier, index) => (
              <tr
                key={supplier.id}
                className={index % 2 === 0 ? 'bg-white' : 'bg-sf-light hover:bg-gray-50 transition'}
              >
                <td className="px-4 py-3 text-sm font-medium text-sf-text">{supplier.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{supplier.contactName || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{supplier.phone || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{supplier.category || '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCents(supplier.totalSpentCents)}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      supplier.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {supplier.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <button
                      title="Editar"
                      onClick={() => setEditingSupplier(supplier)}
                      className="text-blue-600 hover:bg-blue-50 rounded px-2 py-1 transition"
                    >
                      ✏️
                    </button>
                    <button
                      title={supplier.active ? 'Desactivar' : 'Activar'}
                      onClick={() => handleToggleActive(supplier.id, supplier.active)}
                      className={`px-2 py-1 rounded transition ${
                        supplier.active
                          ? 'text-orange-600 hover:bg-orange-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {supplier.active ? '⏸️' : '▶️'}
                    </button>
                    <button
                      title="Eliminar"
                      onClick={() => handleDelete(supplier)}
                      className="text-red-600 hover:bg-red-50 rounded px-2 py-1 transition"
                      disabled={supplier.totalOrders > 0}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
        </div>
      )}

      <SupplierModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAdd}
      />

      <SupplierModal
        isOpen={!!editingSupplier}
        onClose={() => setEditingSupplier(null)}
        onSave={handleEdit}
        editingSupplier={editingSupplier}
      />
    </section>
  );
};

export default Suppliers;
