import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../cache";
import { chart, history, movers, news, options, profile, quote, screen, sessionStart, weekly } from "./yahoo";

const yahoo = vi.hoisted(() => ({ quote: vi.fn(), chart: vi.fn(), quoteSummary: vi.fn(), screener: vi.fn(), options: vi.fn() }));

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = yahoo.quote;
    chart = yahoo.chart;
    quoteSummary = yahoo.quoteSummary;
    screener = yahoo.screener;
    options = yahoo.options;
  },
}));

// Trimmed from live responses on 28 Oct 2026.
const AAPL = {
  symbol: "AAPL",
  quoteType: "EQUITY",
  shortName: "Apple Inc.",
  longName: "Apple Inc.",
  currency: "USD",
  exchange: "NMS",
  fullExchangeName: "NasdaqGS",
  regularMarketPrice: 344.46,
  regularMarketChange: -2.64,
  regularMarketChangePercent: -0.76,
  regularMarketTime: new Date("2026-10-28T19:21:55Z"),
  marketState: "REGULAR",
};
const GOLD = { ...AAPL, symbol: "GC=F", quoteType: "FUTURE", shortName: "Gold Dec 26", longName: undefined };

const bar = (iso: string, close: number | null, extra = {}) => ({
  date: new Date(iso),
  open: close,
  high: close,
  low: close,
  close,
  volume: 100,
  ...extra,
});

const chartResult = (quotes: ReturnType<typeof bar>[]) => ({
  meta: { symbol: "AAPL", currency: "USD", exchangeTimezoneName: "America/New_York" },
  quotes,
});

beforeEach(() => {
  clearCache();
  vi.clearAllMocks();
});

describe("quote", () => {
  it("normalizes Yahoo's fields", async () => {
    yahoo.quote.mockResolvedValue([AAPL, GOLD]);

    const [aapl, gold] = await quote(["AAPL", "GC=F"]);
    expect(aapl).toMatchObject({
      symbol: "AAPL",
      name: "Apple Inc.",
      type: "EQUITY",
      exchange: "NasdaqGS",
      price: 344.46,
      changePercent: -0.76,
      time: 1793215315,
    });
    expect(gold.name).toBe("Gold Dec 26");
  });

  it("leaves out entries without a price", async () => {
    yahoo.quote.mockResolvedValue([AAPL, { ...GOLD, regularMarketPrice: undefined }]);
    expect((await quote(["AAPL", "GC=F"])).map((q) => q.symbol)).toEqual(["AAPL"]);
  });

  it("keeps one incomplete row from failing the whole batch", async () => {
    // Yahoo answers BRK.B with a stub, which fails the library's validation unless it's told not to throw.
    yahoo.quote.mockResolvedValue([AAPL, { symbol: "BRK.B", quoteType: "EQUITY" }, { ...GOLD, regularMarketPrice: null }]);

    expect((await quote(["AAPL", "BRK.B", "GC=F"])).map((q) => q.symbol)).toEqual(["AAPL"]);
    expect(yahoo.quote).toHaveBeenCalledWith(["AAPL", "BRK.B", "GC=F"], {}, { validateResult: false });
  });

  it("answers under the symbol asked for when Yahoo renames a USD pair", async () => {
    yahoo.quote.mockResolvedValue([{ ...AAPL, symbol: "JPY=X" }, { ...AAPL, symbol: "USDCAD=X" }, AAPL]);

    const quotes = await quote(["USDJPY=X", "CAD=X", "AAPL"]);

    expect(quotes.map((q) => q.symbol)).toEqual(["USDJPY=X", "CAD=X", "AAPL"]);
  });

  it("asks Yahoo once within the TTL, and once per symbol", async () => {
    yahoo.quote.mockResolvedValue([AAPL]);

    await quote(["AAPL", "AAPL"]);
    await quote(["AAPL"]);

    expect(yahoo.quote).toHaveBeenCalledTimes(1);
    expect(yahoo.quote.mock.calls[0][0]).toEqual(["AAPL"]);
  });

  it("answers every 10-second watchlist poll with fresh data", async () => {
    vi.useFakeTimers();
    // The TTL starts when Yahoo answers, so the delay is what could push a poll inside it.
    yahoo.quote.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([AAPL]), 300)));

    for (let poll = 0; poll < 3; poll++) {
      void quote(["AAPL"]);
      await vi.advanceTimersByTimeAsync(10_000);
    }

    vi.useRealTimers();
    expect(yahoo.quote).toHaveBeenCalledTimes(3);
  });
});

