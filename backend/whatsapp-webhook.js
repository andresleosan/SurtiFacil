/**
 * Backend - Servidor Express para WhatsApp Integration
 * 
 * Coloca este archivo en: backend/whatsapp-webhook.js
 * 
 * Ejecutar:
 * npm install express cors firebase-admin dotenv
 * node backend/whatsapp-webhook.js
 */

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configurado solo para el frontend
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://smartmarket-b37ce.web.app',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(express.json({ limit: '10mb' }));

// ============ INICIALIZAR FIREBASE ============
let db;
try {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';
  const serviceAccount = require(serviceAccountPath);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  db = admin.firestore();
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase:', error.message);
  process.exit(1);
}

// ============ FUNCIONES AUXILIARES ============

/**
 * Busca o crea una conversación
 */
async function getOrCreateConversation(phoneNumber, customerName) {
  const conversationsRef = db.collection('whatsapp_conversations');
  const snapshot = await conversationsRef.where('phoneNumber', '==', phoneNumber).get();

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  // Crear nueva conversación
  const newConv = await conversationsRef.add({
    phoneNumber,
    customerName: customerName || 'Cliente',
    firstMessageDate: admin.firestore.Timestamp.now(),
    lastMessageDate: admin.firestore.Timestamp.now(),
    status: 'active',
  });

  return newConv.id;
}

/**
 * Guarda un mensaje en Firestore
 */
async function saveMessage(conversationId, sender, messageText, messageType = 'text') {
  await db.collection('whatsapp_messages').add({
    conversationId,
    sender,
    message: messageText,
    messageType,
    timestamp: admin.firestore.Timestamp.now(),
  });
}

/**
 * Actualiza el lastMessageDate de una conversación
 */
async function updateConversationTimestamp(conversationId) {
  await db.collection('whatsapp_conversations').doc(conversationId).update({
    lastMessageDate: admin.firestore.Timestamp.now(),
  });
}

/**
 * Envía un mensaje a través de WhatsApp API
 */
async function sendWhatsAppMessage(phoneNumber, message) {
  if (!process.env.WHATSAPP_API_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.error('❌ WhatsApp credentials not configured');
    throw new Error('WhatsApp credentials missing');
  }

  const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ WhatsApp API error:', data);
      throw new Error(data.error?.message || 'Failed to send message');
    }

    console.log('✅ Message sent:', data.messages[0].id);
    return data;
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    throw error;
  }
}

// ============ MIDDLEWARE DE AUTENTICACIÓN ============

/**
 * Middleware simple para proteger endpoints de admin
 * Requiere header X-API-Key o Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validKey = process.env.ADMIN_API_KEY;

  if (!validKey) {
    // Si no hay clave configurada, RECHAZAR (fail closed)
    console.warn('⚠️  ADMIN_API_KEY not configured - rejecting request');
    return res.status(503).json({ error: 'Server not configured for authentication' });
  }

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }

  next();
}

// ============ RUTAS ============

/**
 * GET /api/webhooks/whatsapp - Verificación del webhook
 */
app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`🔍 Webhook verification: mode=${mode}, token=${token ? 'present' : 'missing'}`);

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.error('❌ Invalid webhook verification token');
    res.sendStatus(403);
  }
});

/**
 * POST /api/webhooks/whatsapp - Recibir mensajes
 */
