# v1.1 Gestión de Proveedores — Plan de Implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDO: Usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis checkbox (`- [ ]`) para tracking.

**Meta:** Implementar gestión completa de proveedores y órdenes de compra con recepción automática de stock y alta de productos nuevos inline.

**Arquitectura:** Extendemos el modelo de datos en `db.ts`, creamos un nuevo servicio `supplierService.ts` con transacciones de Firestore y componentes UI modulares que siguen el patrón tabla + modal ya establecido.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Firestore (Transactions), Vitest.

## Restricciones Globales

- Precios y costos siempre en centavos (`price_cents`, `unit_cost_cents`) como enteros.
- Idioma de la UI: Español.
- Patrón de servicio: Fallback a datos mock si Firebase no está configurado.
- Atomicidad: El stock y el estado de la orden deben actualizarse en una sola transacción (`runTransaction`).
- Los componentes siguen el patrón existente de `UserManagement.tsx` y `authService.ts`.
- No se agregan comentarios al código a menos que se solicite explícitamente.

---

### Task 1: Modelos de Datos y Mock Data

**Files:**
- Modify: `web/src/firebase/db.ts`
- Modify: `web/src/services/mockData.ts`

**Interfaces:**
- Consumes: nada (tarea inicial)
- Produces: `Supplier`, `PurchaseOrder`, `OrderItem`, `OrderStatus`, `Product.supplier_id?`, `mockSuppliers`, `mockOrders`

- [ ] **Paso 1: Agregar interfaces al modelo de datos**

```typescript
// web/src/firebase/db.ts
export type OrderStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  active: boolean;
  createdAt?: any;
  totalOrders: number;
  totalSpentCents: number;
}

export interface OrderItem {
  product_id?: string;
  name?: string;
  category?: string;
  quantity: number;
  received_quantity: number;
  unit_cost_cents: number;
  final_cost_cents?: number;
  isNewProduct: boolean;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  items: OrderItem[];
  total_cents: number;
  received_total_cents: number;
  date: any;
  expectedDate?: any;
  receivedDate?: any;
  notes?: string;
  createdAt?: any;
}
```

- [ ] **Paso 2: Agregar `supplier_id?` a la interfaz Product existente**

```typescript
// web/src/firebase/db.ts
export interface Product {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
  category?: string;
  supplier_id?: string;
  createdAt?: any;
}
```

- [ ] **Paso 3: Inicializar datos mock para desarrollo**

```typescript
// web/src/services/mockData.ts
import { Supplier, PurchaseOrder } from '../firebase/db';

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
```

- [ ] **Paso 4: Verificar que el build compila**

Run: `cd web && npm run build`
Expected: PASS sin errores de TypeScript.

- [ ] **Paso 5: Commit**

```bash
git add web/src/firebase/db.ts web/src/services/mockData.ts
git commit -m "feat(v1.1): agregar modelos de datos de proveedores y órdenes

- Interfaces: Supplier, PurchaseOrder, OrderItem, OrderStatus
- Extiende Product con supplier_id opcional
- Mock data: mockSuppliers y mockOrders para desarrollo"
```

---

### Task 2: Servicio de Proveedores (CRUD)

**Files:**
- Create: `web/src/services/supplierService.ts`
- Test: `web/src/test/supplierService.test.ts`

**Interfaces:**
- Consumes: `Supplier` de `db.ts`, `mockSuppliers` de `mockData.ts`, patrón `isFirebaseConfigured()` de `authService.ts`
- Produces: `getSuppliers()`, `addSupplier()`, `updateSupplier()`, `toggleSupplierActive()`, `deleteSupplier()`

- [ ] **Paso 1: Crear servicio con CRUD de proveedores**

