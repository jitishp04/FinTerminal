import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finnhubFeed } from "./finnhubStream";
import { createHub, FLUSH_EVERY, IDLE, LINGER, type Socket, type Watcher } from "./stream";
import { health, resetHealth } from "./health";

class FakeSocket {
  sent: { type: string; symbol: string }[] = [];
  closed = false;
  onopen: Socket["onopen"] = null;
  onmessage: Socket["onmessage"] = null;
  onclose: Socket["onclose"] = null;
  onerror: Socket["onerror"] = null;

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.call(this as unknown as WebSocket, new Event("open"));
  }
  message(body: unknown) {
    this.onmessage?.call(this as unknown as WebSocket, { data: typeof body === "string" ? body : JSON.stringify(body) } as MessageEvent);
  }
  /** As a browser's WebSocket fails: an error, then a close. */
  drop(code = 1006) {
    this.onerror?.call(this as unknown as WebSocket, new Event("error"));
    this.onclose?.call(this as unknown as WebSocket, { code } as CloseEvent);
  }
  /** As Node's fails a handshake: an error and no close. */
  error() {
    this.onerror?.call(this as unknown as WebSocket, new Event("error"));
  }
  /** As a server ends it: a close alone. */
  end(code: number) {
    this.onclose?.call(this as unknown as WebSocket, { code } as CloseEvent);
  }
  /** What it was asked to subscribe to, less what it was asked to drop. */
  get subscribed() {
    const symbols = new Set<string>();
    for (const { type, symbol } of this.sent) {
      if (type === "subscribe") symbols.add(symbol);
      else symbols.delete(symbol);
    }
    return [...symbols];
  }
}

let sockets: FakeSocket[];
const latest = () => sockets.at(-1)!;

const MAX_STREAMED = finnhubFeed.max;

// The hub, on Finnhub's feed, with fake sockets.
function setup() {
  sockets = [];
  return createHub({
    ...finnhubFeed,
    connect: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as Socket;
    },
  });
}

const watcher = () => ({ onTrades: vi.fn<Watcher["onTrades"]>(), onLive: vi.fn<Watcher["onLive"]>() });

const trade = (s: string, p: number, t: number) => ({ type: "trade", data: [{ s, p, t, v: 100, c: ["1"] }] });

