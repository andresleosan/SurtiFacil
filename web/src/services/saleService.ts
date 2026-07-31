import {
  collection,
  getDocs,
  serverTimestamp,
  doc,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Product, SaleItem, Sale } from '../firebase/db';
import { mockProducts, addLocalSale, getLocalSales } from './mockData';

// Variable global para rastrear si Firebase está disponible
let firebaseAvailable = false;

// Inicializar Firebase availability check
try {
  if (db && typeof db === 'object') {
    firebaseAvailable = true;
  }
} catch {
  firebaseAvailable = false;
}

/**
 * Obtiene la lista de productos desde Firestore
 * Si Firebase no está disponible, usa datos mock
 */
export async function getProducts(): Promise<Product[]> {
  // Si Firebase no está configurado, usa datos mock
  if (!firebaseAvailable || !import.meta.env.VITE_FIREBASE_PROJECT_ID) {
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
  } catch (error) {
    console.error('Error getting products from Firebase:', error);
    console.log('ℹ️ Fallback a datos mock');
    // Fallback a datos mock si hay error
    return mockProducts;
  }
}

/**
 * Crea una nueva venta en Firestore (o datos mock si no está configurado)
 */
export async function createSale(
  cartItems: SaleItem[],
  paymentMethod: 'cash' | 'card' | 'other'
): Promise<string> {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('El carrito está vacío');
  }

  // Si Firebase no está configurado, usar datos mock locales
  if (!firebaseAvailable || !import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    console.log('ℹ️ Creando venta en datos mock (Firebase no configurado)');
    return createMockSale(cartItems, paymentMethod);
  }

  try {
    const saleId = await runTransaction(db, async (transaction) => {
      const currentProducts = new Map<string, Product>();

      // Solo cargar los productos que están en el carrito
      for (const item of cartItems) {
        const productRef = doc(db, 'products', item.product_id);
        const productSnapshot = await transaction.get(productRef);
        if (!productSnapshot.exists()) {
          throw new Error(`Producto ${item.product_id} no encontrado`);
        }
        const productData = {
          id: productSnapshot.id,
          ...productSnapshot.data(),
        } as Product;
        currentProducts.set(item.product_id, productData);
      }

      // Validar stock de cada producto
      for (const item of cartItems) {
        const product = currentProducts.get(item.product_id)!;
        if (item.quantity > product.stock) {
          throw new Error(
            `Stock insuficiente de "${product.name}". Intenta vender ${item.quantity} pero solo hay ${product.stock}`
          );
        }
      }

      // Crear documento de venta
      const salesRef = collection(db, 'sales');
      const newSaleRef = doc(salesRef);
      const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

      const saleData: Omit<Sale, 'id'> = {
        date: serverTimestamp(),
        total,
        payment_method: paymentMethod,
        items: cartItems,
        createdAt: serverTimestamp(),
      };

      transaction.set(newSaleRef, saleData);

      // Actualizar stock de cada producto
      for (const item of cartItems) {
        const productRef = doc(db, 'products', item.product_id);
        const productData = currentProducts.get(item.product_id)!;
        const newStock = productData.stock - item.quantity;
        transaction.update(productRef, { stock: newStock });
      }

      return newSaleRef.id;
    });

    return saleId;
  } catch (error: any) {
    console.error('Error creating sale:', error);
    throw new Error(error.message || 'Error al crear la venta');
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

  // Si pasó validación, proceder a actualizar
  const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const saleId = `sale_${Date.now()}`;

  const newSale: Sale = {
    id: saleId,
    date: new Date(),
    total,
    payment_method: paymentMethod,
    items: cartItems,
    createdAt: new Date(),
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
 * Obtiene el historial de ventas desde Firestore (o datos mock si no está configurado)
 */
export async function getSales(): Promise<Sale[]> {
  // Si Firebase no está configurado, usar datos mock locales
  if (!firebaseAvailable || !import.meta.env.VITE_FIREBASE_PROJECT_ID) {
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
  } catch (error) {
    console.error('Error getting sales from Firebase:', error);
    console.log('ℹ️ Fallback a datos mock');
    // Fallback a datos mock
    const sales = getLocalSales();
    return sales.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return timeB - timeA;
    });
  }
}