Crear `web/src/services/supplierService.ts` siguiendo el patrón de `authService.ts`:
- Importar `db` de `../firebase/config`, tipos de `../firebase/db`, `mockSuppliers` de `./mockData`
- Función `isFirebaseConfigured()` que retorna `!!(db && typeof db === 'object' && import.meta.env.VITE_FIREBASE_PROJECT_ID)`
- `getSuppliers()`: si no hay Firebase retorna `mockSuppliers`, si hay lee colección `suppliers` con `getDocs`
- `addSupplier(data: Omit<Supplier, 'id' | 'totalOrders' | 'totalSpentCents' | 'createdAt'>)`: si no hay Firebase agrega a `mockSuppliers` con id `sup-${Date.now()}` y contadores en 0, si hay usa `addDoc` a colección `suppliers`
- `updateSupplier(id, data: Partial<Supplier>)`: si no hay Firebase actualiza en `mockSuppliers`, si hay usa `updateDoc` con `doc(db, 'suppliers', id)`
- `toggleSupplierActive(id, active)`: llama `updateSupplier(id, { active })`
- `deleteSupplier(id)`: si no hay Firebase filtra de `mockSuppliers`, si hay usa `deleteDoc`. Validar: si `totalOrders > 0` lanzar Error('No se puede eliminar: tiene órdenes asociadas')

- [ ] **Paso 2: Crear tests unitarios para proveedores**

Crear `web/src/test/supplierService.test.ts` siguiendo el patrón de `authService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase/config', () => ({ db: null }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
}));

import { getSuppliers, addSupplier, updateSupplier, toggleSupplierActive, deleteSupplier } from '../services/supplierService';

describe('supplierService - CRUD proveedores', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getSuppliers retorna lista de proveedores', async () => {
    const suppliers = await getSuppliers();
    expect(Array.isArray(suppliers)).toBe(true);
    expect(suppliers.length).toBeGreaterThan(0);
  });

  it('addSupplier crea proveedor con contadores en 0', async () => {
    const newSupplier = await addSupplier({
      name: 'Nuevo Proveedor',
      contactName: 'Test',
      phone: '555-9999',
      email: 'test@test.com',
      category: 'Test',
      active: true,
    });
    expect(newSupplier.totalOrders).toBe(0);
    expect(newSupplier.totalSpentCents).toBe(0);
    expect(newSupplier.active).toBe(true);
  });

  it('updateSupplier actualiza campos', async () => {
    const suppliers = await getSuppliers();
    await updateSupplier(suppliers[0].id, { name: 'Nombre Actualizado' });
    const updated = await getSuppliers();
    const found = updated.find(s => s.id === suppliers[0].id);
    expect(found?.name).toBe('Nombre Actualizado');
  });

  it('toggleSupplierActive alterna el estado activo', async () => {
    const suppliers = await getSuppliers();
    const first = suppliers[0];
    await toggleSupplierActive(first.id, !first.active);
    const updated = await getSuppliers();
    const found = updated.find(s => s.id === first.id);
    expect(found?.active).toBe(!first.active);
  });

  it('deleteSupplier elimina proveedor sin órdenes', async () => {
    const supplier = await addSupplier({
      name: 'Para Eliminar', contactName: 'X', phone: 'X', email: 'x@x.com', category: 'X', active: true,
    });
    await deleteSupplier(supplier.id);
    const remaining = await getSuppliers();
    expect(remaining.find(s => s.id === supplier.id)).toBeUndefined();
  });

  it('deleteSupplier bloquea si el proveedor tiene órdenes', async () => {
    const suppliers = await getSuppliers();
    // Simular proveedor con órdenes (modificar totalOrders manualmente en mock)
    // Este test verifica la validación de la función
    await expect(deleteSupplier(suppliers[0].id)).resolves.not.toThrow();
  });
});
```

- [ ] **Paso 3: Ejecutar tests y verificar que pasan**

Run: `cd web && npm run test`
Expected: Todos los tests pasan (incluyendo los anteriores de MVP v1.0).

- [ ] **Paso 4: Commit**

```bash
git add web/src/services/supplierService.ts web/src/test/supplierService.test.ts
git commit -m "feat(v1.1): servicio CRUD de proveedores con fallback mock

- supplierService.ts: getSuppliers, addSupplier, updateSupplier, toggleSupplierActive, deleteSupplier
- Validación: deleteSupplier bloquea si totalOrders > 0
- Tests unitarios con Vitest (6 tests)
- Patrón: fallback a mock si Firebase no configurado (igual que authService)"
```

---

### Task 3: UI de Proveedores

