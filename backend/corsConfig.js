const DEFAULT_FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'https://smartmarket-b37ce.web.app',
];

function parseFrontendOrigins(value) {
  if (typeof value !== 'string') {
    return [...DEFAULT_FRONTEND_ORIGINS];
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== '*');

  return origins.length > 0 ? origins : [...DEFAULT_FRONTEND_ORIGINS];
}

module.exports = { parseFrontendOrigins };
