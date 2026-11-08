/**
 * Datos Mock para desarrollo/demostración
 * Se usan cuando Firebase no está configurado
 */

import { Product, Sale, SaleItem, Supplier, PurchaseOrder, CreditCustomer, CreditEntry } from '../firebase/db';

const baseProducts: Product[] = [
  {
    id: 'p1',
    name: 'Manzana Roja',
    price_cents: 250, // $2.50
    stock: 45,
  },
  {
    id: 'p2',
    name: 'Pan Integral',
    price_cents: 150, // $1.50
    stock: 78,
  },
  {
    id: 'p3',
    name: 'Leche Entera 1L',
    price_cents: 350, // $3.50
    stock: 32,
    image_url: '/images/products/leche-alqueria-1l.svg',
  },
  {
    id: 'p4',
    name: 'Queso Cheddar',
    price_cents: 650, // $6.50
    stock: 12,
    image_url: '/images/products/quesito-antioqueno-400g.svg',
  },
  {
    id: 'p5',
    name: 'Huevos (Docena)',
    price_cents: 280, // $2.80
    stock: 24,
    image_url: '/images/products/huevos-aa-x30.svg',
  },
  {
    id: 'p6',
    name: 'Yogur Natural',
    price_cents: 180, // $1.80
    stock: 56,
  },
  {
    id: 'p7',
    name: 'Arroz 1kg',
    price_cents: 420, // $4.20
    stock: 89,
    image_url: '/images/products/arroz-diana-1lb.svg',
  },
  {
    id: 'p8',
    name: 'Azúcar 1kg',
    price_cents: 380, // $3.80
    stock: 67,
  },
];

// Copia local de los productos que se actualiza con cada venta
export let mockProducts: Product[] = JSON.parse(JSON.stringify(baseProducts));

export const mockSales: Sale[] = [
  {
    id: 'sale_001',
    date: new Date(2026, 2, 24, 10, 30),
    total: 3150, // $31.50
    payment_method: 'cash',
    items: [
      {
        product_id: 'p1',
        product_name: 'Manzana Roja',
        quantity: 5,
        price_cents: 250,
        subtotal: 1250,
      },
      {
        product_id: 'p3',
        product_name: 'Leche Entera 1L',
        quantity: 2,
        price_cents: 350,
        subtotal: 700,
      },
      {
        product_id: 'p2',
        product_name: 'Pan Integral',
        quantity: 4,
        price_cents: 150,
        subtotal: 600,
      },
    ],
  },
  {
    id: 'sale_002',
    date: new Date(2026, 2, 24, 14, 15),
    total: 6500, // $65.00
    payment_method: 'card',
    items: [
      {
        product_id: 'p4',
        product_name: 'Queso Cheddar',
        quantity: 10,
        price_cents: 650,
        subtotal: 6500,
      },
    ],
  },
  {
    id: 'sale_003',
    date: new Date(2026, 2, 23, 16, 45),
    total: 2280, // $22.80
    payment_method: 'cash',
    items: [
      {
        product_id: 'p5',
        product_name: 'Huevos (Docena)',
        quantity: 8,
        price_cents: 280,
        subtotal: 2240,
      },
      {
        product_id: 'p6',
        product_name: 'Yogur Natural',
        quantity: 1,
        price_cents: 180,
        subtotal: 180,
      },
    ],
  },
];

// Variable para almacenar ventas agregadas localmente (simulando base de datos)
let localSales: Sale[] = [...mockSales];

export function addLocalSale(sale: Sale): void {
  localSales.push(sale);
}

export function getLocalSales(): Sale[] {
  return localSales;
}

export function resetLocalSales(): void {
  localSales = [...mockSales];
  mockProducts = JSON.parse(JSON.stringify(baseProducts));
  mockOrders.length = 0;
}

