import { describe, expect, it } from "vitest";
import { histogram, netDebt, percentile, prefill, random, type Ranges, simulate, triangular, valuePerShare } from "./dcf";
import type { DcfInputs } from "./types";

const M = 1e6;
const flat = (value: number) => ({ low: value, likely: value, high: value });

describe("valuePerShare", () => {
  it("is the Gordon growth value when growth already equals terminal growth", () => {
    // 100 growing 2% a year for ever, at 10%: 100 × 1.02 / (0.10 − 0.02) = 1,275. Less 275 of net debt, over 10 shares.
    const start = { freeCashFlow: 100, netDebt: 275, shares: 10 };
    expect(valuePerShare(start, { growth: 2, terminal: 2, discount: 10 })).toBeCloseTo(100, 9);
  });

  it("fades growth in a straight line to terminal growth by year 10", () => {
    // Year t grows at 20 − 18 × (t − 1) / 9: 20%, 18%, … 2%. Worked out year by year below.
    let fcf = 100;
    let value = 0;
    for (let t = 1; t <= 10; t++) {
      fcf *= 1 + (20 - (18 * (t - 1)) / 9) / 100;
      value += fcf / 1.1 ** t;
    }
    value += (fcf * 1.02) / (0.1 - 0.02) / 1.1 ** 10;
    expect(valuePerShare({ freeCashFlow: 100, netDebt: 0, shares: 1 }, { growth: 20, terminal: 2, discount: 10 })).toBeCloseTo(value, 9);
  });

  it("matches a spreadsheet's base case for Microsoft", () => {
    // Growth 14.6% fading to 2.5%, at 10.5%. FCF $59,957M, net debt -$29,028M, 7,446M shares.
    const start = { freeCashFlow: 59957 * M, netDebt: -29028 * M, shares: 7446 * M };
    expect(valuePerShare(start, { growth: 14.6, terminal: 2.5, discount: 10.5 })).toBeCloseTo(SPREADSHEET_MSFT, 6);
  });
});

// A LibreOffice workbook built by hand: each year's growth, cash flow and discount factor as formulas.
const SPREADSHEET_MSFT = 170.558975774149;

describe("triangular", () => {
  const range = { low: 2, likely: 5, high: 14 };

  it("runs from low to high, with likely where the density peaks", () => {
    expect(triangular(0, range)).toBe(2);
    expect(triangular(1, range)).toBe(14);
    // A quarter of the area lies left of the peak: (5 − 2) / (14 − 2).
    expect(triangular(0.25, range)).toBeCloseTo(5, 12);
  });

  it("gives the one value when low, likely and high are equal", () => {
    expect(triangular(0.7, flat(3))).toBe(3);
  });

  it("averages (low + likely + high) / 3 over many draws", () => {
    const next = random(7);
    let sum = 0;
    for (let i = 0; i < 200_000; i++) sum += triangular(next(), range);
    expect(sum / 200_000).toBeCloseTo(7, 1);
  });
});

describe("random", () => {
  it("gives the same sequence for the same seed, in [0, 1)", () => {
    const a = random(1);
    const b = random(1);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

describe("simulate", () => {
  const start = { freeCashFlow: 59957 * M, netDebt: -29028 * M, shares: 7446 * M };
  const ranges: Ranges = {
    growth: { low: 6.9, likely: 14.6, high: 18 },
    terminal: { low: 2, likely: 2.5, high: 3 },
    discount: { low: 9.4, likely: 10.5, high: 11.6 },
  };

  it("gives the base case in every run when low, likely and high are equal", () => {
    const fixed = { growth: flat(14.6), terminal: flat(2.5), discount: flat(10.5) };
    const base = valuePerShare(start, { growth: 14.6, terminal: 2.5, discount: 10.5 });
    const values = simulate(start, fixed, 500);
    expect(values).toHaveLength(500);
    for (const value of values) expect(value).toBe(base);
  });

  it("gives the same values for the same inputs, and moves the median under 1% with another seed", () => {
    const first = simulate(start, ranges);
    expect(simulate(start, ranges)).toEqual(first);

    const other = simulate(start, ranges, 10_000, 2);
    expect(other).not.toEqual(first);
    const median = percentile(first, 50);
    expect(Math.abs(percentile(other, 50) / median - 1)).toBeLessThan(0.01);
  });

  it("returns 10,000 runs in order, lowest first", () => {
    const values = simulate(start, ranges);
    expect(values).toHaveLength(10_000);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });

  it("redraws any run with terminal growth at or above the discount rate", () => {
    // These overlap a lot. A run that used terminal ≥ discount would be negative or infinite.
    const overlapping = { growth: flat(5), terminal: { low: 2, likely: 4, high: 9 }, discount: { low: 5, likely: 8, high: 10 } };
    const values = simulate({ freeCashFlow: 100, netDebt: 0, shares: 1 }, overlapping, 2000);
    for (const value of values) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("gives up when terminal growth is never below the discount rate", () => {
    const impossible = { growth: flat(5), terminal: flat(8), discount: flat(6) };
    expect(() => simulate({ freeCashFlow: 100, netDebt: 0, shares: 1 }, impossible, 10)).toThrow(/terminal growth/i);
  });
});

describe("percentile", () => {
  it("interpolates between the values around it, like a spreadsheet's PERCENTILE.INC", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentile(sorted, 50)).toBe(30);
    expect(percentile(sorted, 10)).toBeCloseTo(14, 12);
    expect(percentile(sorted, 90)).toBeCloseTo(46, 12);
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 100)).toBe(50);
  });
});

describe("histogram", () => {
  it("counts the values in each of equal bins, leaving out those outside", () => {
    expect(histogram([0, 1, 2, 2.5, 3, 9.99, 10, 11], 0, 10, 4)).toEqual([3, 2, 0, 2]);
  });
});

describe("netDebt", () => {
  it("is debt less cash and short-term investments", () => {
    const balance = { date: "2026-09-30", cash: 20281, shortTermInvestments: 44228, currentDebt: 4391, longTermDebt: 31090 };
    expect(netDebt(balance)).toBe(4391 + 31090 - 20281 - 44228);
  });
});

describe("prefill", () => {
  const inputs = {
    beta: 1.099,
    riskFree: { date: "2026-10-29", value: 4.98 },
    revenue: [168088, 198270, 211915, 245122, 281724, 331839].map((value, i) => ({ period: `FY${2021 + i}`, value: value * M })),
  } as DcfInputs;

  it("takes growth from revenue: the slowest year, the compound rate and the fastest year", () => {
    // Years grew 17.96%, 6.88%, 15.67%, 14.93% and 17.79%. (331,839 / 168,088)^(1/5) − 1 = 14.57%.
    expect(prefill(inputs).growth).toEqual({ low: 6.9, likely: 14.6, high: 18 });
  });

  it("takes the discount rate from the 10-year Treasury plus beta times a 4, 5 or 6% premium", () => {
    // 4.98 + 1.099 × 4 = 9.376, × 5 = 10.475, × 6 = 11.574.
    expect(prefill(inputs).discount).toEqual({ low: 9.4, likely: 10.5, high: 11.6 });
    expect(prefill({ ...inputs, beta: undefined }).discount).toEqual({ low: 9, likely: 10, high: 11 });
  });

  it("gives terminal growth a long-run range", () => {
    expect(prefill(inputs).terminal).toEqual({ low: 2, likely: 2.5, high: 3 });
  });

  it("falls back to a placeholder without two years of revenue", () => {
    expect(prefill({ ...inputs, revenue: inputs.revenue.slice(-1) }).growth).toEqual({ low: 0, likely: 5, high: 10 });
  });
});
