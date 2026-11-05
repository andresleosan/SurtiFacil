export interface ComboItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Combo {
  id: string;
  negocio_id?: string;
  name: string;
  description: string;
  price_cents: number;
  items: ComboItem[];
  image_url?: string;
  active: boolean;
  visible_kiosco?: boolean;
  visible_tienda?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NewComboInput {
  name: string;
  description: string;
  price_cents: number;
  items: ComboItem[];
  image_url?: string;
  active?: boolean;
  visible_kiosco?: boolean;
  visible_tienda?: boolean;
}

