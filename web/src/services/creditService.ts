import { CreditCustomer, CreditEntry, CreditEntryType, UserRole } from '../firebase/db';
import { addLocalCreditEntry, getLocalCreditEntries, mockCreditCustomers } from './mockData';
import { apiClient, emitDataChange, onDataChange } from './apiClient';
import {
  cacheCreditCustomersForTenant,
  enqueueOfflineCreditEntry,
  getCachedCreditCustomersForTenant,
  isOfflineModeActive,
} from './offlineSyncService';

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

function mapCustomer(row: any): CreditCustomer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || undefined,
    notes: row.notes || undefined,
    balance_cents: row.balance_cents ?? 0,
    active: row.active === 1 || row.active === true,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    last_entry_at: row.last_entry_at || row.lastEntryAt,
  };
}

function mapEntry(row: any): CreditEntry {
  return {
    id: row.id,
    customer_id: row.customer_id,
    type: row.type,
    amount_cents: row.amount_cents,
    description: row.description,
    sale_id: row.sale_id || undefined,
    created_by_uid: row.created_by_uid || 'system',
    created_by_role: row.created_by_role || undefined,
    createdAt: row.created_at || row.createdAt,
  };
}

// ---------- modo mock ----------
const mockListeners = new Set<CreditCustomersListener>();

function emitMock() {
  const snapshot = sortByName(mockCreditCustomers.map((customer) => ({ ...customer })));
  mockListeners.forEach((listener) => listener(snapshot));
}

/** Notifica a los suscriptores en modo mock o D1. */
export function refreshCreditCustomers(): void {
  if (isMockMode()) {
    emitMock();
  } else {
    emitDataChange('credits');
  }
}

/**
 * Suscripción reactiva a los clientes de fiado, ordenados por nombre.
 */
export function subscribeToCreditCustomers(onData: CreditCustomersListener, onError: CreditErrorListener): () => void {
  if (isMockMode()) {
    mockListeners.add(onData);
    onData(sortByName(mockCreditCustomers.map((customer) => ({ ...customer }))));
    return () => {
      mockListeners.delete(onData);
    };
  }

  let active = true;

  const fetchAndEmit = async () => {
    if (isOfflineModeActive()) {
      const cached = await getCachedCreditCustomersForTenant();
      if (!active) return;
      if (cached.length > 0) {
        onData(sortByName(cached));
        return;
      }
    }
    try {
      const list = await apiClient.get<any[]>('/credits/customers');
      if (!active) return;
      const mapped = (list || []).map(mapCustomer);
      const sorted = sortByName(mapped);
      void cacheCreditCustomersForTenant(sorted);
      onData(sorted);
    } catch {
      if (!active) return;
      if (isOfflineModeActive()) {
        const cached = await getCachedCreditCustomersForTenant();
        if (!active) return;
        if (cached.length > 0) {
          onData(sortByName(cached));
          return;
        }
      }
      console.error('Error subscribing to credit customers.');
      onError(new Error(LOAD_ERROR));
    }
  };

  void fetchAndEmit();

  const unsubscribeBus = onDataChange('credits', () => {
    if (active) void fetchAndEmit();
  });

  return () => {
    active = false;
    unsubscribeBus();
  };
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
    const created = await apiClient.post<any>('/credits/customers', payload);
    emitDataChange('credits');
    return mapCustomer(created);
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
    await apiClient.put(`/credits/customers/${encodeURIComponent(customerId)}`, changes);
    emitDataChange('credits');
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
    const list = await apiClient.get<any[]>(
      `/credits/entries?customer_id=${encodeURIComponent(customerId)}&limit=${pageSize}`
    );
    return (list || []).map(mapEntry);
  } catch {
    console.error('Error loading credit entries.');
    throw new Error('Error al cargar los movimientos');
  }
}

/**
 * Anota una deuda o un abono y actualiza el saldo del cliente en el servidor.
 * Un abono nunca puede dejar el saldo por debajo de cero.
 */
export async function addCreditEntry(
  customerId: string,
  input: CreditEntryInput,
  actor: CreditActor,
): Promise<CreditEntry> {
  const entry = validateEntryInput(input);
  const delta = entry.type === 'debt' ? entry.amount_cents : -entry.amount_cents;

  if (isOfflineModeActive()) {
    const queued = await enqueueOfflineCreditEntry(customerId, entry, actor);
    return {
      id: queued.id,
      customer_id: customerId,
      ...entry,
      created_by_uid: actor.uid,
      created_by_role: actor.role,
      createdAt: new Date(queued.created_at),
    };
  }

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
    const payload = {
      customer_id: customerId,
      type: entry.type,
      amount_cents: entry.amount_cents,
      description: entry.description,
    };
    const res = await apiClient.post<any>('/credits/entries', payload);
    emitDataChange('credits');
    return {
      id: res.id,
      customer_id: customerId,
      ...entry,
      created_by_uid: actor.uid,
      created_by_role: actor.role,
      createdAt: new Date(),
    };
  } catch (error: any) {
    const message = error?.message || '';
    if (message.includes('supera la deuda') || message.includes('no puede superar')) {
      const err = new Error('El abono supera la deuda pendiente');
      err.name = 'CreditOverpayment';
      throw err;
    }
    if (message.includes('no encontrado') || message.includes('404')) {
      const err = new Error('Cliente no encontrado');
      err.name = 'CreditCustomerNotFound';
      throw err;
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
