import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "./cache";

/** A load whose result the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("cached", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearCache();
  });
  afterEach(() => vi.useRealTimers());

  it("loads once and serves the value until the TTL passes", async () => {
    const load = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    expect(await cached("k", 1000, load)).toBe("first");
    vi.advanceTimersByTime(999);
    expect(await cached("k", 1000, load)).toBe("first");
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(await cached("k", 1000, load)).toBe("second");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);

    const a = cached("k", 1000, load);
    const b = cached("k", 1000, load);
    pending.resolve("value");

    expect(await Promise.all([a, b])).toEqual(["value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("starts the TTL when the load finishes, not when it starts", async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);

    const first = cached("k", 1000, load);
    vi.advanceTimersByTime(5000);
    pending.resolve("slow");
    await first;

    expect(await cached("k", 1000, load)).toBe("slow");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("up");

    await expect(cached("k", 1000, load)).rejects.toThrow("down");
    expect(await cached("k", 1000, load)).toBe("up");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps keys apart", async () => {
    expect(await cached("a", 1000, async () => 1)).toBe(1);
    expect(await cached("b", 1000, async () => 2)).toBe(2);
  });
});
