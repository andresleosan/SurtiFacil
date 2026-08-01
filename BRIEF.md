# BRIEF.md - SurtiFácil Admin

## Estado Actual
**Fase**: v1.3 Reposición Predictiva ✅ COMPLETADA (2026-07-31)
**Core Features**: Dashboard, Inventario, Ventas, WhatsApp, Empleados, Reportes, Proveedores, Órdenes de Compra con recepción automática, Márgenes, Reposición Predictiva

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
| 7 | **Multi-tenant/SaaS** | 2 | 2 | 2 | 1 | **1.75** | ❌ Descartado v1.x |

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
Q4 2026       → Evaluar SaaS / v2.0
```

---

*Documento generado por Cronos - v1.3 Reposición Predictiva Completada*
