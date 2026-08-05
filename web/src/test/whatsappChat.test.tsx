import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const whatsappMock = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  getWhatsAppOrders: vi.fn(),
  processMessageForOrder: vi.fn(),
  createWhatsAppOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  archiveConversation: vi.fn(),
}));

vi.mock('../services/whatsappService', () => whatsappMock);
vi.mock('../services/saleService', () => ({ getProducts: vi.fn() }));

import WhatsAppChat from '../components/WhatsAppChat';

describe('WhatsAppChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whatsappMock.getConversations.mockRejectedValue(new Error('provider secret=do-not-log'));
    whatsappMock.getWhatsAppOrders.mockResolvedValue([]);
    whatsappMock.getMessages.mockResolvedValue([]);
  });

  it('uses Meta Graph API and WhatsApp Cloud API configuration copy', () => {
    render(<WhatsAppChat />);

    expect(screen.getByText('Backend con webhooks de Meta configurado')).toBeInTheDocument();
    expect(screen.getByText('Número de WhatsApp Business verificado en Meta')).toBeInTheDocument();
    expect(screen.getByText('Credenciales de Meta Graph API / WhatsApp Cloud API configuradas en variables de entorno')).toBeInTheDocument();
    expect(screen.queryByText(/Twilio/i)).not.toBeInTheDocument();
  });

  it('logs a generic message without the raw error object when loading fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<WhatsAppChat />);

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error loading conversations.'));
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('provider secret');
    consoleError.mockRestore();
  });
});