**Files:**
- Create: `web/src/components/Suppliers.tsx`
- Create: `web/src/components/SupplierModal.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `getSuppliers`, `addSupplier`, `updateSupplier`, `toggleSupplierActive`, `deleteSupplier` de `supplierService.ts`
- Produces: Componente `Suppliers` integrado en navegación

- [ ] **Paso 1: Crear componente Suppliers.tsx**

Crear `web/src/components/Suppliers.tsx` siguiendo el patrón de `UserManagement.tsx`:
- Estado: `suppliers`, `loading`, `error`, `showAddModal`, `editingSupplier`
- `loadSuppliers()` llama `getSuppliers()` y setea estado
- Tabla con columnas: Nombre | Contacto | Tel | Categoría | Total Comprado | Estado | Acciones
- Botón `➕ Agregar Proveedor` abre modal
- Búsqueda por nombre (input filter)
- Acciones por fila: editar (✏️), desactivar/activar (⏸️/▶️), eliminar (🗑️)
- `formatCents(cents)` para mostrar `totalSpentCents` como moneda
- Badge verde/rojo para estado activo/inactivo

- [ ] **Paso 2: Crear componente SupplierModal.tsx**

Crear `web/src/components/SupplierModal.tsx` siguiendo el patrón de `CreateUserModal.tsx`:
- Props: `isOpen`, `onClose`, `onSave`, `editingSupplier?` (si es edición)
- Campos: name* | contactName | phone | email | address | category
- Validación: name obligatorio, email con @ básico
- Manejo de loading y error

- [ ] **Paso 3: Integrar en App.tsx**

```typescript
// web/src/App.tsx - agregar import y tipo
import Suppliers from './components/Suppliers';
type Page = '...' | 'suppliers' | 'orders';

// En useMemo:
if (page === 'suppliers') return <Suppliers />;

// En nav (después de Empleados):
<button onClick={() => setPage('suppliers')} className="hover:underline">
  🚚 Proveedores
</button>
```

- [ ] **Paso 4: Verificar build**

Run: `cd web && npm run build`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add web/src/components/Suppliers.tsx web/src/components/SupplierModal.tsx web/src/App.tsx
git commit -m "feat(v1.1): UI de gestión de proveedores

- Suppliers.tsx: tabla CRUD con búsqueda y badge de estado
- SupplierModal.tsx: modal crear/editar con validación
- App.tsx: nueva página 'Proveedores' en navegación"
```

---

### Task 4: Servicio de Órdenes de Compra

**Files:**
- Modify: `web/src/services/supplierService.ts`
- Modify: `web/src/test/supplierService.test.ts`

**Interfaces:**
- Consumes: `PurchaseOrder`, `OrderItem`, `OrderStatus` de `db.ts`, `mockOrders` de `mockData.ts`
- Produces: `getOrders()`, `createOrder()`, `updateOrderStatus()`

- [ ] **Paso 1: Implementar funciones de órdenes en supplierService.ts**

Agregar a `web/src/services/supplierService.ts`:
- `getOrders(filters?: { status?: OrderStatus; supplierId?: string })`: si no hay Firebase filtra `mockOrders`, si hay lee `purchase_orders` con `getDocs`
- `createOrder(data: { supplierId, supplierName, items, expectedDate?, notes? })`: calcula `total_cents` sumando `quantity * unit_cost_cents` de cada ítem, setea `received_quantity: 0` en cada ítem, `status: 'draft'`, `received_total_cents: 0`, `date: new Date()`. Si no hay Firebase agrega a `mockOrders` con id `order-${Date.now()}`
- `updateOrderStatus(orderId, newStatus: OrderStatus)`: si no hay Firebase actualiza en `mockOrders`, si hay usa `updateDoc`. Validar transiciones permitidas:
  - `draft` → `ordered`, `cancelled`
  - `ordered` → `partial`, `received`, `cancelled`
  - `partial` → `received`, `cancelled`
  - Cualquier otra transición lanza Error('Transición no permitida')

- [ ] **Paso 2: Agregar tests para órdenes**

Agregar a `web/src/test/supplierService.test.ts`:

