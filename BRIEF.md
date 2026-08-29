# BRIEF.md - SurtiFácil Admin

## Estado Actual
**Fase**: v2.0 Barcode Scanner + PWA ✅ COMPLETADA (2026-07-31)
**Core Features**: Dashboard, Inventario, Ventas, WhatsApp, Empleados, Reportes, Proveedores, Órdenes de Compra con recepción automática, Márgenes, Reposición Predictiva, Escáner de Códigos de Barras, PWA (instalable + offline)

---

## Análisis de Features Pendientes

### Preguntas Obligatorias (Product Strategy)

| Feature | ¿Quién sufre sin esto? | ¿Qué pasa si no se construye en 3 meses? | ¿Mueve métrica real? |
|---------|-------------------------|------------------------------------------|----------------------|
| **Gestión de Empleados** | Dueño que no puede delegar ventas | No puede escalar operación, todo pasa por él | Sí: reduce carga operativa del dueño |
| **Gestión de Proveedores** | Dueño que compra sin historial | Pierde poder de negociación, compra por intuición | Sí: reduce costos de compra 10-15% |
| **Reportes/Analytics** | Dueño que toma decisiones a ciegas | Sigue sin visibilidad del negocio | Moderado: útil pero no crítico aún |
| **Alertas Stock Bajo** | Cajero que vende sin stock | Pierde ventas por productos agotados | Sí: evita pérdida de ventas |

---

## Backlog Priorizado (RICE Simplificado)

| # | Feature | Alcance | Impacto | Confianza | Esfuerzo | **Score** | Decisión |
|---|---------|---------|---------|-----------|----------|-----------|----------|
| 1 | **Alertas Stock Bajo** | 5 | 5 | 5 | 4 | **4.75** | ✅ MVP v1.0 |
| 2 | **Gestión de Empleados** | 4 | 4 | 4 | 3 | **3.75** | ✅ MVP v1.0 |
| 3 | **Reportes Básicos** | 3 | 3 | 4 | 4 | **3.50** | ✅ MVP v1.0 |
| 4 | **Gestión de Proveedores** | 3 | 4 | 3 | 2 | **3.00** | ✅ v1.1 |
| 5 | **Analytics Avanzados (Margen)** | 2 | 3 | 3 | 2 | **2.50** | ✅ v1.2 |
| 6 | **Reposición Predictiva** | 3 | 4 | 3 | 2 | **3.00** | ✅ v1.3 COMPLETADO |
| 7 | **Barcode Scanner + PWA** | 3 | 4 | 3 | 2 | **3.00** | ✅ v2.0 COMPLETADO |
| 8 | **Multi-tenant/SaaS** | 2 | 2 | 2 | 1 | **1.75** | ❌ Descartado v1.x |

---

## Definición MVP v1.0

### Features Incluidos
1. **Alertas de Stock Bajo** - Notificaciones cuando producto < umbral mínimo
2. **Gestión de Empleados** - CRUD usuarios con roles (admin, cajero)
3. **Reportes Básicos** - Ventas diarias/semanales, top productos

### Features NO Incluidos (v1.0)
| Feature | Razón de Descarte |
|---------|-------------------|
| Gestión de Proveedores | Requiere integración con sistemas externos, complejidad alta |
| Analytics Avanzados | Los reportes básicos cubren el 80% del valor |
| Multi-tenant | Prematuro, primer validar con un solo usuario |

---

## Métricas de Éxito v1.0

| Métrica | Target | Cómo medir |
|---------|--------|------------|
| Uso diario activo | > 5 días/semana | Firebase Analytics |
| Tiempo carga inventario | < 2s | Performance audit |
| Errores/venta | < 1% | Logs backend |
| WhatsApp Conversion | > 30% pedidos → ventas | Firestore tracking |

---

## Roadmap Recomendado

