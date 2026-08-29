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
const { Timestamp, getFirestore } = require('firebase-admin/firestore');
const cors = require('cors');
const { createProvisionUserHandler, createRateLimiter } = require('./userProvisioning');
const { getSafeApiError, getSafeApiLogMessage } = require('./apiErrorContract');
const { createSyncClaimsHandler, createWhatsAppTestHandler } = require('./apiRoutes');
const {
  createFirebaseAdminRoleMiddleware,
  createWhatsAppRateLimitMiddlewares,
  createWhatsAppSendHandler,
} = require('./whatsappAdminRoutes');
const { createSalesRouter } = require('./salesRoutes');
const { createAnthropicRouter } = require('./anthropicRoutes');
const { createWhatsAppMessageSender } = require('./whatsappProvider');
const { parseFrontendOrigins } = require('./corsConfig');
const { initializeFirebaseAdmin } = require('./firebaseAdmin');
const {
  createWhatsAppWebhookHandler,
  DEFAULT_AUTO_RESPONSE,
  registerWhatsAppWebhookRoutes,
} = require('./whatsappWebhook');
require('dotenv').config();

const app = express();

// CORS configurado solo para los orígenes del frontend
const ALLOWED_ORIGINS = parseFrontendOrigins(process.env.FRONTEND_ORIGINS);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

// ============ INICIALIZAR FIREBASE ============
let db;
try {
  db = initializeFirebaseAdmin({ admin, getFirestore });
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error(getSafeApiLogMessage('Firebase initialization'));
  process.exit(1);
}

function logApiError(context) {
  console.error(getSafeApiLogMessage(context));
}

function sendApiError(res, status, code = 'internal') {
  return res.status(status).json(getSafeApiError(code));
}

const provisionUser = createProvisionUserHandler({
  admin,
  get db() {
    return db;
  },
  rateLimiter: createRateLimiter({ limit: 10, windowMs: 60_000 }),
});

const syncClaims = createSyncClaimsHandler({
  admin,
  get db() {
    return db;
  },
});

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
    firstMessageDate: Timestamp.now(),
    lastMessageDate: Timestamp.now(),
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
    timestamp: Timestamp.now(),
  });
}

/**
 * Actualiza el lastMessageDate de una conversación
 */
async function updateConversationTimestamp(conversationId) {
  await db.collection('whatsapp_conversations').doc(conversationId).update({
    lastMessageDate: Timestamp.now(),
  });
}

const sendWhatsAppMessage = createWhatsAppMessageSender({
  enabled: process.env.WHATSAPP_ENABLED === 'true',
  logError: (context) => logApiError(context),
});

const handleWhatsAppWebhook = createWhatsAppWebhookHandler({
  getOrCreateConversation,
  saveMessage,
  updateConversationTimestamp,
  sendWhatsAppMessage,
  isAutoResponseEnabled: () => process.env.WHATSAPP_ENABLED === 'true'
    && process.env.AUTO_RESPONSE_ENABLED === 'true',
  getAutoResponseMessage: () => process.env.AUTO_RESPONSE_MESSAGE || DEFAULT_AUTO_RESPONSE,
  logError: (context) => logApiError(context),
});

registerWhatsAppWebhookRoutes(app, {
  getSecret: () => process.env.WHATSAPP_APP_SECRET,
  getVerifyToken: () => process.env.WEBHOOK_VERIFY_TOKEN,
  handler: handleWhatsAppWebhook,
});
app.use(express.json({ limit: '10mb' }));

// ============ MIDDLEWARE DE AUTENTICACIÓN ============

// ============ RUTAS ============

/**
 * POST /api/whatsapp/send - Enviar mensaje desde admin
 */
const requireFirebaseAdminRole = createFirebaseAdminRoleMiddleware({
  admin,
  get db() {
    return db;
  },
});
const {
  send: limitWhatsAppSend,
  test: limitWhatsAppTest,
} = createWhatsAppRateLimitMiddlewares();

app.post('/api/whatsapp/send', requireFirebaseAdminRole, limitWhatsAppSend, createWhatsAppSendHandler({
  get db() {
    return db;
  },
  sendWhatsAppMessage,
  saveMessage,
  updateConversationTimestamp,
}));

/**
 * GET /api/health - Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

 /**
  * POST /api/auth/sync-claims
 * Headers: Authorization: Bearer <Firebase ID token>
 * Body: { uid: string }
 *
 * Lee el estado y rol del documento protegido del usuario y genera custom
 * claims derivados para optimizacion. Firestore Rules usa el documento
 * vigente como autoridad; estos claims nunca deben funcionar como bypass.
 * Requiere un Firebase ID token válido del usuario que se está sincronizando.
 *
 * ADR-0001: /users/{uid} es la autoridad; claims son datos derivados/cache.
 */
app.post('/api/auth/provision-user', provisionUser);

app.post('/api/auth/sync-claims', syncClaims);

/**
 * POST /api/whatsapp/test - Test endpoint
 */
app.post('/api/whatsapp/test', requireFirebaseAdminRole, limitWhatsAppTest, createWhatsAppTestHandler({ sendWhatsAppMessage }));

app.use('/api/sales', createSalesRouter({
  admin,
  get db() {
    return db;
  },
}));

/**
 * POST /api/anthropic/analyze-image - Proxy para Claude Vision
 * Body: { imageBase64: string }
 */
app.use('/api/anthropic', createAnthropicRouter({
  admin,
  get db() {
    return db;
  },
  enabled: process.env.ANTHROPIC_ENABLED === 'true',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL,
}));

// ============ MANEJO DE ERRORES ============

app.use((err, req, res, next) => {
  logApiError('Unhandled request');
  sendApiError(res, 500);
});

app.use((req, res) => {
  sendApiError(res, 404, 'notFound');
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
