import { CreditCustomer, CreditEntryType, PaymentMethod, Product, SaleItem, UserRole } from '../firebase/db';
import { apiClient, emitDataChange, getActiveNegocioId } from './apiClient';
import { addLocalCreditEntry, addLocalSale, mockCreditCustomers, mockProducts } from './mockData';

const DB_NAME = 'surtifacil_offline_v1';
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products_cache';
const STORE_CUSTOMERS = 'customers_cache';
const STORE_QUEUE = 'sync_queue';
const SIMULATED_OFFLINE_KEY = 'sf_simulated_offline';

export type OfflineOperationType = 'sale' | 'credit_entry';
export type OfflineOperationStatus = 'pending' | 'syncing' | 'failed';

export interface OfflineSalePayload {
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    price_cents: number;
    subtotal: number;
  }>;
  payment_method: PaymentMethod;
  credit_customer_id?: string;
  credit_customer_name?: string;
  total_cents: number;
}

export interface OfflineCreditEntryPayload {
  customer_id: string;
  customer_name?: string;
  type: CreditEntryType;
  amount_cents: number;
  description: string;
  actor_uid: string;
  actor_role: UserRole;
}

export interface OfflineQueueItem {
  id: string;
  negocio_id: string;
  type: OfflineOperationType;
  status: OfflineOperationStatus;
  created_at: string;
  sequence: number;
  attempts: number;
  last_error?: string;
  sale_payload?: OfflineSalePayload;
  credit_payload?: OfflineCreditEntryPayload;
}

export interface OfflineSyncSnapshot {
  negocioId: string;
  isOffline: boolean;
  isSimulatedOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  queue: OfflineQueueItem[];
  cachedProductsCount: number;
  cachedCustomersCount: number;
  lastSyncedAt: string | null;
}

interface CachedProductRecord {
  cache_key: string;
  negocio_id: string;
  product: Product;
  updated_at: string;
}

interface CachedCustomerRecord {
  cache_key: string;
  negocio_id: string;
  customer: CreditCustomer;
  updated_at: string;
}

// Espejo en memoria aislado por negocio_id (respaldo instantáneo y soporte en entornos sin IndexedDB)
const memoryProductsByTenant = new Map<string, Map<string, Product>>();
const memoryCustomersByTenant = new Map<string, Map<string, CreditCustomer>>();
const memoryQueue = new Map<string, OfflineQueueItem>();
const lastSyncedByTenant = new Map<string, string>();

let sequenceCounter = 1;
let simulatedOffline = readInitialSimulatedOffline();
let syncInProgress = false;
const listeners = new Set<(snapshot: OfflineSyncSnapshot) => void>();

function readInitialSimulatedOffline(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
    }
  } catch {
    // Ignorar si localStorage no está disponible
  }
  return false;
}

export function resolveOfflineNegocioId(explicitNegocioId?: string | null): string {
  const cleaned = explicitNegocioId?.trim();
  if (cleaned) return cleaned;
  const active = getActiveNegocioId()?.trim();
  return active || 'surtifacil';
}

export function isSimulatedOfflineMode(): boolean {
  return simulatedOffline;
}

export function isOfflineModeActive(): boolean {
  if (simulatedOffline) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  return false;
}

export function setSimulatedOfflineMode(enabled: boolean): void {
  const wasOffline = isOfflineModeActive();
  simulatedOffline = Boolean(enabled);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (simulatedOffline) {
        window.localStorage.setItem(SIMULATED_OFFLINE_KEY, 'true');
      } else {
        window.localStorage.removeItem(SIMULATED_OFFLINE_KEY);
      }
    }
  } catch {
    // Ignorar errores de almacenamiento restringido
  }

  void notifyOfflineListeners();

  // Si salimos de modo offline y hay red, sincronizar automáticamente la cola FIFO
  if (wasOffline && !isOfflineModeActive()) {
    void syncPendingQueue();
  }
}

