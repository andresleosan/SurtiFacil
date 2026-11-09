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

## Matriz de 6 Niveles de Modelo y Esfuerzo (3.8 Flash + Argon)

Para maximizar la eficiencia de tokens y la precisión de razonamiento en cada sesión independiente con `/avanzar`, cada tarea pendiente se clasifica eligiendo **exactamente uno** de estos 6 niveles:

1. **`3.8 Flash (Low)`**: Cambios cosméticos, copy, variables de entorno o ajustes CSS aislados.
2. **`3.8 Flash (Medium)`**: Modales, formularios estándar, generadores Canvas (afiches QR) y reportes de solo lectura.
3. **`3.8 Flash (High)`**: Refactorizaciones modulares masivas, integración de múltiples componentes y APIs REST serverless.
4. **`Argon (Low)`**: Lógica de mostrador sensible con APIs de hardware (Fullscreen API, alertas acústicas Web Audio API).
5. **`Argon (Medium)`**: Algoritmos complejos de servidor, transacciones atómicas multitabla y orquestación de IA (DeepSeek + Function Calling / Web Speech).
6. **`Argon (High)`**: Arquitecturas complejas, sincronización offline bidireccional (IndexedDB + replay de colas) y suites E2E integrales.

---

## Tareas Pendientes por Ejecutar con `/avanzar` (`[ ]`)

- [x] **Tarea 2 — Enlace Completo de Servicios Frontend a Cloudflare D1 y Eliminación de Firestore en Cliente:**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica:**
    1. Cliente HTTP unificado [`web/src/services/apiClient.ts`](../web/src/services/apiClient.ts) implementado con inyección automática de Bearer Token de Firebase Auth, header multi-tenant `X-Negocio-Id`, tipado de errores (`ApiError`), control de tenant override y bus de eventos reactivo (`emitDataChange` / `onDataChange`).
    2. Refactorizados todos los servicios de dominio a Cloudflare D1 (`authService.ts`, `productService.ts`, `saleService.ts`, `creditService.ts`, `supplierService.ts`, `reportService.ts`, `stockAlertService.ts`, `whatsappService.ts`) manteniendo el modo mock para entornos de desarrollo y pruebas.
    3. Eliminada completamente la dependencia de `firebase/firestore` en el cliente (`firebase/config.ts`), logrando una reducción de **323.37 kB** en el bundle de producción (`firebase-vendor` pasó de 493.69 kB a 170.32 kB; 35.86 kB gzip).
    4. 100% de las pruebas unitarias en verde (33 suites, 282 tests aprobados en Vitest), build de producción (`npm run build:web`) sin advertencias ni errores y suite Playwright ejecutada.

- [x] **Tarea 3 — Rediseño de Navegación Administrativa (Patrón HoneyBook), Pasillos y Catálogo Táctil (Sinergia Rappi Aisles + Blinkit) y Configuración del Local (`/inventario` y `/configuracion`):**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica:**
    1. **Navegación HoneyBook:** Barra lateral oscura (`bg-sf-dark`) en [`AppShell.tsx`](../web/src/components/layout/AppShell.tsx) y [`navItems.ts`](../web/src/components/layout/navItems.ts) con cabecera de tienda ("SurtiFácil", estado "Tienda Abierta"), 6 subgrupos desplegables con chevrons (*Mostrador y Ventas*, *Cartera y Fiados*, *Catálogo y Bodega*, *Proveedores*, *Canales Vecinales*, *Configuración*), barra superior Desktop con botón hero `+ Nueva Venta` y menú emergente de perfil de cajero.
    2. **Explorador de Pasillos (Rappi Aisles):** Cuadrícula de 2 columnas en [`Inventory.tsx`](../web/src/components/Inventory.tsx) con pasillos oficiales de abastos (*Fruver*, *Panadería*, *Lácteos*, *Granos*, *Carnes*, *Snacks*, *Bebidas*, *Aseo*, *Cuidado Personal*) con conteo en vivo de productos y acceso instantáneo.
    3. **Catálogo Táctil en Mostrador (Blinkit):** Riel vertical izquierdo para navegación a un toque entre pasillos, cuadrícula táctil con badges de unidad (`libra`, `kilo`, `litro`, `cubeta`, `paquete`, `unidad`), precios en moneda colombiana con [`formatCOP`](../web/src/utils/currency.ts), badges de stock, switches de visibilidad (*Kiosco iPad*, *Tienda Web*, *En Oferta*) y **Edición Rápida en Línea (Quick Inline Edit)** de precio y stock.
    4. **Gestor de Combos y Kits de Mercado:** Módulo de combos y kits con cálculo de ahorro estimado, gestión de ítems y endpoints serverless `/api/combos` en Cloudflare Pages Functions y D1 (`combos` table).
    5. **Configuración del Negocio:** Nueva vista [`StoreSettings.tsx`](../web/src/components/StoreSettings.tsx) (ruta `#/settings`) con selector de barrios paisas, datos informativos de pago (Nequi / Bancolombia), estado de suscripción y cuota IA Sarin, e **Interruptores de Modalidades de Entrega** (*Habilitar Domicilios* con valor del envío en COP y *Habilitar Retiro en Tienda*), persistidos en `negocios.config_json` en D1.
    6. **100% de Pruebas en Verde:** 35 suites de prueba en Vitest (290 tests aprobados), build de producción sin errores y 8/8 pruebas E2E en Playwright aprobadas.

