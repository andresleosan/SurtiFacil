import {
  collection,
  getDocs,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase/config';
import { Product, SaleItem, Sale } from '../firebase/db';
import { mockProducts, addLocalSale, getLocalSales } from './mockData';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const auth = getAuth();

/**
 * Obtiene la lista de productos desde Firestore
 * Solo usa datos mock cuando el modo está habilitado explícitamente.
 */
export async function getProducts(): Promise<Product[]> {
  if (isMockMode()) {
    console.log('ℹ️ Usando datos mock - Firebase no configurado');
    return mockProducts;
  }

  try {
    const productsRef = collection(db, 'products');
    const snapshot = await getDocs(productsRef);
    const products: Product[] = [];

    snapshot.forEach((doc) => {
      products.push({
        id: doc.id,
        ...(doc.data() as Omit<Product, 'id'>),
      });
    });

    return products;
  } catch {
    console.error('Error getting products from Firebase');
    throw new Error('Error al cargar productos');
  }
}

/**
 * Crea una nueva venta mediante el backend (o datos mock en modo explícito).
 */
export async function createSale(
  cartItems: SaleItem[],
  paymentMethod: 'cash' | 'card' | 'other'
): Promise<string> {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('El carrito está vacío');
  }

  if (isMockMode()) {
    console.log('ℹ️ Creando venta en datos mock (Firebase no configurado)');
    return createMockSale(cartItems, paymentMethod);
  }

  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión para crear la venta');

  try {
    const idToken = await user.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/sales/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: cartItems.map(({ product_id, quantity }) => ({ product_id, quantity })),
        payment_method: paymentMethod,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof result.error === 'string' ? result.error : 'Error al crear la venta');
    }
    if (typeof result.saleId !== 'string' || result.saleId.length === 0) {
      throw new Error('Error al crear la venta');
    }
    return result.saleId;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    const safeMessages = new Set([
      'Debes iniciar sesión para crear la venta',
      'Solicitud inválida',
      'No autorizado',
      'Recurso no encontrado',
      'Demasiadas solicitudes',
    ]);
    if (safeMessages.has(message)) throw error;
    console.error('Error creating sale through backend');
    throw new Error('Error al crear la venta');
  }
}

/**
 * Crea una venta usando datos mock locales
 */
function createMockSale(
  cartItems: SaleItem[],
  paymentMethod: 'cash' | 'card' | 'other'
): string {
  // Validar stock disponible
  for (const item of cartItems) {
    const product = mockProducts.find((p) => p.id === item.product_id);
    if (!product) {
      throw new Error(`Producto ${item.product_id} no encontrado`);
    }
    if (item.quantity > product.stock) {
      throw new Error(
        `Stock insuficiente de "${product.name}". Intenta vender ${item.quantity} pero solo hay ${product.stock}`
      );
    }
  }

  const snapshotItems: SaleItem[] = cartItems.map((item) => {
    const product = mockProducts.find((candidate) => candidate.id === item.product_id)!;
    const hasCost = Number.isSafeInteger(product.last_cost_cents) && product.last_cost_cents! >= 0;
    const unitCost = hasCost ? product.last_cost_cents! : Math.floor(product.price_cents / 2);
    const costSource = hasCost ? (product.last_cost_source || 'purchase') : 'fallback_price';
    return {
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      price_cents: product.price_cents,
      subtotal: product.price_cents * item.quantity,
      unit_cost_cents: unitCost,
      cost_subtotal_cents: unitCost * item.quantity,
      cost_source: costSource,
      cost_is_estimated: costSource === 'fallback_price',
      category: product.category?.trim() || 'Sin categoría',
    };
  });
  const total = snapshotItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalCost = snapshotItems.reduce((sum, item) => sum + (item.cost_subtotal_cents || 0), 0);
  const saleId = `sale_${Date.now()}`;

  const newSale: Sale = {
    id: saleId,
    date: new Date(),
    total,
    total_cost_cents: totalCost,
    payment_method: paymentMethod,
    items: snapshotItems,
    createdAt: new Date(),
    schema_version: 2,
    created_by_uid: 'mock-user',
    created_by_role: 'cashier',
  };

  // Actualizar stock en datos mock
  mockProducts.forEach((product) => {
    const soldItem = cartItems.find((item) => item.product_id === product.id);
    if (soldItem) {
      product.stock -= soldItem.quantity;
    }
  });

  // Guardar venta en datos mock
  addLocalSale(newSale);

  return saleId;
}

/**
 * Obtiene el historial de ventas desde Firestore (o datos mock en modo explícito)
 */
export async function getSales(): Promise<Sale[]> {
  if (isMockMode()) {
    console.log('ℹ️ Usando historial de ventas mock (Firebase no configurado)');
    const sales = getLocalSales();
    // Ordenar por fecha descendente
    return sales.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return timeB - timeA;
    });
  }

  try {
    const salesRef = collection(db, 'sales');
    const snapshot = await getDocs(salesRef);
    const sales: Sale[] = [];

    snapshot.forEach((doc) => {
      sales.push({
        id: doc.id,
        ...(doc.data() as Omit<Sale, 'id'>),
      });
    });

    // Ordenar por fecha descendente (más recientes primero)
    sales.sort((a, b) => {
      const timeA = a.date?.toMillis?.() || 0;
      const timeB = b.date?.toMillis?.() || 0;
      return timeB - timeA;
    });

    return sales;
  } catch {
    console.error('Error getting sales from Firebase');
    throw new Error('Error al cargar ventas');
  }
}