// ==========================================
// Capa IndexedDB con aislamiento por negocio_id
// ==========================================
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openOfflineDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const prodStore = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'cache_key' });
          prodStore.createIndex('by_negocio', 'negocio_id', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
          const custStore = db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'cache_key' });
          custStore.createIndex('by_negocio', 'negocio_id', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
          queueStore.createIndex('by_negocio', 'negocio_id', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

async function idbGetAllByNegocio<T>(storeName: string, negocioId: string): Promise<T[] | null> {
  const db = await openOfflineDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index('by_negocio');
      const req = index.getAll(IDBKeyRange.only(negocioId));
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPutRecord<T>(storeName: string, record: T): Promise<void> {
  const db = await openOfflineDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDeleteRecord(storeName: string, key: string): Promise<void> {
  const db = await openOfflineDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbReplaceTenantRecords<T>(
  storeName: string,
  negocioId: string,
  records: T[],
): Promise<void> {
  const db = await openOfflineDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const index = store.index('by_negocio');
      const keysReq = index.getAllKeys(IDBKeyRange.only(negocioId));

      keysReq.onsuccess = () => {
        const oldKeys = keysReq.result || [];
        for (const k of oldKeys) {
          store.delete(k);
        }
        for (const rec of records) {
          store.put(rec);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ==========================================
// Caché de Catálogo de Productos por Negocio
// ==========================================
function getTenantProductMap(negocioId: string): Map<string, Product> {
  let map = memoryProductsByTenant.get(negocioId);
  if (!map) {
    map = new Map<string, Product>();
    memoryProductsByTenant.set(negocioId, map);
  }
  return map;
}

function getTenantCustomerMap(negocioId: string): Map<string, CreditCustomer> {
  let map = memoryCustomersByTenant.get(negocioId);
  if (!map) {
    map = new Map<string, CreditCustomer>();
    memoryCustomersByTenant.set(negocioId, map);
  }
  return map;
}

export async function cacheProductsForTenant(
  products: Product[],
  explicitNegocioId?: string,
): Promise<void> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const map = getTenantProductMap(negocioId);
  map.clear();

  const now = new Date().toISOString();
  const records: CachedProductRecord[] = [];

  for (const prod of products) {
    const cloned: Product = { ...prod };
    map.set(prod.id, cloned);
    records.push({
      cache_key: `${negocioId}::${prod.id}`,
      negocio_id: negocioId,
      product: cloned,
      updated_at: now,
    });
  }

  await idbReplaceTenantRecords(STORE_PRODUCTS, negocioId, records);
  await notifyOfflineListeners();
}

export async function getCachedProductsForTenant(
  explicitNegocioId?: string,
): Promise<Product[]> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const idbRows = await idbGetAllByNegocio<CachedProductRecord>(STORE_PRODUCTS, negocioId);

  if (idbRows && idbRows.length > 0) {
    const map = getTenantProductMap(negocioId);
    map.clear();
    for (const row of idbRows) {
      map.set(row.product.id, { ...row.product });
    }
  }

  const map = getTenantProductMap(negocioId);
  return Array.from(map.values())
    .map((p) => ({ ...p }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}

// ==========================================
// Caché de Clientes de Fiado por Negocio
// ==========================================
export async function cacheCreditCustomersForTenant(
  customers: CreditCustomer[],
  explicitNegocioId?: string,
): Promise<void> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const map = getTenantCustomerMap(negocioId);
  map.clear();

  const now = new Date().toISOString();
  const records: CachedCustomerRecord[] = [];

  for (const cust of customers) {
    const cloned: CreditCustomer = { ...cust };
    map.set(cust.id, cloned);
    records.push({
      cache_key: `${negocioId}::${cust.id}`,
      negocio_id: negocioId,
      customer: cloned,
      updated_at: now,
    });
  }

  await idbReplaceTenantRecords(STORE_CUSTOMERS, negocioId, records);
  await notifyOfflineListeners();
}

export async function getCachedCreditCustomersForTenant(
  explicitNegocioId?: string,
): Promise<CreditCustomer[]> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const idbRows = await idbGetAllByNegocio<CachedCustomerRecord>(STORE_CUSTOMERS, negocioId);

  if (idbRows && idbRows.length > 0) {
    const map = getTenantCustomerMap(negocioId);
    map.clear();
    for (const row of idbRows) {
      map.set(row.customer.id, { ...row.customer });
    }
  }

  const map = getTenantCustomerMap(negocioId);
  return Array.from(map.values())
    .map((c) => ({ ...c }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}

// ==========================================
// Cola FIFO de Ventas y Abonos Offline
// ==========================================
export async function getOfflineQueueForTenant(
  explicitNegocioId?: string,
): Promise<OfflineQueueItem[]> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const idbItems = await idbGetAllByNegocio<OfflineQueueItem>(STORE_QUEUE, negocioId);

  if (idbItems && idbItems.length > 0) {
    for (const item of idbItems) {
      if (!memoryQueue.has(item.id)) {
        memoryQueue.set(item.id, { ...item });
      }
    }
  }

  return Array.from(memoryQueue.values())
    .filter((item) => item.negocio_id === negocioId)
    .sort((a, b) => a.sequence - b.sequence)
    .map((item) => ({ ...item }));
}

export async function enqueueOfflineSale(
  cartItems: SaleItem[],
  paymentMethod: PaymentMethod,
  creditCustomerId?: string,
  explicitNegocioId?: string,
): Promise<OfflineQueueItem> {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('El carrito está vacío');
  }
  if (paymentMethod === 'credit' && !creditCustomerId) {
    throw new Error('Selecciona el cliente al que se le fía');
  }

  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const prodMap = getTenantProductMap(negocioId);
  const custMap = getTenantCustomerMap(negocioId);

  // Validar stock contra caché local si el producto está en caché
  for (const item of cartItems) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error('Cantidad inválida en el carrito');
    }
    const cachedProd = prodMap.get(item.product_id);
    if (cachedProd && item.quantity > cachedProd.stock) {
      throw new Error(
        `Stock insuficiente de "${cachedProd.name}". Disponible en caché: ${cachedProd.stock}`,
      );
    }
  }

  let creditCustomerName: string | undefined;
  if (paymentMethod === 'credit' && creditCustomerId) {
    const cachedCust = custMap.get(creditCustomerId);
    creditCustomerName = cachedCust?.name;
  }

  const normalizedItems = cartItems.map((item) => {
    const cachedProd = prodMap.get(item.product_id);
    const unitPrice = cachedProd ? cachedProd.price_cents : item.price_cents;
    const prodName = cachedProd ? cachedProd.name : item.product_name;
    return {
      product_id: item.product_id,
      product_name: prodName,
      quantity: item.quantity,
      price_cents: unitPrice,
      subtotal: unitPrice * item.quantity,
    };
  });

  const totalCents = normalizedItems.reduce((sum, it) => sum + it.subtotal, 0);
  const nowIso = new Date().toISOString();

  // Descontar stock localmente en el caché del tenant
  for (const item of normalizedItems) {
    const cachedProd = prodMap.get(item.product_id);
    if (cachedProd) {
      const updatedProd: Product = {
        ...cachedProd,
        stock: Math.max(0, cachedProd.stock - item.quantity),
      };
      prodMap.set(item.product_id, updatedProd);
      await idbPutRecord<CachedProductRecord>(STORE_PRODUCTS, {
        cache_key: `${negocioId}::${updatedProd.id}`,
        negocio_id: negocioId,
        product: updatedProd,
        updated_at: nowIso,
      });
    }
  }

  // Si es venta fiada, incrementar el saldo del cliente en el caché local
  if (paymentMethod === 'credit' && creditCustomerId) {
    const cachedCust = custMap.get(creditCustomerId);
    if (cachedCust) {
      const updatedCust: CreditCustomer = {
        ...cachedCust,
        balance_cents: cachedCust.balance_cents + totalCents,
        last_entry_at: nowIso,
      };
      custMap.set(creditCustomerId, updatedCust);
      await idbPutRecord<CachedCustomerRecord>(STORE_CUSTOMERS, {
        cache_key: `${negocioId}::${updatedCust.id}`,
        negocio_id: negocioId,
        customer: updatedCust,
        updated_at: nowIso,
      });
    }
  }

  const seq = sequenceCounter++;
  const queueItem: OfflineQueueItem = {
    id: `offline_sale_${Date.now()}_${seq}`,
    negocio_id: negocioId,
    type: 'sale',
    status: 'pending',
    created_at: nowIso,
    sequence: seq,
    attempts: 0,
    sale_payload: {
      items: normalizedItems,
      payment_method: paymentMethod,
      ...(creditCustomerId ? { credit_customer_id: creditCustomerId } : {}),
      ...(creditCustomerName ? { credit_customer_name: creditCustomerName } : {}),
      total_cents: totalCents,
    },
  };

  memoryQueue.set(queueItem.id, queueItem);
  await idbPutRecord(STORE_QUEUE, queueItem);

  emitDataChange('products');
  emitDataChange('sales');
  if (paymentMethod === 'credit') {
    emitDataChange('credits');
  }
  await notifyOfflineListeners();

  return { ...queueItem };
}

export async function enqueueOfflineCreditEntry(
  customerId: string,
  input: { type: CreditEntryType; amount_cents: number; description: string },
  actor: { uid: string; role: UserRole },
  explicitNegocioId?: string,
): Promise<OfflineQueueItem> {
  if (input.type !== 'debt' && input.type !== 'payment') {
    throw new Error('Tipo de movimiento inválido');
  }
  if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) {
    throw new Error('El monto debe ser mayor a 0');
  }

  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const custMap = getTenantCustomerMap(negocioId);
  const cachedCust = custMap.get(customerId);

  if (cachedCust && input.type === 'payment' && input.amount_cents > cachedCust.balance_cents) {
    const err = new Error('El abono supera la deuda pendiente');
    err.name = 'CreditOverpayment';
    throw err;
  }

  const nowIso = new Date().toISOString();
  if (cachedCust) {
    const delta = input.type === 'debt' ? input.amount_cents : -input.amount_cents;
    const updatedCust: CreditCustomer = {
      ...cachedCust,
      balance_cents: Math.max(0, cachedCust.balance_cents + delta),
      last_entry_at: nowIso,
    };
    custMap.set(customerId, updatedCust);
    await idbPutRecord<CachedCustomerRecord>(STORE_CUSTOMERS, {
      cache_key: `${negocioId}::${updatedCust.id}`,
      negocio_id: negocioId,
      customer: updatedCust,
      updated_at: nowIso,
    });
  }

  const seq = sequenceCounter++;
  const queueItem: OfflineQueueItem = {
    id: `offline_entry_${Date.now()}_${seq}`,
    negocio_id: negocioId,
    type: 'credit_entry',
    status: 'pending',
    created_at: nowIso,
    sequence: seq,
    attempts: 0,
    credit_payload: {
      customer_id: customerId,
      customer_name: cachedCust?.name,
      type: input.type,
      amount_cents: input.amount_cents,
      description: input.description.trim(),
      actor_uid: actor.uid,
      actor_role: actor.role,
    },
  };

  memoryQueue.set(queueItem.id, queueItem);
  await idbPutRecord(STORE_QUEUE, queueItem);

  emitDataChange('credits');
  await notifyOfflineListeners();

  return { ...queueItem };
}

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

async function replaySingleQueueItem(item: OfflineQueueItem): Promise<void> {
  if (item.type === 'sale' && item.sale_payload) {
    const payload = item.sale_payload;
    if (isMockMode()) {
      for (const it of payload.items) {
        const prod = mockProducts.find((p) => p.id === it.product_id);
        if (prod) {
          prod.stock = Math.max(0, prod.stock - it.quantity);
        }
      }
      addLocalSale({
        id: `synced_${item.id}`,
        date: new Date(item.created_at),
        total: payload.total_cents,
        total_cost_cents: Math.floor(payload.total_cents / 2),
        payment_method: payload.payment_method,
        credit_customer_id: payload.credit_customer_id,
        credit_customer_name: payload.credit_customer_name,
        items: payload.items,
        createdAt: new Date(item.created_at),
        schema_version: 2,
      });
      return;
    }

    await apiClient.post(
      '/sales',
      {
        items: payload.items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
        })),
        payment_method: payload.payment_method,
        ...(payload.credit_customer_id ? { credit_customer_id: payload.credit_customer_id } : {}),
      },
      {
        headers: { 'X-Negocio-Id': item.negocio_id },
      },
    );
    return;
  }

  if (item.type === 'credit_entry' && item.credit_payload) {
    const payload = item.credit_payload;
    if (isMockMode()) {
      const cust = mockCreditCustomers.find((c) => c.id === payload.customer_id);
      if (cust) {
        const delta = payload.type === 'debt' ? payload.amount_cents : -payload.amount_cents;
        cust.balance_cents = Math.max(0, cust.balance_cents + delta);
      }
      addLocalCreditEntry({
        id: `synced_${item.id}`,
        customer_id: payload.customer_id,
        type: payload.type,
        amount_cents: payload.amount_cents,
        description: payload.description,
        created_by_uid: payload.actor_uid,
        created_by_role: payload.actor_role,
        createdAt: new Date(item.created_at),
      });
      return;
    }

    await apiClient.post(
      '/credits/entries',
      {
        customer_id: payload.customer_id,
        type: payload.type,
        amount_cents: payload.amount_cents,
        description: payload.description,
      },
      {
        headers: { 'X-Negocio-Id': item.negocio_id },
      },
    );
  }
}

