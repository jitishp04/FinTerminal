import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveStream, isCoin, movingNow, SETTLE, type Source, streams, withTrade } from "./live";
import { MAX_QUOTE_SYMBOLS, type Quote } from "./types";

// Monday 2 November 2026 in New York, on Eastern Standard Time: 09:30 there is 14:30 UTC.
const at = (hours: number, minutes: number, seconds = 0) => Date.UTC(2026, 10, 2, hours + 5, minutes, seconds) / 1000;

const AAPL: Quote = {
  symbol: "AAPL",
  name: "Apple Inc.",
  type: "EQUITY",
  price: 270,
  change: 2,
  changePercent: (2 / 268) * 100,
  previousClose: 268,
  dayHigh: 271,
  dayLow: 266,
  volume: 1_000_000,
  marketState: "REGULAR",
  time: at(10, 0),
};

const trade = (price: number, time: number) => ({ symbol: "AAPL", price, time });

describe("withTrade", () => {
  it("moves the price, change and time on to a newer trade, and keeps the rest", () => {
    expect(withTrade(AAPL, trade(272.5, at(10, 0, 5.25)))).toEqual({
      ...AAPL,
      price: 272.5,
      change: 4.5,
      changePercent: (4.5 / 268) * 100,
      dayHigh: 272.5,
      time: at(10, 0, 5.25),
    });
  });

  it("widens the day's range downward too, and leaves it alone inside it", () => {
    expect(withTrade(AAPL, trade(265, at(10, 1)))).toMatchObject({ dayHigh: 271, dayLow: 265 });
    expect(withTrade(AAPL, trade(268, at(10, 1)))).toMatchObject({ dayHigh: 271, dayLow: 266 });
  });

  it("starts the day's range at the trade when the quote has none", () => {
    expect(withTrade({ ...AAPL, dayHigh: undefined, dayLow: undefined }, trade(272, at(10, 1)))).toMatchObject({ dayHigh: 272, dayLow: 272 });
  });

  it("goes negative below the previous close", () => {
    expect(withTrade(AAPL, trade(261.3, at(10, 1)))).toMatchObject({ change: expect.closeTo(-6.7, 10), changePercent: expect.closeTo(-2.5, 10) });
  });

  it("ignores a trade older than the quote, and takes one as new", () => {
    expect(withTrade(AAPL, trade(272, at(9, 59, 59)))).toBe(AAPL);
    expect(withTrade(AAPL, trade(272, at(10, 0)))).toMatchObject({ price: 272 });
  });

  it("takes a quote with no time", () => {
    expect(withTrade({ ...AAPL, time: undefined }, trade(272, at(10, 1)))).toMatchObject({ price: 272 });
  });

  it("counts only trades in the regular session, 09:30 to 16:00 in New York", () => {
    const before = { ...AAPL, marketState: "PRE", time: at(9, 0) };
    expect(withTrade(before, trade(272, at(9, 29, 59)))).toBe(before);
    expect(withTrade(before, trade(272, at(9, 30)))).toMatchObject({ price: 272 });
    expect(withTrade(AAPL, trade(272, at(15, 59, 59)))).toMatchObject({ price: 272 });
    expect(withTrade(AAPL, trade(272, at(16, 0)))).toBe(AAPL);
  });

  it.each(["POST", "POSTPOST", "CLOSED"])("ignores a trade once Yahoo calls the market %s, as after an early close", (marketState) => {
    const closed = { ...AAPL, marketState };
    expect(withTrade(closed, trade(272, at(13, 30)))).toBe(closed);
  });

  it("counts a crypto trade at any hour, even on a Sunday night, as long as it's newer", () => {
    const btc: Quote = { ...AAPL, symbol: "BTC-USD", type: "CRYPTOCURRENCY", price: 77_000, previousClose: 76_000, marketState: "REGULAR", time: at(-2, 0) };
    // 22:30 on Sunday in New York.
    const sunday = Date.UTC(2026, 10, 2, 3, 30) / 1000;
    expect(withTrade(btc, { symbol: "BTC-USD", price: 77_500, time: sunday })).toMatchObject({ price: 77_500, change: 1_500 });
    expect(withTrade(btc, { symbol: "BTC-USD", price: 77_500, time: at(-3, 0) })).toBe(btc);
  });

  it("leaves a quote with no previous close, and one with no trade", () => {
    const unanchored = { ...AAPL, previousClose: undefined };
    expect(withTrade(unanchored, trade(272, at(10, 1)))).toBe(unanchored);
    expect(withTrade(AAPL, undefined)).toBe(AAPL);
  });
});

