import type { Page } from '../../auth/accessControl';
import type { IconName } from '../ui/Icon';

export interface NavItem {
  page: Page;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  pages: readonly Page[];
}

/** Orden canónico del menú. El acceso por rol se resuelve con `canAccessPage`. */
export const NAV_ITEMS: readonly NavItem[] = [
  { page: 'dashboard', label: 'Dashboard', icon: 'home' },
  { page: 'create-sale', label: 'Nueva Venta', icon: 'cart' },
  { page: 'sales', label: 'Ventas', icon: 'receipt' },
  { page: 'credits', label: 'Fiados', icon: 'wallet' },
  { page: 'inventory', label: 'Inventario', icon: 'box' },
  { page: 'restock', label: 'Reposición', icon: 'refresh' },
  { page: 'margins', label: 'Márgenes', icon: 'percent' },
  { page: 'reports', label: 'Reportes', icon: 'chart' },
  { page: 'suppliers', label: 'Proveedores', icon: 'truck' },
  { page: 'orders', label: 'Pedidos', icon: 'clipboard' },
  { page: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { page: 'employees', label: 'Empleados', icon: 'users' },
  { page: 'settings', label: 'Configuración', icon: 'settings' },
];

/** Grupos jerárquicos estilo HoneyBook para navegación estructurada */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'sales',
    label: 'Mostrador y Ventas',
    icon: '⚡',
    pages: ['dashboard', 'create-sale', 'sales'],
  },
  {
    id: 'credits',
    label: 'Cartera y Fiados',
    icon: '📒',
    pages: ['credits'],
  },
  {
    id: 'catalog',
    label: 'Catálogo y Bodega',
    icon: '📦',
    pages: ['inventory', 'restock', 'margins', 'reports'],
  },
  {
    id: 'purchases',
    label: 'Proveedores y Compras',
    icon: '🚚',
    pages: ['suppliers', 'orders'],
  },
  {
    id: 'channels',
    label: 'Canales y Vecinos',
    icon: '💬',
    pages: ['whatsapp'],
  },
  {
    id: 'settings',
    label: 'Configuración y Equipo',
    icon: '⚙️',
    pages: ['employees', 'settings'],
  },
];

/** Pestañas fijas de la barra inferior en teléfonos; el resto va en "Más". */
export const MOBILE_TAB_PAGES: readonly Page[] = ['dashboard', 'create-sale', 'inventory', 'sales'];

export const MOBILE_TAB_LABELS: Readonly<Partial<Record<Page, string>>> = {
  dashboard: 'Inicio',
  'create-sale': 'Vender',
  inventory: 'Inventario',
  sales: 'Ventas',
};

export function findNavItem(page: Page): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.page === page);
}
