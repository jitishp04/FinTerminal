import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { SECTORS } from "./monitors";
import { change, loadRotation, quadrant, rotation, toWeeks, WEEKS_SENT } from "./rotation";
import type { Bar, Chart, WeeklyClose } from "./types";

/** Consecutive weeks from Monday 4 May 2026, one per close. */
const weekly = (closes: number[]): WeeklyClose[] =>
  closes.map((close, i) => ({ week: new Date(Date.UTC(2026, 4, 4 + 7 * i)).toISOString().slice(0, 10), close }));

/** SPY flat at 100, so a sector's close is its strength against SPY × 100. */
const flat = (weeks: number) => weekly(Array(weeks).fill(100));

/** `weeks` closes at 100, then `after`. */
const steps = (weeks: number, ...after: number[]) => weekly([...Array(weeks).fill(100), ...after]);

describe("rotation", () => {
  it("works out trend and momentum from relative strength", () => {
    // SPY flat at 50. The sector matches it for 16 weeks, then gains 10%: rs is 1 for 16 weeks, then 1.1.
    const points = rotation(weekly([...Array(16).fill(50), 55]), weekly(Array(17).fill(50)));

    // The 13-week average of rs is (12 × 1 + 1.1) / 13, and trend is 100 × rs over it.
    const trend = (100 * 1.1) / ((12 + 1.1) / 13);
    // Trend's own last 5 weeks are 100, 100, 100, 100 and this one.
    const momentum = (100 * trend) / ((4 * 100 + trend) / 5);
    expect(points).toHaveLength(1);
    expect(points[0].week).toBe("2026-08-24");
    expect(points[0].trend).toBeCloseTo(trend, 9);
    expect(points[0].momentum).toBeCloseTo(momentum, 9);
    expect(trend).toBeCloseTo(109.1603, 4);
    expect(momentum).toBeCloseTo(107.1964, 4);
  });

  it("gives no point until there are 17 weeks: 13 for trend's average, then 5 trend values", () => {
    expect(rotation(steps(15, 110), flat(16))).toEqual([]);
    expect(rotation(steps(16, 110), flat(17))).toHaveLength(1);
    expect(rotation([], [])).toEqual([]);
  });

  it("stays at 100 on both axes for a sector that moves with SPY", () => {
    const spy = weekly([100, 104, 99, 103, 108, 101, 97, 105, 110, 106, 102, 109, 111, 107, 113, 104, 112, 115, 108, 117]);
    const sector = spy.map(({ week, close }) => ({ week, close: 2 * close }));

    const points = rotation(sector, spy);

    expect(points).toHaveLength(4);
    for (const { trend, momentum } of points) {
      expect(trend).toBeCloseTo(100, 9);
      expect(momentum).toBeCloseTo(100, 9);
    }
  });

  it("compares each week with SPY's close for the same week", () => {
    // SPY has no close for the 6th week, so the sector's spike that week is never compared with another week's.
    const sector = steps(17, 100);
    sector[5].close = 1000;
    const spy = flat(18).filter((_, i) => i !== 5);

    const [point, ...rest] = rotation(sector, spy);

    expect(rest).toEqual([]);
    expect(point).toMatchObject({ week: sector[17].week, trend: 100, momentum: 100 });
  });

  it.each([
    ["has just jumped", steps(19, 110), "Leading"],
    ["jumped weeks ago, so its average is catching up", steps(14, 110, 110, 110, 110, 110, 110), "Weakening"],
    ["has just dropped", steps(19, 90), "Lagging"],
    ["dropped weeks ago, so its average is catching up", steps(14, 90, 90, 90, 90, 90, 90), "Improving"],
  ])("puts a sector that %s in %s", (_, sector, expected) => {
    const latest = rotation(sector, flat(20)).at(-1)!;
    expect(quadrant(latest)).toBe(expected);
  });
});

describe("quadrant", () => {
  it("splits at 100 on both axes", () => {
    expect(quadrant({ trend: 101, momentum: 101 })).toBe("Leading");
    expect(quadrant({ trend: 101, momentum: 99 })).toBe("Weakening");
    expect(quadrant({ trend: 99, momentum: 99 })).toBe("Lagging");
    expect(quadrant({ trend: 99, momentum: 101 })).toBe("Improving");
  });

  it("counts exactly 100 as above", () => {
    expect(quadrant({ trend: 100, momentum: 100 })).toBe("Leading");
    expect(quadrant({ trend: 99.99, momentum: 100 })).toBe("Improving");
  });
});

