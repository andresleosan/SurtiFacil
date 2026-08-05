import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  currentUser: {
    getIdToken: vi.fn(async () => 'firebase-id-token'),
  } as { getIdToken: () => Promise<string> } | null,
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => authMock,
}));

import { analyzeProductAudio, analyzeProductImage } from '../services/anthropicService';

describe('Anthropic proxy auth contract', () => {
  beforeEach(() => {
    authMock.currentUser = { getIdToken: vi.fn(async () => 'firebase-id-token') };
    vi.restoreAllMocks();
  });

  it('sends only the Firebase Bearer header for image analysis', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { nombre: 'Arroz', precio_sugerido: 1000, categoria: 'Abarrotes' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(analyzeProductImage('base64-image')).resolves.toEqual(expect.objectContaining({ nombre: 'Arroz' }));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/anthropic/analyze-image'), expect.objectContaining({
      headers: {
        Authorization: 'Bearer firebase-id-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64: 'base64-image' }),
    }));
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toMatch(/ADMIN_API_KEY|WHATSAPP_API_TOKEN/);
  });

  it('sends only the Firebase Bearer header for audio analysis', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { nombre: 'Leche', precio: 2500, stock: 4, categoria: 'Lácteos' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(analyzeProductAudio('agrega leche')).resolves.toEqual(expect.objectContaining({ nombre: 'Leche' }));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/anthropic/analyze-audio'), expect.objectContaining({
      headers: {
        Authorization: 'Bearer firebase-id-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcribedText: 'agrega leche' }),
    }));
  });
});