- [x] **Tarea 4 — Plataforma SaaS Multi-Tenant para Abastos en Medellín: Landing Comercial (Patrón Mobbin Food & Drink), Rediseño de Login, Planes, Registro de Locales (`/registro-negocio`) y Panel SuperAdmin (`/super-admin`):**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Convertir SurtiFácil en un SaaS comercializable para cientos de tiendas de barrio en Medellín, dotándolo de una landing page pública de alta conversión, login moderno con split-screen, control centralizado de suscripciones y cuotas de IA por tienda.
  - **Evidencia Técnica de Implementación:**
    1. **Landing Page Comercial (`LandingPage.tsx` en `#/landing`):** Construida siguiendo el patrón Food & Drink Home de Mobbin con hero de alto impacto (*"Moderniza tu mostrador de abastos, fiados y ventas en Medellín"*), CTAs directos (`[ Registrar mi Tienda Gratis ]` y `[ Ver Demostración en Vivo ]`), vitrina interactiva de pasillos Rappi con selector de categorías Blinkit, canasta de mercado interactiva con cálculo en vivo en `formatCOP` y selector visual de los 4 planes offline.
    2. **Rediseño de Login (`Login.tsx`):** Renovado con arquitectura split-screen (patrón Food & Drink Login en Mobbin). Panel izquierdo en desktop con identidad visual de abastos y viñetas de valor; panel derecho ergonómico con botón Google estilizado, campos con iconos, botón accesible para alternar visibilidad de clave (`👁️`), enlaces directos a captación (`#/registro-negocio`) y vitrina comercial (`#/landing`).
    3. **Definición de Planes y Modelos SaaS (`web/src/types/tenant.ts` y `tenantService.ts`):** Modelados los 4 planes SaaS offline (Prueba 3d $5.000 COP / 300 turnos IA, Semanal 7d $19.900 COP / 700 turnos IA, Quincenal 15d $34.900 COP / 1.500 turnos IA, Mensual 30d $59.900 COP / 3.000 turnos IA y Enterprise Insignia ilimitado) junto a la lista oficial de barrios y comunas de Medellín.
    4. **Página de Captación y Registro de Tiendas (`RegisterStore.tsx` en `#/registro-negocio`):** Formulario intuitivo con selector interactivo de planes, generación predictiva de slug para vitrina pública (`#/tienda/:slug`), selector de barrios del Valle de Aburrá y pantalla de bienvenida con resumen de credenciales y botón a WhatsApp.
    5. **Centro de Control SuperAdmin (`SuperAdminStores.tsx` en `#/super-admin`):** Panel exclusivo para `andres.san1404@gmail.com` con 4 KPIs de plataforma (Total Tiendas, Tiendas Activas, Recaudo Estimado Mensual en COP, Consumo Global Sarin IA), tabla de locales con filtros y búsqueda, botones de renovación rápida a 1 clic (`+3d`, `+7d`, `+15d`, `+30d`), suspensión/activación y función **"Operar esta tienda"** para gestionar catálogo y mostrador desde el header (`AppShell.tsx`).
    6. **Banner de Suscripción en Mostrador (`SubscriptionBanner.tsx`):** Integrado en el `Dashboard` mostrando plan activo, días restantes con alerta visual, consumo de Sarin IA con barra de progreso y botón directo para renovar por WhatsApp.
    7. **API Serverless en Cloudflare Pages Functions (`web/functions/api/[[route]].ts`):** Endpoints públicos `POST /api/registro-negocio` y privados `GET /api/super-admin/negocios`, `PUT /api/super-admin/negocios/:id`, `POST /api/super-admin/negocios/:id/renovar` con transacciones seguras y aislamiento multi-tenant.
    8. **100% de Pruebas en Verde:** 36 suites de Vitest (299 tests aprobados), build de producción impecable (`tsc && vite build`) y 10/10 pruebas E2E en Playwright aprobadas en navegadores desktop, mobile y tablet.

- [x] **Tarea 5 — Modo Kiosco Táctil / iPad Afuera del Local (`#/kiosco/:slug`) y Bandeja de Pedidos en Vivo en POS con Alerta Sonora:**
  - **Nivel Recomendado:** `Argon (Low)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica:**
    1. **Tabla y Endpoints Serverless en Cloudflare D1 y Pages Functions:** Endpoints públicos `GET /api/public/store/:slug`, `POST /api/customer-orders` y `GET /api/customer-orders/track/:token`, junto a los endpoints privados de mostrador `GET /api/customer-orders`, `PUT /api/customer-orders/:id/status` y `POST /api/customer-orders/:id/convert-to-sale` con cálculo autoritativo de precios en D1 y emisión de turnos correlativos (`#K-01`).
    2. **Vista Kiosco Táctil de Autoatención (`KioskMode.tsx` en `#/kiosco/:slug`):** Diseñada para iPad/tablets en la entrada del local con objetivos táctiles de `56×56 px`, soporte para `Fullscreen API`, sinergia Rappi Aisles (pasillos ilustrados) + Blinkit (productos táctiles de alto contraste con badges de unidad y precio en `formatCOP`), canasta persistente con controles `+`/`-`, checkout de 2 pasos sin fricción (Nombre del cliente + Efectivo / Transferencia / Fiado) y pantalla de **Turno Gigante** con cuenta regresiva de 15 segundos y reinicio automático.
    3. **Timbre Acústico de Mostrador (`audioAlerts.ts`):** Chime armónico de 2 notas sintetizado mediante la Web Audio API nativa (`playNewOrderChime`) sin dependencias externas, alertando al cajero cuando un cliente genera un turno en el iPad.
    4. **Bandeja de Pedidos en Vivo en POS (`LiveOrdersTray.tsx` y `CreateSale.tsx`):** Pestaña integrada en mostrador con sondeo continuo, visualización de pedidos entrantes de Kiosco/Web y botón de **1 clic: "Facturar y Despachar"** que ejecuta una transacción atómica en D1 descontando stock y emitiendo la venta oficial.
    5. **Integración en Navegación (`AppShell.tsx` y `App.tsx`):** Enlace directo al Modo Kiosco iPad en "Canales y Vecinos" y en el menú móvil, y enrutador hash dedicado para cargar el Kiosco en pantalla completa tanto para clientes sin sesión como para el staff.
    6. **100% de Pruebas en Verde:** 37 suites de Vitest (306 tests aprobados), build de producción impecable (`tsc && vite build`) y 11/11 pruebas E2E en Playwright aprobadas en navegadores desktop, mobile y tablet.

