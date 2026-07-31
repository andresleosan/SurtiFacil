# Spec: v1.1 Gestión de Proveedores

**Fecha**: 2026-07-31
**Estado**: Aprobado (tras brainstorming interactivo)
**Estimación**: 12 días (ver desglose al final)
**Dependencias**: MVP v1.0 (completado en `main`)

---

## Contexto y motivo

El MVP v1.0 entregó Alertas de Stock, Empleados y Reportes, pero el dueño del supermercado todavia gestiona proveedores en cuadernos o memoria. El BRIEF prioriza esta feature en segundo lugar (RICE 3.00) por su impacto en costos: tener historial de compras da **poder de negociación** (10-15% de ahorro estimado).

## Decisiones de diseño (tomadas en brainstorming)

| Decisión | Opción elegida | Alternativas descartadas |
|----------|----------------|--------------------------|
| Alcance | **C** — Catálogo + Órdenes + Recepción automática de stock | A (solo catálogo), B (sin recepción automática) |
| Modelo de ítem de orden | **C** — Productos existentes por defecto + checkbox "producto nuevo" | A (solo existentes), B (siempre inline) |
| Recepción | **B** — Parcial por ítem (`received_quantity`) con `final_cost_cents` editable | A (todo-o-nada), C (con cost_history completo → v1.2) |
| Estados de orden | **B** — `draft`/`ordered`/`partial`/`received`/`cancelled` | A (2 estados), C (6+ estados multi-sucursal) |
| Atomicidad | `runTransaction` de Firestore (igual que `saleService.createSale`) | Batch (no garantiza lecturas consistentes) |

---

## Arquitectura

### Archivos nuevos y editados

| Capa | Archivo | Acción |
|------|---------|--------|
| Tipos | `web/src/firebase/db.ts` | **Editar** — agrega `Supplier`, `PurchaseOrder`, `OrderItem`, `OrderStatus`; extiende `Product` con `supplier_id?` |
| Servicio | `web/src/services/supplierService.ts` | **Nuevo** — CRUD proveedores + CRUD órdenes + recepción (transacción) con fallback mock |
| Mock data | `web/src/services/mockData.ts` | **Editar** — `mockSuppliers`, `mockOrders` |
| Componente | `web/src/components/Suppliers.tsx` | **Nuevo** — tabla CRUD de proveedores |
| Componente | `web/src/components/SupplierModal.tsx` | **Nuevo** — modal crear/editar proveedor |
| Componente | `web/src/components/PurchaseOrders.tsx` | **Nuevo** — lista de órdenes con filtros |
| Componente | `web/src/components/PurchaseOrderModal.tsx` | **Nuevo** — crear/editar orden + ítems |
| Componente | `web/src/components/ReceiveOrder.tsx` | **Nuevo** — recepción parcial por ítem |
| Navegación | `web/src/App.tsx` | **Editar** — páginas `suppliers` y `orders` en nav (admin/manager) |
| Reglas | `firestore.rules` + `docs/firestore.rules` | **Editar** — colecciones `suppliers` y `purchase_orders` |
| Índices | `firestore.indexes.json` | **Editar** — por `supplierId`+`date` y `status`+`date` |
| Tests | `web/src/test/supplierService.test.ts` | **Nuevo** — ~12 tests unitarios |

**Sin cambios ruptura**: las colecciones `products` y `sales` existentes solo reciben `supplier_id?` opcional.

---

## Modelo de datos

### `Supplier` (colección `suppliers`)

```typescript
interface Supplier {
  id: string;
  name: string;
  contactName?: string;      // persona de contacto
  phone?: string;
  email?: string;
  address?: string;
  category?: string;         // rubro: "abarrotes", "lacteos", etc.
  active: boolean;
  createdAt?: any;
  totalOrders: number;       // contador denormalizado (lista)
  totalSpentCents: number;   // histórico comprado (denormalizado)
}
```

### `PurchaseOrder` (colección `purchase_orders`)