export const mockSuppliers: Supplier[] = [
  {
    id: 'sup-1',
    name: 'Distribuidora Central',
    contactName: 'Carlos Pérez',
    phone: '555-0101',
    email: 'ventas@central.com',
    category: 'Abarrotes',
    active: true,
    totalOrders: 0,
    totalSpentCents: 0,
    createdAt: new Date(),
  },
  {
    id: 'sup-2',
    name: 'Lácteos del Valle',
    contactName: 'María Gómez',
    phone: '555-0202',
    email: 'compras@lacteos.com',
    category: 'Lácteos',
    active: true,
    totalOrders: 0,
    totalSpentCents: 0,
    createdAt: new Date(),
  },
];

export const mockOrders: PurchaseOrder[] = [];

// ---- Fiados (clientes con deuda) ----
export const mockCreditCustomers: CreditCustomer[] = [
  { id: 'cc1', name: 'Doña Rosa', phone: '3001234567', balance_cents: 1550, active: true, createdAt: new Date(2026, 7, 1) },
  { id: 'cc2', name: 'Don Carlos', phone: '3109876543', notes: 'Paga los viernes', balance_cents: 0, active: true, createdAt: new Date(2026, 7, 10) },
];

let localCreditEntries: CreditEntry[] = [
  { id: 'ce1', customer_id: 'cc1', type: 'debt', amount_cents: 2550, description: 'Mercado semanal', created_by_uid: 'mock-user', createdAt: new Date(2026, 8, 1, 9, 0) },
  { id: 'ce2', customer_id: 'cc1', type: 'payment', amount_cents: 1000, description: 'Abono', created_by_uid: 'mock-user', createdAt: new Date(2026, 8, 3, 17, 30) },
];

export function getLocalCreditEntries(): CreditEntry[] {
  return [...localCreditEntries];
}

export function addLocalCreditEntry(entry: CreditEntry): void {
  localCreditEntries = [entry, ...localCreditEntries];
}

// ---- Combos y Kits de Mercado ----
export const mockCombos = [
  {
    id: 'combo-1',
    negocio_id: 'surtifacil',
    name: 'Combo Desayuno Paisa',
    description: 'Chocolate Corona, quesito antioqueño y arepas tela x5',
    price_cents: 950000,
    items: [
      { product_id: 'p3', product_name: 'Leche Entera 1L', quantity: 2, unit_price_cents: 350000 },
      { product_id: 'p4', product_name: 'Queso Cheddar', quantity: 1, unit_price_cents: 650000 },
      { product_id: 'p2', product_name: 'Pan Integral', quantity: 1, unit_price_cents: 150000 },
    ],
    active: true,
    visible_kiosco: true,
    visible_tienda: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'combo-2',
    negocio_id: 'surtifacil',
    name: 'Kit Aseo Mes',
    description: 'Detergente en polvo, jabón rey x3 y límpido desinfectante',
    price_cents: 1850000,
    items: [
      { product_id: 'p7', product_name: 'Arroz 1kg', quantity: 3, unit_price_cents: 420000 },
      { product_id: 'p8', product_name: 'Azúcar 1kg', quantity: 2, unit_price_cents: 380000 },
    ],
    active: true,
    visible_kiosco: true,
    visible_tienda: true,
    created_at: new Date().toISOString(),
  },
];

// ---- Configuración de Tienda Mock ----
export const mockStoreSettings = {
  id: 'surtifacil',
  slug: 'surtifacil',
  nombre: 'SurtiFácil Abastos Central - Medellín',
  barrio: 'La Candelaria / Centro',
  ciudad: 'Medellín',
  direccion: 'Calle 50 # 50-20, Centro, Medellín',
  telefono_whatsapp: '+573001234567',
  horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
  costo_domicilio_cents: 350000, // $ 3.500 COP
  permite_domicilio: true,
  permite_retiro: true,
  slogan: 'El motor digital del tendero paisa',
  datos_pago_offline: 'Nequi / Bancolombia A la Mano: 300 123 4567',
  plan_id: 'enterprise',
  estado: 'activo',
  suscripcion_vence_en: '2027-12-31T23:59:59Z',
  cuota_ia_total: 999999,
  cuota_ia_usada: 142,
};
