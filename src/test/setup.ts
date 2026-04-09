/**
 * Test environment polyfills for Vitest running in `node` mode.
 * Provides a minimal localStorage implementation with clear() to satisfy hooks.
 */

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const store = new Map<string, string>();

  globalThis.localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}
