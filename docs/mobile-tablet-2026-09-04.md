# Optimización mobile y tablet - 2026-09-04

**Estado:** implementado en el workspace, sin despliegue ni commit hasta confirmación del operador.
**Objetivo:** que cajeros y administradores usen SurtiFácil desde teléfonos y tablets (PWA instalada
o navegador) sin scroll lateral, con controles táctiles y sin sondeos que consuman datos y lecturas.

## Diagnóstico previo

| Problema | Evidencia |
|---|---|
| Navegación de escritorio | `App.tsx` renderizaba hasta 12 botones de texto en una sola fila |
| Sin breakpoints | 15 de 21 componentes no usaban ninguna clase `sm:`/`md:`/`lg:` |
| Tablas en todas las listas | 10 pantallas con `<table>` y solo `overflow-x-auto` |
| Modal que rompe bajo 640px | `AddProductModal` con `min-w-[600px]` y arrastre solo con mouse |
| Chat fijo | `WhatsAppChat` con `h-screen` y sidebar `w-80` |
| Orientación bloqueada | `manifest.json` con `portrait-primary` |
| Sondeo continuo | Dashboard cada 10 s, Inventario y Ventas cada 5 s, descargando colecciones completas |
| Bundle único | 483 KB de app + 623 KB Firebase + 576 KB Recharts cargados en el login; chunk `react-vendor` vacío |
| Diálogos nativos | `confirm()`/`alert()` en 6 lugares |

Referencias de patrones consultadas en Mobbin: barra inferior con pestaña "Más" que lista secciones
secundarias y cierre de sesión al final; tarjetas de producto con botón "+"; total fijo al pie del
checkout con el botón principal.

## Cambios

### Shell responsivo (`web/src/components/layout/`)

- `AppShell.tsx`: en teléfonos (< 768 px) barra superior compacta, barra de pestañas inferior
  (Inicio, Vender, Inventario, Ventas, Más) y hoja "Más" con el resto de secciones permitidas por el
  rol y "Cerrar sesión". En tablets y escritorio, barra lateral colapsable (icónica por defecto entre
  768 y 1023 px, expandida desde 1024 px, preferencia guardada en `localStorage`).
- Solo una de las dos navegaciones existe en el DOM a la vez (`useIsMobile()`), así los tests y los
  lectores de pantalla ven cada acción una sola vez.
- `navItems.ts` centraliza etiquetas e iconos; el acceso por rol sigue en `auth/accessControl.ts`.
- `App.tsx` carga cada página con `React.lazy`, expone el usuario actual mediante
  `auth/CurrentUserContext.tsx` y conserva el manejo de deep links, errores de sesión y logout.

### Componentes compartidos (`web/src/components/ui/`)

- `Modal.tsx`: hoja inferior en teléfonos, ventana centrada desde `sm`, portal, Escape, bloqueo de
  scroll, foco devuelto al abridor, `role="dialog"` etiquetado por el título.
- `ConfirmDialog.tsx` + `useConfirm()`: reemplazo de `window.confirm` (no funciona bien en PWA
  standalone y no es accesible).
- `PageHeader.tsx`, `Icon.tsx` y clases de `index.css` (`btn-*`, `icon-btn`, `input`, `card`,
  `chip`) con objetivos táctiles de 44 px y campos de 16 px para evitar el zoom automático de iOS.

### Pantallas

- **Nueva venta (POS):** búsqueda por nombre, categoría o código con botón de escaneo, lista táctil de
  productos (tarjetas en tablet/escritorio), carrito con steppers −/+, método de pago como selector
  segmentado y botón de confirmación con el total. En teléfonos el carrito vive en una hoja inferior
  abierta desde una barra fija que muestra artículos y total.
- **Inventario:** tarjetas en teléfono, tabla desde `md`, FAB "+" en móvil, edición en modal
  compartido, confirmación accesible para eliminar. Las acciones de edición solo aparecen para
  admin/manager y la de eliminar solo para admin, coherente con `firestore.rules`.
- **Ventas:** historial paginado (50 por página, "Cargar más"), tarjetas expandibles en teléfono.
- **Dashboard:** KPIs en 2 columnas en móvil, botón "Actualizar" y refresco al volver a la pestaña.
- **Reportes, Márgenes, Reposición, Pedidos, Proveedores, Empleados, WhatsApp** y sus modales:
  mismo patrón (encabezado apilable, tarjetas/tabla, modal compartido, confirmaciones accesibles).
  WhatsApp pasa a maestro-detalle en teléfono con botón "Volver a conversaciones".
- **Escáner:** diálogo responsivo, `qrbox` proporcional al visor y mensaje claro si la cámara falla.

### Datos y rendimiento

- `services/productService.ts`: suscripción `onSnapshot` a productos (una lectura inicial y luego
  solo los documentos que cambian) en lugar de releer la colección cada 5 s; CRUD de productos
  centralizado y con mensajes genéricos.
- `services/saleService.ts`: `getRecentSales` (orden por fecha, `limit`, cursor `startAfter`),
  `getSalesSince` (`where date >= …`) y `getSalesTotals` (`getAggregateFromServer` con `count` y
  `sum`). El dashboard ya no descarga el histórico completo. `getSales()` se mantiene para
  `reportService`/`marginService`; acotar esos reportes sigue en la Task 21.
- `vite.config.ts`: `manualChunks` por función (corrige el chunk `react-vendor` vacío) y chunk
  separado para el escáner. Con `React.lazy`, Recharts y el escáner solo se descargan al abrir
  Reportes/Márgenes o el escáner.
- PWA: `viewport-fit=cover`, `theme-color` de marca, favicon, `orientation: any`, `id`/`scope`.

## Verificación

Ver la sección "Task 26" en `tasks.md` para los conteos de la corrida final.

- Unitarias nuevas: shell móvil/escritorio, `useMediaQuery`, `Modal`/`useConfirm`, POS, Inventario,
  Ventas, `productService`, consultas acotadas de `saleService`, pantallas móviles de compras,
  empleados y WhatsApp.
- E2E: `qa/playwright.config.ts` añade los proyectos `mobile-chromium` (Pixel 7) y
  `tablet-chromium` (iPad horizontal) que ejecutan `qa/tests/responsive-smoke.spec.ts`: sin scroll
  horizontal, controles de 44 px en el login, manifest correcto y, cuando existen credenciales QA,
  navegación por barra inferior o barra lateral según el viewport.

## Pendiente / fuera de alcance

- Acotar `reportService` y `marginService` (siguen leyendo toda la colección `sales`): Task 21.
- Baseline de Lighthouse móvil sobre staging real y presupuesto de lecturas: Task 21/24.
- Gestos táctiles avanzados (deslizar para eliminar) y modo offline de ventas: no planificados.
- El arrastre del modal de "Agregar producto" (solo mouse) se eliminó al adoptar el modal compartido.
