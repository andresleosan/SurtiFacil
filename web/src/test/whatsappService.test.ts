import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  currentUser: {
    getIdToken: vi.fn(async () => 'firebase-id-token'),
  } as { getIdToken: () => Promise<string> } | null,
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => authMock,
}));

vi.mock('../firebase/config', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  Timestamp: { now: vi.fn() },
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

import { sendMessage } from '../services/whatsappService';

describe('WhatsApp outbound client contract', () => {
  beforeEach(() => {
    authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
    vi.restoreAllMocks();
  });

  it('sends the Firebase Bearer token and contract body to the backend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { messages: [{ id: 'wamid-1' }] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(sendMessage('conversation-1', 'Hola', 'text')).resolves.toBe('wamid-1');

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/whatsapp/send'), expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer firebase-id-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: 'conversation-1', message: 'Hola', messageType: 'text' }),
    }));
  });

  it('does not write delivery records directly when the backend rejects the send', async () => {
    const { addDoc, updateDoc } = await import('firebase/firestore');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(sendMessage('conversation-1', 'Hola')).rejects.toThrow('No se pudo enviar el mensaje');
    expect(addDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('fails safely when there is no authenticated Firebase user', async () => {
    authMock.currentUser = null;

    await expect(sendMessage('conversation-1', 'Hola')).rejects.toThrow('Debes iniciar sesión');
  });
});
