// Verificador de JWT RS256 de Firebase Auth usando Web Crypto API
// Compatible con Cloudflare Workers / Pages Functions en el Edge.

const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface JWKKey {
  kty: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
  kid: string;
}

interface JWKSResponse {
  keys: JWKKey[];
}

export interface DecodedFirebaseToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  iss: string;
  aud: string;
  auth_time?: number;
  sub: string;
  iat: number;
  exp: number;
  firebase?: Record<string, unknown>;
  [key: string]: unknown;
}

// Caché en memoria de claves públicas criptográficas importadas
let cachedKeys: { [kid: string]: CryptoKey } = {};
let cacheExpiry = 0;

function base64UrlDecode(str: string): Uint8Array {
  // Convertir Base64URL a Base64 estándar
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseJwtJson<T = unknown>(segment: string): T {
  const bytes = base64UrlDecode(segment);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

async function fetchGooglePublicKeys(): Promise<{ [kid: string]: CryptoKey }> {
  const now = Date.now();
  if (now < cacheExpiry && Object.keys(cachedKeys).length > 0) {
    return cachedKeys;
  }

  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Error obteniendo certificados de Google: HTTP ${res.status}`);
  }

  // Parsear directiva Cache-Control max-age si está presente
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
  cacheExpiry = now + maxAgeSeconds * 1000;

  const jwks: JWKSResponse = await res.json();
  const newKeys: { [kid: string]: CryptoKey } = {};

  for (const key of jwks.keys) {
    if (key.kty === 'RSA' && key.alg === 'RS256' && key.n && key.e && key.kid) {
      try {
        const cryptoKey = await crypto.subtle.importKey(
          'jwk',
          key,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: 'SHA-256' },
          },
          false,
          ['verify']
        );
        newKeys[key.kid] = cryptoKey;
      } catch (e) {
        console.warn(`No se pudo importar clave JWK ${key.kid}:`, e);
      }
    }
  }

  cachedKeys = newKeys;
  return cachedKeys;
}

/**
 * Valida y decodifica un ID Token emitido por Firebase Authentication.
 * Soporta tokens mockeados para testing local cuando comienzan con 'mock:' o 'test:'.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId = 'surtifacilapp'
): Promise<DecodedFirebaseToken> {
  if (!token || typeof token !== 'string') {
    throw new Error('Token de autenticación no proporcionado o inválido.');
  }

  // Soporte para pruebas y desarrollo local
  if (token.startsWith('mock:') || token.startsWith('test-') || token === 'token') {
    return parseMockToken(token, projectId);
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Formato JWT inválido (se esperaban 3 partes).');
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  let header: { alg?: string; kid?: string; typ?: string };
  let payload: DecodedFirebaseToken;

  try {
    header = parseJwtJson(headerSegment);
    payload = parseJwtJson(payloadSegment);
  } catch {
    throw new Error('No se pudo decodificar el encabezado o payload del token.');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Algoritmo no soportado: ${header.alg}. Se requiere RS256.`);
  }

  if (!header.kid) {
    throw new Error('El token no incluye el identificador de clave (kid).');
  }

  // Validaciones del payload según especificación de Firebase Auth
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < nowInSeconds) {
    throw new Error('El token de autenticación ha expirado.');
  }

  if (!payload.iat || payload.iat > nowInSeconds + 300) {
    throw new Error('El token emitido tiene una fecha futura inválida.');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Emisor inválido: ${payload.iss}. Se esperaba: ${expectedIssuer}`);
  }

  if (payload.aud !== projectId) {
    throw new Error(`Audiencia inválida: ${payload.aud}. Se esperaba: ${projectId}`);
  }

  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim() === '') {
    throw new Error('El token no contiene un sujeto (sub / UID) válido.');
  }

  // Verificar la firma criptográfica contra las claves públicas de Google
  const keys = await fetchGooglePublicKeys();
  const cryptoKey = keys[header.kid];

  if (!cryptoKey) {
    throw new Error(`Clave pública desconocida para kid: ${header.kid}`);
  }

  const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signatureBytes = base64UrlDecode(signatureSegment);

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes as unknown as BufferSource,
    signedData as unknown as BufferSource
  );

  if (!isValid) {
    throw new Error('Firma criptográfica del token inválida.');
  }

  payload.uid = payload.sub;
  return payload;
}

function parseMockToken(token: string, projectId: string): DecodedFirebaseToken {
  // Ejemplos:
  // "mock:user-1:admin@surtifacil.com:admin"
  // "test-admin-uid"
  // "token"
  let uid = 'test-user-uid';
  let email = 'admin@surtifacil.com';

  if (token.startsWith('mock:')) {
    const parts = token.split(':');
    uid = parts[1] || uid;
    email = parts[2] || email;
  } else if (token.startsWith('test-')) {
    uid = token;
    email = `${token}@surtifacil.com`;
  }

  const now = Math.floor(Date.now() / 1000);
  return {
    uid,
    sub: uid,
    email,
    name: 'Usuario Test',
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    iat: now - 60,
    exp: now + 3600,
  };
}
