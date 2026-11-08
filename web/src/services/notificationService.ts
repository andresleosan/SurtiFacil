/**
 * Servicio de Notificaciones Web / PWA para Mostrador de SurtiFácil
 * Permite alertar al tendero cuando entra un nuevo pedido (Kiosco, Web o WhatsApp)
 * incluso si la pestaña está en segundo plano o minimizada.
 */

import { playNewOrderChime } from '../utils/audioAlerts';
import { formatCentsCOP } from '../utils/currency';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch (err) {
    console.warn('Error al solicitar permiso de notificación:', err);
    return false;
  }
}

export interface NewOrderNotificationData {
  order_code: string;
  customer_name: string;
  total_cents: number;
  source?: 'kiosk' | 'web' | 'whatsapp';
}

export async function notifyNewCustomerOrder(order: NewOrderNotificationData): Promise<void> {
  // 1. Siempre emitir chime acústico en el mostrador
  try {
    playNewOrderChime();
  } catch {
    // Si el audio está bloqueado por autoplay
  }

  // 2. Si las notificaciones no son compatibles o no están autorizadas, omitir notificación del sistema
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  const sourceLabel =
    order.source === 'kiosk' ? '📱 Kiosco iPad' : order.source === 'whatsapp' ? '💬 WhatsApp' : '🛍️ Tienda Vecinal';

  const title = `🔔 ¡Nuevo Pedido en Mostrador! (${order.order_code})`;
  const body = `${order.customer_name} · ${formatCentsCOP(order.total_cents)} (${sourceLabel}). Toca para facturar.`;

  try {
    // Si tenemos Service Worker activo, usar showNotification para mejor soporte en Android / PWA
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200],
          tag: `order-${order.order_code}`,
          data: { url: '/#/create-sale' },
        } as any);
        return;
      }
    }

    // Fallback a Notification de navegador estándar
    const notif = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `order-${order.order_code}`,
    });

    notif.onclick = () => {
      window.focus();
      window.location.hash = '#/create-sale';
      notif.close();
    };
  } catch (err) {
    console.warn('Error al disparar notificación nativa:', err);
  }
}

export async function sendTestNotification(): Promise<boolean> {
  if (!isNotificationSupported()) {
    throw new Error('Tu navegador no soporta notificaciones de escritorio.');
  }

  let perm = Notification.permission;
  if (perm !== 'granted') {
    perm = await Notification.requestPermission();
  }

  if (perm !== 'granted') {
    throw new Error('Permiso de notificaciones denegado. Habilítalo en los ajustes del navegador.');
  }

  await notifyNewCustomerOrder({
    order_code: '#K-TEST',
    customer_name: 'Don Andrés de Prueba',
    total_cents: 1450000,
    source: 'kiosk',
  });

  return true;
}
