import { UserRole } from '../firebase/db';

export const PAGES = [
  'dashboard',
  'inventory',
  'sales',
  'create-sale',
  'whatsapp',
  'employees',
  'reports',
  'suppliers',
  'orders',
  'margins',
  'restock',
] as const;

export type Page = typeof PAGES[number];

const ALL_ROLES: readonly UserRole[] = ['admin', 'manager', 'cashier'];
const MANAGER_ROLES: readonly UserRole[] = ['admin', 'manager'];

export const PAGE_ROLES: Readonly<Record<Page, readonly UserRole[]>> = {
  dashboard: ALL_ROLES,
  inventory: ALL_ROLES,
  sales: ALL_ROLES,
  'create-sale': ALL_ROLES,
  employees: ['admin'],
  suppliers: MANAGER_ROLES,
  orders: MANAGER_ROLES,
  reports: ALL_ROLES,
  margins: MANAGER_ROLES,
  restock: MANAGER_ROLES,
  whatsapp: MANAGER_ROLES,
};

export function isPage(value: unknown): value is Page {
  return typeof value === 'string' && (PAGES as readonly string[]).includes(value);
}

export function canAccessPage(role: UserRole, page: Page): boolean {
  return PAGE_ROLES[page].includes(role);
}

export function pageFromHash(hash: string): Page {
  const candidate = hash.replace(/^#\/?/, '').split(/[?#]/, 1)[0];
  return isPage(candidate) ? candidate : 'dashboard';
}

export function hashForPage(page: Page): string {
  return `#/${page}`;
}