describe("movers", () => {
  // Trimmed from a live response on 30 Oct 2026. Unlike quote(), the time is in epoch seconds.
  const row = (symbol: string, changePercent: number, volume = 100) => ({
    ...AAPL,
    symbol,
    regularMarketChangePercent: changePercent,
    regularMarketVolume: volume,
    regularMarketTime: 1793385490,
  });

  it("asks Yahoo for the matching list without validating it", async () => {
    yahoo.screener.mockResolvedValue({ quotes: [] });

    await movers("actives");

    expect(yahoo.screener).toHaveBeenCalledWith({ scrIds: "most_actives", count: 25 }, undefined, {
      validateResult: false,
    });
  });

  it("normalizes rows like quotes, reading the time as epoch seconds", async () => {
    yahoo.screener.mockResolvedValue({ quotes: [row("CDNA", 19.44)] });

    const [first] = await movers("gainers");

    expect(first).toMatchObject({ symbol: "CDNA", name: "Apple Inc.", price: 344.46, time: 1793385490 });
  });

  it("leaves out a row without a price instead of failing the list", async () => {
    yahoo.screener.mockResolvedValue({ quotes: [row("CDNA", 19.44), { symbol: "BAD", quoteType: "EQUITY" }] });

    expect((await movers("gainers")).map((q) => q.symbol)).toEqual(["CDNA"]);
  });

  it("ranks each list itself, since Yahoo's order isn't strict", async () => {
    yahoo.screener.mockResolvedValue({ quotes: [row("A", 15, 10), row("B", 19, 30), row("C", -2, 20)] });

    expect((await movers("gainers")).map((q) => q.symbol)).toEqual(["B", "A", "C"]);
    expect((await movers("losers")).map((q) => q.symbol)).toEqual(["C", "A", "B"]);
    expect((await movers("actives")).map((q) => q.symbol)).toEqual(["B", "C", "A"]);
  });

  it("answers every 60-second poll with fresh data", async () => {
    vi.useFakeTimers();
    // The TTL starts when Yahoo answers, so the delay is what could push a poll inside it.
    yahoo.screener.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ quotes: [] }), 300)));

    for (let poll = 0; poll < 3; poll++) {
      void movers("gainers");
      await vi.advanceTimersByTimeAsync(60_000);
    }

    vi.useRealTimers();
    expect(yahoo.screener).toHaveBeenCalledTimes(3);
  });
});

describe("chart", () => {
  it("drops empty bars and fills a missing open, high or low with the close", async () => {
    yahoo.chart.mockResolvedValue(
      chartResult([
        bar("2026-10-27T13:30:00Z", 10, { open: null, high: 12 }),
        bar("2026-10-28T13:30:00Z", null),
        bar("2026-10-28T13:30:00Z", 11),
      ]),
    );

    const result = await chart("AAPL", "1Y");
    expect(result).toMatchObject({ symbol: "AAPL", range: "1Y", interval: "1d", timeZone: "America/New_York" });
    expect(result.bars).toEqual([
      { time: 1793107800, open: 10, high: 12, low: 10, close: 10, volume: 100 },
      { time: 1793194200, open: 11, high: 11, low: 11, close: 11, volume: 100 },
    ]);
  });

  it("keeps the dividend-adjusted close where Yahoo gives one", async () => {
    // From XLK's weekly bars on 1 Nov 2026: a dividend since then puts the adjusted close below the close.
    yahoo.chart.mockResolvedValue(
      chartResult([
        bar("2026-09-14T04:00:00Z", 189.6, { adjclose: 189.379 }),
        bar("2026-09-21T04:00:00Z", 196.27, { adjclose: null }),
      ]),
    );

    const [adjusted, unadjusted] = (await chart("XLK", "5Y")).bars;
    expect(adjusted).toMatchObject({ close: 189.6, adjClose: 189.379 });
    expect(unadjusted).not.toHaveProperty("adjClose");
  });

  it("asks for the bar size each range calls for, regular session only", async () => {
    yahoo.chart.mockResolvedValue(chartResult([]));

    await chart("AAPL", "1D");
    await chart("AAPL", "5Y");

    expect(yahoo.chart.mock.calls.map(([, options]) => options.interval)).toEqual(["5m", "1wk"]);
    expect(yahoo.chart.mock.calls.every(([, options]) => options.includePrePost === false)).toBe(true);
  });

  it("starts 1D at the last trading day, keeping earlier days as history", async () => {
    yahoo.chart.mockResolvedValue(
      chartResult([bar("2026-10-27T19:55:00Z", 1), bar("2026-10-28T13:30:00Z", 2), bar("2026-10-28T19:55:00Z", 3)]),
    );
    const result = await chart("AAPL", "1D");
    expect(result.from).toBe(Date.parse("2026-10-28T13:30:00Z") / 1000);
    expect(result.bars.map((b) => b.close)).toEqual([1, 2, 3]);
  });

  it("fetches about 200 bars of history before a daily or weekly range", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T20:00:00Z") });
    yahoo.chart.mockResolvedValue(chartResult([]));

    const sixMonths = await chart("AAPL", "6M");
    const fiveYears = await chart("AAPL", "5Y");
    vi.useRealTimers();

    const daysBefore = (from: number, period1: Date) => (from * 1000 - period1.getTime()) / 864e5;
    const [[, daily], [, weekly]] = yahoo.chart.mock.calls;
    expect(sixMonths.from).toBe(Date.parse("2026-04-28T20:00:00Z") / 1000);
    expect(daysBefore(sixMonths.from, daily.period1)).toBeGreaterThanOrEqual(290); // 200 trading days
    expect(daysBefore(fiveYears.from, weekly.period1)).toBeGreaterThanOrEqual(1400); // 200 weeks
  });

  it("answers an unknown symbol with a 404", async () => {
    yahoo.chart.mockRejectedValue(new Error("No data found, symbol may be delisted"));
    await expect(chart("ZZZZ", "1Y")).rejects.toMatchObject({ status: 404, message: "No data for ZZZZ" });
  });

  it("passes other failures through", async () => {
    yahoo.chart.mockRejectedValue(new Error("fetch failed"));
    await expect(chart("AAPL", "1Y")).rejects.toMatchObject({
      status: 502,
      message: "Yahoo Finance isn't responding. Retrying…",
    });
  });
});

