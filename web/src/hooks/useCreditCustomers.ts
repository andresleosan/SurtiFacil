import { useEffect, useState } from 'react';
import { CreditCustomer } from '../firebase/db';
import { subscribeToCreditCustomers } from '../services/creditService';

interface CreditCustomersState {
  customers: CreditCustomer[];
  loading: boolean;
  error: string;
}

/** Clientes de fiado en tiempo real (o mock), ordenados por nombre. */
export function useCreditCustomers(): CreditCustomersState {
  const [state, setState] = useState<CreditCustomersState>({ customers: [], loading: true, error: '' });

  useEffect(() => subscribeToCreditCustomers(
    (customers) => setState({ customers, loading: false, error: '' }),
    (error) => setState((previous) => ({ customers: previous.customers, loading: false, error: error.message })),
  ), []);

  return state;
}
