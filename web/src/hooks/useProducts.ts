import { useEffect, useState } from 'react';
import { Product } from '../firebase/db';
import { subscribeToProducts } from '../services/productService';

interface ProductsState {
  products: Product[];
  loading: boolean;
  error: string;
}

/** Lista de productos mantenida en tiempo real (o mock) sin sondeo periódico. */
export function useProducts(): ProductsState {
  const [state, setState] = useState<ProductsState>({ products: [], loading: true, error: '' });

  useEffect(() => {
    const unsubscribe = subscribeToProducts(
      (products) => setState({ products, loading: false, error: '' }),
      (error) => setState((previous) => ({ products: previous.products, loading: false, error: error.message })),
    );
    return unsubscribe;
  }, []);

  return state;
}
