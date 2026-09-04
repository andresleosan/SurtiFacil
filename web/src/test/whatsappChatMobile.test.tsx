import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_QUERY } from '../hooks/useMediaQuery';
import type { WhatsAppConversation } from '../types/whatsapp';

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

const CONVERSATION: WhatsAppConversation = {
  id: 'conv-1',
  phoneNumber: '+573001112233',
  customerName: 'Ana Pérez',
  firstMessageDate: new Date('2026-09-04T09:00:00Z'),
  lastMessageDate: new Date('2026-09-04T10:00:00Z'),
  status: 'active',
};

function stubViewport(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === MOBILE_QUERY ? mobile : !mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('WhatsAppChat on phones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubViewport(true);
    whatsappMock.getConversations.mockResolvedValue([CONVERSATION]);
    whatsappMock.getWhatsAppOrders.mockResolvedValue([]);
    whatsappMock.getMessages.mockResolvedValue([]);
    whatsappMock.processMessageForOrder.mockReturnValue({ hasOrder: false, rawText: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows only the conversation list until one is selected, then a back button returns to it', async () => {
    const user = userEvent.setup();
    render(<WhatsAppChat />);

    const conversationButton = await screen.findByRole('button', { name: /Ana Pérez/ });

    // Solo la lista: sin panel de conversación ni placeholder de escritorio
    expect(screen.getByPlaceholderText('Buscar cliente...')).toBeInTheDocument();
    expect(screen.queryByText('Selecciona una conversación para comenzar')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Escribe un mensaje...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver a conversaciones' })).not.toBeInTheDocument();

    await user.click(conversationButton);

    // Solo la conversación: la lista desaparece y aparece el botón de volver
    expect(await screen.findByPlaceholderText('Escribe un mensaje...')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar cliente...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a conversaciones' })).toBeInTheDocument();
    expect(whatsappMock.getMessages).toHaveBeenCalledWith('conv-1');

    await user.click(screen.getByRole('button', { name: 'Volver a conversaciones' }));

    expect(await screen.findByPlaceholderText('Buscar cliente...')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Escribe un mensaje...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
  });

  it('shows an inline alert instead of window.alert when sending fails', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    whatsappMock.sendMessage.mockRejectedValue(new Error('provider secret=do-not-log'));

    render(<WhatsAppChat />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.type(await screen.findByPlaceholderText('Escribe un mensaje...'), 'Hola');
    await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error al enviar mensaje');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(whatsappMock.sendMessage).toHaveBeenCalledWith('conv-1', 'Hola');
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error sending message.'));
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('provider secret');

    alertSpy.mockRestore();
    consoleError.mockRestore();
  });
});
