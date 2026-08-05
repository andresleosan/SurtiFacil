const SAFE_API_ERRORS = Object.freeze({
  badRequest: 'Solicitud inválida',
  unauthorized: 'No autorizado',
  forbidden: 'No autorizado',
  notFound: 'Recurso no encontrado',
  notConfigured: 'Servicio no configurado',
  rateLimited: 'Demasiadas solicitudes',
  internal: 'Error interno del servidor',
});

function getSafeApiError(code = 'internal') {
  return { error: SAFE_API_ERRORS[code] || SAFE_API_ERRORS.internal };
}

function getSafeApiLogMessage(context) {
  return `[api] ${context} failed`;
}

module.exports = { getSafeApiError, getSafeApiLogMessage, SAFE_API_ERRORS };
