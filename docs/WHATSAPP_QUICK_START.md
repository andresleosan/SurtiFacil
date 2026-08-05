# 💬 WhatsApp Chatbot - SmartMarket Admin

## 🎯 Resumen Rápido

Se ha integrado un **chatbot de WhatsApp** completamente funcional en tu sistema SmartMarket Admin que te permite:

✅ **Recibir pedidos** directamente desde WhatsApp  
✅ **Extraer direcciones** de envío automáticamente  
✅ **Gestionar conversaciones** con clientes  
✅ **Confirmar órdenes** desde el panel de administración  
✅ **Responder mensajes** en tiempo real

---

## 📂 Archivos Creados

### **Frontend (React)**

- `web/src/components/WhatsAppChat.tsx` - Panel principal
- `web/src/services/whatsappService.ts` - Servicios Firestore
- `web/src/types/whatsapp.ts` - Tipos TypeScript
- `web/src/App.tsx` - _(Actualizado con nueva pestaña)_

### **Backend (Node.js)**

- `backend/whatsapp-webhook.js` - Servidor Express para webhooks

### **Documentación**

- `docs/WHATSAPP_README.md` - ⭐ **Comienza aquí**
- `docs/WHATSAPP_INTEGRATION.md` - Estrategia general
- `docs/WHATSAPP_IMPLEMENTATION.md` - Guía paso a paso
- `docs/WHATSAPP_ARCHITECTURE.md` - Diagramas y flujos
- `docs/WHATSAPP_BEST_PRACTICES.md` - Prácticas recomendadas
- `firestore.rules` - Reglas canonicas de seguridad Firebase

### **Configuración**

- `.env.example` - Variables de entorno
- `scripts/whatsapp-init.js` - Script de inicialización

---

## 🚀 Empezar en 5 Minutos

### **1️⃣ Ejecutar inicialización**

```bash
npm run whatsapp:init
```

### **2️⃣ Configurar variables de entorno**

```bash
cp .env.example .env
# Editar .env con credenciales de WhatsApp
```

### **3️⃣ Instalar dependencias del backend**

```bash
npm install express cors firebase-admin dotenv
```

### **4️⃣ Iniciar desarrollo**

```bash
# Terminal 1: Frontend
cd web
npm install
npm run dev

# Terminal 2: Backend
cd ..
node backend/whatsapp-webhook.js
```

### **5️⃣ Abrir en navegador**

```
http://localhost:5173
→ Nueva pestaña "💬 WhatsApp"
```

---

## 📋 Checklist de Configuración

- [ ] Obtener credenciales de WhatsApp Business API
- [ ] Configurar `WHATSAPP_APP_SECRET` con el App Secret de Meta
- [ ] Configurar archivo `.env`
- [ ] Descargar `serviceAccountKey.json` de Firebase
- [ ] Instalar dependencias del backend
- [ ] Ejecutar el servidor backend
- [ ] Configurar webhook en WhatsApp Dashboard
- [ ] Probar envío/recepción de mensajes
- [ ] Publicar reglas de Firestore

---

## 📚 Documentación (Recomendado)

| Documento                    | Para                         |
| ---------------------------- | ---------------------------- |
| `WHATSAPP_README.md`         | 📖 Resumen ejecutivo y flujo |
| `WHATSAPP_IMPLEMENTATION.md` | 🔧 Configuración paso a paso |
| `WHATSAPP_ARCHITECTURE.md`   | 📐 Entender la arquitectura  |
| `WHATSAPP_BEST_PRACTICES.md` | ⭐ Mejores prácticas         |

---

## 🎨 Interfaz de Usuario

### **Panel WhatsApp** (Nueva pestaña en navbar)

```
┌─────────────────────────────────────────────────────┐
│ 💬 SmartMarket Admin - WhatsApp Chat                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Conversaciones]  Chat del cliente  [Órdenes] 📦  │
│  ┌────────────────┐┌─────────────┐┌──────────────┐ │
│  │ Juan Pérez     ││ Chat activo ││ Orden #1    │ │
│  │ +549 123...    ││             ││ $50.00      │ │
│  │ Hace 2 min     ││ Hola,       ││ Pendiente   │ │
│  │                ││ ¿Tienes...? ││ [Confirmar] │ │
│  ├────────────────┤│             │└──────────────┘ │
│  │ María García   ││ 👤 Admin    ││ Orden #2    │ │
│  │ +549 456...    ││ Te lo       ││ $35.00      │ │
│  │ Hace 5 min     ││ envío hoy   ││ Confirmada  │ │
│  │                ││             ││             │ │
│  └────────────────┘└─────────────┘└──────────────┘ │
│                                                     │
│  [Escribir respuesta...]  [Enviar]                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Funcionamiento

```
1. Cliente envía por WhatsApp:
   "Quiero 2 kilos de manzanas, llevar a Calle 5 #123"

2. Sistema recibe y procesa:
   ✓ Detecta orden (palabras clave)
   ✓ Extrae productos y cantidades
   ✓ Extrae dirección de envío
   ✓ Guarda en Firestore

3. Admin ve en panel:
   → Nueva orden en tab "Órdenes Pendientes"
   → Datos: Cliente, productos, dirección

4. Admin confirma:
    → Click en "Confirmar Orden"
    → Se mueve a "Ventas"
    → El estado se actualiza en Firestore; la respuesta al cliente queda pendiente/manual

