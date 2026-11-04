# Hoja de Ruta hacia Producción — SurtiFácil SaaS (`surtifacil`)

Este archivo es la **fuente de verdad persistente entre sesiones** para el comando `/avanzar`. Cada vez que una tarea se planifica, construye, valida con pruebas unitarias y Playwright, y se sube al repositorio (`git commit` + `git push` para despliegue en Cloudflare Pages), se marca con `[x]` aquí.

---

## Visión de Producto y Modelo de Negocio (SaaS para Abastos y Tiendas de Barrio en Medellín)

**SurtiFácil SaaS** transforma cualquier tienda de barrio, minimercado, legumbrería o local de abastos en Medellín y el Valle de Aburrá en un comercio digitalizado, rentable y sin fricción operativa:

1. **Arquitectura 100 % Cloud-Native de Costo Cero Inicial:**
   - **Autenticación:** Firebase Authentication (`surtifacilapp`) para identidad segura (Email/Contraseña y Google).
   - **Frontend, API y Base de Datos:** Cloudflare Pages (`https://surtifacil.pages.dev`) + Cloudflare Pages Functions (`/api/*`) + **Cloudflare D1 SQLite Serverless** (`surtifacil-db`) con aislamiento estricto multi-tenant por `negocio_id`.
2. **Cuatro Pilares Comerciales para el Tendero Paisa:**
   - **Control Total del Negocio desde su Panel Staff:** Inventario por unidades/libras/cubetas, escáner de códigos de barras, márgenes reales, órdenes a proveedores, libro digital de **Fiados** y arqueo de caja en pesos colombianos (`COP`).
   - **Modo Kiosco / iPad Afuera del Local (`/kiosco/:slug`):** Pantalla táctil de autoatención en la entrada del local donde los clientes arman su pedido en segundos, obtienen su número de turno y descongestionan el mostrador en hora pico.
   - **Vitrina Vecinal (`/tienda/:slug`) + Afiche QR Imprimible:** Catálogo digital del barrio con pedidos a domicilio o para recoger.
   - **Bot Sarin impulsado por DeepSeek API (`deepseek-chat`):**
     - **Sarin Vecino (WhatsApp y Web):** Atiende clientes 24/7, consulta stock real en D1, arma el mercado y registra el domicilio automáticamente.
     - **Sarin Copiloto Tendero (Voz Manos Libres en POS + Analítica):** Permite facturar dictando con la voz y responder preguntas gerenciales del negocio al instante.

---

## Tareas Completadas (`[x]`)

- [x] **Paso 1 — Conexión de Repositorio y Despliegue de Producción en Cloudflare Pages (`https://surtifacil.pages.dev`):**
  - Configurado `Root directory: web`, preset `React (Vite)`, comando `npm run build`, salida `dist` y `NODE_VERSION=22` en Cloudflare Pages.
  - Creado [`web/public/_redirects`](../web/public/_redirects) para soporte de rutas SPA y script `build` de respaldo en [`package.json`](../package.json).
  - Verificado despliegue en vivo respondiendo `200 OK` con PWA y Service Worker activos.
- [x] **Paso 2 — Configuración de Autenticación Exclusiva en Firebase (`surtifacilapp`):**
  - Registrada la aplicación web `surtifacil-web` en el proyecto Firebase `surtifacilapp` (`595703512941`).
  - Habilitados los proveedores de acceso **Correo electrónico/contraseña** y **Google**.
  - Configuradas las variables `VITE_FIREBASE_*` y `VITE_BACKEND_URL=https://surtifacil.pages.dev` tanto en Cloudflare Pages como en [`web/.env.local`](../web/.env.local).
- [x] **Paso 3 — Creación y Vinculación de Base de Datos Serverless Cloudflare D1 (`surtifacil-db`):**
  - Creada la base de datos D1 `surtifacil-db` (UUID: `33619f1c-3375-48d4-a04d-3a882de4349c`) y vinculada como binding `DB` en Cloudflare Pages (`Production` y `Preview`).
  - Diseñado y ejecutado el esquema relacional inicial en [`docs/schema-d1.sql`](./schema-d1.sql) con las 9 tablas base e índices operativos.
  - Definido el sistema de diseño y estándares de ingeniería en [`DESIGN.md`](../DESIGN.md) y creada la skill automatizada `/avanzar`.
