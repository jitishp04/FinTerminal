// The saved layout as an external store for useSyncExternalStore: the server
// renders the default layout, and the browser switches to the saved one without
// a hydration mismatch. Falls back to memory when localStorage is unavailable
// (private windows, blocked site data).
const KEY = "finterminal.layout.v1";
const listeners = new Set<() => void>();
let memory: string | null = null;

export function subscribeLayout(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLayoutSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function getServerLayoutSnapshot(): string | null {
  return null;
}

export function saveLayout(raw: string) {
  memory = raw;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // Storage unavailable: the layout lives in memory for this page load.
  }
  listeners.forEach((listener) => listener());
}