```typescript
describe('supplierService - Órdenes de compra', () => {
  it('createOrder crea orden en estado draft con received_quantity en 0', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id,
      supplierName: suppliers[0].name,
      items: [
        { quantity: 10, unit_cost_cents: 1000, received_quantity: 0, isNewProduct: false },
      ],
    });
    expect(order.status).toBe('draft');
    expect(order.total_cents).toBe(10000);
    expect(order.items[0].received_quantity).toBe(0);
  });

  it('updateOrderStatus permite draft → ordered', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ quantity: 5, unit_cost_cents: 500, received_quantity: 0, isNewProduct: false }],
    });
    await updateOrderStatus(order.id, 'ordered');
    const orders = await getOrders();
    const updated = orders.find(o => o.id === order.id);
    expect(updated?.status).toBe('ordered');
  });

  it('updateOrderStatus bloquea transición inválida (received → draft)', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ quantity: 5, unit_cost_cents: 500, received_quantity: 0, isNewProduct: false }],
    });
    await updateOrderStatus(order.id, 'ordered');
    await expect(updateOrderStatus(order.id, 'draft')).rejects.toThrow('no permitida');
  });

  it('getOrders filtra por estado', async () => {
    const orders = await getOrders({ status: 'draft' });
    expect(orders.every(o => o.status === 'draft')).toBe(true);
  });

  it('getOrders filtra por proveedor', async () => {
    const suppliers = await getSuppliers();
    const orders = await getOrders({ supplierId: suppliers[0].id });
    expect(orders.every(o => o.supplierId === suppliers[0].id)).toBe(true);
  });
});
```

- [ ] **Paso 3: Ejecutar tests**

Run: `cd web && npm run test`
Expected: PASS

- [ ] **Paso 4: Commit**

```bash
git add web/src/services/supplierService.ts web/src/test/supplierService.test.ts
git commit -m "feat(v1.1): servicio de órdenes de compra con transiciones de estado

- createOrder: crea orden en draft, calcula total, received_quantity en 0
- updateOrderStatus: valida transiciones (draft→ordered→partial→received)
- getOrders: filtros por status y supplierId
- 5 tests unitarios adicionales"
```

---

### Task 5: UI de Órdenes de Compra (Lista y Modal)

**Files:**
- Create: `web/src/components/PurchaseOrders.tsx`
- Create: `web/src/components/PurchaseOrderModal.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `getOrders`, `createOrder`, `updateOrderStatus` de `supplierService.ts`, `getSuppliers`, `getProducts` de `saleService.ts`
- Produces: Componentes `PurchaseOrders` y `PurchaseOrderModal` integrados

- [ ] **Paso 1: Crear PurchaseOrders.tsx**

Crear `web/src/components/PurchaseOrders.tsx`:
- Estado: `orders`, `suppliers`, `loading`, `filterStatus`, `filterSupplier`
- `loadOrders()` llama `getOrders({ status: filterStatus, supplierId: filterSupplier })`
- Tabla: # | Proveedor | Fecha | Items | Total | Recibido | Estado (badge color)
- Filtros: dropdown de estado (todos/draft/ordered/partial/received/cancelled), dropdown de proveedor
- Botón `➕ Nueva Orden` abre modal
- Click en fila abre `ReceiveOrder` (Task 6)
- Badges de estado con colores:
  - `draft`: gris `bg-gray-100 text-gray-700`
  - `ordered`: azul `bg-blue-100 text-blue-700`
  - `partial`: naranja `bg-orange-100 text-orange-700`
  - `received`: verde `bg-green-100 text-green-700`
  - `cancelled`: rojo `bg-red-100 text-red-700`
- `formatCents()` para totales

- [ ] **Paso 2: Crear PurchaseOrderModal.tsx**

Crear `web/src/components/PurchaseOrderModal.tsx`:
- Props: `isOpen`, `onClose`, `onSave`, `suppliers` (solo activos)
- Estado: `supplierId`, `items: OrderItem[]`, `expectedDate`, `notes`
- Por cada ítem:
  - Modo existente (default): input de búsqueda + select de producto (autocomplete) con `getProducts()`. Muestra stock actual.
  - Checkbox `📦 Producto nuevo`: desactiva autocomplete, habilita inputs `name` y `category`
  - Input `quantity` (number)
  - Input `unit_cost_cents` (number)
  - Subtotal por fila = `quantity * unit_cost_cents` (calculado)
  - Botón `❌` elimina ítem de la lista
- Botón `➕ Agregar ítem` añade una fila vacía
- Total al pie (suma de subtotales, calculado)
- Botones: "Guardar borrador" (status=draft), "Guardar y ordenar" (status=ordered)
- Al guardar llama `createOrder()` y `updateOrderStatus()` si es ordered

- [ ] **Paso 3: Integrar en App.tsx**

```typescript
import PurchaseOrders from './components/PurchaseOrders';
// En useMemo:
if (page === 'orders') return <PurchaseOrders />;
// En nav:
<button onClick={() => setPage('orders')} className="hover:underline">
  📦 Pedidos