export async function syncPendingQueue(
  explicitNegocioId?: string,
): Promise<{ synced: number; failed: number }> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  if (syncInProgress || isOfflineModeActive()) {
    return { synced: 0, failed: 0 };
  }

  const queue = await getOfflineQueueForTenant(negocioId);
  if (queue.length === 0) {
    return { synced: 0, failed: 0 };
  }

  syncInProgress = true;
  await notifyOfflineListeners();

  let synced = 0;
  let failed = 0;

  try {
    // Procesamiento estricto FIFO (ordenado por sequence ascendente)
    for (const item of queue) {
      if (isOfflineModeActive()) break;

      const syncingItem: OfflineQueueItem = {
        ...item,
        status: 'syncing',
        attempts: item.attempts + 1,
      };
      memoryQueue.set(item.id, syncingItem);
      await idbPutRecord(STORE_QUEUE, syncingItem);
      await notifyOfflineListeners();

      try {
        await replaySingleQueueItem(syncingItem);
        memoryQueue.delete(item.id);
        await idbDeleteRecord(STORE_QUEUE, item.id);
        synced += 1;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error al sincronizar con el servidor';
        const failedItem: OfflineQueueItem = {
          ...syncingItem,
          status: 'failed',
          last_error: errorMsg,
        };
        memoryQueue.set(item.id, failedItem);
        await idbPutRecord(STORE_QUEUE, failedItem);
        failed += 1;
      }
    }

    if (synced > 0) {
      lastSyncedByTenant.set(negocioId, new Date().toISOString());
      emitDataChange('products');
      emitDataChange('sales');
      emitDataChange('credits');
    }
  } finally {
    syncInProgress = false;
    await notifyOfflineListeners();
  }

  return { synced, failed };
}

