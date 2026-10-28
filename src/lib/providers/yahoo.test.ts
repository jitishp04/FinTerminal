import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { clearCache } from "../cache";
import { chart, lastSessions, profile, quote } from "./yahoo";

const yahoo = vi.hoisted(() => ({ quote: vi.fn(), chart: vi.fn(), quoteSummary: vi.fn() }));

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = yahoo.quote;
    chart = yahoo.chart;
    quoteSummary = yahoo.quoteSummary;
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

  it("asks Yahoo once within the TTL, and once per symbol", async () => {
    yahoo.quote.mockResolvedValue([AAPL]);

    await quote(["AAPL", "AAPL"]);
    await quote(["AAPL"]);

    expect(yahoo.quote).toHaveBeenCalledTimes(1);
    expect(yahoo.quote).toHaveBeenCalledWith(["AAPL"]);
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

  it("keeps only the last trading day for 1D", async () => {
    yahoo.chart.mockResolvedValue(
      chartResult([bar("2026-10-27T19:55:00Z", 1), bar("2026-10-28T13:30:00Z", 2), bar("2026-10-28T19:55:00Z", 3)]),
    );
    expect((await chart("AAPL", "1D")).bars.map((b) => b.close)).toEqual([2, 3]);
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

describe("lastSessions", () => {
  const at = (iso: string) => ({ time: Date.parse(iso) / 1000, open: 1, high: 1, low: 1, close: 1, volume: 0 });

  it("groups bars by date in the exchange's time zone", () => {
    // 02:00 UTC on the 28th is still the 27th in New York.
    const bars = [at("2026-10-26T15:00:00Z"), at("2026-10-28T02:00:00Z"), at("2026-10-28T15:00:00Z")];
    expect(lastSessions(bars, "America/New_York", 1)).toEqual([bars[2]]);
    expect(lastSessions(bars, "America/New_York", 2)).toEqual([bars[1], bars[2]]);
    expect(lastSessions(bars, "UTC", 1)).toEqual([bars[1], bars[2]]);
  });
});

describe("profile", () => {
  it("combines the company's description with key stats", async () => {
    yahoo.quoteSummary.mockResolvedValue({
      price: { symbol: "AAPL", longName: "Apple Inc.", shortName: "Apple", quoteType: "EQUITY", currency: "USD", exchangeName: "NasdaqGS" },
      assetProfile: { sector: "Technology", industry: "Consumer Electronics", longBusinessSummary: "Apple designs…", fullTimeEmployees: 166000 },
      summaryDetail: { marketCap: 5.03e12, trailingPE: 41.2, dividendYield: 0.003, fiftyTwoWeekHigh: 350, fiftyTwoWeekLow: 200 },
      defaultKeyStatistics: { trailingEps: 8.36, sharesOutstanding: 14.6e9 },
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
    });
  });

  it("reads a fund's category, assets and yield", async () => {
    yahoo.quoteSummary.mockResolvedValue({
      price: { symbol: "SPY", longName: null, shortName: "SPDR S&P 500", quoteType: "ETF" },
      fundProfile: { categoryName: "Large Blend" },
      summaryDetail: { totalAssets: 8.09e11, yield: 0.011 },
    });

    expect(await profile("SPY")).toMatchObject({
      name: "SPDR S&P 500",
      type: "ETF",
      category: "Large Blend",
      totalAssets: 8.09e11,
      dividendYield: 0.011,
    });
  });

  it("answers an unknown symbol with a 404", async () => {
    yahoo.quoteSummary.mockRejectedValue(new Error("Quote not found for symbol: ZZZZ"));
    await expect(profile("ZZZZ")).rejects.toMatchObject({ status: 404 });
  });
});
