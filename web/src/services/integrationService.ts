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
    app_secret_configured?: boolean;
  };
  database: {
    status: string;
    engine: string;
    multi_tenant: boolean;
  };
  security?: {
    session_signing: string;
    jwt_secret_source: string;
    password_hashing: string;
    mock_tokens_blocked_in_prod: boolean;
    whatsapp_hmac_configured: boolean;
    demo_quick_access_enabled: boolean;
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
        app_secret_configured: false,
      },
      database: {
        status: 'connected',
        engine: 'Cloudflare D1 (SQLite Edge)',
        multi_tenant: true,
      },
      security: {
        session_signing: 'HMAC-SHA256',
        jwt_secret_source: 'd1_auto_managed',
        password_hashing: 'PBKDF2-SHA256 (100.000 iteraciones)',
        mock_tokens_blocked_in_prod: true,
        whatsapp_hmac_configured: false,
        demo_quick_access_enabled: true,
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
