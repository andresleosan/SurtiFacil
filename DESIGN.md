# SurtiFácil SaaS — Sistema de Diseño, Experiencia de Usuario y Estándares de Interfaz (`DESIGN.md`)

Este documento define las reglas visuales, ergonómicas, de accesibilidad, voz (Sarin Copiloto), modo Kiosco iPad y rendimiento para todas las interfaces de **SurtiFácil SaaS** (Plataforma Multi-Tenant para Tiendas de Barrio, Abastos y Minimercados en Medellín y Colombia: Punto de Venta POS, Panel Administrativo de Catálogo y Staff, Kiosco Táctil de Autoatención, Storefront Vecinal `/tienda/:slug`, Bandeja de WhatsApp y Panel SuperAdmin).

---

## 1. Identidad Visual y Dirección Estética (`/impeccable`, `/taste-skill`, `/redesign-skill`)

- **Personalidad de Marca:** Comercio vecinal moderno, ágil, confiable y cercano ("El motor digital de la tienda de barrio paisa"). Diseñado para operar a máxima velocidad bajo luz de día o iluminación de mostrador, sin fatiga visual y con cero fricción para tenderos, cajeros y clientes de todas las edades.
- **Paleta de Colores Oficial (`tailwind.config.cjs`):**
  - **Superficies Administrativas y POS (Alto Contraste Operativo):**
    - `bg-sf-light` (`#F4F6F8`) para fondos de área de trabajo limpia y luminosa.
    - `bg-white` (`#FFFFFF`) con bordes `border-slate-200` (`#E2E8F0`) y sombras sutiles para tarjetas operativas, tablas y modales.
    - `bg-sf-dark` (`#0D1B2A`) para navegación lateral, cabeceras de contraste, modo Kiosco nocturno y paneles ejecutivos.
  - **Acentos de Marca y Jerarquía Funcional:**
    - **Azul SurtiFácil (`sf-primary` `#1565C0` / hover `#0D47A1`):** Acciones primarias, navegación activa, escáner y controles principales.
    - **Cian Frescura (`sf-cyan` `#00BCD4`):** Indicadores de sincronización, filtros activos y acentos de tecnología/IA.
    - **Esmeralda Venta (`emerald-600` `#059669` / `emerald-500` `#10B981`):** Confirmación de cobro, abonos de fiados, WhatsApp activo, micrófono de Sarin escuchando y stock saludable.
    - **Ámbar Alerta / Fiado (`amber-500` `#F59E0B` / `amber-600` `#D97706`):** Saldos pendientes en libro de fiados, stock bajo mínimo, pedidos en preparación y modo offline activo.
  - **Semántica de Estados Operativos (`status`):**
    - Pedido Nuevo / Pendiente en Kiosco o WhatsApp: `#EAB308` (`yellow-500`)
    - Alistando Mercado / En Preparación: `#EA580C` (`orange-600`)
    - En Camino / Domicilio Barrio: `#0EA5E9` (`sky-500`)
    - Entregado / Venta Cerrada: `#16A34A` (`green-600`)
    - Error / Stock Agotado / Deuda Vencida: `#DC2626` (`red-600`)

---

## 2. Tipografía, Moneda Colombiana y Legibilidad en Mostrador

- **Tipografía Principal (`font-poppins`):** `Poppins` (`400`, `600`, `700`) con fallback a `system-ui, sans-serif`.
  - Encabezados, totales de caja, números de turno de Kiosco y vueltas a entregar siempre en `font-bold` con `tabular-nums` para alineación numérica perfecta.
- **Formato de Moneda (`formatCOP`):**
  - Todo valor monetario visible al usuario debe mostrarse en **Pesos Colombianos (`es-CO`, `$ 12.500`)** sin decimales innecesarios en pantalla, garantizando lectura instantánea para el tendero y el vecino.
  - Internamente en la base de datos Cloudflare D1, los montos se almacenan como enteros inmutables para evitar errores de punto flotante (`NaN` o desbordamientos).

---

## 3. Ergonomía en Punto de Venta (POS), Kiosco iPad y Copiloto Sarin

1. **Objetivos Táctiles (Touch Targets):**
   - **POS, Inventario y Panel Staff:** Área táctil mínima obligatoria de `44px × 44px` (`min-h-[44px]`, clase `.btn` / `.icon-btn`) en botones `+`, `-`, escáner, filtros de categorías y acciones de fila.
   - **Modo Kiosco / iPad Afuera del Local (`/kiosco/:slug`):** Área táctil ampliada de `56px × 56px` (`min-h-[56px]`), tarjetas de producto con imagen/ícono claro, precio en tamaño `text-xl font-bold`, buscador predictivo grande, categorías con íconos ilustrativos y reinicio automático de sesión tras emitir el número de turno.
