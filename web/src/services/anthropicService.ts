/**
 * Servicio para interactuar con la API de Anthropic (Claude)
 * Usa proxy backend para proteger la API key
 */

import { getAuth } from 'firebase/auth';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const auth = getAuth();

async function getProxyHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión para usar el análisis de productos');

  try {
    const idToken = await user.getIdToken();
    return {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    };
  } catch {
    throw new Error('No se pudo verificar la sesión para usar el análisis de productos');
  }
}

interface ProductAnalysisResult {
  nombre: string;
  precio_sugerido: number | null;
  categoria: string;
}

interface ProductFromAudioResult {
  nombre: string;
  precio: number | null;
  stock: number | null;
  categoria: string;
}

/**
 * Analiza una imagen de producto usando Claude Vision (vía backend proxy)
 */
export async function analyzeProductImage(imageBase64: string): Promise<ProductAnalysisResult> {
  const response = await fetch(`${BACKEND_URL}/api/anthropic/analyze-image`, {
    method: 'POST',
    headers: await getProxyHeaders(),
    body: JSON.stringify({ imageBase64 }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al analizar imagen');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Analiza texto dictado de un producto usando Claude (vía backend proxy)
 */
export async function analyzeProductAudio(transcribedText: string): Promise<ProductFromAudioResult> {
  const response = await fetch(`${BACKEND_URL}/api/anthropic/analyze-audio`, {
    method: 'POST',
    headers: await getProxyHeaders(),
    body: JSON.stringify({ transcribedText }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al analizar audio');
  }

  const result = await response.json();
  return result.data;
}