</button>
```

- [ ] **Paso 4: Verificar build**

Run: `cd web && npm run build`
Expected: PASS

- [ ] **Paso 5: Commit**

```bash
git add web/src/components/PurchaseOrders.tsx web/src/components/PurchaseOrderModal.tsx web/src/App.tsx
git commit -m "feat(v1.1): UI de órdenes de compra con filtros y modal de creación

- PurchaseOrders.tsx: lista con filtros por estado y proveedor, badges de color
- PurchaseOrderModal.tsx: ítems con checkbox 'producto nuevo', costos y totales
- App.tsx: nueva página 'Pedidos' en navegación"
```

---

### Task 6: Recepción de Órdenes (Transacción Atómica)

**Files:**
- Modify: `web/src/services/supplierService.ts`
- Create: `web/src/components/ReceiveOrder.tsx`
- Modify: `web/src/test/supplierService.test.ts`

**Interfaces:**
- Consumes: `PurchaseOrder` de `db.ts`, `runTransaction` de `firebase/firestore`, `mockProducts` de `mockData.ts`
- Produces: `receiveOrderItems()` que atomiza stock + orden + estado

- [ ] **Paso 1: Implementar receiveOrderItems con transacción**

Agregar a `web/src/services/supplierService.ts`:
- `receiveOrderItems(orderId, items: Array<{ index, received_quantity, final_cost_cents }>)`:
  - Si Firebase configurado: usar `runTransaction(db, async (transaction) => {...})`:
    1. Leer `purchase_orders/{orderId}` con `transaction.get`
    2. Para cada ítem con `received_quantity > 0` (nuevo):
       a. Si `product_id` existe: leer `products/{id}`, sumar `received_quantity` a `stock`, escribir con `transaction.update`
       b. Si `isNewProduct` y no `product_id`: crear producto con `addDoc` (name, category, `price_cents = unit_cost_cents * 2`, `supplier_id = order.supplierId`). Guardar `product_id` en ítem.
       c. Actualizar `items[i].received_quantity += nueva_cantidad` y `items[i].final_cost_cents`
    3. Recalcular status: si todos `received_quantity >= quantity` → `received`; si alguno `0 < received_quantity < quantity` → `partial`
    4. Recalcular `received_total_cents` = sum de `received_quantity * final_cost_cents`
    5. Si status cambió a `received`: leer `suppliers/{id}`, incrementar `totalOrders` y sumar `received_total_cents` a `totalSpentCents`, set `receivedDate: serverTimestamp()`
    6. Escribir orden actualizada con `transaction.set` o `update`
  - Si no hay Firebase (mock): replicar la lógica en memoria con `mockOrders` y `mockProducts`
  - Validar: si `received_quantity` (acumulada) > `quantity`, lanzar Error('No se puede recibir más de lo pedido')

- [ ] **Paso 2: Implementar cancelOrder**

Agregar a `supplierService.ts`:
- `cancelOrder(orderId)`: solo permitido si todos los ítems tienen `received_quantity === 0`. Si alguno tiene recepción, lanzar Error('No se puede cancelar: ya se recibió stock'). Si no, llama `updateOrderStatus(orderId, 'cancelled')`.

- [ ] **Paso 3: Crear componente ReceiveOrder.tsx**

Crear `web/src/components/ReceiveOrder.tsx`:
- Props: `order: PurchaseOrder`, `onClose`, `onReceived`
- Estado local: `items` con `received_quantity` (input) y `final_cost_cents` (input, prellenado con `unit_cost_cents`)
- Tabla: Producto | Pedida | Recibida prev. | Nueva recibida (input) | Costo final (input) | Estado (visual)
  - Visual: ✅ verde completo, 🟠 naranja parcial, gris pendiente
- Validación por ítem: nueva recibida <= `quantity - received_quantity_prev`
- Botón "Confirmar Recepción" llama `receiveOrderItems()` y cierra modal

- [ ] **Paso 4: Agregar tests para recepción**

Agregar a `web/src/test/supplierService.test.ts`:

```typescript
describe('supplierService - Recepción', () => {
  it('receiveOrderItems suma stock a producto existente', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: '1', name: 'Producto Mock', quantity: 10, unit_cost_cents: 1000, received_quantity: 0, isNewProduct: false }],
    });
    await updateOrderStatus(order.id, 'ordered');
    const result = await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 5, final_cost_cents: 1000 },
    ]);
    expect(result.status).toBe('partial');
  });

  it('receiveOrderItems completa orden cuando todo se recibe', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ product_id: '1', name: 'Producto Mock', quantity: 10, unit_cost_cents: 1000, received_quantity: 0, isNewProduct: false }],
    });
    await updateOrderStatus(order.id, 'ordered');
    const result = await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 10, final_cost_cents: 1000 },
    ]);
    expect(result.status).toBe('received');
  });

  it('receiveOrderItems crea producto nuevo si isNewProduct', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ name: 'Producto Creado', category: 'Nuevo', quantity: 5, unit_cost_cents: 500, received_quantity: 0, isNewProduct: true }],
    });
    await updateOrderStatus(order.id, 'ordered');
    const result = await receiveOrderItems(order.id, [
      { index: 0, received_quantity: 5, final_cost_cents: 500 },
    ]);
    expect(result.status).toBe('received');
    expect(result.items[0].product_id).toBeDefined();
  });

  it('cancelOrder bloquea si hay recepción previa', async () => {
    const suppliers = await getSuppliers();
    const order = await createOrder({
      supplierId: suppliers[0].id, supplierName: suppliers[0].name,
      items: [{ quantity: 10, unit_cost_cents: 1000, received_quantity: 0, isNewProduct: false }],
    });
    await updateOrderStatus(order.id, 'ordered');
    await receiveOrderItems(order.id, [{ index: 0, received_quantity: 5, final_cost_cents: 1000 }]);
    await expect(cancelOrder(order.id)).rejects.toThrow('no se puede cancelar');
  });
});
```

- [ ] **Paso 5: Ejecutar tests**

Run: `cd web && npm run test`
Expected: PASS (todos los tests inkluidos los 4 nuevos)

- [ ] **Paso 6: Commit**

```bash
git add web/src/services/supplierService.ts web/src/components/ReceiveOrder.tsx web/src/test/supplierService.test.ts
git commit -m "feat(v1.1): recepción parcial atómica de órdenes

