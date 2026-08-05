# 🎯 Mejores Prácticas - WhatsApp Integration

## 1. Seguridad

### ✅ Autenticación y secretos

- [x] Validar webhooks con HMAC `X-Hub-Signature-256`
- [x] Exigir usuario Firebase activo y rol vigente en Firestore Rules
- [x] Proteger endpoints administrativos del Express backend
- [ ] Usar HTTPS en producción
- [ ] Gestionar secretos con el entorno del backend o un secret manager

No se deben poner bearer tokens, App Secret, Verify Token ni credenciales de
Firebase en variables `VITE_` o en el bundle. No se afirma cifrado adicional de
API keys en `.env`; la protección depende del entorno/secret manager y de los
permisos del sistema operativo.

### ✅ Validación de Webhooks

```javascript
// El parser debe conservar el cuerpo exacto antes de analizar JSON.
app.use(express.json({ verify: (req, res, buffer) => {
  req.rawBody = Buffer.from(buffer);
} }));

// Verificar firma del webhook de WhatsApp sin comparación vulnerable.
const crypto = require("crypto");

function verifyWebhook(req, appSecret) {
  const body = req.rawBody;
  const signature = req.headers["x-hub-signature-256"];
  if (!appSecret || !Buffer.isBuffer(body) || !/^sha256=[0-9a-f]{64}$/i.test(signature || "")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(body)
    .digest();
  const provided = Buffer.from(signature.slice("sha256=".length), "hex");

  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

### ✅ Rate Limiting

```javascript
// El backend canónico usa un límite fijo, expiración y máximo de entradas.
const limiter = createWebhookRateLimiter({
  limit: 100,
  windowMs: 60 * 1000,
  maxEntries: 10_000,
});

app.post("/api/webhooks/whatsapp", limiter, verifyWebhookMiddleware, handler);
```

El límite es por IP y local al proceso. Para varias réplicas se necesita almacenamiento compartido; no se debe declarar despliegue listo solo por tener este límite local.

---

## 2. Manejo de Errores

### ✅ Estructura uniforme de errores

```javascript
// El backend usa respuestas allowlisted y no devuelve error.message.
const SAFE_ERRORS = {
  badRequest: 'Solicitud inválida',
  unauthorized: 'No autorizado',
  internal: 'Error interno del servidor',
};

res.status(500).json({ error: SAFE_ERRORS.internal });
```

### ✅ Logging

```javascript
const fs = require("fs");

