import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { health, resetHealth, tracked } from "./health";

const source = (id: string) => health().find((entry) => entry.id === id)!;

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: Error) => error,
  );

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetHealth();
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 2, 15, 30) });
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SEC_USER_AGENT", "FinTerminal test@example.com");
  vi.stubEnv("FRED_API_KEY", "key");
  vi.stubEnv("FINNHUB_API_KEY", "key");
  vi.stubEnv("FAIL_SOURCES", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("tracked", () => {
  it("passes the answer through and notes when it came", async () => {
    expect(await tracked("yahoo", async () => "price")).toBe("price");
    expect(source("yahoo")).toMatchObject({ state: "ok", lastOk: Date.UTC(2026, 10, 2, 15, 30) });
  });

  it("turns a failure into a message that names the source, and logs the cause", async () => {
    const cause = new Error("socket hang up");
    const error = await rejection(
      tracked("yahoo", async () => {
        throw cause;
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, message: "Yahoo Finance isn't responding. Retrying…" });
    expect(logged).toHaveBeenCalledWith(cause);
    expect(source("yahoo").state).toBe("down");
  });

  it("keeps the last good time through a failure", async () => {
    await tracked("sec", async () => "ok");
    const lastOk = source("sec").lastOk;
    vi.advanceTimersByTime(60_000);
    await rejection(
      tracked("sec", async () => {
        throw new Error("timeout");
      }),
    );
    expect(source("sec")).toMatchObject({ state: "down", lastOk });
  });

  it("recovers on the next answer", async () => {
    await rejection(
      tracked("fred", async () => {
        throw new Error("timeout");
      }),
    );
    await tracked("fred", async () => "ok");
    expect(source("fred").state).toBe("ok");
  });

  it("counts a 404 as an answer: the source works and has no such record", async () => {
    const notFound = new ApiError(404, "No data for ZZZZ");
    const error = await rejection(
      tracked("yahoo", async () => {
        throw notFound;
      }),
    );
    expect(error).toBe(notFound);
    expect(source("yahoo").state).toBe("ok");
    expect(logged).not.toHaveBeenCalled();
  });

  it("counts a refused key as down, and keeps its message", async () => {
    const refused = new ApiError(401, "FRED refused FRED_API_KEY.");
    expect(
      await rejection(
        tracked("fred", async () => {
          throw refused;
        }),
      ),
    ).toBe(refused);
    expect(source("fred").state).toBe("down");
  });

  it("keeps one source's trouble to itself", async () => {
    await tracked("sec", async () => "ok");
    await rejection(
      tracked("yahoo", async () => {
        throw new Error("timeout");
      }),
    );
    expect(source("sec").state).toBe("ok");
  });
});

describe("FAIL_SOURCES", () => {
  it("makes a listed source fail without calling it", async () => {
    vi.stubEnv("FAIL_SOURCES", "yahoo, sec");
    const load = vi.fn(async () => "price");
    expect(await rejection(tracked("yahoo", load))).toMatchObject({ status: 502 });
    expect(await rejection(tracked("sec", load))).toMatchObject({ status: 502 });
    expect(load).not.toHaveBeenCalled();
  });

  it("leaves the others alone", async () => {
    vi.stubEnv("FAIL_SOURCES", "yahoo");
    expect(await tracked("fred", async () => "ok")).toBe("ok");
  });
});

describe("health", () => {
  it("lists every source, unused ones as idle", () => {
    expect(health()).toEqual([
      { id: "yahoo", name: "Yahoo Finance", state: "idle" },
      { id: "sec", name: "SEC EDGAR", state: "idle" },
      { id: "fred", name: "FRED", state: "idle" },
      { id: "finnhub", name: "Finnhub", state: "idle" },
      { id: "coinbase", name: "Coinbase", state: "idle" },
    ]);
  });

  it.each([
    ["sec", "SEC_USER_AGENT"],
    ["fred", "FRED_API_KEY"],
    ["finnhub", "FINNHUB_API_KEY"],
  ])("shows %s as off without %s", (id, name) => {
    vi.stubEnv(name, "");
    expect(source(id).state).toBe("off");
  });

  it("never shows Yahoo or Coinbase as off: they need no key", () => {
    expect(source("yahoo").state).toBe("idle");
    expect(source("coinbase").state).toBe("idle");
  });
});
