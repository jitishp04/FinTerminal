import { describe, expect, it } from "vitest";
import { bpChange, invertedSegments, TENORS, toCurve } from "./curve";
import type { CurvePoint, Observation } from "./types";

const points = (values: Record<string, number>): Observation[] =>
  Object.entries(values).map(([date, value]) => ({ date, value }));

/** Every tenor with these days, each a hundredth of a point above the one before. */
const allTenors = (values: Record<string, number>) =>
  TENORS.map((_, i) =>
    points(Object.fromEntries(Object.entries(values).map(([date, value]) => [date, value + i / 100]))),
  );

const days = {
  "2025-10-28": 3,
  "2025-10-29": 3.1,
  "2026-09-28": 4,
  "2026-09-29": 4.1,
  "2026-10-28": 4.9,
  "2026-10-29": 5,
};

const point = (tenor: string, latest: number, inverted = false): CurvePoint => ({
  tenor,
  latest,
  monthAgo: 0,
  yearAgo: 0,
  inverted,
});

describe("TENORS", () => {
  it("runs from the shortest maturity to the longest", () => {
    expect(TENORS.map(({ id }) => id)).toEqual([
      "DGS1MO",
      "DGS3MO",
      "DGS6MO",
      "DGS1",
      "DGS2",
      "DGS3",
      "DGS5",
      "DGS7",
      "DGS10",
      "DGS20",
      "DGS30",
    ]);
    expect(TENORS.map(({ label }) => label)).toEqual(["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"]);
  });
});

describe("toCurve", () => {
  it("gives each tenor its yield now, a month ago and a year ago", () => {
    const { dates, points: curve } = toCurve(allTenors(days));
    expect(dates).toEqual({ latest: "2026-10-29", monthAgo: "2026-09-29", yearAgo: "2025-10-29" });
    expect(curve).toHaveLength(11);
    expect(curve[0]).toMatchObject({ tenor: "1M", latest: 5, monthAgo: 4.1, yearAgo: 3.1 });
    expect(curve[10].tenor).toBe("30Y");
    expect(curve[10].latest).toBeCloseTo(5.1);
  });

  it("uses the nearest day on or before the target, never a later one", () => {
    const series = allTenors({ "2025-10-29": 3, "2026-09-28": 4, "2026-09-30": 4.5, "2026-10-29": 5 });
    expect(toCurve(series).dates.monthAgo).toBe("2026-09-28");
  });

  it("clamps to the end of a shorter month", () => {
    const { dates } = toCurve(allTenors({ "2025-03-31": 1, "2026-02-27": 2, "2026-03-02": 3, "2026-03-31": 4 }));
    expect(dates).toEqual({ latest: "2026-03-31", monthAgo: "2026-02-27", yearAgo: "2025-03-31" });
  });

  it("stops at the newest day every tenor has, so a column is one day's curve", () => {
    const series = allTenors(days);
    series[5] = series[5].slice(0, -1);
    const { dates, points: curve } = toCurve(series);
    expect(dates.latest).toBe("2026-10-28");
    expect(curve[0].latest).toBe(4.9);
  });

  it("takes comparison days that every tenor has too", () => {
    const series = allTenors(days);
    series[3] = series[3].filter(({ date }) => date !== "2026-09-29" && date !== "2025-10-29");
    const { dates, points: curve } = toCurve(series);
    expect(dates).toMatchObject({ monthAgo: "2026-09-28", yearAgo: "2025-10-28" });
    expect(curve[0]).toMatchObject({ monthAgo: 4, yearAgo: 3 });
  });

  it("flags a tenor yielding less than the one before it", () => {
    const series = allTenors({ "2025-10-29": 3, "2026-09-29": 4, "2026-10-29": 5 });
    series[9] = points({ "2025-10-29": 3, "2026-09-29": 4, "2026-10-29": 5.35 });
    series[10] = points({ "2025-10-29": 3, "2026-09-29": 4, "2026-10-29": 5.32 });
    const flagged = toCurve(series).points.filter(({ inverted }) => inverted);
    expect(flagged.map(({ tenor }) => tenor)).toEqual(["30Y"]);
  });

  it("doesn't call a flat stretch inverted", () => {
    const flat = TENORS.map(() => points({ "2025-10-29": 3, "2026-09-29": 4, "2026-10-29": 5 }));
    expect(toCurve(flat).points.some(({ inverted }) => inverted)).toBe(false);
  });
});

describe("bpChange", () => {
  it("is in whole basis points, without the noise of subtracting decimals", () => {
    expect(bpChange(4.98, 5.05)).toBe(-7);
    expect(bpChange(4.1, 3.87)).toBe(23);
    expect(bpChange(5.32, 4.57)).toBe(75);
    expect(bpChange(4.06, 4.06)).toBe(0);
  });
});

describe("invertedSegments", () => {
  it("names each stretch where the curve slopes down", () => {
    expect(invertedSegments([point("10Y", 5.35), point("20Y", 5.32, true), point("30Y", 5.3, true)])).toEqual([
      "10Y–20Y",
      "20Y–30Y",
    ]);
  });

  it("is empty for a normal curve", () => {
    expect(invertedSegments([point("10Y", 5), point("20Y", 5.1)])).toEqual([]);
  });
});
