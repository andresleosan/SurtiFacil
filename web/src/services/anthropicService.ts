/**
 * Servicio para interactuar con la API de Anthropic (Claude)
 * Usa proxy backend para proteger la API key
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcribedText }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al analizar audio');
  }

  const result = await response.json();
  return result.data;
}
