import { getAuth } from 'firebase/auth';

export class ApiError extends Error {
  public status: number;
  public data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let activeNegocioIdOverride: string | null = null;
let storedAuthTokenOverride: string | null = null;

export function getStoredAuthToken(): string | null {
  if (storedAuthTokenOverride) return storedAuthTokenOverride;
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('sf_auth_token');
  }
  return null;
}

export function setStoredAuthToken(token: string | null): void {
  storedAuthTokenOverride = token;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (token) {
      localStorage.setItem('sf_auth_token', token);
    } else {
      localStorage.removeItem('sf_auth_token');
    }
  }
}

export function getActiveNegocioId(): string | null {
  if (activeNegocioIdOverride) return activeNegocioIdOverride;
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('sf_active_negocio_id');
  }
  return null;
}

export function setActiveNegocioId(negocioId: string | null): void {
  activeNegocioIdOverride = negocioId;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (negocioId) {
      localStorage.setItem('sf_active_negocio_id', negocioId);
    } else {
      localStorage.removeItem('sf_active_negocio_id');
    }
  }
}

function getBaseUrl(): string {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/$/, '');
  }
  return '';
}

async function getAuthToken(): Promise<string | null> {
  try {
    const auth = getAuth();
    if (auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
      return await auth.currentUser.getIdToken();
    }
  } catch {
    // Si Firebase Auth no está listo o en entorno de test sin Auth
  }
  return getStoredAuthToken();
}

/**
 * Cliente HTTP unificado para Cloudflare Pages Functions (/api/*)
 * - Inyecta Authorization: Bearer <idToken> automáticamente
 * - Inyecta X-Negocio-Id para multi-tenant o SuperAdmin switch
 * - Normaliza errores con ApiError
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullPath = cleanPath.startsWith('/api') ? cleanPath : `/api${cleanPath}`;
  const url = `${baseUrl}${fullPath}`;

  const headers: Record<string, string> = {};
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }

  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = await getAuthToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const activeNegocio = getActiveNegocioId();
  if (activeNegocio && !headers['X-Negocio-Id']) {
    headers['X-Negocio-Id'] = activeNegocio;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorMessage = `Error HTTP ${response.status}: ${response.statusText}`;
    let errorData: any = null;

    try {
      errorData = await response.json();
      if (errorData && typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      }
    } catch {
      try {
        const text = await response.text();
        if (text) errorMessage = text;
      } catch {
        // Ignorar error al leer texto
      }
    }

    throw new ApiError(errorMessage, response.status, errorData);
  }

  // Si la respuesta es 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));
  return data as T;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit) => apiFetch<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(endpoint: string, options?: RequestInit) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
};

// ==========================================
// Bus de Eventos Reactivo en Cliente
// Reemplaza los listeners de Firestore en vivo
// ==========================================
export type DataEntity = 'products' | 'sales' | 'credits' | 'suppliers' | 'orders' | 'users' | 'combos' | 'settings' | 'cash-closings';

const eventBus = new EventTarget();

export function emitDataChange(entity: DataEntity): void {
  eventBus.dispatchEvent(new CustomEvent(`${entity}:changed`));
}

export function onDataChange(entity: DataEntity, callback: () => void): () => void {
  const handler = () => callback();
  eventBus.addEventListener(`${entity}:changed`, handler);
  return () => {
    eventBus.removeEventListener(`${entity}:changed`, handler);
  };
}