describe("history", () => {
  // Trimmed from a live response on 1 Nov 2026, around NVDA's 10-for-1 split on 10 June 2024.
  const NVDA = {
    meta: { symbol: "NVDA", currency: "USD", instrumentType: "EQUITY", exchangeTimezoneName: "America/New_York" },
    quotes: [
      bar("2024-06-07T13:30:00Z", 120.888, { adjclose: 120.5443 }),
      bar("2024-06-10T13:30:00Z", 121.79, { adjclose: 121.4437 }),
      bar("2024-06-11T13:30:00Z", 120.91, { adjclose: 120.5761 }),
    ],
    events: {
      dividends: [
        { amount: 0.004, date: new Date("2024-03-05T14:30:00Z") },
        { amount: 0.01, date: new Date("2024-06-11T13:30:00Z") },
      ],
    },
  };

  it("asks for every day since 1970, with dividends", async () => {
    yahoo.chart.mockResolvedValue(NVDA);

    await history("NVDA");

    const [[symbol, options]] = yahoo.chart.mock.calls;
    expect(symbol).toBe("NVDA");
    expect(options).toMatchObject({ period1: new Date(0), interval: "1d", includePrePost: false, events: "div" });
  });

  it("keeps Yahoo's split-adjusted closes and dividends, so a split shows no jump", async () => {
    yahoo.chart.mockResolvedValue(NVDA);

    expect(await history("NVDA")).toEqual({
      symbol: "NVDA",
      type: "EQUITY",
      currency: "USD",
      days: [
        { date: "2024-06-07", close: 120.888, adjClose: 120.5443 },
        { date: "2024-06-10", close: 121.79, adjClose: 121.4437 },
        { date: "2024-06-11", close: 120.91, adjClose: 120.5761 },
      ],
      // $0.04 before the split, as Yahoo gives it: a tenth, like the closes.
      dividends: [
        { date: "2024-03-05", amount: 0.004 },
        { date: "2024-06-11", amount: 0.01 },
      ],
    });
  });

  it("dates days in the exchange's time zone, and leaves out today's, which may not be final", async () => {
    // Midday on 30 October in Sydney, where each day's bar is stamped 23:00 UTC the day before.
    vi.useFakeTimers({ now: new Date("2026-10-30T01:00:00Z") });
    yahoo.chart.mockResolvedValue({
      meta: { ...NVDA.meta, symbol: "BHP.AX", currency: "AUD", exchangeTimezoneName: "Australia/Sydney" },
      quotes: [bar("2026-10-28T23:00:00Z", 45.1), bar("2026-10-29T23:00:00Z", 45.6)],
      events: { dividends: [{ amount: 0.6, date: new Date("2026-10-29T23:00:00Z") }] },
    });

    const result = await history("BHP.AX");
    vi.useRealTimers();

    expect(result.days).toEqual([{ date: "2026-10-29", close: 45.1, adjClose: 45.1 }]);
    expect(result.dividends).toEqual([]);
  });

  it("answers an unknown symbol with a 404", async () => {
    yahoo.chart.mockRejectedValue(new Error("No data found, symbol may be delisted"));
    await expect(history("ZZZZ")).rejects.toMatchObject({ status: 404 });
  });
});