describe("change", () => {
  it("is the % change over the last 1 or 4 weeks", () => {
    const closes = weekly([100, 102, 104, 106, 108, 110]);
    expect(change(closes, 1)).toBeCloseTo(100 * (110 / 108 - 1), 9);
    expect(change(closes, 4)).toBeCloseTo(100 * (110 / 102 - 1), 9);
  });

  it("is undefined without that much history", () => {
    expect(change(weekly([100, 101, 102, 103]), 4)).toBeUndefined();
    expect(change([], 1)).toBeUndefined();
  });
});

const bar = (iso: string, close: number, adjClose?: number): Bar => ({
  time: Date.parse(iso) / 1000,
  open: close,
  high: close,
  low: close,
  close,
  ...(adjClose !== undefined && { adjClose }),
  volume: 0,
});

describe("toWeeks", () => {
  it("keeps one close per week, the last: Yahoo adds a bar for the latest trade to the week's own", () => {
    // XLK on 1 Nov 2026: the week of 26 October, then a bar at Friday's close.
    const bars = [bar("2026-10-19T04:00:00Z", 183.23), bar("2026-10-26T04:00:00Z", 180), bar("2026-10-30T20:00:00Z", 179.51)];

    expect(toWeeks(bars, "America/New_York")).toEqual([
      { week: "2026-10-19", close: 183.23 },
      { week: "2026-10-26", close: 179.51 },
    ]);
  });

  it("uses the dividend-adjusted close where there is one", () => {
    const bars = [bar("2026-09-14T04:00:00Z", 189.6, 189.379), bar("2026-09-21T04:00:00Z", 196.27)];

    expect(toWeeks(bars, "America/New_York").map((w) => w.close)).toEqual([189.379, 196.27]);
  });
});

describe("loadRotation", () => {
  /** `weeks` weekly bars from Monday 6 January 2025, at midnight in New York. */
  const chartOf = (symbol: string, weeks = 20): Chart => ({
    symbol,
    range: "5Y",
    interval: "1wk",
    timeZone: "America/New_York",
    from: 0,
    bars: Array.from({ length: weeks }, (_, i) => bar(new Date(Date.UTC(2025, 0, 6 + 7 * i, 5)).toISOString(), 100 + i)),
  });

  it("answers with SPY and every sector, in SECTORS order", async () => {
    const result = await loadRotation(async (symbol) => chartOf(symbol));

    expect(result.benchmark.symbol).toBe("SPY");
    expect(result.benchmark.weeks[0]).toEqual({ week: "2025-01-06", close: 100 });
    expect(result.sectors.map((s) => s.symbol)).toEqual(SECTORS.map((s) => s.symbol));
    expect(result.missing).toEqual([]);
  });

  it(`sends only the last ${WEEKS_SENT} weeks`, async () => {
    const result = await loadRotation(async (symbol) => chartOf(symbol, WEEKS_SENT + 30));

    expect(result.benchmark.weeks).toHaveLength(WEEKS_SENT);
    expect(result.benchmark.weeks.at(-1)?.close).toBe(100 + WEEKS_SENT + 29);
  });

  it("names a sector that fails and keeps the rest", async () => {
    const result = await loadRotation(async (symbol) => {
      if (symbol === "XLE") throw new ApiError(502, "Yahoo Finance isn't responding. Retrying…");
      return chartOf(symbol);
    });

    expect(result.missing).toEqual(["XLE"]);
    expect(result.sectors).toHaveLength(10);
    expect(result.sectors.map((s) => s.symbol)).not.toContain("XLE");
  });

  it("fails with SPY's error when SPY fails, since nothing can be measured", async () => {
    const error = new ApiError(502, "Yahoo Finance isn't responding. Retrying…");
    await expect(
      loadRotation(async (symbol) => {
        if (symbol === "SPY") throw error;
        return chartOf(symbol);
      }),
    ).rejects.toBe(error);
  });
});
