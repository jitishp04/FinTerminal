// Live prices: which symbols stream, what a trade does to a quote, and the page's one stream of them.
import { isUsMarketOpen } from "./market";
import { CRYPTO } from "./monitors";
import { MAX_QUOTE_SYMBOLS, type Quote, type Trade } from "./types";

// Indices, FX, futures, crypto and foreign tickers all carry a mark of some kind: ^GSPC, EURUSD=X, GC=F, BTC-USD, VOD.L.
const US_TICKER = /^[A-Z]{1,5}(-[A-Z])?$/;

/** Whether Finnhub has this symbol: its free plan has US stocks and funds only. */
export const covers = (symbol: string) => US_TICKER.test(symbol);

const COINS = new Set(CRYPTO.flatMap((group) => group.items.map((item) => item.symbol)));

/** Whether Coinbase streams this symbol: the coins `CRYPTO` shows, which it lists under Yahoo's names. */
export const isCoin = (symbol: string) => COINS.has(symbol);

/** Whether any source streams this symbol. */
export const streams = (symbol: string) => covers(symbol) || isCoin(symbol);

// What Yahoo calls a US market after the close: its quote then is the day's close.
const AFTER_THE_CLOSE = new Set(["POST", "POSTPOST", "CLOSED"]);

/**
 * The quote moved on to a newer trade: its last price, change, day's range and time.
 * A stock's quote is Yahoo's regular-session one, so only a trade in that session counts: 09:30 to 16:00
 * in New York, and not once Yahoo says the market has closed, as it does early on some holiday eves.
 * Crypto trades around the clock, so any newer trade counts.
 */
export function withTrade(quote: Quote, trade: Trade | undefined): Quote {
  if (!trade || quote.previousClose === undefined) return quote;
  if (quote.time !== undefined && trade.time < quote.time) return quote;
  const inSession = isUsMarketOpen(new Date(trade.time * 1000)) && !AFTER_THE_CLOSE.has(quote.marketState ?? "");
  if (quote.type !== "CRYPTOCURRENCY" && !inSession) return quote;
  const { price, time } = trade;
  const change = price - quote.previousClose;
  return {
    ...quote,
    price,
    change,
    changePercent: (change / quote.previousClose) * 100,
    dayHigh: Math.max(quote.dayHigh ?? price, price),
    dayLow: Math.min(quote.dayLow ?? price, price),
    time,
  };
}

export interface LiveSnapshot {
  /** Each symbol's latest trade. */
  trades: ReadonlyMap<string, Trade>;
  /** The symbols streaming right now. */
  live: ReadonlySet<string>;
}

/** The parts of an EventSource the stream uses. */
export type Source = Pick<EventSource, "close"> & {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
};

/** Panels asking for a symbol, then letting go of it, as they change, within this are one change to the stream. */
export const SETTLE = 100;

/**
 * The page's stream of live trades: one `/api/stream` for every symbol a panel shows that streams, reopened as that changes.
 * `open` makes an EventSource.
 */
export function createLiveStream(open: (url: string) => Source) {
  const wanted = new Map<string, number>();
  const listeners = new Set<() => void>();
  let snapshot: LiveSnapshot = { trades: new Map(), live: new Set() };
  let source: Source | null = null;
  let streaming = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  function publish(next: Partial<LiveSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }

  function reopen() {
    timer = undefined;
    // The route takes as many as a quote request.
    const symbols = [...wanted.keys()].slice(0, MAX_QUOTE_SYMBOLS);
    const key = symbols.join(",");
    if (key === streaming) return;
    streaming = key;
    source?.close();
    source = null;
    const kept = new Set(symbols);
    publish({ trades: new Map([...snapshot.trades].filter(([symbol]) => kept.has(symbol))), live: new Set() });
    if (symbols.length === 0) return;

    const current = open(`/api/stream?symbols=${symbols.map(encodeURIComponent).join(",")}`);
    source = current;
    current.addEventListener("live", ({ data }) => publish({ live: new Set(JSON.parse(data) as string[]) }));
    current.addEventListener("trades", ({ data }) => {
      const trades = new Map(snapshot.trades);
      for (const trade of JSON.parse(data) as Trade[]) trades.set(trade.symbol, trade);
      publish({ trades });
    });
    // Whether it's reconnecting or has given up, as without a Finnhub key, nothing streams until it says so again.
    current.addEventListener("error", () => {
      if (snapshot.live.size > 0) publish({ live: new Set() });
    });
  }

  const settle = () => {
    clearTimeout(timer);
    timer = setTimeout(reopen, SETTLE);
  };

  return {
    /** Streams the symbols a source has, while `symbols` is on screen. Returns a function that lets them go. */
    watch(symbols: string[]): () => void {
      const own = [...new Set(symbols)].filter(streams);
      if (own.length === 0) return () => {};
      for (const symbol of own) wanted.set(symbol, (wanted.get(symbol) ?? 0) + 1);
      settle();
      let watching = true;
      return () => {
        if (!watching) return;
        watching = false;
        for (const symbol of own) {
          const count = wanted.get(symbol)! - 1;
          if (count > 0) wanted.set(symbol, count);
          else wanted.delete(symbol);
        }
        settle();
      };
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

export type LiveStream = ReturnType<typeof createLiveStream>;