export async function removeOfflineQueueItem(
  queueItemId: string,
  explicitNegocioId?: string,
): Promise<void> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const existing = memoryQueue.get(queueItemId);
  if (existing && existing.negocio_id !== negocioId) {
    throw new Error('Operación no pertenece al negocio activo');
  }
  memoryQueue.delete(queueItemId);
  await idbDeleteRecord(STORE_QUEUE, queueItemId);
  await notifyOfflineListeners();
}

export async function getOfflineSyncSnapshot(
  explicitNegocioId?: string,
): Promise<OfflineSyncSnapshot> {
  const negocioId = resolveOfflineNegocioId(explicitNegocioId);
  const queue = await getOfflineQueueForTenant(negocioId);
  const prodMap = getTenantProductMap(negocioId);
  const custMap = getTenantCustomerMap(negocioId);

  const pendingCount = queue.filter((i) => i.status === 'pending' || i.status === 'syncing').length;
  const failedCount = queue.filter((i) => i.status === 'failed').length;

  return {
    negocioId,
    isOffline: isOfflineModeActive(),
    isSimulatedOffline: simulatedOffline,
    isSyncing: syncInProgress,
    pendingCount,
    failedCount,
    queue,
    cachedProductsCount: prodMap.size,
    cachedCustomersCount: custMap.size,
    lastSyncedAt: lastSyncedByTenant.get(negocioId) || null,
  };
}

