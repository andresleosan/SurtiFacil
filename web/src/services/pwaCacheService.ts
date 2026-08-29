export const PRIVATE_RUNTIME_CACHE_NAMES = ['googleapis-cache', 'firebase-cache'] as const;

export async function clearPrivateRuntimeCaches(): Promise<void> {
  if (typeof globalThis.caches === 'undefined') return;
  await Promise.all(PRIVATE_RUNTIME_CACHE_NAMES.map((cacheName) => globalThis.caches.delete(cacheName)));
}