2. **Copiloto Sarin (Voz en POS + IA con DeepSeek en WhatsApp y Gestión):**
   - **Operación Manos Libres en POS:** El tendero puede dictar ventas y consultas con la palabra de activación **"Sarin"** (ej. *"Sarin, agrega dos leches y una cubeta de huevos, pagan con 50 mil"* o *"Sarin, ¿cuánto me debe Doña Marta?"*).
   - **Doble Confirmación Didáctica:**
     - **Auditiva:** Síntesis de voz (`es-CO`) confirmando ítems agregados, total a cobrar y vueltas exactas.
     - **Visual:** Tarjeta flotante de alto contraste con la frase reconocida, el desglose y las **Vueltas a entregar** en tamaño gigante.
   - **Protección Financiera de Caja:** Jamás registrar una venta en efectivo si el monto recibido es menor al total oficial del catálogo (alerta visual y verbal indicando cuánto falta, o sugiriendo pasar el saldo restante a **Fiado**).

---

## 4. Arquitectura Multi-Tenant SaaS (Aislamiento por Tienda)

- **Identificador de Tienda (`negocio_id`):**
  - Toda tabla en Cloudflare D1 (`products`, `sales`, `sale_items`, `credit_customers`, `credit_entries`, `suppliers`, `purchase_orders`, `users`, `kiosk_orders`, `whatsapp_sessions`) lleva columna obligatoria `negocio_id` indexada.
  - Ninguna consulta o mutación en `web/functions/api/` puede ejecutarse sin filtrar explícitamente por el `negocio_id` validado del token del usuario o del `slug` público en rutas de tienda/kiosco.
- **Control de Catálogo / Menú por el Staff del Local:**
  - Desde el panel administrativo de cada negocio, el dueño o administrador gestiona su propio catálogo: crear/editar/pausar productos, subir imagen, asignar código de barras, definir precio de venta y costo, configurar alertas de stock mínimo, activar/desactivar visibilidad en el Kiosco iPad y Tienda Web (`visible_kiosco`, `visible_tienda`), y armar combos o promociones del barrio.

---

## 5. Accesibilidad, Seguridad Frontend y Anti-Slop (`/security-best-practices`, `/frontend-security-coder`, `/antislop`, `/web-performance-optimization`, `/ponytail`)

- **Accesibilidad Semántica:**
  - Todo botón con solo ícono requiere `aria-label` descriptivo con el nombre del producto o entidad (ej. `Aumentar cantidad de Arroz Diana 1kg`).
  - Filtros de categorías y pestañas de estado deben usar `type="button"` y `aria-pressed`.
  - Modales deben gestionar el foco, tener `role="dialog"`, `aria-modal="true"` y cerrarse con `Escape`.
  - Inputs en móvil deben tener `font-size: 16px` mínimo para evitar auto-zoom brusco en iOS/iPadOS.
- **Seguridad y Autoridad de Servidor (`/security-best-practices`, `/frontend-security-coder`):**
  - Los precios unitarios, subtotales, saldos de fiados y descuentos de stock se validan y calculan autoritativamente en el backend (**Cloudflare Pages Functions + D1**) dentro de transacciones atómicas (`db.batch([...])`).
  - Las claves privadas (`DEEPSEEK_API_KEY`, tokens de WhatsApp) viven exclusivamente como secretos de servidor en Cloudflare Pages/Workers; jamás en variables `VITE_*`.
  - Pagos 100 % controlados por el comercio (Efectivo, Transferencia Nequi/Bancolombia verificada por el tendero y Fiado autorizado); prohibido inyectar pasarelas de cobro engañosas o estados falsos.
- **Cero Slop Visual y de Código (`/antislop`, `/ponytail`):**
  - Prohibido ocultar errores de red o de base de datos tras listas vacías silenciosas: mostrar siempre estado explícito con mensaje claro y botón **Reintentar**.
  - Cero `any` injustificados, cero código muerto, cero `confirm()`/`alert()` nativos del navegador (usar siempre `ConfirmDialog` accesible).
- **Rendimiento Web (`/web-performance-optimization`):**
  - Carga diferida (`React.lazy` + `Suspense`) por ruta/módulo para mantener el bundle inicial ligero en celulares de gama media/baja y tablets de mostrador.
  - Consultas paginadas e indexadas en Cloudflare D1 sin descargas masivas innecesarias.

