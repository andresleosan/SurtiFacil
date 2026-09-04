import { useState } from 'react';
import { User, UserRole } from '../firebase/db';
import { registerUser } from '../services/authService';
import { Modal } from './ui/Modal';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (user: User) => void;
}

const FORM_ID = 'create-user-form';

const CreateUserModal = ({ isOpen, onClose, onUserCreated }: CreateUserModalProps) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'cashier' as UserRole,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const newUser = await registerUser(
        formData.email,
        formData.password,
        formData.displayName,
        formData.role
      );
      onUserCreated(newUser);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      displayName: '',
      role: 'cashier',
    });
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Agregar Nuevo Empleado"
      footer={
        <>
          <button type="button" onClick={handleClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={loading} className="btn-primary">
            {loading ? 'Creando...' : 'Crear Empleado'}
          </button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="create-user-name" className="mb-1 block text-sm font-medium text-gray-700">
            Nombre Completo
          </label>
          <input
            id="create-user-name"
            type="text"
            autoComplete="name"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            className="input"
            placeholder="Ej: Juan Pérez"
            required
          />
        </div>

        <div>
          <label htmlFor="create-user-email" className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="create-user-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="input"
            placeholder="correo@ejemplo.com"
            required
          />
        </div>

        <div>
          <label htmlFor="create-user-password" className="mb-1 block text-sm font-medium text-gray-700">
            Contraseña
          </label>
          <input
            id="create-user-password"
            type="password"
            autoComplete="new-password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="input"
            placeholder="Mínimo 6 caracteres"
            minLength={6}
            required
          />
        </div>

        <div>
          <label htmlFor="create-user-role" className="mb-1 block text-sm font-medium text-gray-700">
            Rol
          </label>
          <select
            id="create-user-role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
            className="input"
          >
            <option value="cashier">Cajero</option>
            <option value="manager">Gerente</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </form>
    </Modal>
  );
};

export default CreateUserModal;
