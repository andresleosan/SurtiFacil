import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(resolve(process.cwd(), '../firestore.rules'), 'utf8');

const operationalCollections = [
  'products',
  'sales',
  'roles',
  'whatsapp_conversations',
  'whatsapp_messages',
  'whatsapp_orders',
  'suppliers',
  'purchase_orders',
];

function getCollectionBlock(collection: string): string {
  const start = rules.indexOf(`match /${collection}/`);
  const next = rules.indexOf('\n    match /', start + 1);
  return rules.slice(start, next === -1 ? rules.length : next);
}

describe('Firestore authorization rules', () => {
  it('defines an active authenticated user helper backed by the user document', () => {
    expect(rules).toMatch(/function isActiveUser\(\)\s*\{[\s\S]*request\.auth != null/);
    expect(rules).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)/);
    expect(rules).toMatch(/get\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)\.data\.active == true/);
    expect(rules).toMatch(/function isAdminUser\(\)\s*\{[\s\S]*\.data\.role == 'admin'/);
    expect(rules).toMatch(/function isManagerUser\(\)\s*\{[\s\S]*\.data\.role == 'manager'/);
  });

  it('denies inactive users from every operational collection while retaining role checks', () => {
    for (const collection of operationalCollections) {
      const block = getCollectionBlock(collection);
      const allows = block.match(/allow [^;]+;/g) ?? [];

      expect(allows.length, `${collection} should define operational permissions`).toBeGreaterThan(0);
      expect(
        allows.every((allow) => /isActiveUser\(\)|isManagerUser\(\)|isAdminUser\(\)/.test(allow)),
        `${collection} has an allow expression without isActiveUser(): ${allows.join(' | ')}`,
      ).toBe(true);
    }
  });

  it('requires active users to have an admin, manager, or cashier role', () => {
    expect(rules).toMatch(/\.data\.role in \['admin', 'manager', 'cashier'\]/);
  });

  it('preserves admin, manager, and cashier restrictions on representative collections', () => {
    const products = getCollectionBlock('products');
    expect(products).toMatch(/allow create: if isManagerUser\(\);/);
    expect(products).toMatch(/allow update: if isManagerUser\(\);/);
    expect(products).not.toMatch(/isCashierStockDecrement/);
    expect(products).toMatch(/allow delete: if isAdminUser\(\);/);

    const sales = getCollectionBlock('sales');
    expect(sales).toMatch(/allow create: if isActiveUser\(\) && false;/);
    expect(sales).toMatch(/allow update, delete: if isAdminUser\(\);/);
    expect(rules).toMatch(/payment_method in \['cash', 'card', 'other'\]/);
    expect(rules).toMatch(/items\.size\(\) > 0/);

    const roles = getCollectionBlock('roles');
    expect(roles).toMatch(/allow write: if isAdminUser\(\);/);

    for (const collection of ['whatsapp_conversations', 'whatsapp_messages', 'whatsapp_orders', 'suppliers', 'purchase_orders']) {
      const block = getCollectionBlock(collection);
      expect(block, `${collection} should require admin or manager for protected reads`).toMatch(
        /allow read: if isManagerUser\(\);/,
      );
    }

    expect(getCollectionBlock('whatsapp_conversations')).toMatch(/allow create, update: if isManagerUser\(\);/);
    expect(getCollectionBlock('whatsapp_messages')).toMatch(/allow create: if isManagerUser\(\);/);
    expect(getCollectionBlock('whatsapp_orders')).toMatch(/allow create, update: if isManagerUser\(\);/);
    for (const collection of ['whatsapp_conversations', 'whatsapp_messages', 'whatsapp_orders']) {
      expect(getCollectionBlock(collection)).toMatch(/allow (?:update, delete|delete): if isAdminUser\(\);/);
    }
  });

  it('allows inactive users to read only their own document and gates all user mutations by active admin state', () => {
    const users = getCollectionBlock('users');
    expect(users).toMatch(/allow read: if request\.auth != null\s*&&\s*\(request\.auth\.uid == userId\s*\|\|\s*isAdminUser\(\)\);/);
    expect(users).toMatch(/allow create, delete: if isAdminUser\(\);/);
    expect(users).toMatch(/allow update: if isActiveUser\(\)\s*&&\s*\(isAdminUser\(\)\s*&&\s*\(request\.auth\.uid != userId\s*\|\|\s*request\.resource\.data\.role == resource\.data\.role\)\s*\|\|\s*\(request\.auth\.uid == userId\s*&&\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['lastLogin'\]\)\)\);/);
  });
});