- [x] **Tarea 6 — Catálogo Web Vecinal por Negocio (`#/tienda/:slug`), Rastreo de Pedido en Vivo (`#/pedido/:token`) y Generador de Afiche QR Imprimible:**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica:**
    1. **Catálogo Web Vecinal (`PublicStorefront.tsx` en `#/tienda/:slug`):** Storefront público y responsive con cabecera personalizada del local (nombre, barrio, horario, WhatsApp y estado Abierto), chips de modalidades de entrega (*Domicilios en el barrio* con valor oficial en COP y *Retiro en tienda*), sinergia Rappi Aisles (selector de pasillos de abastos con emojis) + Blinkit (tarjetas táctiles de producto con badges de unidad, precios en `formatCOP` y badges de oferta), combos y kits de mercado con ahorro en COP, canasta flotante interactiva y drawer de checkout vecinal de 2 pasos sin fricción que genera el pedido autoritativo en D1 (`POST /api/customer-orders` con `source: 'web'`).
    2. **Rastreo de Pedido en Vivo (`OrderTracking.tsx` en `#/pedido/:token`):** Vista pública de seguimiento con barra de progreso visual de 4 etapas (*Recibido* ➔ *Alistando tu mercado* ➔ *En camino / Listo para entrega* ➔ *Entregado* o estado de cancelación), sondeo en vivo automático cada 10 segundos, resumen financiero detallado en `formatCOP` y botón directo de contacto con el tendero por WhatsApp con mensaje pre-redactado.
    3. **Generador Autónomo de QR y Afiches Imprimibles en Canvas (`qrCode.ts`, `qrPosterGenerator.ts` y `StoreQRCard.tsx`):** Codificador QR puro en TypeScript (modo Byte, ECC nivel M) sin dependencias externas, generador de afiches en Canvas a 1200×1600 px (formato póster de alta resolución) para *Tienda Vecinal* o *Modo Kiosco iPad*, descarga instantánea en PNG, impresión directa (`window.print`) e integración dentro de la configuración del negocio (`StoreSettings.tsx`) y menú de navegación lateral (`AppShell.tsx`).
    4. **100% de Pruebas en Verde:** 39 suites de prueba en Vitest (318 tests aprobados), build de producción impecable (`tsc && vite build`) y 12/12 pruebas activas de Playwright aprobadas en navegadores desktop, mobile y tablet.

