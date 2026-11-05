// Tipos para la integración de WhatsApp y Bot Sarin Vecino

export interface WhatsAppCartItem {
  productId: string;
  productName: string;
  quantity: number;
  unit?: string;
  priceCents: number;
  subtotalCents: number;
}

export interface WhatsAppConversation {
  id: string;
  phoneNumber: string;
  customerName: string;
  firstMessageDate: Date;
  lastMessageDate: Date;
  status: 'active' | 'archived' | 'paused';
  botActive?: boolean;
  pausedUntil?: string | null;
  cart?: WhatsAppCartItem[];
  lastMessageText?: string;
  deliveryAddress?: string;
  deliveryNeighborhood?: string;
}

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  sender: 'customer' | 'admin' | 'bot_sarin';
  message: string;
  timestamp: Date;
  messageType: 'text' | 'order_request' | 'location' | 'image';
  metadata?: {
    tools?: string[];
    orderCode?: string;
    trackingToken?: string;
    trackingUrl?: string;
  };
}

export interface WhatsAppOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface WhatsAppOrder {
  id: string;
  conversationId: string;
  phoneNumber: string;
  customerName: string;
  items: WhatsAppOrderItem[];
  deliveryAddress: string;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled';
  createdAt: Date;
  orderNotes: string;
}

export interface ProcessedMessageData {
  hasOrder: boolean;
  products?: { name: string; quantity: number }[];
  address?: string;
  rawText: string;
}

export interface SarinSimulationResult {
  reply: string | null;
  botPaused: boolean;
  cart: WhatsAppCartItem[];
  orderCreated?: {
    id: string;
    orderCode: string;
    totalCents: number;
    trackingToken: string;
    trackingUrl: string;
    deliveryType: 'delivery' | 'pickup_counter';
  } | null;
  toolsInvoked: Array<{
    tool: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
}
