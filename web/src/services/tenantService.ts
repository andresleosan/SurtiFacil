import { apiClient } from './apiClient';
import type { Negocio, RegisterStoreInput, SuperAdminKPIs } from '../types/tenant';
import { getActiveNegocioId, setActiveNegocioId } from './apiClient';

export interface SuperAdminData {
  kpis: SuperAdminKPIs;
  negocios: Negocio[];
}

const MOCK_NEGOCIOS: Negocio[] = [
  {
    id: 'surtifacil',
    slug: 'surtifacil',
    nombre: 'SurtiFácil Abastos Central',
    barrio: 'Centro / La Candelaria',
    ciudad: 'Medellín',
    telefono_whatsapp: '3001234567',
    direccion: 'Carrera 50 # 52-20',
    horario: 'Lunes a Domingo 6:00 AM - 9:00 PM',
    estado: 'activo',
    plan_id: 'enterprise',
    suscripcion_vence_en: new Date(Date.now() + 365 * 86400000).toISOString(),
    cuota_ia_total: 999999,
    cuota_ia_usada: 2450,
    costo_domicilio_cents: 350000,
    total_products: 48,
    total_users: 3,
    total_sales: 154,
  },
  {
    id: 'abastos-la-80',
    slug: 'abastos-la-80',
    nombre: 'Minimercado y Abastos La 80',
    barrio: 'Belén',
    ciudad: 'Medellín',
    telefono_whatsapp: '3119876543',
    direccion: 'Avenida 80 # 30-15',
    horario: 'Lunes a Sábado 7:00 AM - 8:30 PM',
    estado: 'activo',
    plan_id: 'quincenal_15d',
    suscripcion_vence_en: new Date(Date.now() + 8 * 86400000).toISOString(),
    cuota_ia_total: 1500,
    cuota_ia_usada: 680,
    costo_domicilio_cents: 400000,
    total_products: 32,
    total_users: 2,
    total_sales: 78,
  },
  {
    id: 'la-granja-laureles',
    slug: 'la-granja-laureles',
    nombre: 'Fruver & Víveres La Granja',
    barrio: 'Laureles',
    ciudad: 'Medellín',
    telefono_whatsapp: '3024567890',
    direccion: 'Circular 4ta # 73-10',
    horario: 'Todos los días 7:00 AM - 9:00 PM',
    estado: 'activo',
    plan_id: 'mensual_30d',
    suscripcion_vence_en: new Date(Date.now() + 22 * 86400000).toISOString(),
    cuota_ia_total: 3000,
    cuota_ia_usada: 1120,
    costo_domicilio_cents: 450000,
    total_products: 65,
    total_users: 4,
    total_sales: 210,
  },
  {
    id: 'tienda-don-paisa',
    slug: 'tienda-don-paisa',
    nombre: 'Tienda de Abarrotes Don Paisa',
    barrio: 'San Javier (Comuna 13)',
    ciudad: 'Medellín',
    telefono_whatsapp: '3156789012',
    direccion: 'Calle 44 # 105-22',
    horario: 'Lunes a Domingo 7:00 AM - 10:00 PM',
    estado: 'activo',
    plan_id: 'prueba_3d',
    suscripcion_vence_en: new Date(Date.now() + 2 * 86400000).toISOString(),
    cuota_ia_total: 300,
    cuota_ia_usada: 145,
    costo_domicilio_cents: 300000,
    total_products: 18,
    total_users: 1,
    total_sales: 29,
  },
];

