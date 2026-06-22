import { afterEach, describe, expect, it } from 'vitest';
import { paneStorage } from './storage';

// storage.ts reads the `window` and `Office` globals lazily, so we can set and
// clear them per test without jsdom.
function setGlobal(key: string, value: unknown): void {
  Reflect.set(globalThis, key, value);
}
function clearGlobal(key: string): void {
  Reflect.deleteProperty(globalThis, key);
}

function fakeLocalStorage() {
  const map = new Map<string, string>();
  return {
    map,
    ls: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  };
}

afterEach(() => {
  clearGlobal('window');
  clearGlobal('Office');
});

describe('paneStorage', () => {
  it('prefixes keys with the Office partition key when present', () => {
    const { map, ls } = fakeLocalStorage();
    setGlobal('window', { localStorage: ls });
    setGlobal('Office', { context: { partitionKey: 'pk1' } });

    const store = paneStorage();
    store.setItem('auth', 'v');

    expect(map.has('pk:pk1:auth')).toBe(true);
    expect(store.getItem('auth')).toBe('v');
  });

  it('uses no prefix when there is no partition key', () => {
    const { map, ls } = fakeLocalStorage();
    setGlobal('window', { localStorage: ls });

    paneStorage().setItem('auth', 'v');

    expect(map.has('auth')).toBe(true);
  });

  it('falls back to in-memory when localStorage is unavailable', () => {
    const store = paneStorage();
    store.setItem('auth', 'v');
    expect(store.getItem('auth')).toBe('v');
    store.removeItem('auth');
    expect(store.getItem('auth')).toBeNull();
  });
});