```typescript
type OrderStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

interface OrderItem {
  product_id?: string;        // si referencia producto existente
  name?: string;              // si es producto nuevo (alta inline)
  category?: string;
  quantity: number;           // cantidad pedida
  received_quantity: number;  // recibido hasta ahora (inicia 0)
  unit_cost_cents: number;    // costo al crear la orden
  final_cost_cents?: number;  // costo real al recibir (factura)
  isNewProduct: boolean;      // checkbox "producto nuevo"
}

interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;        // denormalizado (snapshot)
  status: OrderStatus;
  items: OrderItem[];
  total_cents: number;        // sum(quantity * unit_cost_cents)
  received_total_cents: number; // sum(received_quantity * final_cost)
  date: any;                  // fecha de creación
  expectedDate?: any;         // fecha de entrega esperada
  receivedDate?: any;         // fecha de última recepción
  notes?: string;
  createdAt?: any;
}
```

### `Product` (extensión, sin ruptura)

```typescript
interface Product {
  // ... campos existentes sin tocar
  supplier_id?: string;       // proveedor preferido (nuevo, opcional)
}
```

### Reglas de denormalización

- `supplierName` en `PurchaseOrder` es snapshot al crear. Si el proveedor se renombra o borra, las órdenes historicas conservan el nombre original (auditoría correcta).
- `totalOrders` y `totalSpentCents` en `Supplier` se actualizan al confirmar recepción completa de una orden (no en cada recepción parcial, para evitar sobrecarga).

---

## Flujo principal

### 1. Alta de proveedor

El dueño crea un proveedor desde la página **Proveedores**. Campos mínimos: `name` (obligatorio), `contactName`, `phone`, `email`, `address`, `category`. `active` inicia `true`, contadores en 0.

### 2. Crear orden de compra (`draft` → `ordered`)

1. Desde **Pedidos**, botón "Nueva Orden" abre `PurchaseOrderModal`.
2. Selecciona proveedor (dropdown de proveedores activos).
3. Agrega ítems:
   - **Modo existente (default)**: select de producto con autocomplete por nombre. Muestra stock actual y costo sugerido (definido como `unit_cost_cents` de la última `purchase_order` recibida de este proveedor que contenga este `product_id`; si no existe historial, deja el input vacío para que el usuario lo ingrese).
   - **Checkbox "Producto nuevo"**: desbloquea inputs `name` y `category`. `product_id` queda vacío.
   - Cantidad + `unit_cost_cents` por ítem.
   - Subtotal por fila = `quantity * unit_cost_cents`.
4. Total al pie = suma de subtotales.
5. `expectedDate` (opcional), `notes` (opcional).
6. Botones: "Guardar borrador" (`status=draft`), "Guardar y ordenar" (`status=ordered`).

### 3. Recepción parcial

1. Desde el detalle de la orden (`ordered` o `partial`), botón "Recibir" abre `ReceiveOrder`.
2. Por cada ítem:
   - `quantity` (bloqueado, solo lectura)
   - Input `received_quantity` (máximo = `quantity - received_quantity_previo`)
   - Input `final_cost_cents` (prellenado con `unit_cost_cents`, editable)
   - Indicador visual: completo (verde check), parcial (naranja), pendiente (gris)
3. Botón "Confirmar Recepción" dispara la transacción.

### 4. Transacción de recepción (atómica)

```
runTransaction(db, async (transaction) => {
  // 1. Leer orden actual
  // 2. Para cada ítem con received_quantity > 0:
  //    a. Si product_id existe:
  //       - leer products/{id}, sumar received_quantity a stock, escribir
  //    b. Si es producto nuevo (isNewProduct, sin product_id):
  //       - crear products/ con name, category,
  //         price_cents = unit_cost_cents * 2 (marcador, editable),
  //         supplier_id = orden.supplierId
  //       - guardar product_id recien creado en items[i].product_id
  //    c. Actualizar items[i].received_quantity y items[i].final_cost_cents
  // 3. Recalcular status:
  //    - todos received_quantity >= quantity → received
  //    - alguno con 0 < received_quantity < quantity → partial
  // 4. Si status cambió a received:
  //    - suppliers/{id}.totalOrders++,
  //      totalSpentCents += received_total_cents
  //    - orders.receivedDate = serverTimestamp()
  // 5. Escribir purchase_orders/{id} con items y status actualizados
});
```