- [x] **Tarea 7 — Integración de DeepSeek API y Bot Sarin Vecino para Pedidos Automáticos por WhatsApp y Chat Web:**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Motor de IA y Control Atómico de Cuota (`deepseekEngine.ts`):** Implementada integración con DeepSeek API (`https://api.deepseek.com/chat/completions`) compatible con el protocolo OpenAI Chat Completions, con soporte de *Function Calling* (`tools`), autenticación por secreto `DEEPSEEK_API_KEY`, verificación atómica y descuento transaccional de `cuota_ia_usada` en la tabla `negocios` de Cloudflare D1.
    2. **Orquestador Autónomo Sarin Vecino (`sarinCustomerOrchestrator.ts`):** Desarrollado orquestador con personalidad de tendero paisa de Medellín y 4 herramientas autoritativas sobre D1:
       - `consultar_catalogo_abastos`: Búsqueda de víveres, precios en COP, ofertas y combos disponibles en D1.
       - `modificar_canasta_pedido`: Gestión interactiva de la canasta temporal del vecino (`add`, `remove`, `set`, `clear`) validando inventario real en bodega.
       - `confirmar_pedido_cliente`: Lectura de modalidades activas (`permite_domicilio` y `permite_retiro`), solicitud de selección cuando ambas aplican, cálculo del valor de envío en `formatCOP` (`costo_domicilio_cents`), inserción autoritativa en `customer_orders` (`delivery_type: 'delivery' | 'pickup_counter'`), emisión de turno correlativo (`#W-01`) y generación de enlace de rastreo en vivo (`#/pedido/:token`).
       - `consultar_estado_o_escalar`: Consulta del estado en vivo de pedidos o transferencia al tendero con pausa temporal del bot (`handoff` por 2 horas).
       - **Motor de Reglas Resiliente:** Motor de fallback determinístico que garantiza funcionamiento ininterrumpido en entornos sin conexión a DeepSeek o pruebas locales.
    3. **Webhooks de WhatsApp y Endpoints Serverless en D1 (`web/functions/api/[[route]].ts`):**
       - `GET /api/webhooks/whatsapp`: Verificación HMAC y token challenge de Meta WhatsApp Cloud API (`hub.mode`, `hub.challenge`).
       - `POST /api/webhooks/whatsapp`: Recepción de mensajes entrantes, detección multi-tenant del local por teléfono y procesamiento con Sarin.
       - `GET /api/whatsapp/conversations` y `GET /api/whatsapp/conversations/:id/messages`: Bandeja y mensajes en vivo aislados por `negocio_id`.
       - `POST /api/whatsapp/conversations/:id/toggle-bot`: Alternancia de bot activo vs pausa para atención personal del tendero.
       - `POST /api/whatsapp/send`: Envío de mensajes de mostrador a clientes con soporte de contratos Meta.
       - `POST /api/whatsapp/simulate`: Simulador interactivo de pedidos con Sarin desde el panel administrativo.
       - `POST /api/ai/sarin-chat`: Endpoint público para el chat vecinal en tienda web.
    4. **Renovación de Vista Mostrador (`WhatsAppChat.tsx`):** Bandeja en vivo con indicadores de estado (*Bot Sarin Activo* / *Pausado por Tendero*), botón de alternancia rápida a 1 toque, visor de canasta en curso del cliente, y **Simulador Interactivo de Sarin** con presets rápidos (*"Consultar verduras y frutas"*, *"Pedir leche y arroz"*, *"Domicilio en Laureles"*), visualización en tiempo real de herramientas invocadas y link a turno generado.
    5. **100% de Pruebas en Verde:** 40 suites de prueba en Vitest (329 tests aprobados), build de producción impecable (`tsc && vite build`) y 15/15 pruebas activas de Playwright aprobadas en navegadores desktop, mobile y tablet.

- [x] **Tarea 8 — Bot Sarin Copiloto del Tendero: Voz Manos Libres en POS y Consultor Gerencial de Negocio con DeepSeek:**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Motor de Voz Manos Libres en POS (`sarinVoiceParser.ts` y `SarinVoicePOS.tsx`):**
       - Reconocimiento de voz continuo con palabra de activación **"Sarin"** (`Web Speech API` `es-CO`) y botón táctil de micrófono (`min-h-[44px]`).
       - Parser de lenguaje natural con soporte de modismos colombianos ("dos leches", "una libra de arroz", "pagan con 20 mil / 50 mil", "fiado a Don Carlos", "limpiar", "cobrar"), matching difuso contra catálogo y control de stock.
       - Cálculo autoritativo de totales, cálculo de **Vueltas en Tamaño Gigante** (`text-2xl font-black`), alerta de seguridad si el dinero recibido es insuficiente y **Doble Confirmación Didáctica** (síntesis de voz hablada `speakSarinResponse` + tarjeta visual de alto contraste con botones de *Aplicar a la Venta*, *Deshacer* y *Repetir por Voz*).
    2. **Orquestador Analítico y Endpoint Serverless en Cloudflare D1 (`sarinCopilotOrchestrator.ts` y `/api/ai/copilot`):**
       - Integración con DeepSeek API (`callDeepSeekChat` con function calling), verificación y descuento atómico de `cuota_ia_usada` en tabla `negocios` y fallback heurístico determinístico con tono paisa.
       - 4 herramientas analíticas de solo lectura sobre D1:
         * `consultar_ventas_y_ganancias`: ventas totales, costo, ganancia neta en COP y margen % por período (hoy, semana, mes).
         * `consultar_deudores_fiados`: ranking del top 5 de clientes deudores en libro de fiados con saldo en `formatCOP` y teléfonos.
         * `consultar_stock_critico`: productos bajo el mínimo o agotados con datos de proveedor.
         * `sugerir_orden_compra`: cantidades recomendadas de reposición e inversión estimada en COP.
    3. **Copiloto Gerencial Interactivo (`SarinBusinessCopilot.tsx`):**
       - Modal accesible desde la cabecera Desktop (`DesktopTopBar`), menú móvil (`MobileTopBar` y hoja "Más"), barra lateral (`Sidebar`) y tarjeta destacada en el `Dashboard`.
       - Chips de acceso rápido a 1 toque (*"Ventas y Ganancias de Hoy"*, *"Top Clientes en Fiados"*, *"Stock Crítico y Agotados"*, *"Lista Sugerida de Compra"*), chat interactivo con voz y texto, síntesis de voz (`🔊 Escuchar`) y tarjetas visuales ricas para cada herramienta ejecutada.
    4. **100% de Pruebas en Verde:** 42 suites de prueba en Vitest (343 tests aprobados), build de producción impecable (`tsc && vite build`) y 16/16 pruebas activas de Playwright aprobadas en navegadores desktop, mobile y tablet.