// Monday 2 November 2026, 10:00 in New York.
const NOW = Date.UTC(2026, 10, 2, 15);

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  resetHealth();
  vi.stubEnv("FINNHUB_API_KEY", "key");
  vi.stubEnv("FAIL_SOURCES", "");
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("watch", () => {
  it("opens one socket and, once it's open, subscribes to the US symbols in Finnhub's form", () => {
    const hub = setup();
    const panel = watcher();
    hub.watch(["AAPL", "^GSPC", "BRK-B", "EURUSD=X"], panel);
    expect(sockets).toHaveLength(1);
    expect(latest().sent).toEqual([]);
    expect(panel.onLive).toHaveBeenLastCalledWith([]);

    latest().open();
    expect(latest().subscribed).toEqual(["AAPL", "BRK.B"]);
    expect(panel.onLive).toHaveBeenLastCalledWith(["AAPL", "BRK-B"]);
  });

  it("opens no socket for symbols Finnhub doesn't have, and says none stream", () => {
    const hub = setup();
    const panel = watcher();
    hub.watch(["^GSPC", "GC=F"], panel);
    expect(sockets).toHaveLength(0);
    expect(panel.onLive).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("shares the socket, and subscribes once to a symbol two watchers have", () => {
    const hub = setup();
    hub.watch(["AAPL", "MSFT"], watcher());
    latest().open();
    const second = watcher();
    hub.watch(["MSFT", "NVDA"], second);
    expect(sockets).toHaveLength(1);
    expect(latest().sent.filter(({ type }) => type === "subscribe").map(({ symbol }) => symbol)).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(second.onLive).toHaveBeenCalledExactlyOnceWith(["MSFT", "NVDA"]);
  });

  it("tells a watcher only when its own symbols change", () => {
    const hub = setup();
    const first = watcher();
    hub.watch(["AAPL"], first);
    latest().open();
    hub.watch(["MSFT"], watcher());
    expect(first.onLive.mock.calls).toEqual([[[]], [["AAPL"]]]);
  });

  it("streams no more than the free plan's 50 symbols, the first asked for", () => {
    const hub = setup();
    const many = Array.from({ length: MAX_STREAMED }, (_, i) => `S${String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26))}`);
    hub.watch(many, watcher());
    latest().open();
    const late = watcher();
    hub.watch(["AAPL", many[0]], late);
    expect(latest().subscribed).toHaveLength(MAX_STREAMED);
    expect(latest().subscribed).not.toContain("AAPL");
    expect(late.onLive).toHaveBeenLastCalledWith([many[0]]);
  });

  it("gives a freed place to a symbol past the cap", () => {
    const hub = setup();
    const many = Array.from({ length: MAX_STREAMED }, (_, i) => `S${String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26))}`);
    const stop = hub.watch(many, watcher());
    latest().open();
    const late = watcher();
    hub.watch(["AAPL"], late);
    stop();
    vi.advanceTimersByTime(LINGER);
    expect(latest().subscribed).toEqual(["AAPL"]);
    expect(late.onLive).toHaveBeenLastCalledWith(["AAPL"]);
  });
});

describe("trades", () => {
  it("hands each watcher the latest trade of its own symbols, once a second, in seconds and Yahoo's form", () => {
    const hub = setup();
    const first = watcher();
    const second = watcher();
    hub.watch(["AAPL", "BRK-B"], first);
    hub.watch(["MSFT"], second);
    latest().open();
    latest().message(trade("AAPL", 270.1, NOW + 100));
    latest().message({ type: "trade", data: [{ s: "AAPL", p: 270.3, t: NOW + 300 }, { s: "AAPL", p: 270.2, t: NOW + 200 }, { s: "BRK.B", p: 480.5, t: NOW + 250 }] });
    expect(first.onTrades).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FLUSH_EVERY);
    expect(first.onTrades).toHaveBeenCalledExactlyOnceWith([
      { symbol: "AAPL", price: 270.3, time: (NOW + 300) / 1000 },
      { symbol: "BRK-B", price: 480.5, time: (NOW + 250) / 1000 },
    ]);
    expect(second.onTrades).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FLUSH_EVERY);
    expect(first.onTrades).toHaveBeenCalledTimes(1);
  });

  it("drops trades in symbols no one watches any more", () => {
    const hub = setup();
    const panel = watcher();
    const stop = hub.watch(["AAPL"], watcher());
    hub.watch(["MSFT"], panel);
    latest().open();
    stop();
    vi.advanceTimersByTime(LINGER);
    latest().message(trade("AAPL", 270, NOW));
    vi.advanceTimersByTime(FLUSH_EVERY);
    expect(panel.onTrades).not.toHaveBeenCalled();
  });

  it("logs Finnhub's errors and anything that isn't JSON, and goes on", () => {
    const hub = setup();
    const panel = watcher();
    hub.watch(["AAPL"], panel);
    latest().open();
    latest().message({ type: "error", msg: "Subscribing to too many symbols" });
    latest().message("not json");
    latest().message(trade("AAPL", 270, NOW));
    vi.advanceTimersByTime(FLUSH_EVERY);
    expect(logged).toHaveBeenCalledWith("Finnhub's stream: Subscribing to too many symbols");
    expect(panel.onTrades).toHaveBeenCalledOnce();
  });
});

