import { useEffect, useState } from 'react';

export const MOBILE_QUERY = '(max-width: 767.98px)';
export const DESKTOP_WIDE_QUERY = '(min-width: 1024px)';

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * Suscribe el componente a una media query. Cuando el entorno no soporta
 * `matchMedia` (jsdom, SSR) devuelve `fallback` para que el layout de
 * escritorio siga siendo el comportamiento por defecto.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    canMatch() ? window.matchMedia(query).matches : fallback,
  );

  useEffect(() => {
    if (!canMatch()) return undefined;
    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQueryList.matches);

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);
      return () => mediaQueryList.removeEventListener('change', handleChange);
    }
    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, [query]);

  return matches;
}

/** `true` en teléfonos (< 768px). Sin `matchMedia` asume escritorio. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY, false);
}

/** `true` en pantallas anchas (>= 1024px). Sin `matchMedia` asume escritorio ancho. */
export function useIsWideScreen(): boolean {
  return useMediaQuery(DESKTOP_WIDE_QUERY, true);
}
