# 🛒 SurtiFácil Admin

## Sistema Web para la Administración de Supermercados

### 📌 Descripción General

SurtiFácil Admin es una aplicación web diseñada para facilitar la gestión integral de un supermercado o tienda de barrio. Su objetivo es centralizar procesos clave como el control de inventario, registro de ventas, administración de empleados y análisis de datos, permitiendo optimizar el tiempo, reducir errores y mejorar la toma de decisiones.

---

### 🎯 Objetivo

Desarrollar una plataforma intuitiva y eficiente que permita a los dueños o administradores de supermercados controlar su negocio en tiempo real desde cualquier dispositivo.

---

### 🔧 Funcionalidades Principales

#### 📦 Gestión de Inventario

- Registrar, editar y eliminar productos fácilmente.
- Control de stock en tiempo real.
- Alertas automáticas cuando un producto está por agotarse.
- Organización por categorías (alimentos, bebidas, aseo, etc.).

#### 💰 Sistema de Ventas (POS)

- Registro de ventas rápido y sencillo.
- Selección de productos y cálculo automático de totales.
- Registro de método de pago.
- (Opcional) integración de lector de códigos de barras.

#### 📊 Panel de Control (Dashboard)

- Ventas diarias, semanales, mensuales.
- Productos más vendidos.
- Ingresos totales.
- Gráficas estadísticas para análisis del negocio.

#### 👨‍💼 Gestión de Empleados

- Creación de usuarios con roles (administrador, cajero, etc.).
- Control de acceso y registro de actividad por usuario.

#### 🚚 Gestión de Proveedores

- Registro de proveedores.
- Gestión de pedidos.
- Historial de compras.

#### 🧠 Funciones Inteligentes (Opcional)

- Predicción de productos con baja rotación o próximos a agotarse.
- Recomendaciones de compra basadas en ventas.
- Análisis de comportamiento del negocio.

---

### 🖥️ Tecnologías Sugeridas

- Frontend: React, TypeScript, CSS o Tailwind.
- Backend: Node.js con Express o Firebase.
- Base de datos: MongoDB o PostgreSQL.

---

### 🧱 Estructura del Sistema

- Inicio de sesión (Login)
- Dashboard principal
- Inventario
- Ventas
- Reportes
- Configuración

---

### 📊 Ejemplo de Datos

Producto:

- Nombre: Arroz
- Precio: 2500
- Stock: 20 unidades
- Categoría: Granos

---

### 🚀 Valor Diferencial

- Acceso desde cualquier dispositivo
- Interfaz amigable y moderna
- Posible PWA (aplicación web progresiva)
- Notificaciones en tiempo real

---

### 💡 Proyección

El proyecto puede evolucionar a un modelo SaaS, permitiendo a múltiples tiendas usar la plataforma con un esquema de suscripción.

---

## Estado actual de implementación

- ✅ Scaffold básico creado
- ✅ Scripts seed (`scripts/seedRoles.js`, `scripts/seedProducts.js`)
- ✅ Orquestador (`run-all.ps1`)
- ✅ Web mínima (`web/index.html`, `web/package.json`)
- ✅ Instrucciones de uso (`docs/run_instructions.md`)

---

## Cómo ejecutar (rápido)

1. `cd S:\Respaldo\UPB\Proyecto`
2. `node -v` y `npm -v`
3. `powershell -ExecutionPolicy Bypass -File .\run-all.ps1 -ServiceAccountPath 'C:\ruta\a\serviceAccountKey.json'` (o sin `-ServiceAccountPath` si no hay Firebase)
4. `cd web` y `npm run start`
5. Abrir `http://localhost:5173`.