5. Cliente recibe:
   La confirmación debe enviarse manualmente desde el chat hasta implementar ese flujo.
```

---

## 🔐 Seguridad

- ✅ Verificación GET preservada con `WEBHOOK_VERIFY_TOKEN`
- ✅ Verificación POST `X-Hub-Signature-256: sha256=...` sobre el cuerpo HTTP exacto
- ✅ El POST rechaza con `401` si falta el App Secret, la firma es inválida o está malformada
- ✅ Límite fijo y acotado de 100 POST por IP cada 60 segundos; las entradas expiran y el mapa tiene máximo 10.000 entradas por proceso
- ✅ HTTPS para el transporte y controles de acceso de Firestore por usuario activo y rol
- ℹ️ Firestore cifra datos en reposo como servicio; no se declara cifrado adicional a nivel de aplicación
- ✅ Autenticación requerida para admins
- ✅ Rate limiting en API
- ✅ Tokens y secretos permanecen en el backend y no se exponen con prefijo `VITE_`

---

## 🔌 Integraciones

### **Requisitos**

- Firebase Firestore (almacenamiento)
- WhatsApp Business API (mensajes)
- Node.js + Express (servidor backend)
- React 18+ (frontend)

### **Conexiones configuradas**

- ✅ WhatsApp Business API → Backend
- ✅ Backend → Firebase Firestore
- ✅ Firebase → React Frontend
- ✅ React → Backend (envío de mensajes)

---

## 💡 Características Incluidas

### **Conversaciones**

- [x] Listar conversaciones activas
- [x] Historial de mensajes
- [x] Información del cliente
- [x] Última actividad
- [x] Archivar conversaciones

### **Mensajería**

- [x] Enviar mensajes
- [x] Recibir mensajes en tiempo real
- [x] Respuestas rápidas preconfiguradas
- [x] Confirmación de entrega

### **Órdenes**

- [x] Detectar órdenes automáticamente
- [x] Extraer productos y cantidades
- [x] Extraer dirección de envío
- [x] Crear órdenes pendientes
- [x] Confirmar órdenes
- [x] Ver historial de órdenes

---

## 🎯 Próximas Mejoras (Roadmap)

### **Fase 2: IA Avanzada**

- Integrar OpenAI para procesamiento natural del lenguaje
- Validación automática de productos contra inventario
- Cálculo inteligente de precios
- Disponibilidad en tiempo real

### **Fase 3: Experiencia Mejorada**

- Notificaciones en tiempo real (WebSockets)
- Estados de entrega (En camino, Entregado, etc.)
- Búsqueda en conversaciones
- Filtros y categorización

### **Fase 4: Pagos**

- Integración con Stripe/Mercado Pago
- Links de pago automáticos
- Confirmación de pago automática
- Recibos digitales

### **Fase 5: Analytics**

- Dashboard de estadísticas
- Reportes de ventas desde WhatsApp
- Análisis de conversación
- Predicción de demanda

---

## 🆘 Solucionar Problemas

### **Webhook no se conecta**

1. Verifica que el `WEBHOOK_VERIFY_TOKEN` sea correcto
2. Verifica que `WHATSAPP_APP_SECRET` sea el App Secret de la aplicación de Meta
3. Usa ngrok para probar localmente
4. Revisa los logs del servidor sin registrar cuerpos, firmas, teléfonos ni tokens

### **No recibo mensajes**

1. Confirma que el webhook esté activo en WhatsApp Dashboard
2. Verifica que Firestore collections existan
3. Revisa la consola del navegador

### **Las órdenes no se crean**

1. Revisa que el mensaje contenga palabras clave ("quiero", "dame", etc.)
2. Verifica que se extraiga correctamente la información
3. Consulta el procesamiento de regex

---

## 📞 Recursos y Links

- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Node.js/Express](https://expressjs.com/)
- [OpenAI API](https://openai.com/api/)
- [Meta Developer](https://developers.facebook.com/)

---

## 📝 Notas Importantes

1. **Production**: Antes de una release operativa, verifica:
   - Autenticación de usuarios y autorización por rol
   - Rate limiting
   - Backups automáticos
   - Monitoreo y alertas
    - SSL/HTTPS
    - Despliegue separado de `backend/whatsapp-webhook.js`, health check `/api/health` y plan de rollback

   El backend actual ya exige `WHATSAPP_APP_SECRET` y la firma HMAC de Meta para cada POST. El límite de webhook es local al proceso; una instalación con varias réplicas necesita almacenamiento compartido antes de considerarse lista para producción.

2. **Costos**: Considera:
   - Firebase (almacenamiento y transacciones)
   - WhatsApp API (por mensaje)
   - Servidor (hosting)
   - OpenAI (si usas IA)

3. **Seguridad**: Mantén:
   - Credenciales en `.env` (nunca en git)
   - Firestore rules actualizadas
   - Rutas WhatsApp protegidas con Firebase ID tokens y roles activos
   - API keys reservadas para integraciones backend-to-backend
   - Logs de auditoría

---

## ✨ ¡Listo para empezar!

```bash
npm run whatsapp:init
npm run dev:all
```

Luego accede a `http://localhost:5173`; la pestaña "💬 WhatsApp" solo aparece para administradores y gerentes.

---

**Creado**: 2024  
**Stack**: React + TypeScript + Firebase + Express + WhatsApp API  
**Status**: Funcional; requiere despliegue, configuración de producción y QA operativo final antes de una release
