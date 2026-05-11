import {
  collection,
  getDocs,
  query,
  QueryConstraint,
  DocumentSnapshot,
  CollectionReference,
  Query,
} from "firebase/firestore";
import { db } from "./config";

/**
 * Obtiene documentos de una colección con filtros opcionales
 */
export async function getDocuments<T>(
  collectionName: string,
  constraints?: QueryConstraint[],
): Promise<(T & { id: string })[]> {
  try {
    const collectionRef = collection(
      db,
      collectionName,
    ) as CollectionReference<T>;
    let q: Query<T>;

    if (constraints && constraints.length > 0) {
      q = query(collectionRef, ...constraints) as Query<T>;
    } else {
      q = collectionRef as Query<T>;
    }

    const snapshot = await getDocs(q);
    const documents: (T & { id: string })[] = [];

    snapshot.forEach((doc: DocumentSnapshot<T>) => {
      documents.push({
        ...(doc.data() as T),
        id: doc.id,
      });
    });

    return documents;
  } catch (error) {
    console.error(`Error getting documents from ${collectionName}:`, error);
    throw error;
  }
}

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