```
Jul-Ago 2026  → MVP v1.0 (Alertas + Empleados + Reportes) ✅
Sep 2026      → v1.1 (Proveedores) ✅
Oct 2026      → v1.2 (Analytics de Margen) ✅
Nov 2026      → v1.3 (Reposición Predictiva) ✅
Q4 2026       → v2.0 (Barcode Scanner + PWA) ✅
Q1 2027       → Evaluar SaaS / Multi-tenant
```

---

*Documento generado por Cronos - v2.0 Barcode Scanner + PWA Completada*

---

## Revalidacion de producto y release - 2026-08-28

La prioridad actual ya no es ampliar funcionalidades. El usuario que mas sufre hoy es el operador
del negocio: el frontend publicado no tiene un backend HTTPS de produccion completo y algunos
calculos financieros, permisos e integraciones todavia no preservan contratos historicos o
operativos suficientemente fuertes.

Si esto no se corrige en tres meses, aumenta el riesgo de margenes historicos cambiantes, accesos
inconsistentes, webhooks duplicados, costos de lecturas crecientes y una release que aparenta estar
publicada pero no funciona de punta a punta. Estas mejoras mueven metricas reales: errores por venta,
exactitud de margen, disponibilidad, costo por operacion e incidentes de acceso.

### Backlog de estabilizacion priorizado

El score usa RICE simplificado, donde 5 en esfuerzo significa menor esfuerzo. Los gates de
seguridad, integridad financiera y release prevalecen sobre el orden numerico cuando exista empate.

| # | Iniciativa | Alcance | Impacto | Confianza | Esfuerzo | Score | Decision |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Backend staging free-tier-first y configuracion de release | 5 | 5 | 5 | 3 | 4.50 | RC obligatoria |
| 2 | Autorizacion, ciclo de vida de usuarios y privacidad PWA | 5 | 5 | 5 | 3 | 4.50 | RC obligatoria |
| 3 | Integridad historica de costos, categorias y actor de venta | 4 | 5 | 5 | 2 | 4.00 | RC obligatoria por datos financieros |
| 4 | QA/CI reproducible, E2E autenticado y contratos | 5 | 4 | 5 | 2 | 4.00 | RC obligatoria |
| 5 | Rendimiento y costo de consultas Firestore | 5 | 4 | 5 | 2 | 4.00 | Antes de produccion |
| 6 | Exactitud de reportes y documentacion | 3 | 4 | 5 | 4 | 4.00 | Antes de produccion |
| 7 | Idempotencia y resiliencia de WhatsApp | 3 | 5 | 5 | 2 | 3.75 | Antes de trafico real |
| 8 | Dependencias y tooling reproducible | 3 | 3 | 5 | 3 | 3.50 | Endurecimiento de release |
| 9 | Multi-tenant, microservicios y nuevas funciones predictivas | 2 | 2 | 2 | 1 | 1.75 | Pospuesto |

### Roadmap actualizado

```text
RC0 - Fundacion de staging, objetivo USD 0
  - Backend preparado para ADC y contenedor reproducible
  - Build fail-closed si produccion contiene localhost
  - Modelo de IA vigente, configurable y deshabilitable

RC1 - Integridad y seguridad operacional
  - Snapshot financiero inmutable por venta
  - RBAC coherente, ciclo de vida Auth/Firestore y privacidad PWA
  - Idempotencia de webhooks y mensajes salientes

RC2 - Evidencia y eficiencia
  - CI, cobertura, E2E autenticado, contratos y carga
  - Consultas acotadas, paginacion/agregados y baseline de rendimiento/costo
  - Reportes y documentacion alineados con el comportamiento real

Produccion
  - Staging completo aprobado
  - Backup/rollback verificados
  - Confirmacion explicita separada del operador

Post-release
  - Evaluar SaaS/multi-tenant, microservicios y nuevas funciones predictivas
```

No se asignan fechas comprometidas hasta medir Task 17 y Task 18. La primera version desplegable
es la release candidate que complete RC0-RC2; no se considera MVP nuevo agregar mas features.
