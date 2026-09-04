import { useEffect, useState } from 'react';
import { User, UserRole } from '../firebase/db';
import { getUsers, updateUserRole, toggleUserActive, deleteUser, isAdminAsync } from '../services/authService';
import { useIsMobile } from '../hooks/useMediaQuery';
import CreateUserModal from './CreateUserModal';
import { Icon } from './ui/Icon';
import { PageHeader } from './ui/PageHeader';
import { useConfirm } from './ui/ConfirmDialog';

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: 'Administrador' },
  { value: 'manager', label: 'Gerente' },
  { value: 'cashier', label: 'Cajero' },
];

const getRoleBadgeStyle = (role: UserRole) => {
  switch (role) {
    case 'admin':
      return 'bg-purple-100 text-purple-700';
    case 'manager':
      return 'bg-blue-100 text-blue-700';
    case 'cashier':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const UserManagement = () => {
  const isMobile = useIsMobile();
  const { confirm, confirmDialog } = useConfirm();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    isAdminAsync().then((v) => { if (!cancelled) setIsAdminUser(v); });
    return () => { cancelled = true; };
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getUsers();
      setUsers(data);
    } catch {
      console.error('Error loading users.');
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      setError('Error al actualizar rol');
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await toggleUserActive(userId, !currentActive);
      setUsers(users.map(u => u.id === userId ? { ...u, active: !currentActive } : u));
    } catch (err) {
      setError('Error al actualizar estado');
    }
  };

  const handleDeleteUser = async (user: User) => {
    const accepted = await confirm({
      title: 'Eliminar usuario',
      message: `¿Estás seguro de eliminar este usuario? Se eliminará "${user.displayName}" y esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!accepted) return;
    try {
      await deleteUser(user.id);
      setUsers(users.filter(u => u.id !== user.id));
    } catch (err) {
      setError('Error al eliminar usuario');
    }
  };

  const renderRoleSelect = (user: User, compact: boolean) => (
    <>
      <label htmlFor={`role-${user.id}`} className="sr-only">
        Rol de {user.displayName}
      </label>
      <select
        id={`role-${user.id}`}
        value={user.role}
        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
        className={`input border-0 text-xs font-medium ${compact ? 'w-auto' : ''} ${getRoleBadgeStyle(user.role)}`}
      >
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </>
  );

  const renderStatusChip = (user: User) => (
    <span className={`chip ${user.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {user.active ? 'Activo' : 'Inactivo'}
    </span>
  );

  const renderActions = (user: User) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => handleToggleActive(user.id, user.active)}
        aria-label={`${user.active ? 'Desactivar' : 'Activar'} ${user.displayName}`}
        className={`btn-secondary px-3 text-xs ${
          user.active ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'
        }`}
      >
        {user.active ? 'Desactivar' : 'Activar'}
      </button>
      <button
        type="button"
        onClick={() => handleDeleteUser(user)}
        aria-label={`Eliminar ${user.displayName}`}
        className="icon-btn text-red-600 hover:bg-red-50"
      >
        <Icon name="trash" size={20} />
      </button>
    </div>
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <PageHeader title="Gestión de Empleados" />
        <div className="py-8 text-center text-gray-500">Cargando usuarios...</div>
      </section>
    );
  }

  if (!isAdminUser) {
    return (
      <section className="space-y-4">
        <PageHeader title="Gestión de Empleados" />
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          No tienes permisos para acceder a esta sección.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Gestión de Empleados"
        actions={
          <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Icon name="plus" size={18} />
            Agregar Empleado
          </button>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">
          No hay usuarios registrados
        </div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label="Empleados">
          {users.map((user) => (
            <li key={user.id} className="card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sf-text">{user.displayName}</p>
                  <p className="truncate text-sm text-gray-600">{user.email}</p>
                </div>
                {renderStatusChip(user)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">{renderRoleSelect(user, false)}</div>
                {renderActions(user)}
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
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Email</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Rol</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Estado</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {users.map((user, index) => (
                <tr key={user.id} className={index % 2 === 0 ? 'bg-white' : 'bg-sf-light transition hover:bg-gray-50'}>
                  <td className="px-4 py-3 text-sm font-medium text-sf-text">{user.displayName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex justify-center">{renderRoleSelect(user, true)}</div>
                  </td>
                  <td className="px-4 py-3 text-center">{renderStatusChip(user)}</td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex justify-center">{renderActions(user)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onUserCreated={(newUser) => {
          setUsers([...users, newUser]);
          setShowCreateModal(false);
        }}
      />

      {confirmDialog}
    </section>
  );
};

export default UserManagement;
