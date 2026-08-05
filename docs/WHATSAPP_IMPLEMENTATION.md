# Guía de Implementación - WhatsApp Chatbot

## 🚀 Próximos Pasos

Ya tenemos la estructura frontend lista. Ahora necesitas implementar lo siguiente:

### **Fase 1: Configuración Inicial**

#### 1. Instalar Firebase Admin SDK (Backend)

```bash
npm install firebase-admin express cors
```

#### 2. Crear variables de entorno (.env)

```env
# En la carpeta raíz del proyecto
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
WHATSAPP_API_TOKEN=tu_token_de_whatsapp
WHATSAPP_PHONE_NUMBER_ID=tu_numero_id
WHATSAPP_BUSINESS_ACCOUNT_ID=tu_account_id
WEBHOOK_VERIFY_TOKEN=tu_token_secreto_webhook
WHATSAPP_APP_SECRET=tu_app_secret_de_meta
```

Estas variables son exclusivamente del backend. Nunca uses un prefijo `VITE_` para un bearer token, App Secret, Verify Token o credencial de Firebase.

---

### **Fase 2: Backend - Servidor Express**

#### Usar el servidor Express: `backend/whatsapp-webhook.js`

```javascript
const express = require("express");
const cors = require("cors");
const {
  createWhatsAppWebhookHandler,
  registerWhatsAppWebhookRoutes,
} = require("./whatsappWebhook");

const app = express();
app.use(cors());

// Estas funciones de persistencia y el cliente de salida viven en el backend.
const handleWhatsAppWebhook = createWhatsAppWebhookHandler({
  getOrCreateConversation,
  saveMessage,
  updateConversationTimestamp,
  sendWhatsAppMessage,
  logError: (context) => console.error(`[api] ${context} failed`),
});

// Registra GET y POST antes del parser JSON global. El POST instala:
// rate limiter acotado -> express.raw() -> HMAC -> parseo JSON -> handler.
registerWhatsAppWebhookRoutes(app, {
  getSecret: () => process.env.WHATSAPP_APP_SECRET,
  getVerifyToken: () => process.env.WEBHOOK_VERIFY_TOKEN,
  handler: handleWhatsAppWebhook,
});

// El resto de endpoints puede usar JSON después de registrar el webhook.
app.use(express.json({ limit: "10mb" }));

// No devuelvas errores del proveedor ni secretos al cliente.
app.use((error, req, res, next) => {
  console.error("[api] Unhandled request failed");
  res.status(500).json({ error: "Error interno del servidor" });
});
```

Firebase Hosting solo sirve el frontend. `backend/whatsapp-webhook.js` es un
servidor Express separado y debe ejecutarse en un objetivo de backend propio.
El helper `backend/whatsappWebhook.js` conserva el cuerpo raw, valida HMAC y
registra las rutas protegidas del webhook; no se debe sustituir por un parser
JSON que pierda el cuerpo original.

---

### **Fase 3: Configurar Webhook en WhatsApp**

