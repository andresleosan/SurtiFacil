import { Combo, NewComboInput } from '../types/combo';
import { apiClient, emitDataChange, onDataChange } from './apiClient';
import { mockCombos } from './mockData';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

function mapCombo(row: any): Combo {
  let items = [];
  try {
    items = typeof row.items_json === 'string' ? JSON.parse(row.items_json) : row.items || [];
  } catch {
    items = [];
  }

  return {
    id: row.id,
    negocio_id: row.negocio_id,
    name: row.name,
    description: row.description || '',
    price_cents: row.price_cents,
    items,
    image_url: row.image_url || undefined,
    active: row.active !== undefined ? Boolean(row.active) : true,
    visible_kiosco: row.visible_kiosco !== undefined ? Boolean(row.visible_kiosco) : true,
    visible_tienda: row.visible_tienda !== undefined ? Boolean(row.visible_tienda) : true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getCombos(): Promise<Combo[]> {
  if (isMockMode()) {
    return [...mockCombos].map(mapCombo);
  }

  try {
    const res = await apiClient.get<any[]>('/combos');
    return (res || []).map(mapCombo);
  } catch {
    console.error('Error fetching combos from D1, returning fallback');
    return [...mockCombos].map(mapCombo);
  }
}

export function subscribeToCombos(onData: (combos: Combo[]) => void, onError: (err: Error) => void): () => void {
  let active = true;

  const fetchAndEmit = async () => {
    try {
      const data = await getCombos();
      if (active) onData(data);
    } catch (err: any) {
      if (active) onError(err);
    }
  };

  void fetchAndEmit();

  const unsubscribe = onDataChange('combos', () => {
    if (active) void fetchAndEmit();
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function createCombo(input: NewComboInput): Promise<Combo> {
  const payload = {
    name: input.name.trim(),
    description: input.description.trim(),
    price_cents: input.price_cents,
    items: input.items,
    image_url: input.image_url || null,
    active: input.active !== undefined ? input.active : true,
    visible_kiosco: input.visible_kiosco !== undefined ? input.visible_kiosco : true,
    visible_tienda: input.visible_tienda !== undefined ? input.visible_tienda : true,
  };

  if (isMockMode()) {
    const combo: Combo = {
      id: `combo-${Date.now()}`,
      negocio_id: 'surtifacil',
      ...payload,
      image_url: payload.image_url ?? undefined,
      created_at: new Date().toISOString(),
    };
    mockCombos.push(combo as any);
    emitDataChange('combos');
    return combo;
  }

  try {
    const created = await apiClient.post<any>('/combos', payload);
    emitDataChange('combos');
    return mapCombo(created);
  } catch {
    console.error('Error creating combo.');
    throw new Error('Error al crear combo de mercado');
  }
}

export async function updateCombo(combo: Combo): Promise<Combo> {
  const payload = {
    name: combo.name.trim(),
    description: combo.description.trim(),
    price_cents: combo.price_cents,
    items: combo.items,
    image_url: combo.image_url || null,
    active: combo.active,
    visible_kiosco: combo.visible_kiosco,
    visible_tienda: combo.visible_tienda,
  };

  if (isMockMode()) {
    const idx = mockCombos.findIndex((c) => c.id === combo.id);
    if (idx >= 0) {
      mockCombos[idx] = { ...mockCombos[idx], ...payload, image_url: payload.image_url ?? undefined } as any;
    }
    emitDataChange('combos');
    return combo;
  }

  try {
    const updated = await apiClient.put<any>(`/combos/${encodeURIComponent(combo.id)}`, payload);
    emitDataChange('combos');
    return mapCombo(updated);
  } catch {
    console.error('Error updating combo.');
    throw new Error('Error al actualizar combo');
  }
}

export async function deleteCombo(comboId: string): Promise<void> {
  if (isMockMode()) {
    const idx = mockCombos.findIndex((c) => c.id === comboId);
    if (idx >= 0) mockCombos.splice(idx, 1);
    emitDataChange('combos');
    return;
  }

  try {
    await apiClient.delete(`/combos/${encodeURIComponent(comboId)}`);
    emitDataChange('combos');
  } catch {
    console.error('Error deleting combo.');
    throw new Error('Error al eliminar combo');
  }
}