- [x] **Tarea 1 — Capa de API Serverless en Cloudflare Pages Functions (`/api/*`), Esquema Multi-Tenant (`negocio_id`) en D1 y Verificación JWT de Firebase Auth:**
  - Creado esquema relacional multi-tenant e insertadas semillas en [`docs/schema-d1.sql`](./schema-d1.sql) para el negocio insignia `surtifacil` y SuperAdmin `andres.san1404@gmail.com`.
  - Construido el verificador criptográfico JWT RS256 con Web Crypto API en [`web/functions/_lib/firebaseAuth.ts`](../web/functions/_lib/firebaseAuth.ts) contra claves públicas de Google y soporte de tokens de desarrollo.
  - Implementado middleware de autenticación y aislamiento multi-tenant en [`web/functions/_lib/authMiddleware.ts`](../web/functions/_lib/authMiddleware.ts) con soporte para switch de local del SuperAdmin vía `X-Negocio-Id`.
  - Construido el enrutador de API en [`web/functions/api/[[route]].ts`](../web/functions/api/[[route]].ts) cubriendo `/health`, `/auth/me`, `/auth/provision`, `/auth/provision-user`, `/auth/sync-claims`, catálogo `/products` (CRUD multi-tenant), ventas `/sales` (transacciones atómicas con descuento de stock y cargos de fiado), `/credits` (clientes y libro de fiados con validación de no sobre-abono), `/suppliers` y órdenes `/orders` (con incremento de stock en recepción) y gestión de empleados `/users`.
  - Verificado con 9/9 pruebas unitarias de API en [`web/src/test/apiFunctions.test.ts`](../web/src/test/apiFunctions.test.ts) (289/289 tests en Vitest pasando en verde), build de producción sin errores y 8/8 tests de Playwright pasando en verde.

---

## Tareas Pendientes por Ejecutar con `/avanzar` (`[ ]`)

- [ ] **Tarea 2 — Enlace Completo de Servicios Frontend a Cloudflare D1 y Eliminación de Firestore en Cliente:**
  - **Objetivo:** Conectar todos los servicios de `web/src/services/` a la nueva API `/api/*` en Cloudflare Pages Functions, dejando Firebase exclusivamente para `firebase/auth`.
  - **Alcance Técnico:**
    1. Crear cliente HTTP unificado [`web/src/services/apiClient.ts`](../web/src/services/apiClient.ts) que obtenga el `idToken` vigente de `firebase/auth`, inyecte el header `Authorization: Bearer <token>` y el `X-Negocio-Id` activo, y maneje errores tipados.
    2. Refactorizar [`authService.ts`](../web/src/services/authService.ts), [`productService.ts`](../web/src/services/productService.ts), [`saleService.ts`](../web/src/services/saleService.ts), [`creditService.ts`](../web/src/services/creditService.ts), [`supplierService.ts`](../web/src/services/supplierService.ts), [`reportService.ts`](../web/src/services/reportService.ts) y [`stockAlertService.ts`](../web/src/services/stockAlertService.ts) para consumir `/api/*` (con bus de eventos reactivo local para refrescar suscriptores tras mutaciones y modo mock intacto para tests aislados).
    3. Limpiar imports de `firebase/firestore` del bundle de producción para reducir drásticamente el peso de `firebase-vendor` (~300 KB menos de JS descargado).
    4. Actualizar y pasar el 100 % de las pruebas unitarias en Vitest y verificar el flujo en vivo con Playwright.

