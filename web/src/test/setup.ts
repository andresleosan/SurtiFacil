import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof window !== 'undefined' && (!window.localStorage || typeof window.localStorage.clear !== 'function')) {
  const store = new Map<string, string>();
  const storageShim: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storageShim });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storageShim });
}

afterEach(() => {
  cleanup();
});