1. Ve a [WhatsApp Business API Dashboard](https://business.facebook.com/)
2. En "App Configuration" → "Webhooks"
3. Establece:
   - **Webhook URL**: `https://tu-dominio.com/api/webhooks/whatsapp`
   - **Verify Token**: El valor de `WEBHOOK_VERIFY_TOKEN` de tu `.env`
4. Suscríbete a eventos: `messages`, `message_status`

Para el POST, Meta debe enviar `X-Hub-Signature-256: sha256=...`. El backend canónico conserva el cuerpo HTTP exacto antes de parsear JSON, calcula HMAC-SHA256 con `WHATSAPP_APP_SECRET` y compara con `crypto.timingSafeEqual`. Si falta el secreto o la firma no es válida, responde `401` genérico sin procesar ni escribir datos. El endpoint también limita a 100 POST por IP cada 60 segundos, elimina entradas vencidas y mantiene como máximo 10.000 entradas por proceso.

La verificación GET también falla cerrada si `WEBHOOK_VERIFY_TOKEN` falta, está vacío o no coincide. Los errores de parseo, persistencia o proveedores se registran con mensajes estáticos y se responden con contratos genéricos; nunca se devuelven detalles internos de excepción, cuerpos del proveedor, teléfonos, firmas o tokens.

---

### **Fase 4: Variables de Entorno Frontend**

Crear `.env.local` en `web/`:

```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain
VITE_FIREBASE_PROJECT_ID=tu_project_id
VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_messaging_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
VITE_BACKEND_URL=https://api.example.com
```

---

### **Fase 5: Reglas de Firebase Security**

Usa únicamente el archivo raíz `firestore.rules`, que exige usuario activo y
rol vigente. No copies reglas abiertas a esta guía:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isActiveUser() {
      return request.auth != null
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.active == true
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager', 'cashier'];
    }

    function isManagerUser() {
      return isActiveUser()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager'];
    }

    function isAdminUser() {
      return isActiveUser()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /whatsapp_conversations/{conversationId} {
      allow read: if isManagerUser();
      allow create, update: if isManagerUser();
      allow delete: if isAdminUser();
    }
    match /whatsapp_messages/{messageId} {
      allow read: if isManagerUser();
      allow create: if isManagerUser();
      allow update, delete: if isAdminUser();
    }
    match /whatsapp_orders/{orderId} {
      allow read: if isManagerUser();
      allow create, update: if isManagerUser();
      allow delete: if isAdminUser();
    }
  }
}
```

---

## 📋 Checklist de Implementación

- [ ] Crear cuenta en Meta/WhatsApp Business
- [ ] Obtener API Token, Phone Number ID y App Secret
- [ ] Guardar las credenciales de WhatsApp únicamente en el `.env` del backend
- [ ] Configurar el servidor Express y su objetivo de despliegue
- [ ] Implementar webhook para recibir mensajes
- [ ] Configurar raw-body capture, HMAC `X-Hub-Signature-256`, fail-closed y error genérico
- [ ] Verificar rate limit acotado: 100 POST/IP/60s, expiración y máximo 10.000 entradas por proceso
- [x] Limitar `POST /api/whatsapp/send` y `/api/whatsapp/test` por usuario y ruta: 10/60s, expiración, máximo 1.000 entradas y `Retry-After`
- [x] Aplicar timeout finito de 10 segundos al proveedor WhatsApp con `AbortController`; los fallos son genéricos
- [ ] Configurar webhook en WhatsApp Dashboard
- [ ] Crear índices en Firestore (si es necesario)
- [x] Implementar autenticación Firebase Bearer y autorización admin/manager en el backend
- [ ] Desplegar frontend en Firebase Hosting y backend Express por separado
- [ ] Probar envío y recepción de mensajes
- [ ] Integrar IA para procesamiento de órdenes (OpenAI, Dialogflow)

---

## 🔧 Mejoras Futuras

### Nivel 2 - Automático

- [ ] Procesar órdenes con IA (OpenAI API)
- [ ] Validar productos contra inventario
- [ ] Calcular precios dinámicos
- [ ] Enviar confirmación automática de órdenes (pendiente; actualmente se envía manualmente desde el chat)
- [ ] Validar direcciones con Google Maps API

### Nivel 3 - Avanzado

- [ ] Notificaciones en tiempo real (WebSockets)
- [ ] Historial completo de conversaciones
- [ ] Integración con sistema de pagos
- [ ] Estadísticas de ventas desde WhatsApp
- [ ] Soporte multiidioma
- [ ] Chatbot con Dialogflow o similar

---

## 📱 Prueba Rápida

Para probar la integración sin servidor, puedes:

1. Instalar [ngrok](https://ngrok.com/)
2. Ejecutar: `ngrok http 3000`
3. Usar la URL de ngrok como webhook temporal

```bash
# Terminal 1
npm run dev  # Frontend

# Terminal 2
 node backend/whatsapp-webhook.js  # Backend local

# Terminal 3
ngrok http 3000  # Exponer localmente
```

---

## 🆘 Troubleshooting

### "Webhook no se conecta"

- Verifica que el `WEBHOOK_VERIFY_TOKEN` sea idéntico
- Verifica que `WHATSAPP_APP_SECRET` esté configurado únicamente en el backend
- Confirma que Meta envía `X-Hub-Signature-256` y que el cuerpo no es modificado por un proxy
- Usa ngrok para probar localmente
- Revisa los logs de WhatsApp Dashboard

### "No recibo mensajes"

- Confirma que el webhook está activo en WhatsApp
- Revisa la colección `whatsapp_conversations` en Firestore
- Valida que el teléfono esté verificado en WhatsApp Business

### "El componente no carga"

- Verifica que Firebase esté inicializado correctamente
- Revisa la consola del navegador (F12)
- Asegúrate de que las colecciones existan en Firestore

---

## 📚 Recursos Útiles

- [WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Firebase Admin SDK](https://firebase.google.com/docs/database/admin/start)
- [OpenAI API](https://openai.com/api/) - Para procesamiento de IA
- [Dialogflow](https://cloud.google.com/dialogflow) - Para chatbots más avanzados
