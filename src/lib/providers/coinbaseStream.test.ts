import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coinbaseFeed } from "./coinbaseStream";
import { resetHealth } from "./health";
import { createHub, FLUSH_EVERY, type Socket } from "./stream";

// A ticker message as the feed sends one, trimmed of fields the hub doesn't read.
const ticker = (product_id: string, price: string, time: string) =>
  JSON.stringify({ type: "ticker", sequence: 1, product_id, price, best_bid: price, best_ask: price, side: "buy", time, trade_id: 1, last_size: "0.01" });

describe("coinbaseFeed", () => {
  it("streams CRYPTO's coins and nothing else", () => {
    expect(coinbaseFeed.covers("BTC-USD")).toBe(true);
    expect(coinbaseFeed.covers("SHIB-USD")).toBe(true);
    expect(coinbaseFeed.covers("PEPE-USD")).toBe(false);
    expect(coinbaseFeed.covers("AAPL")).toBe(false);
    expect(coinbaseFeed.covers("BRK-B")).toBe(false);
  });

  it("subscribes and unsubscribes a product on the ticker channel", () => {
    expect(JSON.parse(coinbaseFeed.subscribe("BTC-USD"))).toEqual({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] });
    expect(JSON.parse(coinbaseFeed.unsubscribe("ETH-USD"))).toEqual({ type: "unsubscribe", product_ids: ["ETH-USD"], channels: ["ticker"] });
  });

  it("reads a ticker as a trade, its price from a string and its time to the millisecond", () => {
    expect(coinbaseFeed.read(ticker("BTC-USD", "77750.61", "2026-11-01T12:48:02.061769Z"))).toEqual({
      alive: true,
      trades: [{ symbol: "BTC-USD", price: 77750.61, time: Date.UTC(2026, 10, 1, 12, 48, 2, 61) / 1000 }],
    });
  });

  it("takes a confirmation or a heartbeat as a sign of life", () => {
    expect(coinbaseFeed.read(JSON.stringify({ type: "subscriptions", channels: [{ name: "ticker", product_ids: ["BTC-USD"] }] }))).toEqual({ alive: true });
    expect(coinbaseFeed.read(JSON.stringify({ type: "heartbeat", product_id: "BTC-USD" }))).toEqual({ alive: true });
  });

  it("passes on an error with its reason", () => {
    expect(coinbaseFeed.read(JSON.stringify({ type: "error", message: "Failed to subscribe", reason: "PEPE-USD is not a valid product" }))).toEqual({
      error: "Failed to subscribe: PEPE-USD is not a valid product",
    });
    expect(coinbaseFeed.read(JSON.stringify({ type: "error" }))).toEqual({ error: "an unnamed error" });
  });

  it("skips a ticker it can't make sense of, and a message it doesn't use", () => {
    expect(coinbaseFeed.read(ticker("BTC-USD", "n/a", "2026-11-01T12:48:02Z"))).toEqual({ alive: true });
    expect(coinbaseFeed.read(ticker("BTC-USD", "77750.61", "yesterday"))).toEqual({ alive: true });
    expect(coinbaseFeed.read(JSON.stringify({ type: "status" }))).toEqual({});
  });

  it("throws on what isn't JSON, for the hub to log", () => {
    expect(() => coinbaseFeed.read("<html>")).toThrow();
  });
});

describe("the hub on Coinbase's feed", () => {
  let sockets: { sent: string[]; open: () => void; message: (data: string) => void }[];

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1, 7) });
    vi.stubEnv("FAIL_SOURCES", "");
    resetHealth();
    sockets = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function setup() {
    return createHub({
      ...coinbaseFeed,
      connect: () => {
        const socket = {
          sent: [] as string[],
          onopen: null as Socket["onopen"],
          onmessage: null as Socket["onmessage"],
          onclose: null as Socket["onclose"],
          onerror: null as Socket["onerror"],
          send(data: string) {
            this.sent.push(data);
          },
          close() {},
          open() {
            this.onopen?.call(this as unknown as WebSocket, new Event("open"));
          },
          message(data: string) {
            this.onmessage?.call(this as unknown as WebSocket, { data } as MessageEvent);
          },
        };
        sockets.push(socket);
        return socket as unknown as Socket;
      },
    });
  }

  it("subscribes to the coins on screen once open, and hands on each one's latest price every second", () => {
    const hub = setup();
    const onTrades = vi.fn();
    const onLive = vi.fn();
    hub.watch(["BTC-USD", "AAPL", "ETH-USD", "^GSPC"], { onTrades, onLive });
    sockets[0].open();
    expect(sockets[0].sent.map((data) => JSON.parse(data).product_ids[0])).toEqual(["BTC-USD", "ETH-USD"]);
    expect(onLive).toHaveBeenLastCalledWith(["BTC-USD", "ETH-USD"]);

    sockets[0].message(ticker("BTC-USD", "77750.61", "2026-11-01T07:00:00.100Z"));
    sockets[0].message(ticker("BTC-USD", "77751.00", "2026-11-01T07:00:00.400Z"));
    vi.advanceTimersByTime(FLUSH_EVERY);
    expect(onTrades).toHaveBeenCalledExactlyOnceWith([{ symbol: "BTC-USD", price: 77751, time: Date.UTC(2026, 10, 1, 7, 0, 0, 400) / 1000 }]);
  });
});