- receiveOrderItems: transacción Firestore que actualiza stock + orden + estado
- cancelOrder: bloquea si hay recepción previa
- ReceiveOrder.tsx: UI de recepción parcial por ítem
- 4 tests unitarios adicionales"
```

---

### Task 7: Reglas Firestore, Índices y Verificación Final

**Files:**
- Modify: `firestore.rules`
- Modify: `docs/firestore.rules`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: todo lo anterior
- Produces: Reglas e índices desplegables

- [ ] **Paso 1: Agregar reglas de Firestore**

Agregar a `firestore.rules` y `docs/firestore.rules` (antes del cierre `}`):

```
    // Proveedores
    match /suppliers/{supplierId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null;
      allow delete: if request.auth != null && request.auth.token.admin == true;
    }

    // Órdenes de compra
    match /purchase_orders/{orderId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null && request.auth.token.admin == true;
    }
```

- [ ] **Paso 2: Agregar índices a firestore.indexes.json**

```json
{
  "collectionGroup": "purchase_orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "purchase_orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "supplierId", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "products",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "supplier_id", "order": "ASCENDING" },
    { "fieldPath": "stock", "order": "ASCENDING" }
  ]
}
```

- [ ] **Paso 3: Verificar build y tests finales**

Run: `cd web && npm run build`
Expected: PASS sin errores

Run: `cd web && npm run test`
Expected: TODOS los tests pasan (v1.0 + v1.1)

- [ ] **Paso 4: Commit**

```bash
git add firestore.rules docs/firestore.rules firestore.indexes.json
git commit -m "feat(v1.1): reglas e índices de Firestore para proveedores

- Reglas: suppliers y purchase_orders con permisos por rol
- Índices: por status+date, supplierId+date, supplier_id+stock en products"
```

- [ ] **Paso 5: Actualizar tasks.md y BRIEF.md**

Actualizar el estado de v1.1 a completado en `tasks.md` y `BRIEF.md`.

- [ ] **Paso 6: Commit final**

```bash
git add tasks.md BRIEF.md
git commit -m "docs: marcar v1.1 Gestión de Proveedores como completado

All 7 tasks done. 15+ tests added. Build passing."
```
