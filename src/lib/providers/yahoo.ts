import YahooFinance from "yahoo-finance2";
import type { ChartEventDividend, ChartMeta, ChartResultArrayQuote } from "yahoo-finance2/modules/chart";
import type { Quote as YahooQuote } from "yahoo-finance2/modules/quote";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import { ApiError } from "../api";
import { cached } from "../cache";
import { wallClock } from "../chartData";
import type { Bar, Chart, ChartRange, History, MoverType, Profile, Quote } from "../types";
import { tracked } from "./health";

// Unofficial, keyless and for personal use: the library keeps Yahoo's cookie and crumb.
const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

// Under the watchlist's 10 s poll: the TTL starts when Yahoo answers, so at 10 s every other poll would be a cache hit.
const QUOTE_TTL = 8 * SECOND;
// Under the 60 s poll, for the same reason.
const MOVERS_TTL = 50 * SECOND;
const PROFILE_TTL = 60 * MINUTE;
// Daily closes change once a day, and a full history is a big download.
const HISTORY_TTL = 4 * 60 * MINUTE;

const MOVERS_COUNT = 25;

const daysAgo = (days: number) => (now: Date) => new Date(now.getTime() - days * DAY);
const startOfYear = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

// Calendar days holding 200 trading days, or 200 weeks: history fetched before a range so SMA 200 covers it.
const DAILY_HISTORY = 300;
const WEEKLY_HISTORY = 1410;

/**
 * How each range is fetched: `days` of bars back from today, history included.
 * Intraday ranges start at the last N trading sessions in the data, the others at `start`.
 */
const RANGES: Record<
  ChartRange,
  { interval: "5m" | "15m" | "1d" | "1wk"; days: number; ttl: number } & (
    | { sessions: number }
    | { start: (now: Date) => Date }
  )
> = {
  "1D": { interval: "5m", days: 7, sessions: 1, ttl: MINUTE },
  "5D": { interval: "15m", days: 30, sessions: 5, ttl: MINUTE },
  "1M": { interval: "1d", days: 31 + DAILY_HISTORY, start: daysAgo(31), ttl: 10 * MINUTE },
  "6M": { interval: "1d", days: 183 + DAILY_HISTORY, start: daysAgo(183), ttl: 10 * MINUTE },
  YTD: { interval: "1d", days: 366 + DAILY_HISTORY, start: startOfYear, ttl: 10 * MINUTE },
  "1Y": { interval: "1d", days: 366 + DAILY_HISTORY, start: daysAgo(366), ttl: 10 * MINUTE },
  "5Y": { interval: "1wk", days: 1827 + WEEKLY_HISTORY, start: daysAgo(1827), ttl: 10 * MINUTE },
};

/** Yahoo's list for each mover type, and how to rank it: Yahoo's own order isn't strict. */
const MOVER_LISTS = {
  gainers: { scrIds: "day_gainers", rank: (q: Quote) => -(q.changePercent ?? 0) },
  losers: { scrIds: "day_losers", rank: (q: Quote) => q.changePercent ?? 0 },
  actives: { scrIds: "most_actives", rank: (q: Quote) => -(q.volume ?? 0) },
} as const;

/** Yahoo's `JPY=X` means USD/JPY, so `USDJPY=X` is the same pair, and it may answer with either name. */
const samePair = (symbol: string) => symbol.replace(/^USD([A-Z]{3}=X)$/, "$1");

/** Latest quotes in one Yahoo request, under the symbols asked for. Unknown symbols are left out. */
export function quote(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols)];
  return cached(`quote:${unique.join(",")}`, QUOTE_TTL, () =>
    tracked("yahoo", async () => {
      // Yahoo answers some symbols with a stub (BRK.B). Validating would throw away the whole batch for it.
      const rows = (await yahoo.quote(unique, {}, { validateResult: false })) as YahooQuote[];
      const asked = new Map(unique.map((symbol) => [samePair(symbol), symbol]));
      return rows.flatMap((row) => {
        const quote = toQuote(row);
        return quote ? [{ ...quote, symbol: asked.get(samePair(quote.symbol)) ?? quote.symbol }] : [];
      });
    }),
  );
}

