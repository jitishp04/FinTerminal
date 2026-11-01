import { ApiError } from "../api";
import { cached } from "../cache";
import type { Quote } from "../types";
import { tracked } from "./health";

const BASE = "https://finnhub.io/api/v1";

// The free plan takes one symbol a request and 60 requests a minute, so this can't poll the way Yahoo's batch does.
const QUOTE_TTL = 60 * 1000;

// Indices, FX, futures, crypto and foreign tickers all carry a mark of some kind: ^GSPC, EURUSD=X, GC=F, BTC-USD, VOD.L.
const US_TICKER = /^[A-Z]{1,5}(-[A-Z])?$/;

interface FinnhubQuote {
  /** Last price. 0 for a symbol Finnhub doesn't know. */
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
  /** Epoch seconds. */
  t: number;
}

/** Whether Finnhub can stand in for this symbol: its free plan has US stocks and funds only. */
export const covers = (symbol: string) => US_TICKER.test(symbol);

function toQuote(symbol: string, { c, d, dp, h, l, o, pc, t }: FinnhubQuote): Quote | null {
  if (!c) return null;
  return {
    symbol,
    // Its quotes come without a name, and without a kind: SPY looks the same as AAPL.
    name: symbol,
    type: "UNKNOWN",
    currency: "USD",
    price: c,
    change: d ?? undefined,
    changePercent: dp ?? undefined,
    previousClose: pc,
    open: o,
    dayHigh: h,
    dayLow: l,
    time: t,
  };
}

/** The latest quote, or null if Finnhub doesn't know the symbol. */
export function quote(symbol: string): Promise<Quote | null> {
  return cached(`finnhub:quote:${symbol}`, QUOTE_TTL, () =>
    tracked("finnhub", async () => {
      // Yahoo's BRK-B is Finnhub's BRK.B.
      const response = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(symbol.replace("-", "."))}`, {
        headers: { "X-Finnhub-Token": process.env.FINNHUB_API_KEY ?? "" },
      });
      if (response.status === 401) throw new ApiError(401, "Finnhub refused FINNHUB_API_KEY. Check it in .env.local.");
      if (!response.ok) throw new Error(`Finnhub answered ${response.status} for ${symbol}`);
      return toQuote(symbol, (await response.json()) as FinnhubQuote);
    }),
  );
}
