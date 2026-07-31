# tasks.md - SurtiFácil Admin MVP v1.0

## Fecha: 2026-07-31
## Objetivo: MVP v1.0 - Alertas + Empleados + Reportes

---

## FASE 1: Alertas de Stock Bajo (5 días) ✅ COMPLETADA

### 1.1 Diseño de Datos (1 día) ✅
- [x] Definir esquema `stock_alerts` en Firestore
- [x] Crear interfaz `StockAlert` en `services/stockAlertService.ts`
- [x] Documentar estructura en `docs/`

### 1.2 Backend (2 días) ✅
- [x] Crear función `checkLowStock()` en `services/stockAlertService.ts`
- [x] Implementar umbral configurable por producto
- [x] Crear endpoint GET `/api/alerts` (si backend Express)
- [x] Agregar campo `minStock` a producto existente

### 1.3 Frontend (2 días) ✅
- [x] Crear componente `StockAlerts.tsx`
- [x] Agregar badge indicador en `Inventory.tsx`
- [x] Implementar notificación visual en Dashboard
- [x] Agregar configuración de umbrales en Settings

---

## FASE 2: Gestión de Empleados (7 días) ✅ COMPLETADA

### 2.1 Modelo de Datos (1 día) ✅
- [x] Definir esquema `users` en Firestore
- [x] Crear interfaz `User` con roles: `admin | cashier | manager`
- [x] Implementar validación de permisos por rol

### 2.2 Servicio de Auth (2 días) ✅
- [x] Configurar Firebase Authentication
- [x] Crear `authService.ts` con:
  - `register(email, password, role)`
  - `login(email, password)`
  - `logout()`
  - `getCurrentUser()`
  - `getUsers()`
  - `updateUserRole()`
  - `toggleUserActive()`
  - `deleteUser()`
  - `isAdmin()`
- [x] Implementar protección de rutas según rol

### 2.3 UI Empleados (2 días) ✅
- [x] Crear componente `UserManagement.tsx`
- [x] Implementar tabla de usuarios con roles
- [x] Crear modal `CreateUserModal.tsx`
- [x] Agregar opciones de editar/eliminar usuario

### 2.4 Integración (2 días) ✅
- [x] Agregar página 'Empleados' al nav en `App.tsx`
- [x] Implementar control de acceso por rol
- [x] Proteger rutas sensibles (solo admin)
- [x] Agregar logging de actividad por usuario

---

## FASE 3: Reportes Básicos (5 días) ✅ COMPLETADA

### 3.1 Datos y Servicios (2 días) ✅
- [x] Crear `reportService.ts` con:
  - `getDailySales(date)`
  - `getWeeklySales(startDate, endDate)`
  - `getTopProducts(limit)`
  - `getSalesByCategory()`
  - `getSalesSummary()`
  - `formatCurrency()`
  - `formatNumber()`
- [x] Optimizar queries Firestore (índices)

### 3.2 UI Reportes (2 días) ✅
- [x] Crear componente `Reports.tsx`
- [x] Implementar gráficas con recharts (BarChart, PieChart)
- [x] Crear selector de rango de fechas (7/14/30 días)
- [x] Mostrar: ventas diarias, semanales, top 5 productos
- [x] Exportar datos a CSV

### 3.3 Dashboard Integration (1 día) ✅
- [x] Agregar enlace a reportes en `Dashboard.tsx`
- [x] Crear acceso rápido a reportes desde nav
- [x] Evento de navegación personalizado (`navigate`)
- [x] Exportar datos a CSV (opcional)

---

## FASE 4: Testing y QA (3 días) ✅ COMPLETADA

### 4.1 Configuración (1 día) ✅
- [x] Instalar Vitest en `web/` (vitest, @testing-library/react, jsdom)
- [x] Configurar tests en `package.json` (test, test:watch, test:ui)
- [x] Crear estructura `src/test/` con setup.ts
- [x] Configurar vite.config.ts (jsdom, globals, css)

### 4.2 Tests Unitarios (2 días) ✅
- [x] Tests para `stockAlertService.ts` (14 tests)
- [x] Tests para `reportService.ts` (14 tests)
- [x] Tests para `authService.ts` (10 tests)
- [x] Tests de utils (formatCurrency, formatNumber)
- [x] **38 tests pasan, 0 fallan**

