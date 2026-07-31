/**
 * Datos Mock para desarrollo/demostración
 * Se usan cuando Firebase no está configurado
 */

import { Product, Sale, SaleItem, Supplier, PurchaseOrder } from '../firebase/db';

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
  },
  {
    id: 'p4',
    name: 'Queso Cheddar',
    price_cents: 650, // $6.50
    stock: 12,
  },
  {
    id: 'p5',
    name: 'Huevos (Docena)',
    price_cents: 280, // $2.80
    stock: 24,
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
