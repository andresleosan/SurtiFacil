export interface StoreSettings {
  id: string;
  slug: string;
  nombre: string;
  barrio: string;
  ciudad: string;
  direccion: string;
  telefono_whatsapp: string;
  horario: string;
  costo_domicilio_cents: number;
  permite_domicilio: boolean;
  permite_retiro: boolean;
  slogan: string;
  datos_pago_offline: string;
  plan_id: string;
  estado: string;
  suscripcion_vence_en?: string;
  cuota_ia_total: number;
  cuota_ia_usada: number;
}
