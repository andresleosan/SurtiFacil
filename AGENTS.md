# SurtiFácil SaaS — Instrucciones para Agentes de Desarrollo

Guía de arquitectura, estándares de desarrollo y comandos operativos para el proyecto **SurtiFácil SaaS** (Plataforma Multi-Tenant para Tiendas de Barrio, Locales de Abastos y Minimercados en Medellín y Colombia).

---

## 1. Visión General del Proyecto

**SurtiFácil SaaS** es una plataforma integral de Punto de Venta (POS), Kiosco Táctil de Autoatención para iPad/Tablet (`#/kiosco/:slug`), Catálogo Público Vecinal (`#/tienda/:slug`), Gestión de Domicilios, Control de Inventario con Escáner de Códigos de Barras, Libro Digital de Fiados, Órdenes a Proveedores, Cierres de Caja con Arqueo COP y Asistente Inteligente **Sarin** (Voz en POS + Pedidos y Gestión con **DeepSeek API** por WhatsApp), diseñada con arquitectura **multi-tenant** sobre **Cloudflare Pages + Cloudflare D1 + Firebase Authentication**.

---

## 2. Stack Tecnológico

- **Frontend (`web/`):**
  - React 18 (`react`, `react-dom`)
  - Vite 6
  - TypeScript (modo estricto)
  - Tailwind CSS + Autoprefixer + PostCSS
  - Recharts (gráficos y métricas de ventas y márgenes)
  - `html5-qrcode` (escáner de códigos de barras EAN-13 / UPC / QR)
  - `vite-plugin-pwa` + Workbox (PWA instalable y soporte offline)
- **Backend & Base de Datos Serverless (Cloudflare):**
  - **Cloudflare Pages:** Hosting global en `https://surtifacil.pages.dev`
  - **Cloudflare Pages Functions (`web/functions/api/`):** API REST serverless en el mismo origen
  - **Cloudflare D1 (`surtifacil-db`):** Base de datos SQLite relacional en el Edge (`env.DB`)
- **Autenticación:**
  - **Firebase Authentication (`surtifacilapp`):** Inicio de sesión con Correo/Contraseña y Google, emitiendo ID Tokens (JWT RS256) verificados por el backend en Cloudflare
- **Inteligencia Artificial (Bot Sarin):**
  - **DeepSeek API (`deepseek-chat`):** Orquestación de pedidos por WhatsApp/Web y Copiloto Gerencial del tendero
  - **Web Speech API (`es-CO`):** Reconocimiento y síntesis de voz manos libres en el POS
- **Testing & QA:**
  - Vitest + Testing Library (`npm test`)
  - Playwright E2E (`npm run test:e2e`)

---

## 3. Comandos Principales

```powershell
# Desarrollo local frontend
npm run start:web

# Compilación de producción (tsc && vite build)
npm run build:web

# Pruebas unitarias (Vitest)
npm test

# Pruebas End-to-End (Playwright)
npm run test:e2e
```

---

## 4. Estructura del Repositorio

```text
├── web/
│   ├── functions/          # Cloudflare Pages Functions (API Serverless /api/* conectada a env.DB)
│   ├── public/             # Assets públicos, iconos PWA, manifest.json y _redirects
│   └── src/
│       ├── auth/           # Contexto de usuario autenticado y control de acceso por rol
│       ├── components/     # Vistas y modales (POS, Inventario, Fiados, Kiosco, Tienda, Sarin, etc.)
│       ├── config/         # Validaciones de entorno y configuración de compilación
│       ├── firebase/       # Inicialización de Firebase Auth y contratos de tipos
│       ├── hooks/          # Custom hooks reactivos
│       ├── services/       # Clientes de API hacia Cloudflare D1 y servicios de dominio
│       └── test/           # Suites de pruebas unitarias en Vitest
├── docs/
│   ├── HOJA_DE_RUTA_PRODUCCION.md # Fuente de verdad secuencial para el comando /avanzar
│   └── schema-d1.sql              # Esquema relacional multi-tenant de Cloudflare D1
├── qa/                     # Configuración y suites E2E de Playwright
├── DESIGN.md               # Sistema de diseño, ergonomía táctil, voz Sarin y reglas UI/UX
└── AGENTS.md               # Este archivo de instrucciones del proyecto
```

---

## 5. Reglas Críticas de Arquitectura y Negocio

### 5.1 Aislamiento Multi-Tenant (`negocio_id`)
- Toda tabla operativa en Cloudflare D1 (`products`, `sales`, `sale_items`, `credit_customers`, `credit_entries`, `suppliers`, `purchase_orders`, `customer_orders`, `users`) está estrictamente aislada por `negocio_id`.
- Ninguna consulta o escritura en `web/functions/api/` puede ejecutarse sin filtrar por el `negocio_id` validado del usuario autenticado o del `slug` público del local.

### 5.2 Autoridad Financiera en Servidor y Moneda Colombiana (`formatCOP`)
- Todos los valores monetarios se muestran en Pesos Colombianos (`formatCOP`, ej. `$ 12.500`) y se almacenan como enteros inmutables.
- El cálculo de totales de venta, descuentos de stock, márgenes y saldos en el libro de fiados es responsabilidad exclusiva del servidor en transacciones atómicas de Cloudflare D1.
- El sistema opera con medios de pago controlados por el tendero (**Efectivo**, **Transferencia Nequi/Bancolombia** y **Fiado**); no inyectar pasarelas de cobro externas no autorizadas.

### 5.3 Control de Roles y Staff por Tienda
- Roles operativos por negocio: `admin` (dueño/administrador del local, gestiona catálogo completo, precios, empleados y configuración), `manager` (inventario, compras y reportes) y `cashier` (POS, recepción de pedidos de Kiosco/WhatsApp y abonos de fiados).
- SuperAdmin de la plataforma SaaS (`andres.san1404@gmail.com`): acceso exclusivo al Centro de Control Multi-Tenant (`#/super-admin`) para activar locales, gestionar planes y auditar cuotas de IA de DeepSeek.

---

## 6. Flujo de Trabajo con `/avanzar`

1. La fuente de verdad del progreso entre sesiones es [`docs/HOJA_DE_RUTA_PRODUCCION.md`](docs/HOJA_DE_RUTA_PRODUCCION.md).
2. Todo diseño de interfaz e interacción debe cumplir estrictamente [`DESIGN.md`](DESIGN.md).
3. Ninguna tarea se da por terminada sin compilar sin errores (`npm run build:web`), pasar las pruebas (`npm test` + Playwright) y subir los cambios con `git commit` y `git push` para su despliegue automático en `https://surtifacil.pages.dev/`.
