import { ApiError } from "../api";
import { cached } from "../cache";
import { type FinnhubNews, fromFinnhub } from "../news";
import type { NewsItem, Quote } from "../types";
import { tracked } from "./health";

const BASE = "https://finnhub.io/api/v1";

// The free plan takes one symbol a request and 60 requests a minute, so this can't poll the way Yahoo's batch does.
const QUOTE_TTL = 60 * 1000;
// Under the news panel's 5-minute refresh, for the same reason as quotes.
const NEWS_TTL = 4 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

// Whether Finnhub can stand in for a symbol. The browser needs it too, for the live stream.
export { covers } from "../live";

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

// Yahoo's BRK-B is Finnhub's BRK.B.
const finnhubSymbol = (symbol: string) => encodeURIComponent(symbol.replace("-", "."));

/** One Finnhub request, its key in a header so that it's never in a URL. */
async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: { "X-Finnhub-Token": process.env.FINNHUB_API_KEY ?? "" } });
  if (response.status === 401) throw new ApiError(401, "Finnhub refused FINNHUB_API_KEY. Check it in .env.local.");
  if (!response.ok) throw new Error(`Finnhub answered ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

/** The latest quote, or null if Finnhub doesn't know the symbol. */
export function quote(symbol: string): Promise<Quote | null> {
  return cached(`finnhub:quote:${symbol}`, QUOTE_TTL, () =>
    tracked("finnhub", async () => toQuote(symbol, await request<FinnhubQuote>(`/quote?symbol=${finnhubSymbol(symbol)}`))),
  );
}

/** A company's news over the last week. */
export function companyNews(symbol: string, now = new Date()): Promise<NewsItem[]> {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const range = `from=${day(new Date(now.getTime() - 7 * DAY_MS))}&to=${day(now)}`;
  return cached(`finnhub:news:${symbol}`, NEWS_TTL, () =>
    tracked("finnhub", async () => fromFinnhub(await request<FinnhubNews[]>(`/company-news?symbol=${finnhubSymbol(symbol)}&${range}`))),
  );
}

/** The latest news in one of Finnhub's categories: forex, crypto or merger. */
export function topicNews(category: string): Promise<NewsItem[]> {
  return cached(`finnhub:topic:${category}`, NEWS_TTL, () =>
    tracked("finnhub", async () => fromFinnhub(await request<FinnhubNews[]>(`/news?category=${category}`))),
  );
}
