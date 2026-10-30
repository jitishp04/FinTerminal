import { describe, expect, it } from "vitest";
import { keyStats, typeLabel } from "./keyStats";
import type { Profile } from "./types";

// Trimmed from live /api/profile responses on 28 Oct 2026.
const MSFT: Profile = {
  symbol: "MSFT",
  name: "Microsoft Corporation",
  type: "EQUITY",
  marketCap: 3_827_000_000_000,
  peRatio: 36.214,
  forwardPE: 31.02,
  eps: 14.21,
  dividendYield: 0.0071,
  beta: 1.05,
  week52Low: 344.79,
  week52High: 555.45,
  averageVolume: 22_098_123,
  sharesOutstanding: 7_430_000_000,
  grossMargin: 0.67944,
  operatingMargin: 0.45111,
  profitMargin: 0.40305,
};

const SPY: Profile = {
  symbol: "SPY",
  name: "State Street SPDR S&P 500 ETF Trust",
  type: "ETF",
  totalAssets: 809_216_114_688,
  expenseRatio: 0.000945,
  dividendYield: 0.0099,
  peRatio: 24.464,
  week52Low: 629.28,
  week52High: 781.62,
  averageVolume: 42_271_814,
};

const values = (profile: Profile) => Object.fromEntries(keyStats(profile));

describe("keyStats", () => {
  it("shows a stock's valuation, range, volume and margins", () => {
    expect(values(MSFT)).toEqual({
      "Market cap": "3.83T",
      "P/E (TTM)": "36.21",
      "Forward P/E": "31.02",
      "EPS (TTM)": "14.21",
      "Dividend yield": "0.71%",
      Beta: "1.05",
      "52-week range": "344.79 – 555.45",
      "Avg volume": "22.1M",
      "Shares out": "7.43B",
      "Gross margin": "67.94%",
      "Operating margin": "45.11%",
      "Profit margin": "40.31%",
    });
  });

  it("shows a fund's assets, costs and yield, and leaves missing values empty", () => {
    expect(values(SPY)).toEqual({
      "Total assets": "809B",
      "Expense ratio": "0.095%",
      Yield: "0.99%",
      "P/E (TTM)": "24.46",
      Beta: undefined,
      "52-week range": "629.28 – 781.62",
      "Avg volume": "42.3M",
    });
  });

  it("shows only the price stats for an index, currency or future", () => {
    const fx: Profile = { symbol: "EURUSD=X", name: "EUR/USD", type: "CURRENCY", week52Low: 1.1114, week52High: 1.2024, averageVolume: 0 };
    expect(keyStats(fx)).toEqual([
      ["52-week range", "1.1114 – 1.2024"],
      ["Avg volume", undefined],
    ]);
  });

  it("treats a gross margin of zero as missing: Yahoo sends that for banks, which don't have one", () => {
    expect(values({ ...MSFT, grossMargin: 0 })["Gross margin"]).toBeUndefined();
  });

  it("leaves a stock's missing stats empty instead of dropping them", () => {
    const young: Profile = { symbol: "NEW", name: "New Co", type: "EQUITY", marketCap: 1e9 };
    const stats = keyStats(young);
    expect(stats).toHaveLength(12);
    expect(stats.filter(([, value]) => value !== undefined)).toEqual([["Market cap", "1B"]]);
  });
});

describe("typeLabel", () => {
  it("names Yahoo's types in plain words, passing unknown ones through", () => {
    expect(typeLabel("EQUITY")).toBe("Stock");
    expect(typeLabel("MUTUALFUND")).toBe("Mutual fund");
    expect(typeLabel("OPTION")).toBe("OPTION");
  });
});
