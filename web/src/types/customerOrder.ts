export type CustomerOrderSource = 'kiosk' | 'web' | 'whatsapp';

export type CustomerOrderDeliveryType = 'pickup_counter' | 'delivery';

export type CustomerOrderPaymentMethod = 'cash' | 'transfer' | 'credit';

export type CustomerOrderStatus = 'pending' | 'preparing' | 'ready_or_on_way' | 'completed' | 'cancelled';

export interface CustomerOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
  image_url?: string;
  unit?: string;
}

export interface CustomerOrder {
  id: string;
  negocio_id: string;
  order_code: string; // ej: '#K-01', '#W-05'
  source: CustomerOrderSource;
  customer_name: string;
  customer_phone?: string | null;
  delivery_type: CustomerOrderDeliveryType;
  delivery_address?: string | null;
  delivery_neighborhood?: string | null;
  payment_method: CustomerOrderPaymentMethod;
  items_json: string; // Serializado en D1
  items?: CustomerOrderItem[]; // Parseado en frontend
  total_cents: number;
  status: CustomerOrderStatus;
  tracking_token?: string | null;
  sale_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCustomerOrderInput {
  slug?: string;
  negocio_id?: string;
  customer_name: string;
  customer_phone?: string;
  delivery_type: CustomerOrderDeliveryType;
  delivery_address?: string;
  delivery_neighborhood?: string;
  payment_method: CustomerOrderPaymentMethod;
  items: Array<{
    product_id: string;
    product_name?: string;
    quantity: number;
    unit_price_cents?: number;
    image_url?: string;
    unit?: string;
  }>;
  source: CustomerOrderSource;
}

export interface PublicStoreData {
  id: string;
  slug: string;
  nombre: string;
  barrio?: string;
  ciudad?: string;
  telefono_whatsapp?: string;
  direccion?: string;
  horario?: string;
  logo_url?: string;
  estado: string;
  costo_domicilio_cents: number;
  datos_pago_offline?: string;
  config: {
    slogan?: string;
    permite_domicilio?: boolean;
    permite_retiro?: boolean;
    allow_kiosk?: boolean;
    allow_whatsapp?: boolean;
    [key: string]: unknown;
  };
  products: Array<{
    id: string;
    name: string;
    price_cents: number;
    stock: number;
    unit: string;
    category?: string;
    image_url?: string;
    barcode?: string;
    visible_kiosco: number;
    visible_tienda: number;
    en_oferta: number;
    precio_oferta_cents?: number | null;
  }>;
  combos: Array<{
    id: string;
    name: string;
    description?: string;
    price_cents: number;
    items_json: string;
    image_url?: string;
    visible_kiosco: number;
    visible_tienda: number;
  }>;
}

