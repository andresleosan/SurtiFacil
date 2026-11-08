import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getIntegrationStatus,
  testDeepSeekConnection,
} from '../services/integrationService';
import { apiClient } from '../services/apiClient';

describe('integrationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('obtiene el estado de integraciones del backend', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      deepseek: {
        configured: true,
        mode: 'live',
        model: 'deepseek-chat',
        provider: 'DeepSeek API v3 (Edge)',
      },
      whatsapp: {
        configured: true,
        mode: 'live',
        phone_id: '***1234',
        webhook_url: 'https://surtifacil.pages.dev/api/webhooks/whatsapp',
        verify_token_configured: true,
      },
      database: {
        status: 'connected',
        engine: 'Cloudflare D1 (SQLite Edge)',
        multi_tenant: true,
      },
    });

    const status = await getIntegrationStatus();
    expect(status.deepseek.configured).toBe(true);
    expect(status.whatsapp.webhook_url).toContain('/api/webhooks/whatsapp');
  });

  it('usa fallback cuando el backend falla al consultar integraciones', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network error'));

    const status = await getIntegrationStatus();
    expect(status.deepseek.mode).toBe('simulated_heuristic');
    expect(status.whatsapp.mode).toBe('simulated_local');
    expect(status.database.status).toBe('connected');
  });

  it('prueba la conexión de DeepSeek API', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      success: true,
      mode: 'live',
      latency_ms: 55,
      message: 'Conexión exitosa con DeepSeek API oficial en la nube.',
    });

    const res = await testDeepSeekConnection();
    expect(res.success).toBe(true);
    expect(res.mode).toBe('live');
    expect(res.latency_ms).toBe(55);
  });
});