function logEvent(level, message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${level}: ${message}\n`;

  fs.appendFileSync("logs/app.log", logEntry);
  console.log(logEntry);
}

logEvent("INFO", "Mensaje recibido");
```

---

## 3. Performance

### ✅ Caching

```javascript
const cache = new Map();

async function getCachedConversations(cacheTime = 60000) {
  const cacheKey = "conversations";

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < cacheTime) {
      return cached.data;
    }
  }

  const data = await getConversations();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### ✅ Batching de requests

```javascript
// En lugar de enviar 100 mensajes individualmente
async function sendBatchMessages(messages) {
  const batches = [];
  for (let i = 0; i < messages.length; i += 10) {
    batches.push(messages.slice(i, i + 10));
  }

  for (const batch of batches) {
    await Promise.all(batch.map((m) => sendWhatsAppMessage(m.phone, m.text)));
    await new Promise((r) => setTimeout(r, 1000)); // Esperar 1s entre batches
  }
}
```

---

## 4. Monitoreo

### ✅ Métricas

```javascript
const metrics = {
  messagesReceived: 0,
  messagesSent: 0,
  ordersCreated: 0,
  errorsCount: 0,
};

app.get("/api/metrics", (req, res) => {
  res.json(metrics);
});

// Incrementar en cada acción
metrics.messagesReceived++;
```

### ✅ Alertas

```javascript
async function sendAlert(message) {
  // Enviar alerta por email o SMS
  if (metrics.errorsCount > 10) {
    console.error("⚠️ Muchos errores detectados");
    // Notificar admin
  }
}
```

---

## 5. Escalabilidad

### ✅ Queue de mensajes

```javascript
const Queue = require("bull");
const messageQueue = new Queue("whatsapp-messages");

// Agregar a queue
await messageQueue.add(
  { phoneNumber, message },
  { attempts: 3, backoff: "exponential" },
);

// Procesar queue
messageQueue.process(async (job) => {
  await sendWhatsAppMessage(job.data.phoneNumber, job.data.message);
});
```

### ✅ Despliegue del backend Express

```javascript
// Firebase Hosting no despliega este proceso.
// Ejecutar backend/whatsapp-webhook.js en un servicio separado,
// comprobar GET /api/health y conservar un artefacto anterior para rollback.
```

---

## 6. Experiencia del Usuario (Frontend)

### ✅ Indicadores de escritura

```typescript
// Mostrar que el admin está escribiendo
const [isTyping, setIsTyping] = useState(false);

useEffect(() => {
  // Enviar "is_typing: true" cada segundo mientras el admin escribe
}, []);
```

### ✅ Confirmación de entrega

```typescript
// Mostrar checkmark en mensajes confirmados
const MessageItem = ({ message }) => (
  <div>
    {message.text}
    {message.delivered && <span>✓✓</span>}
  </div>
);
```

### ✅ Buscar en conversaciones

```typescript
const [searchTerm, setSearchTerm] = useState("");

const filteredConversations = conversations.filter(
  (conv) =>
    conv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.phoneNumber.includes(searchTerm),
);
```

---

## 7. Testing

### ✅ Test unitario del webhook

```javascript
const request = require("supertest");

describe("POST /api/webhooks/whatsapp", () => {
  it("should save message to Firestore", async () => {
    const res = await request(app)
      .post("/api/webhooks/whatsapp")
      .send({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    {
                      from: "5491234567890",
                      text: { body: "Hola" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

    expect(res.status).toBe(200);
  });
});
```

### ✅ Test de component

```typescript
import { render, screen } from '@testing-library/react';
import WhatsAppChat from './WhatsAppChat';

describe('WhatsAppChat', () => {
  it('should render conversations list', () => {
    render(<WhatsAppChat />);
    expect(screen.getByText('💬 WhatsApp Chats')).toBeInTheDocument();
  });
});
```

---

## 8. Documentación

### ✅ Comentarios en código

```javascript
/**
 * Recibe mensajes del webhook de WhatsApp
 * @param {string} phoneNumber - Teléfono del cliente
 * @param {string} message - Contenido del mensaje
 * @returns {Promise<string>} ID del mensaje guardado
 * @throws {Error} Si hay error al guardar
 */
async function saveMessage(phoneNumber, message) {
  // ...
}
```

### ✅ API Documentation

```javascript
/**
 * POST /api/whatsapp/send
 *
 * Envía un mensaje a un cliente después de verificar Firebase y el rol
 *
 * Body:
 * {
 *   "conversationId": "doc_id",
 *   "message": "Tu mensaje",
 *   "messageType": "text"
 * }
 *
 * Response: { success: true, data: {...} }
 * Requiere Authorization: Bearer <Firebase ID token> de un usuario activo
 * admin o manager. El número de teléfono se obtiene de la conversación.
 * Límite: 10 solicitudes por usuario y ruta cada 60 segundos; el exceso responde
 * 429 con Retry-After. El proveedor tiene un timeout finito y sus fallos son genéricos.
 */
```

---

## 9. Deployment

### ✅ Checklist pre-producción

- [ ] Variables de entorno configuradas
- [ ] Firebase Rules publicadas
- [ ] SSL/HTTPS habilitado
- [ ] Backups de datos configurados
- [ ] Logs habilitados
- [ ] Monitoreo activo
- [ ] Plan de rollback
- [ ] Prueba de failover

### ✅ Opciones de hosting

| Opción                   | Pros                     | Contras                |
| ------------------------ | ------------------------ | ---------------------- |
| Express en un servicio administrado | Modelo actual y control explícito | Requiere operación separada |
| Google Cloud Run                    | Contenerizado                     | Requiere imagen y configuración |
| VM o plataforma Node                | Flexible                          | Requiere health check y rollback |

---

## 10. Mantenimiento

### ✅ Limpieza de datos antigos

```javascript
// Archivar conversaciones inactivas > 30 días
async function archiveOldConversations() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const snapshot = await db
    .collection("whatsapp_conversations")
    .where("lastMessageDate", "<", thirtyDaysAgo)
    .get();

  for (const doc of snapshot.docs) {
    await doc.ref.update({ status: "archived" });
  }
}
```

### ✅ Backup automático

```javascript
// Ejecutar diariamente con Cloud Scheduler
exports.backupDatabase = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async (context) => {
    // Copiar datos a backup collection
  });
```
