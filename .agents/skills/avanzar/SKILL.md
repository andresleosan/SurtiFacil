---
name: avanzar
description: >-
  Avanza paso a paso con la siguiente tarea pendiente hacia producción en SurtiFácil SaaS.
  Activar siempre que el usuario escriba `/avanzar`, pida continuar con las tareas
  pendientes en una nueva sesión, o solicite planificar e implementar el siguiente paso
  de `docs/HOJA_DE_RUTA_PRODUCCION.md`.
---

# Skill `/avanzar` — Ciclo Completo de Planificación, Construcción Limpia, QA con Playwright y Despliegue a Producción

Cuando el usuario invoque `/avanzar` (o pida avanzar con las tareas pendientes en una nueva sesión), ejecuta estrictamente este protocolo de 5 fases en orden secuencial:

---

## Fase 1: Lectura de Contexto y Selección de la Siguiente Tarea Pendiente
1. Lee obligatoriamente estos tres archivos del repositorio antes de proponer o tocar código:
   - [`docs/HOJA_DE_RUTA_PRODUCCION.md`](../../../docs/HOJA_DE_RUTA_PRODUCCION.md): Identifica la **primera tarea marcada con `[ ]`** en la lista de tareas pendientes.
   - [`AGENTS.md`](../../../AGENTS.md): Verifica las reglas críticas de arquitectura y negocio (aislamiento multi-tenant por `negocio_id`, autoridad financiera en servidor, moneda `formatCOP` y TypeScript estricto).
   - [`DESIGN.md`](../../../DESIGN.md): Verifica los tokens visuales (`#1565C0`, `#0D1B2A`, `#F4F6F8`, `Poppins`, `formatCOP`), aislamiento multi-tenant por `negocio_id`, accesibilidad (`aria-label`, `aria-pressed`, objetivos táctiles de `44×44 px` en POS/Admin y `56×56 px` en Kiosco iPad) y ergonomía del Copiloto Sarin.

---

## Fase 2: Ideación y Planificación Rigurosa (`/brainstorming` + `/writing-plans` + `/grill-me`)
1. **Ideación (`/brainstorming`):** Analiza la tarea activa buscando la solución arquitectónica y de experiencia de usuario más intuitiva, veloz y ergonómica para el tendero de barrio en Medellín, su staff y sus clientes (en POS, Kiosco iPad, Tienda Vecinal y Bot Sarin con DeepSeek).
2. **Alineación (`/grill-me`):** Si existe alguna ambigüedad crítica de negocio que impida avanzar, resuélvela con preguntas puntuales; si los requisitos ya están claramente especificados en `docs/HOJA_DE_RUTA_PRODUCCION.md` y `DESIGN.md`, formula el plan ejecutable y avanza directamente a la construcción.
3. **Planificación (`/writing-plans`):** Estructura los archivos exactos a crear o editar (en `web/functions/` para Cloudflare D1/Pages Functions y en `web/src/` para React/Vite), los contratos de datos multi-tenant (`negocio_id`), las validaciones de seguridad y los casos de prueba, incorporando explícitamente las reglas de [`DESIGN.md`](../../../DESIGN.md).

---

## Fase 3: Construcción Impecable, Segura y Limpia (Primero Construir Todo)
Construye primero toda la funcionalidad de la tarea aplicando simultáneamente estos estándares de ingeniería:
1. **Diseño, Interfaz y Experiencia (`/impeccable`, `/taste-skill`, `/redesign-skill`):**
   - Cumple estrictamente [`DESIGN.md`](../../../DESIGN.md): jerarquía tipográfica clara (`tabular-nums`, `formatCOP`), objetivos táctiles mínimos (`44×44 px` general y `56×56 px` en Kiosco), retroalimentación visual inmediata y estados de carga/vacío/error explícitos con opción de **Reintentar**.
2. **Seguridad Backend y Frontend (`/security-best-practices`, `/frontend-security-coder`):**
   - **Aislamiento Multi-Tenant:** Toda consulta o escritura en Cloudflare D1 (`env.DB`) debe filtrar y validar obligatoriamente `negocio_id` con consultas parametrizadas (`prepare(...).bind(...)`) para prevenir inyección SQL y fugas entre comercios.
   - **Integridad Financiera:** Precios, subtotales, descuentos de stock y saldos de fiados se calculan en el servidor dentro de transacciones atómicas (`db.batch`). Prohibido aceptar montos negativos, `NaN` o cobros deficitarios.
   - **Gestión de Secretos:** Credenciales sensibles (`DEEPSEEK_API_KEY`, tokens de WhatsApp) residen exclusivamente en el entorno de Cloudflare Functions, nunca en `VITE_*` ni en el repositorio.
3. **Higiene de Código, Rendimiento y Anti-Slop (`/antislop`, `/web-performance-optimization`, `/ponytail`):**
   - Código limpio, modular, con tipado TypeScript estricto (`tsc` sin errores), cero `any` injustificados, cero código muerto y cero `alert()`/`confirm()` nativos.
   - Mantén carga diferida (`React.lazy` + `Suspense`) en vistas pesadas para proteger el tiempo de carga inicial en móviles y tablets.

---

## Fase 4: Verificación Integral con `/superpowers` + Pruebas E2E con MCP Playwright
Una vez finalizado por completo el ciclo de construcción de la tarea:
1. Ejecuta las validaciones de tipos, pruebas unitarias y build de producción:
   ```powershell
   npm test
   npm run build:web
   ```
2. Aplicando la disciplina de verificación de `/superpowers`, ejecuta las pruebas de extremo a extremo con **Playwright** (`npx playwright test --config=qa/playwright.config.ts` o mediante MCP Playwright / subagente navegador) verificando que todas las vistas, flujos interactivos y contratos de API de la tarea funcionen correctamente, sin errores de consola ni regresiones visuales.
3. Si alguna prueba falla, diagnostica la causa raíz, corrígela y repite la verificación hasta que el 100 % pase en verde.

---

## Fase 5: Actualización de Hoja de Ruta, Commit, Push y Despliegue a Producción
1. Marca la tarea completada como `[x]` en [`docs/HOJA_DE_RUTA_PRODUCCION.md`](../../../docs/HOJA_DE_RUTA_PRODUCCION.md) documentando brevemente la evidencia (archivos creados/modificados y conteo de pruebas en verde).
2. Revisa el estado de Git, haz commit de los cambios y sube a `origin/main` para disparar el despliegue automático en Cloudflare Pages (`https://surtifacil.pages.dev/`):
   ```powershell
   git -c safe.directory=E:/Proyectos/SurtiFacil status
   git -c safe.directory=E:/Proyectos/SurtiFacil add .
   git -c safe.directory=E:/Proyectos/SurtiFacil commit -m "feat: <descripción clara de la tarea completada>"
   git -c safe.directory=E:/Proyectos/SurtiFacil push origin main
   ```
   *(Usa `BypassSandbox: true` únicamente en el comando `git push` si el sandbox bloquea la salida de red).*
3. Finaliza tu respuesta confirmando el despliegue y diciéndole explícitamente al usuario:
   > **"✅ Todo quedó implementado, probado con Playwright y subido a producción en `https://surtifacil.pages.dev/`. Cuando revises, puedes escribir `/avanzar` para continuar con la siguiente tarea."**

