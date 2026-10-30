import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalStore } from "./localStore";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createLocalStore", () => {
  it("saves to localStorage and tells subscribers", () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    const store = createLocalStore("test.key");
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.save("one");
    unsubscribe();
    store.save("two");

    expect(saved.get("test.key")).toBe("two");
    expect(store.getSnapshot()).toBe("two");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the value in memory when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const store = createLocalStore("test.key");

    store.save("one");

    expect(store.getSnapshot()).toBe("one");
  });

  it("renders the default on the server", () => {
    expect(createLocalStore("test.key").getServerSnapshot()).toBeNull();
  });
});
