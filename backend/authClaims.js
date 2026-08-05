const VALID_ROLES = new Set(['admin', 'manager', 'cashier']);

function resolveClaimsForUser(userData) {
  if (!userData || userData.active !== true) {
    return {
      allowed: false,
      status: 403,
      error: 'User is inactive',
      clearClaims: true,
      claims: { admin: false, manager: false },
    };
  }

  if (!VALID_ROLES.has(userData.role)) {
    return {
      allowed: false,
      status: 400,
      error: 'Invalid role in Firestore',
      clearClaims: true,
      claims: { admin: false, manager: false },
    };
  }

  return {
    allowed: true,
    claims: {
      admin: userData.role === 'admin',
      manager: userData.role === 'manager' || userData.role === 'admin',
    },
  };
}

module.exports = { resolveClaimsForUser };
