import { useEffect, useState } from 'react';
import { Supplier } from '../firebase/db';
import { useIsMobile } from '../hooks/useMediaQuery';
import { getSuppliers, addSupplier, updateSupplier, toggleSupplierActive, deleteSupplier } from '../services/supplierService';
import SupplierModal from './SupplierModal';
import { Icon } from './ui/Icon';
import { PageHeader } from './ui/PageHeader';
import { useConfirm } from './ui/ConfirmDialog';

const formatCents = (cents: number): string => `$${(cents / 100).toLocaleString()}`;

const leadTimeLabel = (supplier: Supplier) =>
  supplier.lead_time_days ? `${supplier.lead_time_days} días` : '7 días (default)';

const Suppliers = () => {
  const isMobile = useIsMobile();
  const { confirm, confirmDialog } = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await getSuppliers();
      setSuppliers(data);
    } catch {
      console.error('Error loading suppliers');
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
    } catch {
      setError('Error al actualizar estado');
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    const accepted = await confirm({
      title: 'Eliminar proveedor',
      message: '¿Estás seguro de eliminar este proveedor?',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!accepted) return;
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

  const renderActions = (supplier: Supplier, compact: boolean) => {
    const sizeClass = compact ? 'h-10 w-10' : '';
    const iconSize = compact ? 18 : 20;
    return (
      <div className={`flex gap-1 ${compact ? 'justify-center' : ''}`}>
        <button
          type="button"
          onClick={() => setEditingSupplier(supplier)}
          aria-label={`Editar ${supplier.name}`}
          className={`icon-btn ${sizeClass} text-sf-primary hover:bg-sf-light`}
        >
          <Icon name="pencil" size={iconSize} />
        </button>
        <button
          type="button"
          onClick={() => handleToggleActive(supplier.id, supplier.active)}
          aria-label={`${supplier.active ? 'Desactivar' : 'Activar'} ${supplier.name}`}
          className={`icon-btn ${sizeClass} ${
            supplier.active ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'
          }`}
        >
          <Icon name={supplier.active ? 'minus' : 'check'} size={iconSize} />
        </button>
        <button
          type="button"
          onClick={() => handleDelete(supplier)}
          aria-label={`Eliminar ${supplier.name}`}
          disabled={supplier.totalOrders > 0}
          className={`icon-btn ${sizeClass} text-red-600 hover:bg-red-50`}
        >
          <Icon name="trash" size={iconSize} />
        </button>
      </div>
    );
  };

  const statusChip = (supplier: Supplier) => (
    <span className={`chip ${supplier.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {supplier.active ? 'Activo' : 'Inactivo'}
    </span>
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <PageHeader title="Gestión de Proveedores" />
        <div className="py-8 text-center text-gray-500">Cargando proveedores...</div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Gestión de Proveedores"
        actions={
          <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
            <Icon name="plus" size={18} />
            Agregar Proveedor
          </button>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="relative sm:max-w-xs">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <label htmlFor="suppliers-search" className="sr-only">
          Buscar por nombre
        </label>
        <input
          id="suppliers-search"
          type="search"
          inputMode="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input pl-10"
          placeholder="Buscar por nombre..."
        />
      </div>

      {filteredSuppliers.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">
          {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
        </div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label="Proveedores">
          {filteredSuppliers.map((supplier) => (
            <li key={supplier.id} className="card p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sf-text">{supplier.name}</p>
                  <p className="mt-0.5 truncate text-sm text-gray-600">
                    {supplier.contactName || '—'}
                    {supplier.phone && <span> · {supplier.phone}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    <span className="chip bg-sf-cyan/10 text-sf-cyan">{supplier.category || '—'}</span>
                    <span>Lead time: {leadTimeLabel(supplier)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total comprado</p>
                  <p className="font-semibold text-sf-primary">{formatCents(supplier.totalSpentCents)}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {statusChip(supplier)}
                {renderActions(supplier, false)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-sf-primary text-white">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Nombre</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Contacto</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Tel</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Categoría</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Lead time</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Total Comprado</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Estado</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="transition hover:bg-sf-light">
                  <td className="px-4 py-3 text-sm font-medium text-sf-text">{supplier.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{supplier.contactName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{supplier.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{supplier.category || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{leadTimeLabel(supplier)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{formatCents(supplier.totalSpentCents)}</td>
                  <td className="px-4 py-3 text-center">{statusChip(supplier)}</td>
                  <td className="px-4 py-2 text-center">{renderActions(supplier, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {confirmDialog}
    </section>
  );
};

export default Suppliers;
