# 📐 Arquitectura de Integración WhatsApp

## Diagrama de Flujo General

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE FINAL                             │
│                     📱 WhatsApp (Cliente)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Envía mensaje
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    WhatsApp Business API                         │
│                  (API de Meta/Facebook)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Webhook POST
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              🖥️ BACKEND (Node.js/Express)                       │
│              backend/whatsapp-webhook.js                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Recibe webhook de WhatsApp                              │ │
│  │ • Valida firma del mensaje                                │ │
│  │ • Guarda en Firestore                                     │ │
│  │ • Procesa orden (detección de productos)                  │ │
│  │ • Envía respuesta automática (opcional)                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Read/Write
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│            🗄️ FIREBASE FIRESTORE (Base de Datos)               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Collections:                                               │ │
│  │ • whatsapp_conversations (Chats activos)                  │ │
│  │ • whatsapp_messages (Historial)                           │ │
│  │ • whatsapp_orders (Órdenes procesadas)                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Query/Listen
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│           💻 FRONTEND (React + TypeScript)                      │
│           web/src/components/WhatsAppChat.tsx                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Panel de Administración:                                   │ │
│  │ • [Conversaciones] | [Chat Activo] | [Órdenes Pendientes]│ │
│  │ • Responder mensajes                                       │ │
│  │ • Confirmar órdenes                                        │ │
│  │ • Ver historial completo                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Respuesta admin
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│           🖥️ BACKEND (Envío de respuesta)                       │
│         POST /api/whatsapp/send                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Send message
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    WhatsApp Business API                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Envía mensaje
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   📱 Cliente recibe respuesta                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Componentes Detallados

### Frontend Components

```
App.tsx (Principal)
├── Dashboard.tsx
├── Inventory.tsx
├── Sales.tsx
├── CreateSale.tsx
└── WhatsAppChat.tsx ⭐ NUEVO
    ├── Conversaciones Panel (Izquierda)
    │   ├── Lista de chats
    │   ├── Información del cliente
    │   └── Última actividad
    ├── Chat Panel (Centro)
    │   ├── Header con datos del cliente
    │   ├── Área de mensajes
    │   ├── Quick responses
    │   └── Input de mensaje
    └── Órdenes Panel (Derecha)
        ├── Tab: Chats Activos
        └── Tab: Órdenes Pendientes
```

### Services

```
services/
├── mockData.ts
├── saleService.ts
└── whatsappService.ts ⭐ NUEVO
    ├── getConversations()
    ├── getMessages()
    ├── sendMessage()
    ├── getWhatsAppOrders()
    ├── createWhatsAppOrder()
    ├── updateOrderStatus()
    ├── processMessageForOrder()
    └── archiveConversation()
```

### Types

```
types/
├── whatsapp.ts ⭐ NUEVO
    ├── WhatsAppConversation
    ├── WhatsAppMessage
    ├── WhatsAppOrder
    ├── WhatsAppOrderItem
    └── ProcessedMessageData
```

---

## Flujo de Procesamiento de Órdenes

```
Cliente: "Quiero 2 kilos de arroz y 1 litro de leche, enviar a Calle 5 #123"
                                    │
                                    ↓
                        processMessageForOrder()
                                    │
        ┌──────────────┬───────────┴───────────┬──────────────┐
        ↓              ↓                         ↓              ↓
    Detecta      Extrae productos         Extrae dirección   Costo total
    orden: ✓     │                           │                  │
                 ├─ 2 x "de arroz"          └─ "Calle 5 #123"  └─ $20
                 └─ 1 x "de leche"
                                    │
                                    ↓
                        Crea objeto WhatsAppOrder
                                    │
                                    ↓
                    ✅ Guardado en Firestore
                                    │
                                    ↓
                    📋 Aparece en tab "Órdenes"
                                    │
                                    ↓
        Admin revisa orden y presiona "Confirmar"
                                    │
                                    ↓
                    updateOrderStatus() → "confirmed"
                                    │
                                    ↓
        ✅ Orden se mueve a colección de ventas
```

---

## Integración de APIs

### Recepción de Mensajes (Webhook)

```
Webhook POST /api/webhooks/whatsapp
{
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "from": "5491234567890",
        "messages": [{
          "type": "text",
          "text": {
            "body": "Hola, quiero una manzana"
          },
          "timestamp": "1234567890"
        }],
        "contacts": [{
          "profile": {
            "name": "Juan Pérez"
          },
          "wa_id": "5491234567890"
        }]
      }
    }]
  }]
}
```

### Envío de Mensajes (API)

```
POST /api/whatsapp/send
{
  "conversationId": "doc_id",
  "message": "Perfecto, confirmo tu orden",
  "messageType": "text"
}

Authorization: Bearer <Firebase ID token>
// Usuario activo con rol admin o manager requerido.

Response:
{
  "success": true,
  "data": {
    "messages": [{
      "id": "wamid.xxx"
    }]
  }
}
```

---