describe("weekly", () => {
  // In Stockholm, where a Monday's bar can land on the Sunday in UTC.
  const VOLVO = {
    meta: { symbol: "VOLV-B.ST", currency: "SEK", exchangeTimezoneName: "Europe/Stockholm" },
    quotes: [
      bar("2026-10-25T23:00:00Z", 300, { high: 305, low: 295, volume: 10 }),
      bar("2026-10-30T07:00:00Z", 310, { high: 320, low: 299, volume: 20 }),
      bar("2026-11-02T08:00:00Z", 305, { volume: 30 }),
      bar("2026-11-03T08:00:00Z", null),
    ],
  };

  it("asks for every day since 1970, in the regular session", async () => {
    yahoo.chart.mockResolvedValue(VOLVO);

    await weekly("VOLV-B.ST");

    const [[symbol, options]] = yahoo.chart.mock.calls;
    expect(symbol).toBe("VOLV-B.ST");
    expect(options).toEqual({ period1: new Date(0), interval: "1d", includePrePost: false });
  });

  it("makes weeks of the days, by the date on the exchange", async () => {
    yahoo.chart.mockResolvedValue(VOLVO);

    expect(await weekly("VOLV-B.ST")).toEqual({
      symbol: "VOLV-B.ST",
      currency: "SEK",
      weeks: [
        { time: Date.UTC(2026, 9, 26) / 1000, open: 300, high: 320, low: 295, close: 310, volume: 30 },
        { time: Date.UTC(2026, 10, 2) / 1000, open: 305, high: 305, low: 305, close: 305, volume: 30 },
      ],
    });
  });

  it("answers 404 for a symbol Yahoo doesn't know", async () => {
    yahoo.chart.mockRejectedValue(new Error("No data found, symbol may be delisted"));

    await expect(weekly("ZZZZ")).rejects.toMatchObject({ status: 404, message: "No data for ZZZZ" });
  });
});

describe("sessionStart", () => {
  const at = (iso: string) => ({ time: Date.parse(iso) / 1000, open: 1, high: 1, low: 1, close: 1, volume: 0 });

  it("groups bars by date in the exchange's time zone", () => {
    // 02:00 UTC on the 28th is still the 27th in New York.
    const bars = [at("2026-10-26T15:00:00Z"), at("2026-10-28T02:00:00Z"), at("2026-10-28T15:00:00Z")];
    expect(sessionStart(bars, "America/New_York", 1)).toBe(bars[2].time);
    expect(sessionStart(bars, "America/New_York", 2)).toBe(bars[1].time);
    expect(sessionStart(bars, "UTC", 1)).toBe(bars[1].time);
  });

  it("starts at the first bar when there are fewer sessions than asked", () => {
    const bars = [at("2026-10-27T15:00:00Z"), at("2026-10-28T15:00:00Z")];
    expect(sessionStart(bars, "America/New_York", 5)).toBe(bars[0].time);
    expect(sessionStart([], "America/New_York", 1)).toBeUndefined();
  });
});