- [x] **Tarea 9 — Cierre de Caja con Arqueo Físico de Billetes/Monedas COP, Ticket Térmico (58mm/80mm) y Cobro Amigable de Fiados por WhatsApp:**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Módulo de Arqueo Físico COP y Cierre de Caja (`CashClosingModal.tsx` y tabla `cash_closings` en Cloudflare D1):**
       - Cuadrícula táctil con touch targets $\ge 44\times 44\text{ px}$ para las 11 denominaciones oficiales colombianas: 6 billetes (\$100k, \$50k, \$20k, \$10k, \$5k, \$2k) y 5 monedas (\$1k, \$500, \$200, \$100, \$50) con selectores rápidos y teclado numérico.
       - Comparador en tiempo real entre Efectivo Esperado (Base inicial + Ventas efectivo del turno + Abonos a fiados en efectivo) vs Efectivo Físico Contado.
       - Badges semánticos automáticos de estado: `Cuadrado` (diferencia $0), `Sobrante` (superávit) y `Faltante` (déficit).
       - Persistencia inmutable en tabla `cash_closings` de D1 con endpoints serverless autoritativos (`/api/cash-closings/summary`, `POST /api/cash-closings`, `GET /api/cash-closings`, `GET /api/cash-closings/:id`), emisión de Acta Oficial numerada y fallback en memoria.
       - Accesible desde la barra superior de `CreateSale.tsx` ("🔒 Arqueo / Cierre COP"), la vista `Sales.tsx`, el `Dashboard.tsx`, la barra lateral `Sidebar`, el menú de perfil desktop y la hoja móvil "Más".
    2. **Comprobante Térmico Digital (58mm / 80mm) y Exportación Excel CSV (`ThermalReceiptModal.tsx`, `receiptGenerator.ts`, `csvExporter.ts`):**
       - Modal de vista previa e impresión de tirilla térmica con selector de ancho (58 mm para impresoras portátiles bluetooth y 80 mm para impresoras de mostrador).
       - Reglas `@media print` en `web/src/index.css` que aíslan únicamente la tirilla de compra o de cierre, forzando modo monocromático y ocultando barras, botones y menús.
       - Botón directo para compartir el comprobante estructurado y estilizado con emojis por WhatsApp al cliente o al administrador.
       - Exportador a Excel (`.csv`) con prefijo UTF-8 BOM (`\uFEFF`) para compatibilidad nativa con Microsoft Excel en español y sanitización de inyección de fórmulas CSV.
    3. **Cobro Amigable de Fiados por WhatsApp (`Credits.tsx`):**
       - Botón táctil `📲` de 1 clic en la tabla de clientes deudores y tarjeta de cobro destacado en el detalle del cliente.
       - Generación automática de mensaje cordial y personalizado con el nombre del vecino, saldo total pendiente en `formatCOP`, lista de últimos movimientos (fiados y abonos) y datos bancarios para transferencias Nequi/Bancolombia.
    4. **100% de Pruebas en Verde:** 45 suites de prueba en Vitest (360 tests aprobados), compilación de producción impecable (`tsc && vite build`) y 16/16 pruebas activas de Playwright aprobadas en navegadores desktop, mobile y tablet.

- [x] **Tarea 10 — Modo Offline Resiliente en Mostrador (IndexedDB + Cola de Sincronización Multi-Tenant) y Suite E2E Completa con Playwright:**
  - **Nivel Recomendado:** `Argon (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Motor Offline Multi-Tenant sobre IndexedDB (`offlineSyncService.ts`):**
       - Base de datos local `surtifacil_offline_v1` sobre IndexedDB con espejo determinístico en memoria y aislamiento estricto por `negocio_id` en los almacenes `products_cache`, `customers_cache` y `sync_queue`.
       - Caché automático del catálogo de productos y clientes del libro de fiados al consultar en línea (`productService.ts`, `saleService.ts`, `creditService.ts`) para lectura instantánea sin conexión en el mostrador.
       - Descuento optimista de stock local en caché al registrar ventas sin red y actualización inmediata del saldo local del cliente al registrar ventas fiadas o abonos en modo offline.
       - Cola FIFO (`enqueueOfflineSale`, `enqueueOfflineCreditEntry`, `syncPendingQueue`) que reenvía secuencialmente las operaciones pendientes a `/api/sales` y `/api/credits/:customerId/entries` al recuperar conexión (`window.online`), con soporte de modo offline simulado (`setSimulatedOfflineMode`) para pruebas de contingencia en mostrador.
    2. **Banner Interactivo de Contingencia y Modal Inspector de Cola (`OfflineSyncBanner.tsx`, `AppShell.tsx`, `CreateSale.tsx`):**
       - Píldora de estado de red (`OfflineStatusPill`) integrada en la barra superior de `CreateSale.tsx` para conmutar o verificar el estado de red e inspeccionar la cola.
       - Banner global interactivo (`OfflineSyncBanner`) en `AppShell.tsx` que alerta al cajero cuando opera sin red o tiene operaciones en cola y ofrece sincronización manual a 1 toque (*"Sincronizar Ahora"*).
       - Modal de inspección de cola (`OfflineQueueModal`) con detalle de cada venta o abono pendiente, montos en `formatCOP`, estado de sincronización y descarte individual seguro.
    3. **Suite E2E de Certificación de Producción en Playwright (`qa/e2e/saas-production.spec.ts`):**
       - **Escenario 1:** Registro público multi-tenant de nueva tienda (`#/registro-negocio`), aprovisionamiento de credenciales y login de staff (`#/login`).
       - **Escenario 2:** Gestión de catálogo, creación de producto/combo en `#/inventory` y configuración de tienda con afiche QR en `#/settings`.
       - **Escenario 3:** Flujo completo de pedido en **Modo Kiosco iPad** (`#/kiosco/surtifacil`), generación de turno y facturación a 1 clic desde la bandeja en vivo del POS (`#/create-sale`).
       - **Escenario 4:** Flujo completo de **Tienda Vecinal** (`#/tienda/surtifacil`) y rastreo de pedido en tiempo real (`#/pedido/:token`).
       - **Escenario 5:** Venta en POS con **Sarin Voz Manos Libres**, **Copiloto Gerencial Sarin IA**, **Libro de Fiados** (`#/credits`), **Arqueo de Caja COP** (`CashClosingModal`) y **Panel SuperAdmin Multi-Tenant** (`#/super-admin`).
       - **Escenario 6:** Contingencia en **Modo Offline Resiliente** en POS (caché IndexedDB + encolado FIFO de venta offline + inspección en modal + reconexión y sincronización automática con el servidor).
    4. **100% de Pruebas en Verde:** 46 suites de prueba en Vitest (363 tests aprobados), compilación de producción impecable (`tsc && vite build`) y 22/22 pruebas activas de Playwright aprobadas (incluyendo los 6 escenarios integrales de `qa/e2e/saas-production.spec.ts` y las suites multi-dispositivo).

