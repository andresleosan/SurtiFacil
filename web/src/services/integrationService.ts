import { apiClient } from './apiClient';

export interface IntegrationStatus {
  deepseek: {
    configured: boolean;
    mode: 'live' | 'simulated_heuristic' | 'error';
    model: string;
    provider: string;
  };
  whatsapp: {
    configured: boolean;
    mode: 'live' | 'simulated_local';
    phone_id?: string | null;
    webhook_url: string;
    verify_token_configured: boolean;
  };
  database: {
    status: string;
    engine: string;
    multi_tenant: boolean;
  };
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  try {
    return await apiClient.get<IntegrationStatus>('/integrations/status');
  } catch (err) {
    console.warn('Error obteniendo estado de integraciones, usando fallback:', err);
    return {
      deepseek: {
        configured: false,
        mode: 'simulated_heuristic',
        model: 'deepseek-chat',
        provider: 'DeepSeek Heurístico Local',
      },
      whatsapp: {
        configured: false,
        mode: 'simulated_local',
        phone_id: null,
        webhook_url: 'https://surtifacil.pages.dev/api/webhooks/whatsapp',
        verify_token_configured: true,
      },
      database: {
        status: 'connected',
        engine: 'Cloudflare D1 (SQLite Edge)',
        multi_tenant: true,
      },
    };
  }
}

export async function testDeepSeekConnection(): Promise<{
  success: boolean;
  mode: string;
  latency_ms?: number;
  message?: string;
  error?: string;
}> {
  try {
    return await apiClient.post<{
      success: boolean;
      mode: string;
      latency_ms?: number;
      message?: string;
      error?: string;
    }>('/integrations/test-deepseek');
  } catch (err: any) {
    return {
      success: false,
      mode: 'error',
      error: err.message || 'Error de comunicación con el backend',
    };
  }
}
