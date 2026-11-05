/**
 * SurtiFácil SaaS - Contratos de Tipos para Tenants, Negocios y Planes
 */

export type SaaSPlanId = 'prueba_3d' | 'semanal_7d' | 'quincenal_15d' | 'mensual_30d' | 'enterprise';

export interface SaaSPlan {
  id: SaaSPlanId;
  name: string;
  shortName: string;
  durationDays: number;
  priceCOP: number;
  cuotaIATurnos: number;
  description: string;
  features: string[];
  badge?: string;
  popular?: boolean;
}

export const SAAS_PLANS: readonly SaaSPlan[] = [
  {
    id: 'prueba_3d',
    name: 'Plan Prueba (3 días)',
    shortName: 'Prueba 3d',
    durationDays: 3,
    priceCOP: 5000,
    cuotaIATurnos: 300,
    description: 'Ideal para probar el mostrador táctil y la IA en tu tienda sin compromiso.',
    features: [
      'Punto de Venta POS táctil ilimitado',
      '300 turnos de voz y pedidos Sarin IA',
      'Catálogo de abastos con escáner de barras',
      'Libro de Fiados básico',
      'Soporte inicial por WhatsApp',
    ],
  },
  {
    id: 'semanal_7d',
    name: 'Plan Semanal (7 días)',
    shortName: 'Semanal 7d',
    durationDays: 7,
    priceCOP: 19900,
    cuotaIATurnos: 700,
    description: 'Para abastecer la semana y controlar el flujo diario de caja.',
    features: [
      'Todo lo del Plan Prueba',
      '700 turnos de Sarin IA (Voz + WhatsApp)',
      'Modo Kiosco iPad para la entrada del local',
      'Arqueo de caja físico en COP sin descuadres',
      'Reporte semanal de márgenes y reposición',
    ],
  },
  {
    id: 'quincenal_15d',
    name: 'Plan Quincenal (15 días)',
    shortName: 'Quincenal 15d',
    durationDays: 15,
    priceCOP: 34900,
    cuotaIATurnos: 1500,
    description: 'El plan más elegido por minimercados y abastos con alto movimiento quincenal.',
    popular: true,
    badge: 'Más Popular',
    features: [
      'Todo lo del Plan Semanal',
      '1.500 turnos de Sarin IA',
      'Catálogo Web Vecinal público (/tienda/:slug)',
      'Cobro amigable de fiados por WhatsApp a 1 clic',
      'Alertas de stock bajo para reposición inmediata',
      'Soporte prioritario para el tendero',
    ],
  },
  {
    id: 'mensual_30d',
    name: 'Plan Mensual (30 días)',
    shortName: 'Mensual 30d',
    durationDays: 30,
    priceCOP: 59900,
    cuotaIATurnos: 3000,
    description: 'Máximo ahorro y tranquilidad operativa para todo el mes.',
    features: [
      'Todo lo del Plan Quincenal',
      '3.000 turnos de Sarin IA con DeepSeek',
      'Múltiples cajeros y roles de staff',
      'Generador de afiches QR para mostrador',
      'Respaldo seguro en Cloudflare D1',
      'Mejor costo por día de operación',
    ],
  },
  {
    id: 'enterprise',
    name: 'Plan Enterprise Insignia',
    shortName: 'Enterprise',
    durationDays: 365,
    priceCOP: 0,
    cuotaIATurnos: 999999,
    description: 'Plan ilimitado para la sede matriz y cuentas corporativas.',
    features: [
      'Acceso total a todas las herramientas SaaS',
      'Sarin IA ilimitada sin límites de turnos',
      'Múltiples sucursales y sincronización',
      'Soporte 24/7 directo con el desarrollador',
    ],
  },
];

export type NegocioEstado = 'activo' | 'pendiente' | 'suspendido';

export interface Negocio {
  id: string;
  slug: string;
  nombre: string;
  barrio: string;
  ciudad: string;
  telefono_whatsapp?: string;
  direccion?: string;
  horario?: string;
  logo_url?: string;
  estado: NegocioEstado;
  plan_id: SaaSPlanId;
  suscripcion_vence_en?: string;
  cuota_ia_total: number;
  cuota_ia_usada: number;
  costo_domicilio_cents: number;
  datos_pago_offline?: string;
  config_json?: string;
  created_at?: string;
  updated_at?: string;
  // Métricas opcionales devueltas por SuperAdmin
  total_products?: number;
  total_users?: number;
  total_sales?: number;
}

export interface RegisterStoreInput {
  nombre: string;
  slug: string;
  owner_name: string;
  email: string;
  password?: string;
  telefono_whatsapp: string;
  barrio: string;
  direccion?: string;
  plan_id: SaaSPlanId;
}

export interface SuperAdminKPIs {
  totalTiendas: number;
  tiendasActivas: number;
  recaudoEstimadoCOP: number;
  cuotaIATotal: number;
  cuotaIAUsada: number;
}

export const MEDELLIN_NEIGHBORHOODS: readonly string[] = [
  'Laureles',
  'Belén',
  'El Poblado',
  'Robledo',
  'Castilla',
  'Aranjuez',
  'Buenos Aires',
  'San Javier (Comuna 13)',
  'La América',
  'Guayabal',
  'Manrique',
  'Villa Hermosa',
  'Doce de Octubre',
  'Popular',
  'Santa Cruz',
  'San Antonio de Prado',
  'San Cristóbal',
  'Centro / La Candelaria',
  'Envigado (Área Metropolitana)',
  'Itagüí (Área Metropolitana)',
  'Bello (Área Metropolitana)',
  'Sabaneta (Área Metropolitana)',
];

