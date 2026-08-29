import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPrivateRuntimeCaches, PRIVATE_RUNTIME_CACHE_NAMES } from '../services/pwaCacheService';

describe('PWA authenticated-data privacy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deletes every historical private runtime cache', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { delete: remove });

    await clearPrivateRuntimeCaches();

    expect(remove.mock.calls.map(([name]) => name)).toEqual([...PRIVATE_RUNTIME_CACHE_NAMES]);
  });

  it('uses NetworkOnly for Google APIs and Firebase realtime endpoints', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const runtimeSection = config.slice(config.indexOf('runtimeCaching'), config.indexOf('server:'));

    expect(runtimeSection).toContain('googleapis');
    expect(runtimeSection).toContain('firebaseio');
    expect(runtimeSection.match(/handler: 'NetworkOnly'/g)).toHaveLength(2);
    expect(runtimeSection).not.toContain('NetworkFirst');
    expect(runtimeSection).not.toContain("cacheName: 'googleapis-cache'");
    expect(runtimeSection).not.toContain("cacheName: 'firebase-cache'");
  });
});
