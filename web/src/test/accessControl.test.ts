import { describe, expect, it } from 'vitest';
import { canAccessPage, hashForPage, PAGE_ROLES, pageFromHash, PAGES } from '../auth/accessControl';
import { UserRole } from '../firebase/db';

describe('route authorization matrix', () => {
  const roles: UserRole[] = ['admin', 'manager', 'cashier'];

  it('defines an explicit role list for every page', () => {
    expect(Object.keys(PAGE_ROLES).sort()).toEqual([...PAGES].sort());
    for (const page of PAGES) {
      expect(PAGE_ROLES[page].length).toBeGreaterThan(0);
      expect(PAGE_ROLES[page].every((role) => roles.includes(role))).toBe(true);
    }
  });

  it.each([
    ['employees', false, false, true],
    ['suppliers', false, true, true],
    ['orders', false, true, true],
    ['reports', true, true, true],
    ['margins', false, true, true],
    ['restock', false, true, true],
    ['whatsapp', false, true, true],
  ] as const)('%s matches cashier, manager, and admin policy', (page, cashier, manager, admin) => {
    expect(canAccessPage('cashier', page)).toBe(cashier);
    expect(canAccessPage('manager', page)).toBe(manager);
    expect(canAccessPage('admin', page)).toBe(admin);
  });

  it('parses canonical deep links and normalizes unknown routes', () => {
    expect(pageFromHash('#/employees')).toBe('employees');
    expect(pageFromHash('#reports')).toBe('reports');
    expect(pageFromHash('#/unknown')).toBe('dashboard');
    expect(hashForPage('orders')).toBe('#/orders');
  });
});
