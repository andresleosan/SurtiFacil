import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { CreditCustomer, CreditEntry, CreditEntryType, UserRole } from '../firebase/db';
import { addLocalCreditEntry, getLocalCreditEntries, mockCreditCustomers } from './mockData';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

export const MAX_CREDIT_AMOUNT_CENTS = 100_000_000; // $1.000.000,00

export interface CreditCustomerInput {
  name: string;
  phone?: string;
  notes?: string;
}

export interface CreditEntryInput {
  type: CreditEntryType;
  amount_cents: number;
  description: string;
}

export interface CreditActor {
  uid: string;
  role: UserRole;
}

export type CreditCustomersListener = (customers: CreditCustomer[]) => void;
export type CreditErrorListener = (error: Error) => void;

const LOAD_ERROR = 'Error al cargar los fiados';

function sortByName(customers: CreditCustomer[]): CreditCustomer[] {
  return [...customers].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function normalizeCustomerInput(input: CreditCustomerInput): CreditCustomerInput {
  const name = input.name.trim();
  if (!name) throw new Error('El nombre del cliente es requerido');
  if (name.length > 100) throw new Error('El nombre es demasiado largo');
  const phone = input.phone?.trim() || '';
  const notes = input.notes?.trim() || '';
  if (phone.length > 30) throw new Error('El teléfono es demasiado largo');
  if (notes.length > 300) throw new Error('Las notas son demasiado largas');
  return { name, phone, notes };
}

function validateEntryInput(input: CreditEntryInput): CreditEntryInput {
  if (input.type !== 'debt' && input.type !== 'payment') throw new Error('Tipo de movimiento inválido');
  if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) {
    throw new Error('El monto debe ser mayor a 0');
  }
  if (input.amount_cents > MAX_CREDIT_AMOUNT_CENTS) throw new Error('El monto es demasiado alto');
  const description = input.description.trim();
  if (description.length > 200) throw new Error('La descripción es demasiado larga');
  return { type: input.type, amount_cents: input.amount_cents, description };
}

// ---------- modo mock ----------
const mockListeners = new Set<CreditCustomersListener>();

function emitMock() {
  const snapshot = sortByName(mockCreditCustomers.map((customer) => ({ ...customer })));
  mockListeners.forEach((listener) => listener(snapshot));
}

/** Notifica a los suscriptores en modo mock (por ejemplo tras una venta fiada local). */
export function refreshCreditCustomers(): void {
  if (isMockMode()) emitMock();
}

/**
 * Suscripción en tiempo real a los clientes de fiado, ordenados por nombre.
 */
export function subscribeToCreditCustomers(onData: CreditCustomersListener, onError: CreditErrorListener): () => void {
  if (isMockMode()) {
    mockListeners.add(onData);
    onData(sortByName(mockCreditCustomers.map((customer) => ({ ...customer }))));
    return () => {
      mockListeners.delete(onData);
    };
  }

  try {
    return onSnapshot(
      collection(db, 'credit_customers'),
      (snapshot) => {
        const customers: CreditCustomer[] = [];
        snapshot.forEach((document) => {
          const data = document.data() as Omit<CreditCustomer, 'id'>;
          customers.push({ id: document.id, ...data, balance_cents: data.balance_cents ?? 0, active: data.active !== false });
        });
        onData(sortByName(customers));
      },
      () => {
        console.error('Error subscribing to credit customers.');
        onError(new Error(LOAD_ERROR));
      },
    );
  } catch {
    console.error('Error subscribing to credit customers.');
    onError(new Error(LOAD_ERROR));
    return () => {};
  }
}

export async function addCreditCustomer(input: CreditCustomerInput): Promise<CreditCustomer> {
  const normalized = normalizeCustomerInput(input);
  const payload = { ...normalized, balance_cents: 0, active: true };

  if (isMockMode()) {
    const customer: CreditCustomer = { id: `cc-${Date.now()}`, ...payload, createdAt: new Date() };
    mockCreditCustomers.push(customer);
    emitMock();
    return customer;
  }

  try {
    const reference = await addDoc(collection(db, 'credit_customers'), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: reference.id, ...payload };
  } catch {
    console.error('Error adding credit customer.');
    throw new Error('Error al crear el cliente');
  }
}

