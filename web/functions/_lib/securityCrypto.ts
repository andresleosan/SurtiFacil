import { Env } from '../types';

export interface SignedD1TokenPayload {
  v: 1;
  uid: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  negocioId: string;
  isSuperAdmin?: boolean;
  iat: number;
  exp: number;
}

export interface PasswordVerificationResult {
  valid: boolean;
  needsRehash: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const DEFAULT_PBKDF2_ITERATIONS = 100_000; // Límite máximo soportado por Cloudflare Workers
const MAX_PBKDF2_ITERATIONS = 100_000;
const LEGACY_SHA256_PREFIX = 'surtifacil_salt_v1:';
const D1_SECRET_KEY = 'd1_jwt_hmac_v1';
const VALID_ROLES = new Set(['admin', 'manager', 'cashier']);

// Caché por instancia de DB para aislar cada DB/MockD1Database y evitar consultas repetitivas
const dbSecretCache = new WeakMap<object, string>();

// Almacén en memoria para rate-limiting en el Edge
const rateLimitStore = new Map<string, number[]>();
const MAX_RATE_LIMIT_BUCKETS = 5000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeJson(obj: unknown): string {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(obj));
  return base64UrlEncodeBytes(jsonBytes);
}

function base64UrlDecodeBytes(str: string): Uint8Array {
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

/**
 * Compara dos cadenas en tiempo constante sobre sus bytes UTF-8 para mitigar timing attacks.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Calcula el hash legado SHA-256 con salt estático (solo para migración transparente).
 */
export async function hashPasswordLegacySHA256(password: string): Promise<string> {
  const normalized = password.trim();
  const data = new TextEncoder().encode(`${LEGACY_SHA256_PREFIX}${normalized}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

async function derivePBKDF2Hex(password: string, saltBytes: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.trim()),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Genera un hash seguro PBKDF2-SHA256 con salt aleatorio de 16 bytes por usuario.
 * Utiliza por defecto 100.000 iteraciones (máximo soportado por Cloudflare Workers).
 */
export async function hashPasswordPBKDF2(
  password: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<string> {
  const safeIterations = Math.min(
    MAX_PBKDF2_ITERATIONS,
    Math.max(1000, Math.trunc(Number(iterations) || DEFAULT_PBKDF2_ITERATIONS))
  );
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(saltBytes);
  const hashHex = await derivePBKDF2Hex(password, saltBytes, safeIterations);
  return `pbkdf2$sha256$${safeIterations}$${saltHex}$${hashHex}`;
}

/**
 * Verifica una contraseña contra un hash PBKDF2-SHA256 o contra el hash legado SHA-256.
 * Cuando valida un hash legado SHA-256, marca `needsRehash: true` para migrarlo al vuelo.
 */
export async function verifyPasswordHash(
  password: string,
  storedHash: string | null | undefined
): Promise<PasswordVerificationResult> {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return { valid: false, needsRehash: false };
  }

  const trimmedHash = storedHash.trim();
  if (trimmedHash.startsWith('pbkdf2$sha256$')) {
    const parts = trimmedHash.split('$');
    if (parts.length !== 5) {
      return { valid: false, needsRehash: false };
    }
    const iterations = Number(parts[2]);
    const saltBytes = hexToBytes(parts[3]);
    const expectedHex = parts[4].toLowerCase();

    if (
      !Number.isInteger(iterations) ||
      iterations < 1000 ||
      iterations > MAX_PBKDF2_ITERATIONS ||
      !saltBytes ||
      !/^[0-9a-f]{64}$/.test(expectedHex)
    ) {
      return { valid: false, needsRehash: false };
    }

    const derivedHex = await derivePBKDF2Hex(password, saltBytes, iterations);
    return {
      valid: timingSafeEqualStrings(derivedHex, expectedHex),
      needsRehash: false,
    };
  }

  if (/^[0-9a-f]{64}$/i.test(trimmedHash)) {
    const legacyHex = await hashPasswordLegacySHA256(password);
    const valid = timingSafeEqualStrings(legacyHex.toLowerCase(), trimmedHash.toLowerCase());
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

/**
 * Resuelve el secreto HMAC-SHA256 para firmar/verificar sesiones nativas D1.
 * Prioriza `env.JWT_SECRET`; de lo contrario auto-gestiona un secreto persistido en `_system_secrets`.
 */
export async function resolveSessionSigningSecret(env?: Env): Promise<string> {
  const envSecret = typeof env?.JWT_SECRET === 'string' ? env.JWT_SECRET.trim() : '';
  if (envSecret.length >= 16) {
    return envSecret;
  }

  const db = env?.DB;
  if (!db) {
    throw new Error('Secreto de firma de sesión (JWT_SECRET) no disponible.');
  }

  const cached = dbSecretCache.get(db as unknown as object);
  if (cached) {
    return cached;
  }

  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS _system_secrets (
          secret_key TEXT PRIMARY KEY,
          secret_value TEXT NOT NULL,
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .run();
  } catch {
    // Continuar si el entorno mock no procesa DDL
  }

  try {
    const existing = await db
      .prepare('SELECT secret_value FROM _system_secrets WHERE secret_key = ?')
      .bind(D1_SECRET_KEY)
      .first<{ secret_value?: string }>();
    if (existing?.secret_value && existing.secret_value.length >= 16) {
      dbSecretCache.set(db as unknown as object, existing.secret_value);
      return existing.secret_value;
    }
  } catch {
    // Intentar generar e insertar
  }

  const candidate = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  try {
    await db
      .prepare(
        "INSERT OR IGNORE INTO _system_secrets (secret_key, secret_value, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .bind(D1_SECRET_KEY, candidate)
      .run();

    const persisted = await db
      .prepare('SELECT secret_value FROM _system_secrets WHERE secret_key = ?')
      .bind(D1_SECRET_KEY)
      .first<{ secret_value?: string }>();
    const resolved = persisted?.secret_value && persisted.secret_value.length >= 16
      ? persisted.secret_value
      : candidate;
    dbSecretCache.set(db as unknown as object, resolved);
    return resolved;
  } catch {
    dbSecretCache.set(db as unknown as object, candidate);
    return candidate;
  }
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

/**
 * Firma un token de sesión D1 en formato `d1s.<payloadBase64Url>.<signatureBase64Url>`.
 */
export async function signD1SessionToken(
  input: {
    uid: string;
    email: string;
    role: 'admin' | 'manager' | 'cashier';
    negocioId: string;
    isSuperAdmin?: boolean;
  },
  secret: string,
  ttlSeconds = 7 * 86400
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedD1TokenPayload = {
    v: 1,
    uid: input.uid,
    email: input.email.toLowerCase(),
    role: input.role,
    negocioId: input.negocioId,
    isSuperAdmin: Boolean(input.isSuperAdmin),
    iat: now,
    exp: now + Math.max(60, Math.trunc(ttlSeconds)),
  };

  const payloadB64 = base64UrlEncodeJson(payload);
  const signingInput = `d1s.${payloadB64}`;
  const key = await importHmacKey(secret, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
  return `${signingInput}.${sigB64}`;
}

/**
 * Verifica la firma HMAC-SHA256 y vigencia de un token de sesión `d1s.*`.
 */
export async function verifyD1SessionToken(token: string, secret: string): Promise<SignedD1TokenPayload> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'd1s' || !parts[1] || !parts[2]) {
    throw new Error('Formato de token D1 firmado inválido.');
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64UrlDecodeBytes(parts[2]);
  } catch {
    throw new Error('Firma de token D1 malformada.');
  }

  const key = await importHmacKey(secret, ['verify']);
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes as unknown as BufferSource,
    new TextEncoder().encode(signingInput) as unknown as BufferSource
  );
  if (!isValid) {
    throw new Error('Firma criptográfica del token D1 inválida.');
  }

  let payload: SignedD1TokenPayload;
  try {
    const payloadBytes = base64UrlDecodeBytes(parts[1]);
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SignedD1TokenPayload;
  } catch {
    throw new Error('No se pudo decodificar el payload del token D1.');
  }

  if (
    !payload ||
    payload.v !== 1 ||
    !payload.uid ||
    !payload.email ||
    !payload.negocioId ||
    !VALID_ROLES.has(payload.role)
  ) {
    throw new Error('El contenido del token D1 firmado no es válido.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) {
    throw new Error('El token de sesión ha expirado.');
  }
  if (!payload.iat || payload.iat > now + 300) {
    throw new Error('El token de sesión tiene una fecha de emisión inválida.');
  }

  return payload;
}

/**
 * Determina si se permiten tokens de prueba/desarrollo sin firma (`mock:`, `d1:`, `test-`)
 * y atajos de demostración privilegiados según el entorno y origen de la petición.
 */
export function isDevOrTestAuthAllowed(request?: Request, env?: Env): boolean {
  const envName = String(env?.ENVIRONMENT || '').trim().toLowerCase();
  const allowMock = String(env?.ALLOW_MOCK_TOKENS || '').trim().toLowerCase();

  if (envName === 'production' || allowMock === 'false') {
    return false;
  }
  if (envName === 'test' || envName === 'development' || allowMock === 'true') {
    return true;
  }

  if (request?.url) {
    try {
      const hostname = new URL(request.url).hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true;
      }
    } catch {
      // URL inválida: denegar por defecto
    }
  }

  return false;
}

/**
 * Verifica la cabecera `X-Hub-Signature-256: sha256=<hex>` de Meta WhatsApp Cloud API.
 */
export async function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const providedHex = signatureHeader.slice(7).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(providedHex)) {
    return false;
  }

  const key = await importHmacKey(appSecret, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expectedHex = bytesToHex(new Uint8Array(digest)).toLowerCase();
  return timingSafeEqualStrings(expectedHex, providedHex);
}

/**
 * Controla intentos por ventana deslizante en memoria para proteger endpoints sensibles.
 */
export function checkRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowMs: number,
  recordAttempt = true
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const existing = rateLimitStore.get(bucketKey) || [];
  const active = existing.filter((ts) => ts > cutoff);

  if (active.length >= maxAttempts) {
    rateLimitStore.set(bucketKey, active);
    const retryAfterSeconds = Math.max(1, Math.ceil((active[0] + windowMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  if (recordAttempt) {
    active.push(now);
    if (rateLimitStore.size > MAX_RATE_LIMIT_BUCKETS) {
      // Podar entradas antiguas para evitar crecimiento ilimitado de memoria en Edge
      for (const [key, timestamps] of rateLimitStore.entries()) {
        if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
          rateLimitStore.delete(key);
        }
        if (rateLimitStore.size <= MAX_RATE_LIMIT_BUCKETS * 0.8) break;
      }
      if (rateLimitStore.size > MAX_RATE_LIMIT_BUCKETS) {
        const firstKey = rateLimitStore.keys().next().value;
        if (firstKey) rateLimitStore.delete(firstKey);
      }
    }
    rateLimitStore.set(bucketKey, active);
  } else if (active.length !== existing.length) {
    if (active.length === 0) {
      rateLimitStore.delete(bucketKey);
    } else {
      rateLimitStore.set(bucketKey, active);
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - active.length),
    retryAfterSeconds: 0,
  };
}

export function clearRateLimit(bucketKey: string): void {
  rateLimitStore.delete(bucketKey);
}

export function resetRateLimitsForTests(): void {
  rateLimitStore.clear();
}