/** One list of the day's top US stocks, best ranked first. */
export function movers(type: MoverType): Promise<Quote[]> {
  const { scrIds, rank } = MOVER_LISTS[type];
  return cached(`movers:${type}`, MOVERS_TTL, () =>
    tracked("yahoo", async () => {
      // Not validated, for the same reason as quote().
      const options = { scrIds, count: MOVERS_COUNT };
      const { quotes } = (await yahoo.screener(options, undefined, { validateResult: false })) as {
        quotes: { regularMarketTime?: number }[];
      };
      return quotes
        .flatMap((row) => {
          // The same fields as quote(), except that the time comes in epoch seconds.
          const time = row.regularMarketTime;
          return toQuote({ ...row, regularMarketTime: time && new Date(time * 1000) } as unknown as YahooQuote) ?? [];
        })
        .sort((a, b) => rank(a) - rank(b));
    }),
  );
}

/** Price bars for `range`, with the bar size the range calls for, plus history before it. */
export function chart(symbol: string, range: ChartRange): Promise<Chart> {
  const spec = RANGES[range];
  const { interval } = spec;
  return cached(`chart:${symbol}:${range}`, spec.ttl, () =>
    orNotFound(symbol, async () => {
      const now = new Date();
      // The library defaults to adding pre- and post-market bars; charts show the regular session.
      const { meta, quotes } = await yahoo.chart(symbol, { period1: daysAgo(spec.days)(now), interval, includePrePost: false });
      const timeZone = meta.exchangeTimezoneName;
      const bars = toBars(quotes);
      const from = "sessions" in spec ? sessionStart(bars, timeZone, spec.sessions) : seconds(spec.start(now));
      return { symbol: meta.symbol, range, interval, currency: meta.currency, timeZone, from: from ?? seconds(now), bars };
    }),
  );
}

/** Every daily close since the symbol began, to the last full day, with its dividends. */
export function history(symbol: string): Promise<History> {
  return cached(`history:${symbol}`, HISTORY_TTL, () =>
    orNotFound(symbol, async () => {
      const { meta, quotes, events } = await yahoo.chart(symbol, {
        period1: new Date(0),
        interval: "1d",
        includePrePost: false,
        events: "div",
      });
      return toHistory(meta, quotes, events?.dividends ?? [], new Date());
    }),
  );
}

/** Company or fund description plus key stats. Indices, FX and futures get name and price stats only. */
export function profile(symbol: string): Promise<Profile> {
  return cached(`profile:${symbol}`, PROFILE_TTL, () =>
    orNotFound(symbol, async () =>
      toProfile(
        symbol,
        // Yahoo skips modules a symbol lacks (financialData for funds) as long as one is present.
        await yahoo.quoteSummary(symbol, {
          modules: ["price", "summaryDetail", "assetProfile", "defaultKeyStatistics", "fundProfile", "financialData"],
        }),
      ),
    ),
  );
}

