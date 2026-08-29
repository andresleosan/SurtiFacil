/**
 * Tipo para un producto en Firestore
 */
export interface Product {
  id: string;
  name: string;
  price_cents: number; // Precio en centavos (ej: 250 = $2.50)
  stock: number;
  category?: string; // Categoría del producto (opcional)
  supplier_id?: string;
  createdAt?: any;
  last_cost_cents?: number;
  last_cost_source?: 'purchase' | 'fallback_price';
  last_cost_updated_at?: any;
  barcode?: string; // EAN-13, UPC-A, or QR code
}

/**
 * Roles de usuario en el sistema
 */
export type UserRole = 'admin' | 'manager' | 'cashier';

/**
 * Tipo para un usuario en Firestore
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt?: any;
  lastLogin?: any;
}

/**
 * Tipo para un item de venta
 */
export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price_cents: number;
  subtotal: number; // quantity * price_cents
  unit_cost_cents?: number;
  cost_subtotal_cents?: number;
  cost_source?: 'purchase' | 'fallback_price';
  cost_is_estimated?: boolean;
  category?: string;
}

/**
 * Tipo para una venta en Firestore
 */
export interface Sale {
  id: string;
  date: any; // Firestore Timestamp
  total: number; // Total en centavos
  payment_method: "cash" | "card" | "other";
  items: SaleItem[];
  createdAt?: any;
  schema_version?: 2;
  created_by_uid?: string;
  created_by_role?: UserRole;
  total_cost_cents?: number;
}

export type OrderStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  active: boolean;
  createdAt?: any;
  totalOrders: number;
  totalSpentCents: number;
  lead_time_days?: number;
}

export interface OrderItem {
  product_id?: string;
  name?: string;
  category?: string;
  quantity: number;
  received_quantity: number;
  unit_cost_cents: number;
  final_cost_cents?: number;
  isNewProduct: boolean;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  items: OrderItem[];
  total_cents: number;
  received_total_cents: number;
  date: any;
  expectedDate?: any;
  receivedDate?: any;
  notes?: string;
  createdAt?: any;
}