### 5. Cancelación

Solo permitida desde `draft` u `ordered` con `received_quantity === 0` en todos los ítems. Si hay recepción parcial, se bloquea con mensaje "No se puede cancelar: ya se recibió stock (X unidades). Elimina los ítems pendientes si es necesario.".

---

## UI y navegación

### Navegación (`App.tsx`)

Dos botones nuevos en header (después de "Empleados"):

- `🚚 Proveedores` → `page='suppliers'`
- `📦 Pedidos` → `page='orders'`

Visibles para `admin` y `manager` (usar `isAdmin() || hasRole('manager')`). `cashier` no los ve.

### `Suppliers.tsx` (patrón `UserManagement`)

Tabla: Nombre | Contacto | Tel | Categoría | Total Comprado | Estado
- Header con badge de proveedores inactivos
- Botón `➕ Agregar Proveedor`
- Búsqueda por nombre
- Fila: editar / desactivar / eliminar (soft delete → active=false)
- Hard delete bloqueado si `totalOrders > 0` (mensaje: "no se puede eliminar, tiene órdenes asociadas")

### `SupplierModal.tsx` (patrón `CreateUserModal`)

Form: name* | contactName | phone | email | address | category. Validación de email y teléfono (básica).

### `PurchaseOrders.tsx`

- Filtros: estado (todos/draft/ordered/partial/received/cancelled) + proveedor (dropdown)
- Tabla: # | Proveedor | Fecha | Items | Total | Recibido | Estado (badge)
- Click en fila → detalle/recepción
- Botón `➕ Nueva Orden`

### `PurchaseOrderModal.tsx`

- Select proveedor (solo activos)
- Lista editable de ítems:
  - Modo existente: autocomplete de producto (muestra stock actual + costo sugerido)
  - Checkbox `📦 Producto nuevo` → desactiva autocomplete, habilita inputs name/category
  - quantity + unit_cost_cents
  - Subtotal calculado por fila
  - Botón "❌" para eliminar ítem de esta orden
- Total al pie (calculado)
- `expectedDate` (date picker), `notes` (textarea)
- Botones: "Guardar borrador" / "Guardar y ordenar"

### `ReceiveOrder.tsx`

- Tabla de ítems de la orden (orden en estado `ordered` o `partial`):
  - Columnas: Producto | Pedida | Recibida prev. | Input nueva received_quantity | Input final_cost_cents | Estado (visual)
- Validación: `received_quantity` (nueva) `<= quantity - prev_received`
- Botón "Confirmar Recepción"
- Si quedan pendientes, la orden queda `partial` y se puede volver a recibir después

### Badges de estado

| Estado | Clases Tailwind | Icono |
|--------|-----------------|-------|
| `draft` | `bg-gray-100 text-gray-700` | ✏️ |
| `ordered` | `bg-blue-100 text-blue-700` | 📤 |
| `partial` | `bg-orange-100 text-orange-700` | 🟠 |
| `received` | `bg-green-100 text-green-700` | ✅ |
| `cancelled` | `bg-red-100 text-red-700` | ❌ |

---

## Reglas de Firestore

Añadir a `firestore.rules` y `docs/firestore.rules`:

```
match /suppliers/{supplierId} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null;
  allow delete: if request.auth != null && request.auth.token.admin == true;
}

match /purchase_orders/{orderId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;  // recepción
  allow delete: if request.auth != null && request.auth.token.admin == true;
}
```

## Índices

`firestore.indexes.json`:

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

---

## Tests (`web/src/test/supplierService.test.ts`)

~12 unit tests con Vitest (mock Firebase como en los demás):

