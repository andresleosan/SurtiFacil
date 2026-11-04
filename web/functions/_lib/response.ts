export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Negocio-Id, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  details: unknown = null
): Response {
  return jsonResponse(
    {
      error: message,
      status,
      ...(details !== null && details !== undefined ? { details } : {}),
    },
    status
  );
}

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
