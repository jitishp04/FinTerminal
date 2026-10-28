interface Entry {
  value: Promise<unknown>;
  /** Epoch ms. Infinity while the load is in flight, so callers share it. */
  expires: number;
}

const entries = new Map<string, Entry>();

/**
 * Returns `key`'s cached value, loading it when missing or older than `ttlMs`.
 * Concurrent misses share one load, and a failed load is not cached.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const entry: Entry = { value: load(), expires: Infinity };
  entries.set(key, entry);
  entry.value.then(
    () => {
      entry.expires = Date.now() + ttlMs;
    },
    () => {
      if (entries.get(key) === entry) entries.delete(key);
    },
  );
  return entry.value as Promise<T>;
}

/** Empties the cache. For tests. */
export function clearCache() {
  entries.clear();
}