export async function updateCreditCustomer(
  customerId: string,
  input: CreditCustomerInput & { active: boolean },
): Promise<void> {
  const normalized = normalizeCustomerInput(input);
  const changes = { ...normalized, active: input.active };

  if (isMockMode()) {
    const index = mockCreditCustomers.findIndex((candidate) => candidate.id === customerId);
    if (index >= 0) mockCreditCustomers[index] = { ...mockCreditCustomers[index], ...changes };
    emitMock();
    return;
  }

  try {
    await updateDoc(doc(db, 'credit_customers', customerId), { ...changes, updatedAt: serverTimestamp() });
  } catch {
    console.error('Error updating credit customer.');
    throw new Error('Error al actualizar el cliente');
  }
}

/** Movimientos más recientes primero. */
export async function getCreditEntries(customerId: string, pageSize = 50): Promise<CreditEntry[]> {
  if (isMockMode()) {
    return getLocalCreditEntries()
      .filter((entry) => entry.customer_id === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, pageSize);
  }

  try {
    const entriesQuery = query(
      collection(db, 'credit_entries'),
      where('customer_id', '==', customerId),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
    );
    const snapshot = await getDocs(entriesQuery);
    return snapshot.docs.map((document) => ({ id: document.id, ...(document.data() as Omit<CreditEntry, 'id'>) }));
  } catch {
    console.error('Error loading credit entries.');
    throw new Error('Error al cargar los movimientos');
  }
}

/**
 * Anota una deuda o un abono y actualiza el saldo del cliente en una sola
 * transacción. Un abono nunca puede dejar el saldo por debajo de cero.
 */
export async function addCreditEntry(
  customerId: string,
  input: CreditEntryInput,
  actor: CreditActor,
): Promise<CreditEntry> {
  const entry = validateEntryInput(input);
  const delta = entry.type === 'debt' ? entry.amount_cents : -entry.amount_cents;

  if (isMockMode()) {
    const customer = mockCreditCustomers.find((candidate) => candidate.id === customerId);
    if (!customer) throw new Error('Cliente no encontrado');
    const nextBalance = customer.balance_cents + delta;
    if (nextBalance < 0) throw new Error('El abono supera la deuda pendiente');
    customer.balance_cents = nextBalance;
    customer.last_entry_at = new Date();
    const created: CreditEntry = {
      id: `ce-${Date.now()}`,
      customer_id: customerId,
      ...entry,
      created_by_uid: actor.uid,
      created_by_role: actor.role,
      createdAt: new Date(),
    };
    addLocalCreditEntry(created);
    emitMock();
    return created;
  }

  try {
    const customerRef = doc(db, 'credit_customers', customerId);
    const entryRef = doc(collection(db, 'credit_entries'));
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(customerRef);
      if (!snapshot.exists()) {
        const error = new Error('Cliente no encontrado');
        error.name = 'CreditCustomerNotFound';
        throw error;
      }
      const currentBalance = (snapshot.data() as CreditCustomer).balance_cents ?? 0;
      const nextBalance = currentBalance + delta;
      if (nextBalance < 0) {
        const error = new Error('El abono supera la deuda pendiente');
        error.name = 'CreditOverpayment';
        throw error;
      }
      transaction.set(entryRef, {
        customer_id: customerId,
        type: entry.type,
        amount_cents: entry.amount_cents,
        description: entry.description,
        created_by_uid: actor.uid,
        created_by_role: actor.role,
        createdAt: serverTimestamp(),
      });
      transaction.update(customerRef, {
        balance_cents: nextBalance,
        updatedAt: serverTimestamp(),
        last_entry_at: serverTimestamp(),
      });
    });
    return {
      id: entryRef.id,
      customer_id: customerId,
      ...entry,
      created_by_uid: actor.uid,
      created_by_role: actor.role,
      createdAt: new Date(),
    };
  } catch (error) {
    if (error instanceof Error && (error.name === 'CreditCustomerNotFound' || error.name === 'CreditOverpayment')) {
      throw error;
    }
    console.error('Error adding credit entry.');
    throw new Error('Error al registrar el movimiento');
  }
}

/** Convierte un texto en pesos ("12.500", "12500,50" o "99.99") a centavos enteros; `null` si no es válido. */
export function parseAmountToCents(value: string): number | null {
  const cleaned = value.trim().replace(/\s+/g, '').replace(/^\$/, '');
  if (!cleaned) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    // Formato local: puntos de miles y coma decimal opcional.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(cleaned)) {
    normalized = cleaned.replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number.parseFloat(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
