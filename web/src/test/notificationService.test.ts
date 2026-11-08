import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  notifyNewCustomerOrder,
  sendTestNotification,
} from '../services/notificationService';

describe('notificationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detecta soporte de notificaciones según el entorno de ventana', () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(),
    });
    expect(isNotificationSupported()).toBe(true);
  });

  it('devuelve el permiso actual de Notification', () => {
    const perm = getNotificationPermission();
    expect(['default', 'granted', 'denied']).toContain(perm);
  });

  it('solicita permisos mediante Notification.requestPermission', async () => {
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });

    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(Notification.requestPermission).toHaveBeenCalled();
  });

  it('emite notificación de nuevo pedido con datos correctos', async () => {
    const mockNotification = vi.fn();
    vi.stubGlobal('Notification', Object.assign(mockNotification, {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    }));

    await notifyNewCustomerOrder({
      order_code: '#K-99',
      customer_name: 'Doña Teresa',
      total_cents: 850000,
      source: 'kiosk',
    });

    expect(mockNotification).toHaveBeenCalledWith(
      '🔔 ¡Nuevo Pedido en Mostrador! (#K-99)',
      expect.objectContaining({
        body: expect.stringContaining('Doña Teresa'),
      })
    );
  });

  it('sendTestNotification dispara una alerta de prueba si hay permisos', async () => {
    const mockNotification = vi.fn();
    vi.stubGlobal('Notification', Object.assign(mockNotification, {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    }));

    const result = await sendTestNotification();
    expect(result).toBe(true);
    expect(mockNotification).toHaveBeenCalledWith(
      '🔔 ¡Nuevo Pedido en Mostrador! (#K-TEST)',
      expect.objectContaining({
        body: expect.stringContaining('Don Andrés de Prueba'),
      })
    );
  });
});