class FakeSource {
  closed = false;
  listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(public url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

let sources: FakeSource[];
const latest = () => sources.at(-1)!;
const symbolsOf = (source: FakeSource) => new URL(source.url, "http://localhost").searchParams.get("symbols");

function setup() {
  sources = [];
  return createLiveStream((url) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source as unknown as Source;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLiveStream", () => {
  it("opens one stream for the US symbols on screen, once panels settle", () => {
    const stream = setup();
    stream.watch(["AAPL", "^GSPC"]);
    stream.watch(["MSFT", "AAPL", "BRK-B"]);
    expect(sources).toHaveLength(0);
    vi.advanceTimersByTime(SETTLE);
    expect(sources).toHaveLength(1);
    expect(symbolsOf(latest())).toBe("AAPL,MSFT,BRK-B");
  });

  it("streams CRYPTO's coins too, but not other crypto or FX", () => {
    const stream = setup();
    stream.watch(["BTC-USD", "AAPL", "PEPE-USD", "EURUSD=X"]);
    vi.advanceTimersByTime(SETTLE);
    expect(symbolsOf(latest())).toBe("BTC-USD,AAPL");
  });

  it("opens nothing for symbols no source streams", () => {
    const stream = setup();
    const stop = stream.watch(["^GSPC", "EURUSD=X"]);
    vi.advanceTimersByTime(SETTLE);
    stop();
    vi.advanceTimersByTime(SETTLE);
    expect(sources).toHaveLength(0);
  });

  it("reopens with the new set when a panel adds a symbol, closing the old stream", () => {
    const stream = setup();
    stream.watch(["AAPL"]);
    vi.advanceTimersByTime(SETTLE);
    stream.watch(["NVDA"]);
    vi.advanceTimersByTime(SETTLE);
    expect(sources).toHaveLength(2);
    expect(sources[0].closed).toBe(true);
    expect(symbolsOf(latest())).toBe("AAPL,NVDA");
  });

  it("keeps its stream when a panel lets go of symbols and takes them back, as on a re-render", () => {
    const stream = setup();
    const stop = stream.watch(["AAPL"]);
    vi.advanceTimersByTime(SETTLE);
    stop();
    stream.watch(["AAPL"]);
    vi.advanceTimersByTime(SETTLE);
    expect(sources).toHaveLength(1);
    expect(latest().closed).toBe(false);
  });

  it("closes the stream when the last panel goes, and lets go only once per watch", () => {
    const stream = setup();
    const stop = stream.watch(["AAPL"]);
    stream.watch(["AAPL"]);
    vi.advanceTimersByTime(SETTLE);
    stop();
    stop();
    vi.advanceTimersByTime(SETTLE);
    expect(latest().closed).toBe(false);
  });

  it("closes the stream with nothing left to show", () => {
    const stream = setup();
    const stop = stream.watch(["AAPL"]);
    vi.advanceTimersByTime(SETTLE);
    stop();
    vi.advanceTimersByTime(SETTLE);
    expect(sources).toHaveLength(1);
    expect(latest().closed).toBe(true);
  });

  it(`asks for at most ${MAX_QUOTE_SYMBOLS} symbols, the first on screen`, () => {
    const stream = setup();
    const many = Array.from({ length: MAX_QUOTE_SYMBOLS + 5 }, (_, i) => `S${String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26))}`);
    stream.watch(many);
    vi.advanceTimersByTime(SETTLE);
    expect(symbolsOf(latest())!.split(",")).toEqual(many.slice(0, MAX_QUOTE_SYMBOLS));
  });

  it("publishes what streams and each symbol's latest trade, and tells its listeners", () => {
    const stream = setup();
    const listener = vi.fn();
    stream.subscribe(listener);
    stream.watch(["AAPL", "MSFT"]);
    vi.advanceTimersByTime(SETTLE);
    latest().emit("live", ["AAPL", "MSFT"]);
    latest().emit("trades", [trade(272, 1), { symbol: "MSFT", price: 520, time: 1 }]);
    latest().emit("trades", [trade(273, 2)]);
    expect([...stream.getSnapshot().live]).toEqual(["AAPL", "MSFT"]);
    expect(Object.fromEntries(stream.getSnapshot().trades)).toEqual({ AAPL: trade(273, 2), MSFT: { symbol: "MSFT", price: 520, time: 1 } });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("says nothing streams after an error, until the stream says so again", () => {
    const stream = setup();
    stream.watch(["AAPL"]);
    vi.advanceTimersByTime(SETTLE);
    latest().emit("live", ["AAPL"]);
    latest().emit("error");
    expect(stream.getSnapshot().live.size).toBe(0);
    latest().emit("live", ["AAPL"]);
    expect([...stream.getSnapshot().live]).toEqual(["AAPL"]);
  });

  it("forgets what streamed, and the trades of symbols gone, when it reopens", () => {
    const stream = setup();
    const stop = stream.watch(["AAPL"]);
    stream.watch(["MSFT"]);
    vi.advanceTimersByTime(SETTLE);
    latest().emit("live", ["AAPL", "MSFT"]);
    latest().emit("trades", [trade(272, 1), { symbol: "MSFT", price: 520, time: 1 }]);
    stop();
    vi.advanceTimersByTime(SETTLE);
    expect(stream.getSnapshot().live.size).toBe(0);
    expect([...stream.getSnapshot().trades.keys()]).toEqual(["MSFT"]);
  });

  it("stops listening to a listener that unsubscribes", () => {
    const stream = setup();
    const listener = vi.fn();
    stream.subscribe(listener)();
    stream.watch(["AAPL"]);
    vi.advanceTimersByTime(SETTLE);
    latest().emit("live", ["AAPL"]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("movingNow", () => {
  const live = new Set(["AAPL", "SPY", "BTC-USD"]);

  it("counts every streaming symbol in the regular session", () => {
    expect(movingNow(live, true)).toBe(3);
  });

  it("counts only coins with the market closed, as a stock's price can't move", () => {
    expect(movingNow(live, false)).toBe(1);
  });

  it("is 0 when only stocks stream and the market is closed", () => {
    expect(movingNow(new Set(["AAPL"]), false)).toBe(0);
  });
});

describe("streams", () => {
  it("takes US stocks and funds, and CRYPTO's coins", () => {
    expect([streams("AAPL"), streams("BRK-B"), streams("SPY"), streams("BTC-USD"), streams("DOGE-USD")]).toEqual([true, true, true, true, true]);
    expect([streams("^GSPC"), streams("EURUSD=X"), streams("GC=F"), streams("PEPE-USD"), streams("VOD.L")]).toEqual([false, false, false, false, false]);
    expect(isCoin("AAPL")).toBe(false);
  });
});
