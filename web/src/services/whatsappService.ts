import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppOrder,
  ProcessedMessageData,
} from '../types/whatsapp';

/**
 * Obtiene todas las conversaciones de WhatsApp
 */
export async function getConversations(): Promise<WhatsAppConversation[]> {
  const conversationsRef = collection(db, 'whatsapp_conversations');
  const q = query(conversationsRef, orderBy('lastMessageDate', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    firstMessageDate: doc.data().firstMessageDate?.toDate(),
    lastMessageDate: doc.data().lastMessageDate?.toDate(),
  })) as WhatsAppConversation[];
}

/**
 * Obtiene los mensajes de una conversación específica
 */
export async function getMessages(conversationId: string): Promise<WhatsAppMessage[]> {
  const messagesRef = collection(db, 'whatsapp_messages');
  const q = query(
    messagesRef,
    where('conversationId', '==', conversationId),
    orderBy('timestamp', 'asc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  })) as WhatsAppMessage[];
}

/**
 * Envía un mensaje en una conversación
 */
export async function sendMessage(
  conversationId: string,
  message: string,
  messageType: 'text' | 'order_request' | 'location' | 'image' = 'text'
): Promise<string> {
  const messagesRef = collection(db, 'whatsapp_messages');
  const docRef = await addDoc(messagesRef, {
    conversationId,
    sender: 'admin',
    message,
    messageType,
    timestamp: Timestamp.now(),
  });

  // Actualizar lastMessageDate de la conversación
  const conversationRef = doc(db, 'whatsapp_conversations', conversationId);
  await updateDoc(conversationRef, {
    lastMessageDate: Timestamp.now(),
  });

  return docRef.id;
}

/**
 * Obtiene todas las órdenes de WhatsApp
 */
export async function getWhatsAppOrders(): Promise<WhatsAppOrder[]> {
  const ordersRef = collection(db, 'whatsapp_orders');
  const q = query(ordersRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
  })) as WhatsAppOrder[];
}

/**
 * Crea una nueva orden desde WhatsApp
 */
export async function createWhatsAppOrder(orderData: Omit<WhatsAppOrder, 'id'>): Promise<string> {
  const ordersRef = collection(db, 'whatsapp_orders');
  const docRef = await addDoc(ordersRef, {
    ...orderData,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

/**
 * Actualiza el estado de una orden
 */
export async function updateOrderStatus(
  orderId: string,
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled'
): Promise<void> {
  const orderRef = doc(db, 'whatsapp_orders', orderId);
  await updateDoc(orderRef, { status });
}

/**
 * Procesa un mensaje para detectar órdenes y direcciones
 * Esta es una implementación básica con regex.
 * Para IA más avanzada, usar OpenAI o Dialogflow
 */
export function processMessageForOrder(messageText: string): ProcessedMessageData {
  const lowerText = messageText.toLowerCase();

  // Palabras clave para detectar órdenes
  const orderKeywords = ['quiero', 'necesito', 'dame', 'manda', 'traeme', 'envía', 'lleva'];
  const hasOrderKeyword = orderKeywords.some((kw) => lowerText.includes(kw));

  // Intentar extraer productos (búsqueda simple)
  const productPattern = /(\d+)\s*(?:kg|kilos?|unidad|und|paquete|pack)?[\s,de]*([a-záéíóúñ\s]+)/gi;
  const products: { name: string; quantity: number }[] = [];
  let match;

  while ((match = productPattern.exec(messageText)) !== null) {
    products.push({
      quantity: parseInt(match[1]),
      name: match[2].trim(),
    });
  }

  // Intentar extraer dirección (palabras clave comunes)
  let address = '';
  const addressPatterns = [
    /(?:llevar? a|dirección|domicilio|enviar a)\s*([^.!?]*?)(?:\.|!|\?|$)/i,
    /(?:calle|avenida|carrera|diagonal)\s+([^.!?]*?)(?:\.|!|\?|$)/i,
  ];

  for (const pattern of addressPatterns) {
    const addressMatch = messageText.match(pattern);
    if (addressMatch) {
      address = addressMatch[1].trim();
      break;
    }
  }

  return {
    hasOrder: hasOrderKeyword && products.length > 0,
    products: products.length > 0 ? products : undefined,
    address: address || undefined,
    rawText: messageText,
  };
}

/**
 * Archiva una conversación
 */
export async function archiveConversation(conversationId: string): Promise<void> {
  const conversationRef = doc(db, 'whatsapp_conversations', conversationId);
  await updateDoc(conversationRef, { status: 'archived' });
}

/**
 * Obtiene órdenes pendientes de WhatsApp
 */
export async function getPendingWhatsAppOrders(): Promise<WhatsAppOrder[]> {
  const ordersRef = collection(db, 'whatsapp_orders');
  const q = query(
    ordersRef,
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
  })) as WhatsAppOrder[];
}
