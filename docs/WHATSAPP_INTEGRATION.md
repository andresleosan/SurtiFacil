# Estrategia de Integración WhatsApp Chatbot

## Descripción General

Integración de un chatbot de WhatsApp en SmartMarket Admin para recibir pedidos y direcciones de envío directamente desde los clientes.

## Arquitectura

### 1. **Stack Tecnológico**

- **WhatsApp Business API**: Para enviar/recibir mensajes
- **Firebase Firestore**: Almacenamiento de conversaciones y pedidos
- **Express backend**: Procesamiento de webhooks desde WhatsApp
- **React Frontend**: Panel de administración para gestionar chats

### 2. **Estructura de Datos en Firestore**

#### Colección: `whatsapp_conversations`

```
{
  id: string,
  phoneNumber: string,           // Teléfono del cliente
  customerName: string,          // Nombre del cliente
  firstMessageDate: timestamp,   // Primera vez que contactó
  lastMessageDate: timestamp,    // Último mensaje
  status: 'active' | 'archived'  // Estado de la conversación
}
```

#### Colección: `whatsapp_messages`

```
{
  id: string,
  conversationId: string,        // Referencia a la conversación
  sender: 'customer' | 'admin',  // Quién envía
  message: string,               // Contenido del mensaje
  timestamp: timestamp,
  messageType: 'text' | 'order_request' | 'location' | 'image'
}
```

#### Colección: `whatsapp_orders`

```
{
  id: string,
  conversationId: string,        // Referencia a la conversación
  phoneNumber: string,
  customerName: string,
  items: [
    {
      productId: string,
      productName: string,
      quantity: number,
      price: number
    }
  ],
  deliveryAddress: string,
  totalPrice: number,
  status: 'pending' | 'confirmed' | 'delivered',
  createdAt: timestamp,
  orderNotes: string
}
```

### 3. **Flujo de Integración**

```
Cliente (WhatsApp)
     ↓
WhatsApp Business API
     ↓
Webhook (Backend Express)
     ↓
Firebase Firestore
     ↓
React Admin Panel (Nueva Pestaña)
     ↓
Admin (Responde/Confirma órdenes)
```

### 4. **Características Principales**

#### Panel de WhatsApp (Frontend)

- **Lista de Conversaciones**: Muestra todos los chats activos
- **Chat Detail**: Vista del historial de mensajes
- **Procesamiento de Órdenes**:
  - Reconoce patrones de órdenes ("Quiero 2 manzanas, 3 naranjas")
  - Extrae direcciones de envío
  - Crea órdenes automáticamente en Firestore
- **Respuestas Rápidas**: Botones preconfigurados para respuestas comunes
- **Auto-responder**: Mensaje automático cuando un cliente escribe

### 5. **Integraciones Necesarias**

#### Backend Express

```javascript
// Webhook para recibir mensajes de WhatsApp
POST /api/webhooks/whatsapp
{
  messaging_product: "whatsapp",
  message: {
    from: "5541999999999",
    text: "Hola, quiero 2 kg de arroz",
    timestamp: "1234567890"
  }
}
```

#### Variables de Entorno Necesarias (solo backend)

```env
WHATSAPP_API_TOKEN=tu_token_whatsapp
WHATSAPP_PHONE_NUMBER_ID=id_del_numero
WHATSAPP_BUSINESS_ACCOUNT_ID=id_del_negocio
WHATSAPP_APP_SECRET=app_secret_de_meta
WEBHOOK_VERIFY_TOKEN=token_de_verificacion
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
```

El bearer token, el App Secret, el Verify Token y las credenciales de Firebase nunca se configuran con `VITE_` ni se envían al frontend. El frontend solo necesita la URL del backend (`VITE_BACKEND_URL`).

### 6. **Proceso de Pedidos Automático**

1. **Cliente envía mensaje**: "Quiero 2 manzanas y 3 naranjas, llevar a Calle 5 #123"
2. **AI/Regex procesa**:
   - Identifica productos
   - Calcula cantidades
   - Extrae dirección
3. **Sistema crea borrador de orden**
4. **Admin revisa** en panel de WhatsApp
5. **Admin confirma o ajusta**
6. **Orden se mueve a "Ventas"**

### 7. **Próximos Pasos de Implementación**

1. **Fase 1**: Estructura básica del componente
2. **Fase 2**: Conexión con Firebase
3. **Fase 3**: Integración de API de WhatsApp
4. **Fase 4**: Servidor Express para webhooks
5. **Fase 5**: IA simple para reconocimiento de órdenes

### 8. **Seguridad**

- **Validación de Webhooks**: Verificar `X-Hub-Signature-256` con HMAC-SHA256 sobre el cuerpo raw y comparación timing-safe
- **Rate Limiting**: Limitar mensajes por usuario
- **Autenticación**: Firebase Auth y documento `/users/{uid}` activo con rol admin/manager para operar en Firestore
- **Credenciales**: Bearer token, App Secret, Verify Token y service account solo en backend; el frontend solo conoce `VITE_BACKEND_URL`
- **Datos**: HTTPS protege el transporte y Firestore gestiona el cifrado en reposo; no se declara cifrado adicional a nivel de aplicación

#### Checklist de Secretos

- [ ] `WHATSAPP_API_TOKEN` configurado únicamente en el entorno backend
- [ ] `WHATSAPP_APP_SECRET` configurado únicamente en el entorno backend
- [ ] No hay variables de WhatsApp con prefijo frontend en el bundle

### 9. **Alternativas de Implementación**

- **Modelo actual**: Servidor Express + Firestore + React, con despliegues de frontend y backend separados
- **Alternativa futura**: Cualquier migración de plataforma requeriría un diseño y despliegue independientes
- **Servicios complementarios**: Twilio, MessageBird, Dialogflow u OpenAI solo si se incorporan explícitamente
