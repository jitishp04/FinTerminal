import YahooFinance from "yahoo-finance2";
import type { ChartResultArrayQuote } from "yahoo-finance2/modules/chart";
import type { Quote as YahooQuote } from "yahoo-finance2/modules/quote";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import { ApiError } from "../api";
import { cached } from "../cache";
import type { Bar, Chart, ChartRange, Profile, Quote } from "../types";

// Unofficial, keyless and for personal use: the library keeps Yahoo's cookie and crumb.
const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

const QUOTE_TTL = 10 * SECOND;
const PROFILE_TTL = 60 * MINUTE;

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

/** Latest quotes in one Yahoo request. Unknown symbols are left out. */
export function quote(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols)];
  return cached(`quote:${unique.join(",")}`, QUOTE_TTL, async () =>
    (await yahoo.quote(unique)).flatMap((q) => toQuote(q) ?? []),
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

/** Company or fund description plus key stats. Indices, FX and futures get name and price stats only. */
export function profile(symbol: string): Promise<Profile> {
  return cached(`profile:${symbol}`, PROFILE_TTL, () =>
    orNotFound(symbol, async () =>
      toProfile(
        symbol,
        await yahoo.quoteSummary(symbol, {
          modules: ["price", "summaryDetail", "assetProfile", "defaultKeyStatistics", "fundProfile"],
        }),
      ),
    ),
  );
}

/** Yahoo reports an unknown symbol as a plain Error; answer it with a 404. */
async function orNotFound<T>(symbol: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof Error && /quote not found|no data found/i.test(error.message)) {
      throw new ApiError(404, `No data for ${symbol}`);
    }
    throw error;
  }
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

export function toQuote(q: YahooQuote): Quote | undefined {
  if (q.regularMarketPrice === undefined) return undefined;
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

/** Drops Yahoo's empty bars (FX and futures have gaps) and fills a missing open/high/low with the close. */
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
    peRatio: detail?.trailingPE,
    forwardPE: detail?.forwardPE ?? stats?.forwardPE,
    eps: stats?.trailingEps,
    dividendYield: detail?.dividendYield ?? detail?.yield,
    beta: detail?.beta ?? stats?.beta,
    week52High: detail?.fiftyTwoWeekHigh,
    week52Low: detail?.fiftyTwoWeekLow,
    averageVolume: detail?.averageVolume,
    sharesOutstanding: stats?.sharesOutstanding,
  };
}