---

## FASE 5: Deploy (2 días) ✅ COMPLETADA

### 5.1 Preparación (1 día) ✅
- [x] Configurar variables de entorno production
- [x] Optimizar build (`npm run build`) - manualChunks (react/firebase/charts)
- [x] Configurar Firebase Hosting (`firebase.json`)
- [x] Crear `.firebaserc`
- [x] Crear `firestore.rules` (reglas de seguridad)
- [x] Crear `firestore.indexes.json` (índices optimizados)
- [x] Cache headers configurados (JS/CSS 7 días, imágenes 1 año)
- [x] Agregar scripts de deploy al `package.json` raíz

### 5.2 Despliegue (1 día) ✅
- [x] Documentar proceso en `docs/DEPLOY.md`
- [x] Comandos documentados (deploy:hosting, deploy:rules, deploy:all)
- [x] Checklist pre-producción
- [x] Sección de troubleshooting
- [x] Guía de rollback
- [ ] Deploy a producción (requiere `firebase login` + project ID real)

---

## Resumen Estimación

### MVP v1.0 ✅ COMPLETADO
| Fase | Días | Estado |
|------|------|--------|
| Alertas Stock | 5 | ✅ COMPLETADA |
| Empleados | 7 | ✅ COMPLETADA |
| Reportes | 5 | ✅ COMPLETADA |
| Testing | 3 | ✅ COMPLETADA |
| Deploy | 2 | ✅ COMPLETADA |
| **Subtotal MVP v1.0** | **22 días** | **✅** |

### v1.1 Gestión de Proveedores ✅ COMPLETADO
| Fase | Días | Estado |
|------|------|--------|
| Task 1: Modelos y Mock Data | 1 | ✅ COMPLETADA |
| Task 2: Servicio CRUD Proveedores | 1 | ✅ COMPLETADA |
| Task 3: UI Proveedores | 2 | ✅ COMPLETADA |
| Task 4: Servicio Órdenes | 1 | ✅ COMPLETADA |
| Task 5: UI Órdenes | 2 | ✅ COMPLETADA |
| Task 6: Recepción Atómica | 2 | ✅ COMPLETADA |
| Task 7: Reglas + Índices | 1 | ✅ COMPLETADA |
| **Subtotal v1.1** | **10 días** | **✅** |

### v1.2 Analytics de Margen ✅ COMPLETADO
| Fase | Días | Estado |
|------|------|--------|
| Tarea 1: Modelo + resolveCost | 1 | ✅ COMPLETADA |
| Tarea 2: Servicio resumen + diario | 2 | ✅ COMPLETADA |
| Tarea 3: Top productos + categorías | 1 | ✅ COMPLETADA |
| Tarea 4: Registro costo atómico | 1 | ✅ COMPLETADA |
| Tarea 5: UI KPIs + chart diario | 1 | ✅ COMPLETADA |
| Tarea 6: UI categorías + tablas + CSV | 1 | ✅ COMPLETADA |
| **Subtotal v1.2** | **7 días** | **✅** |

---

## Checklist Pre-Entrega ✅

- [x] Todos los features funcionando
- [x] Tests pass (`npm run test`) - 54/54 pass
- [x] Build exitoso (`npm run build`) - chunks optimizados
- [x] Sin errores en consola (build limpio)
- [x] Documentación actualizada (DEPLOY.md, BRIEF.md)
- [ ] Deploy a producción (pendiente credenciales Firebase)

---

## Commits Recientes (v1.1)

- `723086a` feat(v1.1): recepción parcial atómica de órdenes
- `7a904b2` feat(v1.1): UI de órdenes de compra con filtros y modal
- `0f19229` feat(v1.1): servicio de órdenes con transiciones de estado
- `2dd1a26` feat(v1.1): UI de gestión de proveedores
- `b09eaa4` feat(v1.1): servicio CRUD de proveedores
- `24c527f` feat(v1.1): agregar modelos de datos de proveedores y órdenes

---

*Generado por Cronos - MVP v1.0 + v1.1 Planning*