describe("profile", () => {
  it("combines the company's description with key stats", async () => {
    yahoo.quoteSummary.mockResolvedValue({
      price: { symbol: "AAPL", longName: "Apple Inc.", shortName: "Apple", quoteType: "EQUITY", currency: "USD", exchangeName: "NasdaqGS" },
      assetProfile: { sector: "Technology", industry: "Consumer Electronics", longBusinessSummary: "Apple designs…", fullTimeEmployees: 166000 },
      summaryDetail: { marketCap: 5.03e12, trailingPE: 41.2, dividendYield: 0.003, fiftyTwoWeekHigh: 350, fiftyTwoWeekLow: 200 },
      defaultKeyStatistics: { trailingEps: 8.36, sharesOutstanding: 14.6e9 },
      financialData: { grossMargins: 0.47, operatingMargins: 0.32, profitMargins: 0.27 },
    });

    expect(await profile("AAPL")).toMatchObject({
      name: "Apple Inc.",
      type: "EQUITY",
      exchange: "NasdaqGS",
      sector: "Technology",
      description: "Apple designs…",
      employees: 166000,
      marketCap: 5.03e12,
      peRatio: 41.2,
      eps: 8.36,
      dividendYield: 0.003,
      grossMargin: 0.47,
      operatingMargin: 0.32,
      profitMargin: 0.27,
    });
    expect(yahoo.quoteSummary.mock.calls[0][1].modules).toContain("financialData");
  });

  it("reads a fund's category, assets, expense ratio and yield", async () => {
    yahoo.quoteSummary.mockResolvedValue({
      price: { symbol: "SPY", longName: null, shortName: "SPDR S&P 500", quoteType: "ETF" },
      fundProfile: { categoryName: "Large Blend", feesExpensesInvestment: { annualReportExpenseRatio: 0.000945 } },
      summaryDetail: { totalAssets: 8.09e11, yield: 0.011 },
    });

    expect(await profile("SPY")).toMatchObject({
      name: "SPDR S&P 500",
      type: "ETF",
      category: "Large Blend",
      totalAssets: 8.09e11,
      expenseRatio: 0.000945,
      dividendYield: 0.011,
    });
  });

  it("answers an unknown symbol with a 404", async () => {
    yahoo.quoteSummary.mockRejectedValue(new Error("Quote not found for symbol: ZZZZ"));
    await expect(profile("ZZZZ")).rejects.toMatchObject({ status: 404 });
  });
});