---

## Fase 2 — Certificación de Acceso Real en Producción y Pruebas Multi-Rol

- [x] **Tarea 11 — Auto-Migración de Esquema Multi-Tenant en Cloudflare D1 (`dbSchema.ts`) y Semillas Operativas en Producción:**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Migrador Idempotente de Esquema en Frío (`web/functions/_lib/dbSchema.ts`):**
       - Soluciona de raíz el error en producción `D1_ERROR: no such column: negocio_id` y `D1_ERROR: no such table: negocios` en `surtifacil-db` ejecutando automáticamente `ensureDatabaseSchema(env.DB)` antes de cada petición `/api/*` y dentro de `authenticateRequest`.
       - Crea todas las tablas multi-tenant (`negocios`, `users`, `suppliers`, `products`, `combos`, `credit_customers`, `credit_entries`, `sales`, `sale_items`, `purchase_orders`, `purchase_order_items`, `customer_orders`, `cash_closings`) y migra mediante `ALTER TABLE ... ADD COLUMN` cualquier tabla heredada de Fase 1 añadiendo `negocio_id`, `is_super_admin`, `password_hash`, `visible_kiosco`, `visible_tienda`, `en_oferta`, `precio_oferta_cents`, `last_cost_cents`, etc.
    2. **Semillas Oficiales de Producción (`INSERT OR IGNORE`):**
       - Tiendas activas (`surtifacil`, `abastos-la-80`), catálogo completo de abastos visible en Kiosco y Tienda Vecinal, combo `Combo Desayuno Paisa`, clientes de fiados (`Don Carlos Restrepo`, `Doña Marta Gómez`), proveedores y cuentas oficiales por rol (`andres.san1404@gmail.com`, `admin@surtifacil.com`, `gerente@surtifacil.com`, `cajero@surtifacil.com`, `ejemplo@mitienda.com`, `qa@surtifacil.com`).

- [x] **Tarea 12 — Autenticación Híbrida (Firebase + D1 Nativo `/api/auth/login`), Aprovisionamiento Google/Registro y Panel de Acceso Rápido Multi-Rol en `Login.tsx`:**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Endpoint de Login Nativo en Cloudflare D1 (`POST /api/auth/login` en `web/functions/api/[[route]].ts`):**
       - Verifica usuarios contra la tabla `users` en D1 mediante hash SHA-256 (`hashPassword` con Web Crypto API) para tiendas recién registradas y empleados creados desde `#/users`, además de habilitar el acceso de las cuentas semilla oficiales (`ejemplo@mitienda.com`, `admin@surtifacil.com`, `cajero@surtifacil.com`, `gerente@surtifacil.com`, `andres.san1404@gmail.com`).
       - Emite tokens de sesión (`d1:<uid>:<email>:<role>:<negocioId>`) validados por `verifyFirebaseIdToken` (`firebaseAuth.ts`) e inyectados automáticamente por `apiClient.ts` (`sf_auth_token`).
    2. **Auto-Aprovisionamiento en Login con Google y Entrada Directa tras Registro (`authMiddleware.ts` y `RegisterStore.tsx`):**
       - Cualquier usuario autenticado con Google o Firebase que ingrese por primera vez es auto-aprovisionado automáticamente en la tabla `users` de D1 sin ser rechazado.
       - Al registrar una nueva tienda en `#/registro-negocio`, se cifra su `password_hash` en D1, se siembran 3 productos iniciales en su catálogo y se habilita el botón **"🚀 Entrar directo a mi tienda ahora"** (`establishDirectSession`) para ingresar en 1 clic sin volver a digitar credenciales.
    3. **Panel de Acceso Rápido Multi-Rol en `Login.tsx` (`loginWithQuickRole`):**
       - Botones táctiles (`min-h-[44px]`) en `#/login` para ingresar en 1 clic como **🏪 Admin** (`admin@surtifacil.com`), **🛒 Cajero** (`cajero@surtifacil.com`), **📦 Gerente** (`gerente@surtifacil.com`), **👑 SuperAdmin** (`andres.san1404@gmail.com`), **🛍️ Vista Cliente Tienda** (`#/tienda/surtifacil`) y **📱 Vista Cliente Kiosco** (`#/kiosco/surtifacil`).