async function notifyOfflineListeners(): Promise<void> {
  const snapshot = await getOfflineSyncSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribeToOfflineSync(
  listener: (snapshot: OfflineSyncSnapshot) => void,
): () => void {
  listeners.add(listener);
  void getOfflineSyncSnapshot().then((snapshot) => {
    if (listeners.has(listener)) {
      listener(snapshot);
    }
  });
  return () => {
    listeners.delete(listener);
  };
}

export async function clearOfflineStateForTests(): Promise<void> {
  memoryProductsByTenant.clear();
  memoryCustomersByTenant.clear();
  memoryQueue.clear();
  lastSyncedByTenant.clear();
  simulatedOffline = false;
  syncInProgress = false;
  sequenceCounter = 1;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SIMULATED_OFFLINE_KEY);
    }
  } catch {
    // Ignorar
  }

  const db = await openOfflineDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([STORE_PRODUCTS, STORE_CUSTOMERS, STORE_QUEUE], 'readwrite');
        tx.objectStore(STORE_PRODUCTS).clear();
        tx.objectStore(STORE_CUSTOMERS).clear();
        tx.objectStore(STORE_QUEUE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  await notifyOfflineListeners();
}

// Registrar listeners globales de red del navegador
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    void notifyOfflineListeners();
  });

  window.addEventListener('online', () => {
    void notifyOfflineListeners();
    if (!simulatedOffline) {
      void syncPendingQueue();
    }
  });
}
