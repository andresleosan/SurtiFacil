import { describe, expect, it } from 'vitest';
import { assertProductionBackendUrl } from '../config/buildEnvironment';

describe('production backend URL build guard', () => {
  it('allows local defaults outside production mode', () => {
    expect(() => assertProductionBackendUrl('development', undefined)).not.toThrow();
    expect(() => assertProductionBackendUrl('test', 'http://localhost:3000')).not.toThrow();
  });

  it.each([
    undefined,
    '',
    'not-a-url',
    'http://api.example.com',
    'http://localhost:3000',
    'https://localhost:3000',
    'https://127.0.0.1:3000',
    'https://api.localhost',
  ])('rejects unsafe production value %s', (value) => {
    expect(() => assertProductionBackendUrl('production', value)).toThrow(/VITE_BACKEND_URL/);
  });

  it('accepts a public HTTPS production backend URL', () => {
    expect(() => assertProductionBackendUrl('production', ' https://api.example.com ')).not.toThrow();
  });
});
