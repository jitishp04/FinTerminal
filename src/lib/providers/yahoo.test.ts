import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { clearCache } from "../cache";
import { chart, movers, profile, quote, sessionStart } from "./yahoo";

const yahoo = vi.hoisted(() => ({ quote: vi.fn(), chart: vi.fn(), quoteSummary: vi.fn(), screener: vi.fn() }));

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = yahoo.quote;
    chart = yahoo.chart;
    quoteSummary = yahoo.quoteSummary;
    screener = yahoo.screener;
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
    await expect(chart("AAPL", "1Y")).rejects.not.toBeInstanceOf(ApiError);
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
