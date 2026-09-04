import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile, useIsWideScreen, useMediaQuery } from '../hooks/useMediaQuery';

type Listener = (event: { matches: boolean }) => void;

function stubMatchMedia(matching: (query: string) => boolean) {
  const listeners = new Map<string, Set<Listener>>();
  const matchMedia = vi.fn((query: string) => {
    const set = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, set);
    return {
      matches: matching(query),
      media: query,
      addEventListener: (_: 'change', listener: Listener) => set.add(listener),
      removeEventListener: (_: 'change', listener: Listener) => set.delete(listener),
    };
  });
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    emit(query: string, matches: boolean) {
      listeners.get(query)?.forEach((listener) => listener({ matches }));
    },
  };
}

describe('useMediaQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the fallback when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767.98px)', true));
    expect(result.current).toBe(true);
  });

  it('defaults to desktop layouts without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const mobile = renderHook(() => useIsMobile());
    const wide = renderHook(() => useIsWideScreen());
    expect(mobile.result.current).toBe(false);
    expect(wide.result.current).toBe(true);
  });

  it('tracks the media query and its change events', () => {
    const media = stubMatchMedia((query) => query === '(max-width: 767.98px)');
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    act(() => media.emit('(max-width: 767.98px)', false));
    expect(result.current).toBe(false);
  });
});