describe("news", () => {
  it("reads Yahoo's RSS feed for the symbol", async () => {
    const feed = readFileSync(new URL("../fixtures/news/aapl-yahoo.xml", import.meta.url), "utf8");
    const fetchStub = vi.fn(async () => new Response(feed, { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);

    const items = await news("BRK-B");
    vi.unstubAllGlobals();

    expect(fetchStub.mock.calls[0]).toEqual(["https://feeds.finance.yahoo.com/rss/2.0/headline?s=BRK-B&region=US&lang=en-US"]);
    expect(items).toHaveLength(16);
  });

  it("treats a failed feed as Yahoo not responding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(news("AAPL")).rejects.toMatchObject({ status: 502, message: "Yahoo Finance isn't responding. Retrying…" });
    vi.unstubAllGlobals();
  });
});

describe("options", () => {
  // AAPL's nearest expiration, from a live answer on 1 Nov 2026, with its quote trimmed. Dates come as Dates.
  const NEAREST = JSON.parse(readFileSync(new URL("../fixtures/options/aapl-nearest.json", import.meta.url), "utf8"), (_, value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : value,
  );
  const onExpiry = (iso: string) => ({
    ...NEAREST,
    options: [{ ...NEAREST.options[0], expirationDate: new Date(`${iso}T00:00:00Z`) }],
  });

  beforeEach(() => {
    clearCache();
    yahoo.options.mockReset();
  });

  it("normalizes the nearest expiration's chain", async () => {
    yahoo.options.mockResolvedValue(NEAREST);
    const chain = await options("AAPL");
    expect(yahoo.options).toHaveBeenCalledWith("AAPL", {}, { validateResult: false });
    expect(chain).toMatchObject({ symbol: "AAPL", currency: "USD", price: 344.63, expiration: "2026-11-04" });
    expect(chain.expirations).toHaveLength(19);
    expect(chain.expirations.slice(0, 3)).toEqual(["2026-11-04", "2026-11-06", "2026-11-13"]);
    expect(chain.calls).toHaveLength(44);
    expect(chain.puts).toHaveLength(36);
    expect(chain.calls[0]).toEqual({
      contract: "AAPL261104C00275000",
      strike: 275,
      bid: 68.2,
      ask: 71.55,
      last: 69.61,
      change: -4.540001,
      volume: 10,
      openInterest: 3,
      impliedVolatility: 1.0478563232421876,
      lastTrade: Date.UTC(2026, 9, 30, 18, 40, 7) / 1000,
    });
  });

  it("puts each side in strike order, whatever order Yahoo sends", async () => {
    const [first, ...rest] = NEAREST.options[0].calls;
    yahoo.options.mockResolvedValue({ ...NEAREST, options: [{ ...NEAREST.options[0], calls: [...rest, first] }] });
    const { calls } = await options("AAPL");
    expect(calls.map(({ strike }) => strike)).toEqual([...calls.map(({ strike }) => strike)].sort((a, b) => a - b));
  });

  it("asks for a listed expiration by its day, at midnight UTC", async () => {
    yahoo.options.mockImplementation(async (_symbol: string, query: { date?: Date }) => (query.date ? onExpiry("2026-11-20") : NEAREST));
    const chain = await options("AAPL", "2026-11-20");
    expect(yahoo.options).toHaveBeenLastCalledWith("AAPL", { date: new Date("2026-11-20T00:00:00Z") }, { validateResult: false });
    expect(chain.expiration).toBe("2026-11-20");
  });

  it("answers the nearest expiration asked by name from the first request", async () => {
    yahoo.options.mockResolvedValue(NEAREST);
    expect((await options("AAPL", "2026-11-04")).expiration).toBe("2026-11-04");
    expect(yahoo.options).toHaveBeenCalledOnce();
  });

  it("refuses an expiration Yahoo doesn't list, which it would answer with an empty chain", async () => {
    yahoo.options.mockResolvedValue(NEAREST);
    await expect(options("AAPL", "2026-11-05")).rejects.toMatchObject({ status: 400, message: "No AAPL options expire on 2026-11-05" });
    expect(yahoo.options).toHaveBeenCalledOnce();
  });

  it("answers a symbol without options, such as a currency, with a 404", async () => {
    yahoo.options.mockResolvedValue({ ...NEAREST, expirationDates: [], strikes: [], options: [], quote: { ...NEAREST.quote, quoteType: "CURRENCY" } });
    await expect(options("EURUSD=X")).rejects.toMatchObject({ status: 404, message: "EURUSD=X has no listed options" });
  });

  it("answers an unknown symbol, which Yahoo answers with nothing, with a 404", async () => {
    yahoo.options.mockResolvedValue(undefined);
    await expect(options("ZZZZZZ")).rejects.toMatchObject({ status: 404, message: "No data for ZZZZZZ" });
  });
});

describe("screen", () => {
  // Trimmed from a live undervalued-growth row on 1 Nov 2026.
  const NU = {
    ...AAPL,
    symbol: "NU",
    longName: "Nu Holdings Ltd.",
    regularMarketPrice: 11.61,
    regularMarketChangePercent: -3.65146,
    regularMarketVolume: 92_844_229,
    regularMarketTime: 1793390403,
    marketCap: 56_084_295_680,
    trailingPE: 15.904109,
    fiftyTwoWeekLow: 11.2,
    fiftyTwoWeekHigh: 18.98,
  };

  beforeEach(() => {
    clearCache();
    yahoo.screener.mockReset();
  });

  it("asks for Yahoo's most rows, unvalidated, and keeps its description and total", async () => {
    yahoo.screener.mockResolvedValue({ description: "Stocks with earnings growth rates better than 25%", total: 243, quotes: [NU] });
    const result = await screen("undervalued_growth_stocks");
    expect(yahoo.screener).toHaveBeenCalledWith({ scrIds: "undervalued_growth_stocks", count: 250 }, undefined, { validateResult: false });
    expect(result).toMatchObject({ id: "undervalued_growth_stocks", description: "Stocks with earnings growth rates better than 25%", total: 243 });
  });

  it("makes each row a quote, with market cap, P/E and the 52-week range", async () => {
    yahoo.screener.mockResolvedValue({ description: "", total: 1, quotes: [NU] });
    const [row] = (await screen("undervalued_growth_stocks")).rows;
    expect(row).toMatchObject({
      symbol: "NU",
      name: "Nu Holdings Ltd.",
      price: 11.61,
      changePercent: -3.65146,
      volume: 92_844_229,
      time: 1793390403,
      marketCap: 56_084_295_680,
      peRatio: 15.904109,
      week52Low: 11.2,
      week52High: 18.98,
    });
  });

  it("keeps Yahoo's order, leaves out a row without a price, and leaves a missing P/E missing", async () => {
    const loser = { ...NU, symbol: "LOSS", trailingPE: undefined };
    yahoo.screener.mockResolvedValue({ total: 3, quotes: [loser, { symbol: "BAD", quoteType: "EQUITY" }, NU] });
    const { rows, description } = await screen("aggressive_small_caps");
    expect(rows.map(({ symbol }) => symbol)).toEqual(["LOSS", "NU"]);
    expect(rows[0].peRatio).toBeUndefined();
    expect(description).toBe("");
  });
});