/** Yahoo reports an unknown symbol as a plain Error; answer it with a 404. */
function orNotFound<T>(symbol: string, load: () => Promise<T>): Promise<T> {
  return tracked("yahoo", async () => {
    try {
      return await load();
    } catch (error) {
      if (error instanceof Error && /quote not found|no data found/i.test(error.message)) {
        throw new ApiError(404, `No data for ${symbol}`);
      }
      throw error;
    }
  });
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

export function toQuote(q: YahooQuote): Quote | undefined {
  if (typeof q.regularMarketPrice !== "number") return undefined;
  return {
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    type: q.quoteType,
    currency: q.currency,
    exchange: q.fullExchangeName ?? q.exchange,
    price: q.regularMarketPrice,
    change: q.regularMarketChange,
    changePercent: q.regularMarketChangePercent,
    previousClose: q.regularMarketPreviousClose,
    open: q.regularMarketOpen,
    dayHigh: q.regularMarketDayHigh,
    dayLow: q.regularMarketDayLow,
    volume: q.regularMarketVolume,
    marketState: q.marketState,
    time: q.regularMarketTime ? seconds(q.regularMarketTime) : undefined,
  };
}

/**
 * Drops Yahoo's empty bars (FX and futures have gaps) and fills a missing open/high/low with the close.
 * Keeps the dividend-adjusted close where Yahoo has one.
 */
export function toBars(rows: ChartResultArrayQuote[]): Bar[] {
  return rows.flatMap((r) => {
    if (r.close == null) return [];
    return [
      {
        time: seconds(r.date),
        open: r.open ?? r.close,
        high: r.high ?? r.close,
        low: r.low ?? r.close,
        close: r.close,
        ...(r.adjclose != null && { adjClose: r.adjclose }),
        volume: r.volume ?? 0,
      },
    ];
  });
}

/** When the last `sessions` trading days begin, by date in the exchange's time zone. */
export function sessionStart(bars: Bar[], timeZone: string, sessions: number): number | undefined {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dates = bars.map((b) => day.format(b.time * 1000));
  const unique = [...new Set(dates)];
  const first = dates.indexOf(unique[Math.max(0, unique.length - sessions)]);
  return first === -1 ? undefined : bars[first].time;
}

export function toProfile(symbol: string, r: QuoteSummaryResult): Profile {
  const { price, summaryDetail: detail, assetProfile: about, defaultKeyStatistics: stats, fundProfile: fund } = r;
  const financials = r.financialData;
  return {
    symbol: price?.symbol ?? symbol,
    name: price?.longName ?? price?.shortName ?? symbol,
    type: price?.quoteType ?? "UNKNOWN",
    currency: price?.currency ?? detail?.currency,
    exchange: price?.exchangeName,
    description: about?.longBusinessSummary,
    sector: about?.sector,
    industry: about?.industry,
    country: about?.country,
    website: about?.website,
    employees: about?.fullTimeEmployees,
    category: fund?.categoryName ?? undefined,
    marketCap: detail?.marketCap,
    totalAssets: detail?.totalAssets,
    expenseRatio: fund?.feesExpensesInvestment?.annualReportExpenseRatio ?? stats?.annualReportExpenseRatio,
    peRatio: detail?.trailingPE,
    forwardPE: detail?.forwardPE ?? stats?.forwardPE,
    eps: stats?.trailingEps,
    dividendYield: detail?.dividendYield ?? detail?.yield,
    beta: detail?.beta ?? stats?.beta,
    week52High: detail?.fiftyTwoWeekHigh,
    week52Low: detail?.fiftyTwoWeekLow,
    averageVolume: detail?.averageVolume,
    sharesOutstanding: stats?.sharesOutstanding,
    grossMargin: financials?.grossMargins,
    operatingMargin: financials?.operatingMargins,
    profitMargin: financials?.profitMargins ?? stats?.profitMargins,
  };
}

/** Daily bars as dated closes, in the exchange's time zone. Today's is left out: it may still be trading. */
export function toHistory(meta: ChartMeta, rows: ChartResultArrayQuote[], dividends: ChartEventDividend[], now: Date): History {
  const day = (time: number) => new Date(wallClock(time, meta.exchangeTimezoneName) * 1000).toISOString().slice(0, 10);
  const today = day(seconds(now));
  return {
    symbol: meta.symbol,
    type: meta.instrumentType,
    currency: meta.currency,
    days: toBars(rows).flatMap(({ time, close, adjClose }) => {
      const date = day(time);
      return date < today ? [{ date, close, adjClose: adjClose ?? close }] : [];
    }),
    dividends: dividends.flatMap(({ date, amount }) => {
      const exDate = day(seconds(date));
      return exDate < today ? [{ date: exDate, amount }] : [];
    }),
  };
}
