import { useEffect, useState } from 'react';
import { User, UserRole } from '../firebase/db';
import { getUsers, updateUserRole, toggleUserActive, deleteUser, isAdmin } from '../services/authService';
import CreateUserModal from './CreateUserModal';

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error loading users:', err);
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

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      await deleteUser(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      setError('Error al eliminar usuario');
    }
  };

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

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'manager':
        return 'Gerente';
      case 'cashier':
        return 'Cajero';
      default:
        return role;
    }
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">Gestión de Empleados</h2>
        <div className="text-center py-8 text-gray-500">Cargando usuarios...</div>
      </section>
    );
  }

  if (!isAdmin()) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">Gestión de Empleados</h2>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          No tienes permisos para acceder a esta sección.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sf-text flex items-center gap-2">
          <span>👥</span> Gestión de Empleados
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-sf-primary text-white px-4 py-2 rounded-lg hover:bg-sf-dark font-medium transition flex items-center gap-2"
        >
          <span>➕</span> Agregar Empleado
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="overflow-x-auto bg-white shadow-sm rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-sf-primary text-white">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Nombre
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Email
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                Rol
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                Estado
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {users.map((user, index) => (
              <tr
                key={user.id}
                className={
                  index % 2 === 0
                    ? 'bg-white'
                    : 'bg-sf-light hover:bg-gray-50 transition'
                }
              >
                <td className="px-4 py-3 text-sm font-medium text-sf-text">
                  {user.displayName}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {user.email}
                </td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeStyle(user.role)} border-0 focus:ring-2 focus:ring-sf-primary`}
                  >
                    <option value="admin">Administrador</option>
                    <option value="manager">Gerente</option>
                    <option value="cashier">Cajero</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      user.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {user.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <button
                      title={user.active ? 'Desactivar' : 'Activar'}
                      onClick={() => handleToggleActive(user.id, user.active)}
                      className={`px-2 py-1 rounded text-xs font-medium transition ${
                        user.active
                          ? 'text-orange-600 hover:bg-orange-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {user.active ? '⏸️' : '▶️'}
                    </button>
                    <button
                      title="Eliminar"
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-600 hover:bg-red-50 rounded px-2 py-1 transition"
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

      {users.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No hay usuarios registrados
        </div>
      )}

      {/* Modal para crear usuario */}
      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onUserCreated={(newUser) => {
          setUsers([...users, newUser]);
          setShowCreateModal(false);
        }}
      />
    </section>
  );
};

export default UserManagement;
