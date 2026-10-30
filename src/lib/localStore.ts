// A saved string as an external store for useSyncExternalStore: the server
// renders the default, and the browser switches to the saved value without a
// hydration mismatch. Falls back to memory when localStorage is unavailable
// (private windows, blocked site data).
export function createLocalStore(key: string) {
  const listeners = new Set<() => void>();
  let memory: string | null = null;

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): string | null {
      try {
        return localStorage.getItem(key) ?? memory;
      } catch {
        return memory;
      }
    },
    getServerSnapshot(): string | null {
      return null;
    },
    save(raw: string) {
      memory = raw;
      try {
        localStorage.setItem(key, raw);
      } catch {
        // Storage unavailable: the value lives in memory for this page load.
      }
      listeners.forEach((listener) => listener());
    },
  };
}
