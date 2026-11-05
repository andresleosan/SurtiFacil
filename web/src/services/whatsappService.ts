import { getAuth } from 'firebase/auth';
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppOrder,
  ProcessedMessageData,
} from '../types/whatsapp';
import { apiClient } from './apiClient';

const auth = getAuth();

// Almacenamiento local temporal en memoria para WhatsApp (se sincronizará con D1 en Tarea 7)
const localConversations: WhatsAppConversation[] = [];
const localMessages: Record<string, WhatsAppMessage[]> = {};
const localOrders: WhatsAppOrder[] = [];

/**
 * Obtiene todas las conversaciones de WhatsApp
 */
export async function getConversations(): Promise<WhatsAppConversation[]> {
  try {
    return [...localConversations];
  } catch {
    console.error('Error loading conversations.');
    throw new Error('Error al cargar conversaciones');
  }
}

/**
 * Obtiene los mensajes de una conversación específica
 */
export async function getMessages(conversationId: string): Promise<WhatsAppMessage[]> {
  try {
    return localMessages[conversationId] || [];
  } catch {
    console.error('Error loading messages.');
    throw new Error('Error al cargar mensajes');
  }
}

/**
 * Envía un mensaje en una conversación mediante Cloudflare Pages Functions
 */
export async function sendMessage(
  conversationId: string,
  message: string,
  messageType: 'text' | 'order_request' | 'location' | 'image' = 'text'
): Promise<string> {
  let user = null;
  try {
    user = auth.currentUser;
  } catch {
    // Si auth no está inicializado
  }

  if (!user) throw new Error('Debes iniciar sesión para enviar mensajes');

  try {
    const payload = { conversationId, message, messageType };
    const result = await apiClient.post<any>('/whatsapp/send', payload);
    const providerMessageId = result?.data?.messages?.[0]?.id || result?.messageId || result?.id;
    if (typeof providerMessageId !== 'string' || providerMessageId.length === 0) {
      throw new Error('No se pudo enviar el mensaje');
    }
    return providerMessageId;
  } catch (error) {
    if (error instanceof Error && error.message === 'No se pudo enviar el mensaje') throw error;
    throw new Error('No se pudo enviar el mensaje');
  }
}

/**
 * Obtiene todas las órdenes de WhatsApp
 */
export async function getWhatsAppOrders(): Promise<WhatsAppOrder[]> {
  return [...localOrders];
}

/**
 * Crea una nueva orden desde WhatsApp
 */
export async function createWhatsAppOrder(orderData: Omit<WhatsAppOrder, 'id'>): Promise<string> {
  const id = `wo-${Date.now()}`;
  localOrders.unshift({ id, ...orderData, createdAt: new Date() });
  return id;
}

/**
 * Actualiza el estado de una orden
 */
export async function updateOrderStatus(
  orderId: string,
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled'
): Promise<void> {
  const order = localOrders.find((o) => o.id === orderId);
  if (order) {
    order.status = status;
  }
}

/**
 * Procesa un mensaje para detectar órdenes y direcciones
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
  const conv = localConversations.find((c) => c.id === conversationId);
  if (conv) {
    conv.status = 'archived';
  }
}

/**
 * Obtiene órdenes pendientes de WhatsApp
 */
export async function getPendingWhatsAppOrders(): Promise<WhatsAppOrder[]> {
  return localOrders.filter((o) => o.status === 'pending');
}
