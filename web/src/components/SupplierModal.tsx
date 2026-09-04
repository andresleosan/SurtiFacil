import { useState, useEffect, useId } from 'react';
import { Supplier } from '../firebase/db';
import { Modal } from './ui/Modal';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Supplier, 'id' | 'totalOrders' | 'totalSpentCents' | 'createdAt'>) => Promise<void>;
  editingSupplier?: Supplier | null;
}

const SupplierModal = ({ isOpen, onClose, onSave, editingSupplier }: SupplierModalProps) => {
  const formId = useId();
  const [formData, setFormData] = useState({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    category: '',
    lead_time_days: 7 as number | '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingSupplier) {
      setFormData({
        name: editingSupplier.name || '',
        contactName: editingSupplier.contactName || '',
        phone: editingSupplier.phone || '',
        email: editingSupplier.email || '',
        address: editingSupplier.address || '',
        category: editingSupplier.category || '',
        lead_time_days: editingSupplier.lead_time_days ?? 7,
      });
    } else {
      setFormData({
        name: '',
        contactName: '',
        phone: '',
        email: '',
        address: '',
        category: '',
        lead_time_days: 7,
      });
    }
    setError('');
  }, [editingSupplier, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('El nombre del proveedor es obligatorio');
      return;
    }

    if (formData.email && !formData.email.includes('@')) {
      setError('El email no es válido');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      contactName: formData.contactName.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      address: formData.address.trim() || undefined,
      category: formData.category.trim() || undefined,
      lead_time_days: formData.lead_time_days === '' ? 7 : Number(formData.lead_time_days),
      active: editingSupplier ? editingSupplier.active : true,
    };

    setLoading(true);
    try {
      await onSave(payload);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar proveedor');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  const field = (name: string) => `${formId}-${name}`;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={editingSupplier ? 'Editar Proveedor' : 'Agregar Nuevo Proveedor'}
      footer={
        <>
          <button type="button" onClick={handleClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" form={formId} disabled={loading} className="btn-primary">
            {loading ? 'Guardando...' : editingSupplier ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={field('name')} className="mb-1 block text-sm font-medium text-gray-700">
            Nombre *
          </label>
          <input
            id={field('name')}
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input"
            placeholder="Ej: Distribuidora del Norte"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={field('contact')} className="mb-1 block text-sm font-medium text-gray-700">
              Contacto
            </label>
            <input
              id={field('contact')}
              type="text"
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              className="input"
              placeholder="Ej: Juan Pérez"
            />
          </div>

          <div>
            <label htmlFor={field('phone')} className="mb-1 block text-sm font-medium text-gray-700">
              Teléfono
            </label>
            <input
              id={field('phone')}
              type="tel"
              inputMode="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="input"
              placeholder="Ej: +503 7777-8888"
            />
          </div>
        </div>

        <div>
          <label htmlFor={field('email')} className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id={field('email')}
            type="text"
            inputMode="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="input"
            placeholder="correo@ejemplo.com"
          />
        </div>

        <div>
          <label htmlFor={field('address')} className="mb-1 block text-sm font-medium text-gray-700">
            Dirección
          </label>
          <input
            id={field('address')}
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="input"
            placeholder="Ej: Calle Principal #123"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={field('category')} className="mb-1 block text-sm font-medium text-gray-700">
              Categoría
            </label>
            <input
              id={field('category')}
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="input"
              placeholder="Ej: Lácteos, Bebidas, Abarrotes"
            />
          </div>

          <div>
            <label htmlFor={field('lead')} className="mb-1 block text-sm font-medium text-gray-700">
              Lead time (días)
            </label>
            <input
              id={field('lead')}
              type="number"
              inputMode="numeric"
              min="0"
              value={formData.lead_time_days}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  lead_time_days: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
              className="input"
              placeholder="Ej: 7"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default SupplierModal;