describe("letting go", () => {
  it("unsubscribes a symbol a few seconds after its last watcher goes", () => {
    const hub = setup();
    const stop = hub.watch(["AAPL", "MSFT"], watcher());
    hub.watch(["MSFT"], watcher());
    latest().open();
    stop();
    vi.advanceTimersByTime(LINGER - 1);
    expect(latest().subscribed).toEqual(["AAPL", "MSFT"]);
    vi.advanceTimersByTime(1);
    expect(latest().subscribed).toEqual(["MSFT"]);
  });

  it("keeps a symbol taken back within those seconds, as when a panel's stream reopens", () => {
    const hub = setup();
    const stop = hub.watch(["AAPL"], watcher());
    latest().open();
    stop();
    hub.watch(["AAPL", "MSFT"], watcher());
    vi.advanceTimersByTime(LINGER);
    expect(latest().sent).toEqual([
      { type: "subscribe", symbol: "AAPL" },
      { type: "subscribe", symbol: "MSFT" },
    ]);
  });

  it("closes the socket a minute after nothing is left to stream, unless something's wanted again", () => {
    const hub = setup();
    const stop = hub.watch(["AAPL"], watcher());
    latest().open();
    stop();
    vi.advanceTimersByTime(LINGER + IDLE - 1);
    const stopAgain = hub.watch(["MSFT"], watcher());
    vi.advanceTimersByTime(IDLE);
    expect(latest().closed).toBe(false);
    expect(sockets).toHaveLength(1);

    stopAgain();
    vi.advanceTimersByTime(LINGER + IDLE);
    expect(latest().closed).toBe(true);
    expect(sockets).toHaveLength(1);
  });

  it("stops a watcher only once", () => {
    const hub = setup();
    const stop = hub.watch(["AAPL"], watcher());
    hub.watch(["AAPL"], watcher());
    latest().open();
    stop();
    stop();
    vi.advanceTimersByTime(LINGER);
    expect(latest().subscribed).toEqual(["AAPL"]);
  });
});

describe("failures", () => {
  it("notes the socket opening in Finnhub's health", async () => {
    const hub = setup();
    hub.watch(["AAPL"], watcher());
    latest().open();
    await vi.advanceTimersByTimeAsync(0);
    expect(health().find(({ id }) => id === "finnhub")).toMatchObject({ state: "ok" });
  });

  it("says nothing streams when the socket drops, then reconnects and subscribes again", () => {
    const hub = setup();
    const panel = watcher();
    hub.watch(["AAPL", "MSFT"], panel);
    latest().open();
    latest().drop();
    expect(panel.onLive).toHaveBeenLastCalledWith([]);

    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    latest().open();
    expect(latest().subscribed).toEqual(["AAPL", "MSFT"]);
    expect(panel.onLive).toHaveBeenLastCalledWith(["AAPL", "MSFT"]);
  });

  it("waits twice as long after each failure, and starts over once the socket has worked", async () => {
    const hub = setup();
    hub.watch(["AAPL"], watcher());
    const gaps: number[] = [];
    let last = Date.now();
    for (let i = 0; i < 8; i++) {
      latest().drop();
      const count = sockets.length;
      while (sockets.length === count) await vi.advanceTimersByTimeAsync(500);
      gaps.push(Date.now() - last);
      last = Date.now();
    }
    expect(gaps).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(health().find(({ id }) => id === "finnhub")).toMatchObject({ state: "down" });
    expect(logged).toHaveBeenCalledWith(new Error("Finnhub's stream failed before it opened"));

    latest().open();
    latest().message({ type: "ping" });
    latest().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(10);
  });

  it("retries a handshake that fails with only an error, as Node's WebSocket does, and lets that socket go", async () => {
    const hub = setup();
    hub.watch(["AAPL"], watcher());
    latest().error();
    expect(sockets[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
  });

  it("retries once for an error followed by a close", async () => {
    const hub = setup();
    hub.watch(["AAPL"], watcher());
    latest().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
  });

  it("names the close code when the server ends it before it opens", async () => {
    const hub = setup();
    hub.watch(["AAPL"], watcher());
    latest().end(1008);
    await vi.advanceTimersByTimeAsync(0);
    expect(logged).toHaveBeenCalledWith(new Error("Finnhub's stream closed (code 1008) before it opened"));
  });

  it("doesn't reconnect when nothing is wanted", async () => {
    const hub = setup();
    const stop = hub.watch(["AAPL"], watcher());
    latest().open();
    stop();
    vi.advanceTimersByTime(LINGER);
    latest().drop();
    await vi.advanceTimersByTimeAsync(2 * IDLE);
    expect(sockets).toHaveLength(1);
  });

  it("opens no socket while FAIL_SOURCES includes finnhub, and keeps trying", async () => {
    vi.stubEnv("FAIL_SOURCES", "finnhub");
    const hub = setup();
    const panel = watcher();
    hub.watch(["AAPL"], panel);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(0);
    expect(panel.onLive).toHaveBeenCalledExactlyOnceWith([]);
    expect(health().find(({ id }) => id === "finnhub")).toMatchObject({ state: "down" });

    vi.stubEnv("FAIL_SOURCES", "");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });
});
