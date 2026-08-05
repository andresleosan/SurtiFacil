const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveClaimsForUser } = require('../authClaims');

test('rejects inactive users and returns claims that remove operational roles', () => {
  assert.deepEqual(
    resolveClaimsForUser({ active: false, role: 'admin' }),
    {
      allowed: false,
      status: 403,
      error: 'User is inactive',
      clearClaims: true,
      claims: { admin: false, manager: false },
    },
  );
});

test('preserves role-derived claims for active users', () => {
  assert.deepEqual(
    resolveClaimsForUser({ active: true, role: 'manager' }),
    {
      allowed: true,
      claims: { admin: false, manager: true },
    },
  );
});

test('rejects invalid roles and returns claims that remove existing operational roles', () => {
  assert.deepEqual(
    resolveClaimsForUser({ active: true, role: 'owner' }),
    {
      allowed: false,
      status: 400,
      error: 'Invalid role in Firestore',
      clearClaims: true,
      claims: { admin: false, manager: false },
    },
  );
});