- [x] **Tarea 13 — Suite E2E de Certificación de Acceso Multi-Rol (`qa/e2e/access-roles.spec.ts`):**
  - **Nivel Recomendado:** `Argon (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Escenario 1:** Inicio de sesión por formulario en `#/login` con `ejemplo@mitienda.com` y verificación de carga del `Panel de Control`.
    2. **Escenario 2:** Acceso Rápido en 1 Clic para **Cajero**, **Gerente**, **Admin** y **SuperAdmin**, validando redirección a cada módulo y bloqueo RBAC (`Acceso restringido` para Cajero en `#/suppliers` y para Gerente en `#/employees`).
    3. **Escenario 3:** Registro de nueva tienda en `#/registro-negocio`, entrada directa en 1 clic (`🚀 Entrar directo a mi tienda ahora`), cierre de sesión y re-ingreso mediante correo y contraseña en `#/login`.
    4. **Escenario 4:** Acceso directo desde `#/login` como **Cliente** hacia **Tienda Vecinal** (`#/tienda/surtifacil`) y **Kiosco Táctil iPad** (`#/kiosco/surtifacil`) verificando catálogo en vivo.

---

## Fase 3 — Expansión Comercial, Auditoría DIAN y Certificación Total

- [x] **Tarea 14 — Notificaciones Push Web / PWA en Segundo Plano para Pedidos en Mostrador (`notificationService.ts`):**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Servicio Web Push & Audio Chime (`web/src/services/notificationService.ts`):**
       - Soporte nativo para Web Notification API con vibración `[200, 100, 200]`, icono oficial PWA y fallback acústico Web Audio API dual-tone (`playNewOrderChime`) a 880 Hz / 1174.6 Hz.
       - Disparo proactivo en la bandeja de pedidos en vivo (`LiveOrdersTray.tsx`) al recibir nuevos turnos de Kiosco o pedidos web vecinales.
       - Botón accesible en la cabecera del POS (`CreateSale.tsx`) para activar/desactivar alertas sonoras de mostrador (`aria-label="Alertas de mostrador activas"` / `"Activar alertas de mostrador"`).

- [x] **Tarea 15 — Centro de Integraciones y Auditoría de Secretos en Vivo (DeepSeek IA y WhatsApp Cloud API en `StoreSettings.tsx`):**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Endpoints de Auditoría Segura (`/api/integrations/status` y `/api/integrations/test-deepseek` en `web/functions/api/[[route]].ts`):**
       - Inspección en el Edge de variables de entorno (`DEEPSEEK_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`) sin filtrar valores sensibles.
       - Test en vivo con medición de latencia en milisegundos (`latency_ms`) y respuesta inmediata al frontend.
    2. **Panel de Gestión de Integraciones (`StoreSettings.tsx` Bloques 5 y 6):**
       - Diagnóstico de notificaciones push del navegador con botón de prueba en 1 clic ("🔔 Probar Alerta Ahora").
       - Tarjeta interactiva de DeepSeek IA con botón de prueba de conexión y tarjeta de WhatsApp Cloud API con URL de Webhook y botón de copiado rápido al portapapeles.

- [x] **Tarea 16 — Libro Fiscal de Registro Diario de Ventas (DIAN Colombia) y Exportación Contable en Excel CSV / PDF Imprimible:**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Agregador Fiscal Diario (`web/src/services/fiscalLedgerGenerator.ts`):**
       - Cumplimiento estricto del Artículo 616-1 del Estatuto Tributario para contribuyentes no responsables de IVA en Colombia.
       - Desglose día por día de ingresos brutos por medio de pago (**Efectivo**, **Transferencia Nequi/Bancolombia**, **Fiado**), conteo de transacciones, rango de comprobantes emitidos y total consolidado en COP.
       - Exportador a archivo CSV contable codificado con UTF-8 BOM para apertura perfecta en Microsoft Excel en español (`downloadFiscalLedgerCSV`).
    2. **Modal Interactivo de Consulta e Impresión (`FiscalLedgerModal.tsx` y `Reports.tsx`):**
       - Filtro dinámico de períodos (últimos 7 días, 15 días, 30 días, 60 días o año completo).
       - Tabla con pie de totales consolidados y botones táctiles de exportación a Excel e impresión limpia optimizada (`window.print()`).