export async function registerStore(input: RegisterStoreInput) {
  try {
    return await apiClient.post<{ success: boolean; message: string; negocio: any; user: any }>(
      '/registro-negocio',
      input
    );
  } catch (error) {
    // Si la API no está disponible en dev o preview sin Cloudflare Functions
    console.warn('API /registro-negocio falló, usando simulación local:', error);
    const slug = input.slug.toLowerCase().trim();
    const newNegocio: Negocio = {
      id: slug,
      slug,
      nombre: input.nombre,
      barrio: input.barrio,
      ciudad: 'Medellín',
      telefono_whatsapp: input.telefono_whatsapp,
      direccion: input.direccion,
      estado: 'activo',
      plan_id: input.plan_id,
      suscripcion_vence_en: new Date(Date.now() + 3 * 86400000).toISOString(),
      cuota_ia_total: 300,
      cuota_ia_usada: 0,
      costo_domicilio_cents: 0,
      total_products: 0,
      total_users: 1,
      total_sales: 0,
    };
    MOCK_NEGOCIOS.push(newNegocio);
    return {
      success: true,
      message: '¡Tienda registrada exitosamente!',
      negocio: newNegocio,
      user: { email: input.email, role: 'admin' },
    };
  }
}

export async function getSuperAdminData(): Promise<SuperAdminData> {
  try {
    return await apiClient.get<SuperAdminData>('/super-admin/negocios');
  } catch (error) {
    console.warn('API /super-admin/negocios falló, usando datos simulados:', error);
    const totalTiendas = MOCK_NEGOCIOS.length;
    const tiendasActivas = MOCK_NEGOCIOS.filter((n) => n.estado === 'activo').length;
    let recaudoEstimadoCOP = 0;
    let cuotaIATotal = 0;
    let cuotaIAUsada = 0;

    for (const n of MOCK_NEGOCIOS) {
      cuotaIATotal += n.cuota_ia_total;
      cuotaIAUsada += n.cuota_ia_usada;
      if (n.estado === 'activo') {
        if (n.plan_id === 'prueba_3d') recaudoEstimadoCOP += 5000;
        else if (n.plan_id === 'semanal_7d') recaudoEstimadoCOP += 19900;
        else if (n.plan_id === 'quincenal_15d') recaudoEstimadoCOP += 34900;
        else if (n.plan_id === 'mensual_30d') recaudoEstimadoCOP += 59900;
      }
    }

    return {
      kpis: {
        totalTiendas,
        tiendasActivas,
        recaudoEstimadoCOP,
        cuotaIATotal,
        cuotaIAUsada,
      },
      negocios: [...MOCK_NEGOCIOS],
    };
  }
}

export async function updateNegocio(id: string, updates: Partial<Negocio>): Promise<Negocio> {
  try {
    return await apiClient.put<Negocio>(`/super-admin/negocios/${id}`, updates);
  } catch (error) {
    console.warn('API updateNegocio falló, actualizando local:', error);
    const index = MOCK_NEGOCIOS.findIndex((n) => n.id === id);
    if (index >= 0) {
      MOCK_NEGOCIOS[index] = { ...MOCK_NEGOCIOS[index], ...updates };
      return MOCK_NEGOCIOS[index];
    }
    throw error;
  }
}

export async function renovarNegocio(id: string, days: number, add_cuota_ia?: number): Promise<Negocio> {
  try {
    return await apiClient.post<Negocio>(`/super-admin/negocios/${id}/renovar`, { days, add_cuota_ia });
  } catch (error) {
    console.warn('API renovarNegocio falló, actualizando local:', error);
    const index = MOCK_NEGOCIOS.findIndex((n) => n.id === id);
    if (index >= 0) {
      const current = MOCK_NEGOCIOS[index];
      let base = new Date();
      if (current.suscripcion_vence_en) {
        const d = new Date(current.suscripcion_vence_en);
        if (d > base) base = d;
      }
      const newExpiry = new Date(base.getTime() + days * 86400000).toISOString();
      const updated: Negocio = {
        ...current,
        estado: 'activo',
        suscripcion_vence_en: newExpiry,
        cuota_ia_total: current.cuota_ia_total + (add_cuota_ia || 0),
      };
      MOCK_NEGOCIOS[index] = updated;
      return updated;
    }
    throw error;
  }
}

export function operateStore(negocioId: string | null) {
  setActiveNegocioId(negocioId);
}

export function getOperatingStoreId(): string | null {
  return getActiveNegocioId();
}