app.post('/api/webhooks/whatsapp', async (req, res) => {
  try {
    const body = req.body;

    // Validar estructura del webhook
    if (!body || body.object !== 'whatsapp_business_account') {
      console.log('⏭️ Ignorando evento no-whatsapp:', body?.object);
      return res.sendStatus(200);
    }

    // Validar que entry sea array
    if (!Array.isArray(body.entry)) {
      return res.status(400).json({ error: 'Invalid webhook format: entry must be array' });
    }

    // Procesar cada evento
    for (const entry of body.entry) {
      if (!entry.changes || !Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const value = change.value || {};
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];

        for (const message of messages) {
          // Validar que message tenga campos requeridos
          if (!message.from || typeof message.from !== 'string') continue;
          if (!/^\d{10,15}$/.test(message.from)) continue;

          const phoneNumber = message.from;
          const messageText = (typeof message.text?.body === 'string')
            ? message.text.body.slice(0, 1000)
            : '[Mensaje sin texto]';
          const customerName = (typeof contacts[0]?.profile?.name === 'string')
            ? contacts[0].profile.name.slice(0, 100)
            : 'Cliente';

          console.log(`📨 Mensaje recibido de ${customerName} (${phoneNumber})`);

          try {
            const conversationId = await getOrCreateConversation(phoneNumber, customerName);
            await saveMessage(conversationId, 'customer', messageText, 'text');
            await updateConversationTimestamp(conversationId);

            if (process.env.AUTO_RESPONSE_ENABLED === 'true') {
              const autoResponse = process.env.AUTO_RESPONSE_MESSAGE || 
                '👋 Hola, gracias por tu mensaje. Un administrador te responderá pronto.';
              await sendWhatsAppMessage(phoneNumber, autoResponse);
            }
          } catch (error) {
            console.error('❌ Error processing message:', error);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whatsapp/send - Enviar mensaje desde admin
 */
app.post('/api/whatsapp/send', requireAuth, async (req, res) => {
  try {
    const { phoneNumber, message, conversationId } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'phoneNumber and message required' });
    }

    console.log(`📤 Admin enviando mensaje a ${phoneNumber}: "${message}"`);

    // Enviar mensaje
    const result = await sendWhatsAppMessage(phoneNumber, message);

    // Guardar mensaje en Firestore
    if (conversationId) {
      await saveMessage(conversationId, 'admin', message, 'text');
      await updateConversationTimestamp(conversationId);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health - Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/auth/sync-claims
 * Body: { uid: string, idToken: string }
 *
 * Lee el rol del usuario desde Firestore y lo sincroniza como custom claims
 * de Firebase Auth (request.auth.token.admin / .manager). Idempotente.
 * Requiere idToken válido del usuario que se está sincronizando.
 *
 * ADR-0001: custom claims son la fuente de verdad para autorización en rules.
 */
app.post('/api/auth/sync-claims', async (req, res) => {
  try {
    const { uid, idToken } = req.body || {};
    if (!uid || !idToken) {
      return res.status(400).json({ error: 'uid and idToken required' });
    }

    // Verificar que el idToken pertenece al uid solicitado
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.uid !== uid) {
      return res.status(403).json({ error: 'Token does not match uid' });
    }

    // Leer rol desde Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found in Firestore' });
    }
    const role = userDoc.data().role;
    if (!role || !['admin', 'manager', 'cashier'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role in Firestore' });
    }

    // Setear custom claims
    const claims = {
      admin: role === 'admin',
      manager: role === 'manager' || role === 'admin',
    };
    await admin.auth().setCustomUserClaims(uid, claims);

    console.log(`🔐 Custom claims sincronizados para uid=${uid}: ${JSON.stringify(claims)}`);
    res.json({ success: true, claims });
  } catch (error) {
    console.error('❌ Error syncing custom claims:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/whatsapp/test - Test endpoint
 */
app.post('/api/whatsapp/test', requireAuth, async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber required' });
    }

    console.log(`🧪 Enviando mensaje de test a ${phoneNumber}`);

    const result = await sendWhatsAppMessage(
      phoneNumber,
      '✅ Este es un mensaje de prueba desde SurtiFácil Admin.'
    );

    res.json({ success: true, message: 'Test message sent', data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/anthropic/analyze-image - Proxy para Claude Vision
 * Body: { imageBase64: string }
 */
app.post('/api/anthropic/analyze-image', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: `Analiza esta imagen de un producto de supermercado. 
Extrae SOLO un JSON: { nombre: string, precio_sugerido: number, categoria: string }
Si no puedes identificar el precio, usa null.
Categorías: Abarrotes, Bebidas, Lácteos, Limpieza, Otros
Responde SOLO con el JSON.` },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    const content = data.content[0]?.text;
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');

    res.json({ success: true, data: JSON.parse(jsonMatch[0]) });
  } catch (error) {
    console.error('❌ Anthropic image analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/anthropic/analyze-audio - Proxy para Claude Text
 * Body: { transcribedText: string }
 */
app.post('/api/anthropic/analyze-audio', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { transcribedText } = req.body;
  if (!transcribedText) {
    return res.status(400).json({ error: 'transcribedText required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `El usuario dictó: "${transcribedText}"
Extrae SOLO un JSON: { nombre: string, precio: number, stock: number, categoria: string }
Si falta algún campo, usa null.
Categorías: Abarrotes, Bebidas, Lácteos, Limpieza, Otros
Responde SOLO con el JSON.`,
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    const content = data.content[0]?.text;
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');

    res.json({ success: true, data: JSON.parse(jsonMatch[0]) });
  } catch (error) {
    console.error('❌ Anthropic audio analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ MANEJO DE ERRORES ============

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: err.message });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============ INICIAR SERVIDOR ============

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 WhatsApp Webhook Server Started');
  console.log('='.repeat(50));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Webhook: http://localhost:${PORT}/api/webhooks/whatsapp`);
  console.log(`💊 Health: http://localhost:${PORT}/api/health`);
  console.log('='.repeat(50) + '\n');

  if (!process.env.WHATSAPP_API_TOKEN) {
    console.warn('⚠️  WARNING: WHATSAPP_API_TOKEN not configured\n');
  }
});

module.exports = app;