1. `createSupplier` — crea proveedor con contadores en 0 y `active=true`
2. `updateSupplier` — actualiza campos
3. `toggleSupplierActive` — activa/desactiva
4. `deleteSupplier` — borra sin órdenes; bloquea si `totalOrders > 0`
5. `createOrder` con ítems existentes — `status=draft`, `received_quantity=0`
6. `createOrder` con producto nuevo — `isNewProduct=true`, `product_id` vacío
7. `updateOrderStatus` — transiciones válidas (`draft`→`ordered`, `ordered`→`cancelled`)
8. `updateOrderStatus` — transición inválida (`received`→`draft`, debe fallar)
9. `receiveOrderItem` (parcial) — suma stock, status queda `partial`, `received_total` correcto
10. `receiveOrderItem` (completa) — todos recibidos, status `received`, contadores de supplier actualizados
11. `receiveOrderItem` (producto nuevo) — crea producto, asocia `supplier_id`
12. `cancelOrder` con recepción — bloquea con mensaje "no se puede cancelar, ya se recibió stock"

---

## Gotchas y decisiones explícitas

1. **Recepción atómica**: `runTransaction` (no batch) garantiza que stock y orden se actualizan juntos. Falla uno → falla todo.
2. **Producto nuevo en recepción**: se crea con `price_cents = unit_cost_cents * 2` (marcador 100% markup, editable después en Inventario). El precio no es definitivo.
3. **`received_quantity > quantity`**: se valida en `ReceiveOrder` (input max = `quantity - prev_received`). No permitir over-delivery.
4. **Soft delete de proveedor**: `active=false` (no borra). Hard delete bloqueado si `totalOrders > 0`.
5. **Denormalización de `supplierName`**: snapshot al crear. Si el proveedor cambia de nombre, las órdenes viejas conservan el original.
6. **Contadores denormalizados**: `totalOrders` y `totalSpentCents` en `Supplier` se actualizan solo cuando una orden pasa a `received` (no en cada recepción parcial, para evitar escrituras excesivas).
7. **Fallback mock**: si Firebase no está configurado, los tests y desarrollo local usan arrays en memoria (mismo patrón que `authService` y `saleService`).

---

## Estimación por fase

| Fase | Días | Entregable |
|------|------|------------|
| Fase 1: Modelo + servicio CRUD proveedores | 2 | `Supplier`/`User` types, `supplierService.ts` (proveedores) |
| Fase 2: UI proveedores | 2 | `Suppliers.tsx`, `SupplierModal.tsx`, nav "Proveedores" |
| Fase 3: Modelo + servicio órdenes | 2 | `PurchaseOrder` types, funciones `createOrder`/`updateOrderStatus` |
| Fase 4: UI órdenes (lista + modal crear) | 2 | `PurchaseOrders.tsx`, `PurchaseOrderModal.tsx`, nav "Pedidos" |
| Fase 5: Recepción parcial + transacción | 2 | `ReceiveOrder.tsx`, `receiveOrderItem()` con `runTransaction` |
| Fase 6: Tests + reglas + índices + commit | 2 | `supplierService.test.ts`, `firestore.rules`, `firestore.indexes.json` |
| **Total** | **12 días** | |

---

## Criterios de aceptación

- [ ] Dueño puede crear/editar/desactivar proveedores
- [ ] Dueño puede crear orden de compra con ítems existentes y nuevos
- [ ] Orden pasa por `draft` → `ordered` parcial → `received`
- [ ] Al recibir, el stock de productos sube atómicamente
- [ ] Producto nuevo se crea y queda vinculado al proveedor
- [ ] Las órdenes parciales se pueden recibir más veces
- [ ] Cancelación valida que no haya recepción previa
- [ ] Manager y admin ven Pedidos/Proveedores; cashier no los ve
- [ ] 12 tests pasan con `npm run test`
- [ ] Build exitoso con `npm run build`
- [ ] Reglas y índices desplegados con `npm run deploy:rules` y `npm run deploy:indexes`