- [ ] **Tarea 3 — Rediseño de Navegación Administrativa (Patrón HoneyBook), Pasillos y Catálogo Táctil (Sinergia Rappi Aisles + Blinkit) y Configuración del Local (`/inventario` y `/configuracion`):**
  - **Objetivo:** Renovar la experiencia visual y operativa del staff implementando la navegación jerárquica inspirada en HoneyBook en el AppShell, la matriz de exploración visual de pasillos inspirada en Rappi Aisles y el catálogo de productos con riel vertical táctil inspirado en Blinkit, permitiendo administrar productos, unidades de medida, combos y configuración comercial.
  - **Alcance Técnico:**
    1. **Navegación Administrativa ([Patrón HoneyBook en Mobbin](https://mobbin.com/screens/bcce288e-c338-41f8-a1d1-fb6b6d6dc709)):**
       - Refactorizar [`AppShell.tsx`](../web/src/components/layout/AppShell.tsx) y [`navItems.ts`](../web/src/components/layout/navItems.ts) con barra lateral oscura (`bg-sf-dark`), cabecera con estado de tienda y suscripción, subgrupos desplegables con chevrons (*Mostrador y Ventas*, *Cartera y Fiados*, *Catálogo y Bodega*, *Proveedores*, *Canales Vecinales*, *Configuración*), barra superior con botón hero `+ Nueva Venta` y menú emergente de perfil de cajero.
    2. **Explorador de Pasillos de Abastos ([Patrón Rappi Aisles en Mobbin](https://mobbin.com/screens/41848e74-4e6c-4dec-9da4-cdf042973fa5)):**
       - Matriz táctil en 2 columnas de pasillos ilustrados (*Frutas y Verduras*, *Panadería y Arepas*, *Lácteos y Huevos*, *Granos y Despensa*, *Carnes y Salsamentaria*, *Snacks*, *Bebidas*, *Aseo y Hogar*) con contador de productos y acceso instantáneo.
    3. **Catálogo Táctil de Productos en Mostrador ([Patrón Blinkit en Mobbin](https://mobbin.com/screens/39e1dc5f-a55e-4bb1-b93f-1b60ea4d7375)):**
       - Riel vertical izquierdo de categorías con iconos ilustrados para cambiar de pasillo a un toque.
       - Cuadrícula de tarjetas de producto de 2-3 columnas con fotografía, nombre, badge de peso/unidad (`libra`, `kilo`, `litro`, `cubeta`, `paquete`), precio `formatCOP`, botón verde táctil `+ AGREGAR` y switches de visibilidad (*Kiosco iPad*, *Tienda Web* y *En Oferta*).
       - Edición rápida en línea de precio y stock para cuando llega mercancía nueva al mostrador.
    4. Crear gestor de **Combos y Kits de Mercado** (ej. *"Combo Desayuno Paisa"*, *"Kit Aseo Mes"*) donde el staff agrupa productos existentes con precio especial.
    5. Crear la vista **Configuración del Negocio** (`web/src/components/StoreSettings.tsx`) para editar: nombre comercial, barrio en Medellín, dirección, teléfono WhatsApp de pedidos, horario de atención, valor del domicilio, datos informativos de pago (Nequi / Bancolombia) y mensaje de bienvenida.

- [ ] **Tarea 4 — Plataforma SaaS Multi-Tenant para Abastos en Medellín: Planes, Registro de Locales (`/registro-negocio`), Selector de Tienda y Panel SuperAdmin (`/super-admin`):**
  - **Objetivo:** Convertir SurtiFácil en un SaaS comercializable para cientos de tiendas de barrio en Medellín, con control centralizado de suscripciones y cuotas de IA por tienda.
  - **Alcance Técnico:**
    1. Implementar los 4 planes SaaS offline en `web/src/types/tenant.ts` y endpoints `/api/super-admin/negocios`:
       - **Plan Prueba (3 días):** \$ 5.000 COP · 300 turnos Sarin IA.
       - **Plan Semanal (7 días):** \$ 19.900 COP · 700 turnos Sarin IA.
       - **Plan Quincenal (15 días):** \$ 34.900 COP · 1.500 turnos Sarin IA.
       - **Plan Mensual (30 días):** \$ 59.900 COP · 3.000 turnos Sarin IA.
       - **Plan Enterprise Insignia:** Ilimitado para la sede principal `surtifacil`.
    2. Construir la página pública de captación y registro de tenderos (`#/registro-negocio` — `RegisterStore.tsx`) con selector visual de planes, selección de barrio/comuna de Medellín y creación de tienda en estado `pendiente` o `prueba_activa`.
    3. Construir el **Centro de Control SuperAdmin** (`#/super-admin` — `SuperAdminStores.tsx`) exclusivo para `andres.san1404@gmail.com`:
       - 4 KPIs de plataforma (Total Tiendas, Tiendas Activas, Recaudo Estimado Mensual, Consumo Global Sarin IA).
       - Filtros por estado/barrio, activación y renovación rápida a 1 clic (`+3d`, `+7d`, `+15d`, `+30d`), barra de progreso de cuota IA y botón **"Operar esta tienda"** con selector de tienda activa en la barra superior (`AppShell.tsx`).
    4. Agregar `SubscriptionBanner.tsx` en el `Dashboard` del tendero mostrando días restantes de su plan, consumo de Sarin IA y botón directo para renovar por WhatsApp con el administrador de la plataforma.

- [ ] **Tarea 5 — Modo Kiosco Táctil / iPad Afuera del Local (`#/kiosco/:slug`) y Bandeja de Pedidos en Vivo en POS con Alerta Sonora:**
  - **Objetivo:** Habilitar una interfaz táctil de autoatención tipo Kiosco para tablets/iPads ubicados afuera o en la entrada del local de abastos, conectada en tiempo real con la caja del tendero.
  - **Alcance Técnico:**
    1. Crear tabla `customer_orders` en D1 (`id`, `negocio_id`, `order_code`, `source` ['kiosk' | 'web' | 'whatsapp'], `customer_name`, `customer_phone`, `delivery_type` ['pickup_counter' | 'delivery'], `delivery_address`, `delivery_neighborhood`, `payment_method` ['cash' | 'transfer' | 'credit'], `items_json`, `total_cents`, `status` ['pending' | 'preparing' | 'ready_or_on_way' | 'completed' | 'cancelled'], `tracking_token`, `created_at`) y endpoints públicos/privados en `/api/customer-orders`.
    2. Construir la vista **Kiosco de Autoatención** (`web/src/components/KioskMode.tsx` en `#/kiosco/:slug`):
       - Botones gigantes de alta visibilidad (`min-h-[56px]`), modo Pantalla Completa (`Fullscreen API`), categorías ilustradas con íconos grandes, buscador rápido y tarjetas de producto con botón `+ Agregar` de 1 toque.
       - Carrito lateral/inferior persistente con ajuste rápido de cantidades (`+` / `-`) y cálculo en vivo en `formatCOP`.
       - Checkout sin fricción en 2 pasos: Nombre del cliente, modalidad (**"Llevar ya en mostrador"** vs **"Envíenmelo a mi casa"**) y medio de pago (**Efectivo**, **Transferencia Nequi** o **Anotar a mi Fiado**).
       - Pantalla final de **Turno Gigante** (ej. `TURNO #A-12`) con instrucciones claras y cuenta regresiva de 15 segundos para limpiar y reiniciar automáticamente la pantalla para el siguiente vecino.
    3. Integrar en el POS (`CreateSale.tsx`) y en la navegación una **Bandeja de Pedidos de Clientes (Kiosco / Web / WhatsApp)** con timbre acústico Web Audio API (`playNewOrderChime`), permitiendo al tendero ver lo que pidió el cliente en el iPad y **Facturarlo / Descontar Stock en 1 clic**.

- [ ] **Tarea 6 — Catálogo Web Vecinal por Negocio (`#/tienda/:slug`), Rastreo de Pedido en Vivo (`#/pedido/:token`) y Generador de Afiche QR Imprimible:**
  - **Objetivo:** Darle a cada local de abastos su propia tienda virtual pública para recibir domicilios del barrio y un generador de carteles QR listos para imprimir y pegar en el mostrador o vitrina.
  - **Alcance Técnico:**
    1. Construir el Storefront Vecinal (`web/src/components/PublicStorefront.tsx` en `#/tienda/:slug`) con cabecera personalizada del negocio (nombre, barrio, horario, estado Abierto/Cerrado), ofertas destacadas, combos de mercado, carrito de compras y checkout de domicilio o retiro en tienda.
    2. Construir la vista de **Rastreo de Pedido en Vivo** (`web/src/components/OrderTracking.tsx` en `#/pedido/:token`) con barra de progreso de 4 etapas (**Recibido** ➔ **Alistando tu mercado** ➔ **En camino** ➔ **Entregado**), resumen del pedido y botón de contacto directo al WhatsApp de la tienda.
    3. Crear el componente [`StoreQRCard.tsx`](../web/src/components/StoreQRCard.tsx) y generador en Canvas (`qrPosterGenerator.ts`) dentro de Configuración de la Tienda para descargar en PNG de alta resolución (1200×1600 px) el **Afiche QR de Tienda Vecinal** y el **Acceso Directo al Modo Kiosco iPad**.

- [ ] **Tarea 7 — Integración de DeepSeek API y Bot Sarin Vecino para Pedidos Automáticos por WhatsApp y Chat Web:**
  - **Objetivo:** Conectar la API de **DeepSeek** (`deepseek-chat`) para que el bot **Sarin** atienda automáticamente a los clientes de cada tienda por WhatsApp y por el widget de chat web, consultando el inventario real en D1 y creando los pedidos sin intervención manual.
  - **Alcance Técnico:**
    1. Implementar `web/functions/_lib/deepseekEngine.ts` compatible con el formato OpenAI/DeepSeek Chat Completions (`https://api.deepseek.com/chat/completions`), leyendo el secreto `DEEPSEEK_API_KEY` en Cloudflare y verificando/descontando atómicamente la cuota `cuota_ia_usada` del `negocio_id` en D1.
    2. Implementar el orquestador **Sarin Vecino** (`web/functions/_lib/sarinCustomerOrchestrator.ts`) con 4 herramientas (*Function Calling*) verificadas contra D1:
       - `consultar_catalogo_abastos`: busca productos disponibles, precios, ofertas y combos del local.
       - `modificar_canasta_pedido`: arma y actualiza la canasta temporal del cliente validando stock real.
       - `confirmar_pedido_domicilio`: calcula precios autoritativos en servidor, crea la orden en `customer_orders` con origen `whatsapp` y genera el link de rastreo `/pedido/:token`.
       - `consultar_estado_o_escalar`: consulta el estado de un pedido activo o pausa el bot por 2 horas (`handoff`) para que el tendero atienda personalmente.
    3. Conectar el endpoint de webhook `/api/webhooks/whatsapp` (con validación HMAC y soporte multi-tenant) y renovar [`WhatsAppChat.tsx`](../web/src/components/WhatsAppChat.tsx) con bandeja en vivo, interruptor de Bot Activo / Pausa Manual por conversación y **Simulador Interactivo de Sarin** para probar pedidos desde el panel.

- [ ] **Tarea 8 — Bot Sarin Copiloto del Tendero: Voz Manos Libres en POS y Consultor Gerencial de Negocio con DeepSeek:**
  - **Objetivo:** Dotar al tendero y administrador de un copiloto inteligente por voz y texto que acelere el cobro en mostrador cuando tiene las manos ocupadas y responda preguntas operativas y financieras de su negocio en tiempo real.
  - **Alcance Técnico:**
    1. Construir `SarinVoicePOS.tsx` integrado en [`CreateSale.tsx`](../web/src/components/CreateSale.tsx):
       - Reconocimiento de voz continuo (`Web Speech API` `es-CO`) con palabra de activación **"Sarin"** y botón táctil de micrófono (`min-h-[44px]`).
       - Interpretación de comandos de venta rápida (*"Sarin, agrega dos leches y una libra de arroz, pagan con 20 mil"*), validación contra precios oficiales, cálculo de vueltas con **doble confirmación didáctica** (voz hablada + tarjeta visual de alto contraste) y botones de **Deshacer** / **Repetir**.
    2. Construir el **Copiloto Gerencial Sarin** (`SarinBusinessCopilot.tsx` y endpoint `/api/ai/copilot`) impulsado por DeepSeek con herramientas analíticas de solo lectura sobre D1 para el dueño del negocio:
       - Consultas al instante por voz o chat: *"¿Cuánto llevamos vendido hoy y cuál es la ganancia?"*, *"¿Quiénes son los 5 clientes que más me deben en fiados?"*, *"¿Qué productos tienen stock crítico hoy?"*, *"Ármame la lista sugerida de compra para el proveedor"*.

- [ ] **Tarea 9 — Cierre de Caja con Arqueo Físico de Billetes/Monedas COP, Ticket Térmico (58mm/80mm) y Cobro Amigable de Fiados por WhatsApp:**
  - **Objetivo:** Blindar el control del efectivo diario del tendero con arqueo físico en denominaciones colombianas, impresión de tirillas térmicas de mostrador y gestión de cobro de cartera de fiados a 1 clic.
  - **Alcance Técnico:**
    1. Crear módulo de **Cierre de Caja y Arqueo Físico COP** (`CashClosingModal.tsx` y tabla `cash_closings` en D1):
       - Cuadrícula táctil con los 6 billetes (\$100.000, \$50.000, \$20.000, \$10.000, \$5.000, \$2.000) y 5 monedas (\$1.000, \$500, \$200, \$100, \$50) de Colombia.
       - Comparador en tiempo real entre **Efectivo Esperado por Ventas/Abonos** vs **Efectivo Físico Contado**, badge semántico (`Cuadrado`, `Sobrante`, `Faltante`) y generación de Acta de Cierre inmutable.
    2. Crear el modal de **Comprobante Térmico Digital (58mm / 80mm)** (`ThermalReceiptModal.tsx`) con estilos `@media print` en [`web/src/index.css`](../web/src/index.css), botón para enviar el recibo al WhatsApp del cliente a 1 toque y exportación de ventas/reportes a Excel (`.csv` UTF-8 BOM).
    3. En [`Credits.tsx`](../web/src/components/Credits.tsx), agregar botón **"Enviar Recordatorio por WhatsApp"** que abre un mensaje cordial pre-formateado con el nombre del vecino, el saldo pendiente en `formatCOP`, los últimos movimientos y los datos de Nequi/Bancolombia de la tienda.

- [ ] **Tarea 10 — Modo Offline Resiliente en Mostrador (IndexedDB + Cola de Sincronización Multi-Tenant) y Suite E2E Completa con Playwright:**
  - **Objetivo:** Garantizar que ninguna tienda de barrio detenga sus ventas o abonos si falla el internet del sector, y certificar toda la plataforma de punta a punta con Playwright.
  - **Alcance Técnico:**
    1. Implementar `offlineSyncService.ts` sobre IndexedDB con aislamiento por `negocio_id`:
       - Caché automático del catálogo de productos y clientes de fiado para lectura instantánea sin red.
       - Cola FIFO de ventas y abonos registrados en modo offline con banner interactivo en cabecera, auto-sincronización al volver la conexión y modal de inspección de cola.
    2. Construir y ejecutar la suite E2E automatizada en Playwright (`qa/e2e/saas-production.spec.ts`) validando:
       - Login y aprovisionamiento multi-tenant.
       - Gestión de catálogo, combos y configuración de tienda por el staff.
       - Flujo completo de pedido en **Modo Kiosco iPad** (`#/kiosco/surtifacil`) y recepción en POS.
       - Flujo de **Tienda Vecinal** (`#/tienda/surtifacil`) y rastreo de pedido.
       - Venta en POS con Copiloto Sarin, Libro de Fiados, Arqueo de Caja COP y Panel SuperAdmin.

