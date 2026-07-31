/**
 * Tipo para un producto en Firestore
 */
export interface Product {
  id: string;
  name: string;
  price_cents: number; // Precio en centavos (ej: 250 = $2.50)
  stock: number;
  category?: string; // Categoría del producto (opcional)
  createdAt?: any;
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
}