- [x] **Tarea 17 — Suite E2E de Certificación de Fase 3 y Despliegue en Vivo:**
  - **Nivel Recomendado:** `Argon (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Pruebas Unitarias Vitest:** 49 archivos de prueba y 375 tests pasando al 100% (`notificationService.test.ts`, `fiscalLedgerGenerator.test.ts`, `integrationService.test.ts`, `apiFunctions.test.ts`).
    2. **Suite E2E Playwright:** 27 pruebas de producción pasando sin fallos (`saas-production.spec.ts` Escenario 7 certificando Libro Fiscal DIAN, alertas sonoras del POS y test de DeepSeek en vivo).
    3. **Compilación de Producción:** `npm run build:web` generado con éxito (4.98s) con PWA Service Worker activo.

---

## Fase 4 — Catálogo Fotográfico Ultra-Realista de Productos Colombianos y Gestión Móvil

- [x] **Tarea 18 — Banco de Empaques y Fotografías de la Canasta Familiar Colombiana + Componente `<ProductImage>` Reutilizable con Fallback y Lazy Loading:**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Estado:** ✅ Completada y Desplegada
  - **Evidencia Técnica de Implementación:**
    1. **Banco Vectorial de Empaques Colombianos Auténticos (`web/public/images/products/`):**
       - Ilustraciones de empaques ultra-realistas en formato SVG a 400×400 px con sombreado 3D y tipografía oficial: `leche-colanta-1l.svg`, `huevos-santa-reyes.svg`, `panela-dona-panela.svg`, `arepas-chocolo.svg`, `salchichon-zenu.svg`, `saltin-noel.svg`, además de `default-product.svg` como fallback oficial.
       - Actualizado `web/src/data/colombianCatalog.ts` con nuevos productos típicos, marcas, códigos EAN-13 oficiales y matching difuso predictivo por nombre y código de barras.
    2. **Componente Transversal `<ProductImage>` (`web/src/components/ui/ProductImage.tsx`):**
       - Carga diferida nativa (`loading="lazy"` y `decoding="async"`).
       - Resolución predictiva automática mediante `findColombianProductImage` cuando no se suministra URL o cuando falla la carga remota.
       - Detector de fallos (`onError`) de doble nivel que elimina por completo iconos de imágenes rotas en el navegador y renderiza un contenedor SVG estilizado.
       - Badge ergonómico y accesible de oferta (`"🔥 Oferta"` u `offerBadgeText` personalizado) con soporte semántico `aria-label`.
    3. **Integración Transversal en Todas las Vistas de Usuario y Mostrador:**
       - **Landing Page (`LandingPage.tsx`):** Canasta de mercado interactiva y vitrina con productos auténticos de marcas colombianas (Colanta, Santa Reyes, Diana, Doña Panela, Don Maíz, Sello Rojo, Zenú, Noel, Margarita, Ramo).
       - **Modo Kiosco iPad (`KioskMode.tsx`):** Tarjetas táctiles de combos del barrio, productos estándar de abastos y resumen de turno/canasta.
       - **Tienda Vecinal (`PublicStorefront.tsx`):** Catálogo web vecinal, combos de ahorro y drawer de checkout con soporte de fotos reales.
       - **Punto de Venta POS (`CreateSale.tsx`):** Vistas responsive de mostrador (móvil y escritorio) con fotos de empaques en lugar de emojis.
       - **Inventario y Menú (`Inventory.tsx` y `AddProductModal.tsx`):** Tabla de catálogo, cuadrícula táctil, combos y modales de edición/alta de productos con vista previa reactiva.
    4. **100% de Pruebas en Verde:**
       - 50 suites de Vitest y 386 tests aprobados al 100% (incluyendo nueva suite `productImage.test.tsx` con 11 tests).
       - Compilación de producción impecable (`npm run build:web` en 6.12s) con PWA y Service Worker activo.
       - Suite E2E de Playwright ejecutada con 27/27 pruebas activas en verde en navegadores desktop, mobile y tablet.

- [ ] **Tarea 19 — Carga Fotográfica desde el Celular y Compresor WebP en Navegador (`Inventory.tsx` y `AddProductModal.tsx`):**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Permitir al tendero tomar una foto de un producto en el mostrador directamente con la cámara de su celular (`capture="environment"`) o subir un archivo de imagen al crear o editar productos.
  - **Entregables:**
    1. Compresor de imagen en el cliente con Canvas HTML5 (redimensiona a máximo 800×800 px y comprime a WebP/JPEG < 120 KB en Base64 o URL).
    2. Vista previa instantánea con botón de eliminación o cambio de foto.
    3. Persistencia transparente en el campo `image_url` en Cloudflare D1.

---

## Fase 5 — Operaciones Avanzadas de Mostrador, Cobranza WhatsApp y Facturación Térmica

- [ ] **Tarea 20 — Teclado Táctil de Billetes COP y Calculadora Visual de Vueltas en POS (`CreateSale.tsx`):**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Agilizar el cobro en efectivo durante horas pico mediante botones rápidos de denominaciones colombianas (`[Exacto]`, `[$10.000]`, `[$20.000]`, `[$50.000]`, `[$100.000]`) y cálculo instantáneo en verde gigante de las "Vueltas a entregar".

- [ ] **Tarea 21 — Módulo de Cobranza Vecinal de Fiados por WhatsApp con Link Nequi/Bancolombia (`Credits.tsx`):**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Botón táctil `"📲 Cobrar por WhatsApp"` en cada cliente moroso del Libro de Fiados que genera un enlace click-to-chat con mensaje respetuoso paisa, saldo actualizado, fecha de vencimiento y datos de transferencia Nequi/Bancolombia de la tienda.

- [ ] **Tarea 22 — Tirilla Térmica de 58mm y 80mm para Impresoras POS y Código QR de Seguimiento:**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Formato CSS `@media print` de comprobante de venta y abono de fiado calibrado para impresoras térmicas de rollos de 58mm y 80mm (Bluetooth/USB) con QR de verificación vecinal y leyenda DIAN Art. 616-1.

- [ ] **Tarea 23 — Suite E2E de Certificación Total (Fases 4 y 5) y Despliegue en Vivo:**
  - **Nivel Recomendado:** `Argon (High)`
  - **Objetivo:** Pruebas unitarias de compresión y utilidades, suite E2E completa en Playwright cubriendo catálogo fotográfico, billetes COP, cobranza WhatsApp y tirilla térmica, finalizando con commit y despliegue automático a producción.





