import type { Page } from '../../auth/accessControl';
import type { IconName } from '../ui/Icon';

export interface NavItem {
  page: Page;
  label: string;
  icon: IconName;
}

/** Orden canónico del menú. El acceso por rol se resuelve con `canAccessPage`. */
export const NAV_ITEMS: readonly NavItem[] = [
  { page: 'dashboard', label: 'Dashboard', icon: 'home' },
  { page: 'create-sale', label: 'Nueva Venta', icon: 'cart' },
  { page: 'inventory', label: 'Inventario', icon: 'box' },
  { page: 'sales', label: 'Ventas', icon: 'receipt' },
  { page: 'reports', label: 'Reportes', icon: 'chart' },
  { page: 'margins', label: 'Márgenes', icon: 'percent' },
  { page: 'restock', label: 'Reposición', icon: 'refresh' },
  { page: 'orders', label: 'Pedidos', icon: 'clipboard' },
  { page: 'suppliers', label: 'Proveedores', icon: 'truck' },
  { page: 'employees', label: 'Empleados', icon: 'users' },
  { page: 'credits', label: 'Fiados', icon: 'wallet' },
  { page: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
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
