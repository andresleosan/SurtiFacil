import { D1Database, Env } from '../types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface DeepSeekCompletionResponse {
  id?: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: 'stop' | 'tool_calls' | 'length' | string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  total: number;
  used: number;
}

/**
 * Verifica atómicamente y descuenta 1 unidad de la cuota de IA del negocio en Cloudflare D1.
 */
export async function checkAndConsumeAiQuota(
  db: D1Database,
  negocioId: string
): Promise<QuotaCheckResult> {
  const row = await db
    .prepare('SELECT cuota_ia_total, cuota_ia_usada, estado FROM negocios WHERE id = ?')
    .bind(negocioId)
    .first<{ cuota_ia_total: number; cuota_ia_usada: number; estado: string }>();

  if (!row) {
    return { allowed: false, remaining: 0, total: 0, used: 0 };
  }

  const total = Number(row.cuota_ia_total ?? 300);
  const used = Number(row.cuota_ia_usada ?? 0);
  const remaining = Math.max(0, total - used);

  if (row.estado !== 'activo' || remaining <= 0) {
    return { allowed: false, remaining, total, used };
  }

  // Descuento atómico de 1 turno de IA
  await db
    .prepare(
      `UPDATE negocios 
       SET cuota_ia_usada = cuota_ia_usada + 1, 
           updated_at = datetime('now') 
       WHERE id = ? AND cuota_ia_usada < cuota_ia_total`
    )
    .bind(negocioId)
    .run();

  return {
    allowed: true,
    remaining: Math.max(0, remaining - 1),
    total,
    used: used + 1,
  };
}

/**
 * Realiza una llamada a la API oficial de DeepSeek (formato compatible con OpenAI).
 * Si no hay API key configurada o falla la red, devuelve null para fallback seguro.
 */
export async function callDeepSeekChat(
  env: Env,
  options: {
    messages: ChatMessage[];
    tools?: ChatCompletionTool[];
    tool_choice?: 'auto' | 'none' | string;
    temperature?: number;
    max_tokens?: number;
  }
): Promise<DeepSeekCompletionResponse | null> {
  const apiKey = (env.DEEPSEEK_API_KEY as string | undefined)?.trim();
  if (!apiKey || apiKey === 'mock-key' || apiKey.startsWith('sk-test-mock')) {
    return null;
  }

  const bodyPayload: Record<string, unknown> = {
    model: 'deepseek-chat',
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 1024,
  };

  if (options.tools && options.tools.length > 0) {
    bodyPayload.tools = options.tools;
    bodyPayload.tool_choice = options.tool_choice ?? 'auto';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`DeepSeek API devolvió HTTP ${response.status}: ${errText.slice(0, 150)}`);
      return null;
    }

    const data = (await response.json()) as DeepSeekCompletionResponse;
    return data;
  } catch (error) {
    console.warn('Error en llamada a DeepSeek API, usando orquestador resiliente:', error);
    return null;
  }
}