## Configuración de Firestore

```
firestore/
├── whatsapp_conversations (Collection)
│   ├── doc1 (Document)
│   │   ├── phoneNumber: "5491234567890"
│   │   ├── customerName: "Juan Pérez"
│   │   ├── firstMessageDate: Timestamp
│   │   ├── lastMessageDate: Timestamp
│   │   └── status: "active"
│   └── ...
│
├── whatsapp_messages (Collection)
│   ├── msg1 (Document)
│   │   ├── conversationId: "doc1"
│   │   ├── sender: "customer"
│   │   ├── message: "Hola"
│   │   ├── timestamp: Timestamp
│   │   └── messageType: "text"
│   └── ...
│
└── whatsapp_orders (Collection)
    ├── order1 (Document)
    │   ├── conversationId: "doc1"
    │   ├── phoneNumber: "5491234567890"
    │   ├── items: [
    │   │   {productName: "Arroz", quantity: 2}
    │   │ ]
    │   ├── deliveryAddress: "Calle 5 #123"
    │   ├── totalPrice: 20
    │   ├── status: "pending"
    │   └── createdAt: Timestamp
    └── ...
```

---

## Índices de Firestore Recomendados

```javascript
// Índices compuestos a crear en Firebase Console:

// Para whatsapp_messages
{
  fields: [
    { fieldPath: "conversationId", order: "ASCENDING" },
    { fieldPath: "timestamp", order: "DESCENDING" },
  ];
}

// Para whatsapp_orders
{
  fields: [
    { fieldPath: "status", order: "ASCENDING" },
    { fieldPath: "createdAt", order: "DESCENDING" },
  ];
}
```

---

## Seguridad - Capas

```
┌──────────────────────────────────┐
│   CLIENTE (Chat WhatsApp)        │
└──────────────┬───────────────────┘
               │ Validación
               ↓
┌──────────────────────────────────┐
│   WEBHOOK (Firma de WhatsApp)    │
└──────────────┬───────────────────┘
               │ Autenticación
               ↓
┌──────────────────────────────────┐
│   BACKEND (Firebase Bearer)      │
└──────────────┬───────────────────┘
               │ Firestore Rules
               ↓
┌──────────────────────────────────┐
│   FIRESTORE (Reglas de Acceso)   │
└──────────────────────────────────┘
```

---

## Variables de Entorno (Mapa de dependencias)

```
.env (Backend)
├── FIREBASE_SERVICE_ACCOUNT_PATH ──→ Firebase Admin SDK
├── WHATSAPP_API_TOKEN ─────────────→ WhatsApp API
├── WHATSAPP_PHONE_NUMBER_ID ───────→ WhatsApp API
├── WHATSAPP_APP_SECRET ─────────────→ Firma HMAC del webhook
├── WEBHOOK_VERIFY_TOKEN ───────────→ Validación GET del webhook
└── WHATSAPP_REQUEST_TIMEOUT_MS ─────→ Timeout de llamadas al proveedor

.env.local (Frontend)
├── VITE_FIREBASE_API_KEY ────────→ Firebase Web SDK
├── VITE_FIREBASE_PROJECT_ID ─────→ Firestore
└── VITE_BACKEND_URL ──────────────→ Servidor Express
```

El frontend autentica las rutas administrativas con `Authorization: Bearer <Firebase ID token>`.
El token bearer del proveedor, el App Secret, el Verify Token y la service account son exclusivamente
del backend; no deben tener prefijo `VITE_` ni aparecer en el bundle del frontend.

Las rutas autenticadas `POST /api/whatsapp/send` y `POST /api/whatsapp/test` comparten un único límite
de proceso de 10 solicitudes por clave usuario/ruta cada 60 segundos, con un máximo total de 1.000
entradas expirables. Cuando se excede, responden `429` con `Retry-After`. Las llamadas
al proveedor tienen un timeout finito de 10 segundos por defecto, configurable con
`WHATSAPP_REQUEST_TIMEOUT_MS`; los fallos devuelven una respuesta genérica y solo generan logs estáticos.

---

## Deployment Architecture (Recomendado)

```
┌─────────────────────────────────────────────────────────┐
│           🌐 Dominio Personalizado (tu-dominio.com)    │
└─────────────────────────────────────────────────────────┘
     │                                           │
     │                                           │
     ↓                                           ↓
┌──────────────────────┐            ┌──────────────────────┐
│   Frontend Static    │            │  Backend API        │
│  (Firebase Hosting)  │            │ (Express backend)   │
│  tu-dominio.com      │            │ api.tu-dominio.com  │
└──────────────────────┘            └──────────────────────┘
                                             │
                                             ↓
                                    ┌──────────────────────┐
                                    │   Firebase Firestore │
                                    │   Database           │
                                    └──────────────────────┘
                                             │
                                             ↓
                                    ┌──────────────────────┐
                                    │  WhatsApp Business   │
                                    │  API (Meta)          │
                                    └──────────────────────┘
```
