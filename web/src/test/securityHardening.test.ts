import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  hashPasswordLegacySHA256,
  hashPasswordPBKDF2,
  isDevOrTestAuthAllowed,
  resetRateLimitsForTests,
  signD1SessionToken,
  timingSafeEqualStrings,
  verifyD1SessionToken,
  verifyPasswordHash,
  verifyWhatsAppWebhookSignature,
} from '../../functions/_lib/securityCrypto';
import { verifyFirebaseIdToken } from '../../functions/_lib/firebaseAuth';
import { Env } from '../../functions/types';

describe('securityCrypto y blindaje criptográfico (Tarea 28)', () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it('hashPasswordPBKDF2 genera salts únicos por usuario con 100.000 iteraciones y verifica correctamente', async () => {
    const hash1 = await hashPasswordPBKDF2('SurtiForte2026!');
    const hash2 = await hashPasswordPBKDF2('SurtiForte2026!');

    expect(hash1).toMatch(/^pbkdf2\$sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hash2).toMatch(/^pbkdf2\$sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hash1).not.toBe(hash2);

    const ok = await verifyPasswordHash('SurtiForte2026!', hash1);
    expect(ok).toEqual({ valid: true, needsRehash: false });

    const fail = await verifyPasswordHash('ClaveIncorrecta', hash1);
    expect(fail).toEqual({ valid: false, needsRehash: false });
  });

  it('verifyPasswordHash detecta hashes legados SHA-256 y solicita rehash transparente', async () => {
    const legacy = await hashPasswordLegacySHA256('MiClave123');
    expect(legacy).toMatch(/^[0-9a-f]{64}$/);

    const ok = await verifyPasswordHash('MiClave123', legacy);
    expect(ok).toEqual({ valid: true, needsRehash: true });

    const bad = await verifyPasswordHash('OtraClave', legacy);
    expect(bad).toEqual({ valid: false, needsRehash: false });
  });

  it('signD1SessionToken y verifyD1SessionToken validan firma HMAC-SHA256, alteración de payload y expiración', async () => {
    const secret = 'clave-secreta-hmac-de-32-caracteres-minimo';
    const token = await signD1SessionToken(
      {
        uid: 'user-1',
        email: 'tendero@tienda.co',
        role: 'cashier',
        negocioId: 'mi-tienda',
        isSuperAdmin: false,
      },
      secret,
      3600
    );

    expect(token.startsWith('d1s.')).toBe(true);
    const verified = await verifyD1SessionToken(token, secret);
    expect(verified.uid).toBe('user-1');
    expect(verified.role).toBe('cashier');
    expect(verified.negocioId).toBe('mi-tienda');

    // Intento de escalar rol manipulando el payload sin firmar
    const [, payloadB64, sigB64] = token.split('.');
    const decodedPayload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    decodedPayload.role = 'admin';
    const tamperedB64 = btoa(JSON.stringify(decodedPayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const tamperedToken = `d1s.${tamperedB64}.${sigB64}`;

    await expect(verifyD1SessionToken(tamperedToken, secret)).rejects.toThrow(/Firma/i);
    await expect(verifyD1SessionToken(token, 'otro-secreto-invalido-123456')).rejects.toThrow(/Firma/i);

    // Token expirado (construido manualmente con exp en el pasado)
    const expiredPayload = {
      ...decodedPayload,
      role: 'cashier',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 60,
    };
    const expB64 = btoa(JSON.stringify(expiredPayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expSigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`d1s.${expB64}`));
    const expSigB64 = btoa(String.fromCharCode(...new Uint8Array(expSigBuf)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    await expect(verifyD1SessionToken(`d1s.${expB64}.${expSigB64}`, secret)).rejects.toThrow(/expirado/i);
  });

  it('verifyFirebaseIdToken bloquea tokens mock/d1 sin firma en producción y acepta d1s firmado', async () => {
    const prodEnv = { ENVIRONMENT: 'production', JWT_SECRET: 'secreto-produccion-muy-seguro-2026' } as unknown as Env;
    const prodReq = new Request('https://surtifacil.pages.dev/api/products');

    expect(isDevOrTestAuthAllowed(prodReq, prodEnv)).toBe(false);

    await expect(
      verifyFirebaseIdToken('mock:u1:admin@surtifacil.com:admin', 'surtifacilapp', {
        env: prodEnv,
        request: prodReq,
      })
    ).rejects.toThrow(/rechazado en producción/i);

    await expect(
      verifyFirebaseIdToken('d1:u1:admin@surtifacil.com:admin:surtifacil', 'surtifacilapp', {
        env: prodEnv,
        request: prodReq,
      })
    ).rejects.toThrow(/rechazado en producción/i);

    await expect(
      verifyFirebaseIdToken('test-admin-uid', 'surtifacilapp', {
        env: prodEnv,
        request: prodReq,
      })
    ).rejects.toThrow(/rechazado en producción/i);

    await expect(
      verifyFirebaseIdToken('token', 'surtifacilapp', {
        env: prodEnv,
        request: prodReq,
      })
    ).rejects.toThrow(/rechazado en producción/i);

    const signed = await signD1SessionToken(
      {
        uid: 'u1',
        email: 'admin@mitienda.co',
        role: 'admin',
        negocioId: 'mi-tienda',
      },
      prodEnv.JWT_SECRET!
    );
    const decoded = await verifyFirebaseIdToken(signed, 'surtifacilapp', {
      env: prodEnv,
      request: prodReq,
    });
    expect(decoded.uid).toBe('u1');
    expect(decoded.iss).toBe('surtifacil:d1-hmac');
  });

  it('verifyWhatsAppWebhookSignature valida firmas HMAC-SHA256 de Meta y rechaza alteraciones', async () => {
    const secret = 'whatsapp_secret_key_prod';
    const rawBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '123' }] });
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const validHex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    expect(await verifyWhatsAppWebhookSignature(rawBody, `sha256=${validHex}`, secret)).toBe(true);
    expect(await verifyWhatsAppWebhookSignature(`${rawBody} `, `sha256=${validHex}`, secret)).toBe(false);
    expect(await verifyWhatsAppWebhookSignature(rawBody, null, secret)).toBe(false);
    expect(timingSafeEqualStrings('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqualStrings('abc123', 'abc124')).toBe(false);
  });

  it('checkRateLimit bloquea tras superar el límite y se reinicia con resetRateLimitsForTests', () => {
    const bucket = 'login:127.0.0.1:test@tienda.co';
    expect(checkRateLimit(bucket, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(bucket, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(bucket, 3, 60_000).allowed).toBe(true);

    const blocked = checkRateLimit(bucket, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    resetRateLimitsForTests();
    expect(checkRateLimit(bucket, 3, 60_000).allowed).toBe(true);
  });
});
