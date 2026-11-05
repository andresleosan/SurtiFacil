import { StoreSettings } from '../types/storeSettings';
import { apiClient, emitDataChange, onDataChange } from './apiClient';
import { mockStoreSettings } from './mockData';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function mapSettings(data: any): StoreSettings {
  let config: Record<string, any> = {};
  try {
    config = typeof data.config_json === 'string' ? JSON.parse(data.config_json) : (data.config_json || {});
  } catch {
    config = {};
  }

  return {
    id: data.id || 'surtifacil',
    slug: data.slug || 'surtifacil',
    nombre: data.nombre || 'SurtiFácil Abastos',
    barrio: data.barrio || 'Medellín',
    ciudad: data.ciudad || 'Medellín',
    direccion: data.direccion || '',
    telefono_whatsapp: data.telefono_whatsapp || '',
    horario: data.horario || 'Lunes a Domingo 7:00 AM - 9:00 PM',
    costo_domicilio_cents: data.costo_domicilio_cents ?? 0,
    permite_domicilio: config.permite_domicilio !== undefined ? Boolean(config.permite_domicilio) : true,
    permite_retiro: config.permite_retiro !== undefined ? Boolean(config.permite_retiro) : true,
    slogan: config.slogan || 'El motor digital del tendero paisa',
    datos_pago_offline: data.datos_pago_offline || '',
    plan_id: data.plan_id || 'enterprise',
    estado: data.estado || 'activo',
    suscripcion_vence_en: data.suscripcion_vence_en,
    cuota_ia_total: data.cuota_ia_total ?? 300,
    cuota_ia_usada: data.cuota_ia_usada ?? 0,
  };
}

export async function getStoreSettings(): Promise<StoreSettings> {
  if (isMockMode()) {
    return { ...mockStoreSettings };
  }

  try {
    const res = await apiClient.get<any>('/settings');
    return mapSettings(res);
  } catch (err) {
    console.warn('Error fetching settings from /settings, trying /auth/me fallback');
    try {
      const me = await apiClient.get<any>('/auth/me');
      if (me?.negocio) return mapSettings(me.negocio);
    } catch {
      // Fallback
    }
    return { ...mockStoreSettings };
  }
}

export async function updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings> {
  if (isMockMode()) {
    Object.assign(mockStoreSettings, settings);
    emitDataChange('settings');
    return { ...mockStoreSettings };
  }

  try {
    const updated = await apiClient.put<any>('/settings', settings);
    emitDataChange('settings');
    return mapSettings(updated);
  } catch {
    console.error('Error updating store settings in D1.');
    throw new Error('Error al guardar la configuración del local');
  }
}

export function subscribeToSettings(
  onData: (settings: StoreSettings) => void,
  onError: (err: Error) => void
): () => void {
  let active = true;

  const fetchAndEmit = async () => {
    try {
      const data = await getStoreSettings();
      if (active) onData(data);
    } catch (err: any) {
      if (active) onError(err);
    }
  };

  void fetchAndEmit();

  const unsubscribe = onDataChange('settings', () => {
    if (active) void fetchAndEmit();
  });

  return () => {
    active = false;
    unsubscribe();
  };
}
