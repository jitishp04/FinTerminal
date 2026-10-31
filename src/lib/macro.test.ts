import { describe, expect, it } from "vitest";
import {
  formatIndicator,
  INDICATORS,
  monthlyChange,
  monthsBefore,
  periodLabel,
  sparkPoints,
  toChart,
  toIndicator,
  yearOverYear,
  type IndicatorDef,
} from "./macro";
import type { MacroSeries, Observation } from "./types";

const points = (values: Record<string, number>): Observation[] =>
  Object.entries(values).map(([date, value]) => ({ date, value }));

const closeTo = (found: Observation[], expected: Record<string, number>) => {
  expect(found.map(({ date }) => date)).toEqual(Object.keys(expected));
  found.forEach(({ date, value }) => expect(value).toBeCloseTo(expected[date], 6));
};

// The 2025 shutdown stopped the survey, so CPI and UNRATE have no October 2025.
const CPI = points({
  "2024-09-01": 100,
  "2024-10-01": 101,
  "2024-11-01": 102,
  "2025-08-01": 104,
  "2025-09-01": 105,
  "2025-11-01": 108,
  "2026-08-01": 109,
  "2026-09-01": 110,
  "2026-10-01": 111,
  "2026-11-01": 113.4,
});

describe("monthsBefore", () => {
  it.each([
    ["2026-10-29", 1, "2026-09-29"],
    ["2026-10-29", 12, "2025-10-29"],
    ["2026-01-15", 1, "2025-12-15"],
    ["2026-03-01", 12, "2025-03-01"],
  ])("takes %s back to the same day: %i month(s)", (date, months, expected) => {
    expect(monthsBefore(date, months)).toBe(expected);
  });

  it.each([
    ["2026-03-31", 1, "2026-02-28"],
    ["2024-03-31", 1, "2024-02-29"],
    ["2026-10-31", 1, "2026-09-30"],
    ["2024-02-29", 12, "2023-02-28"],
  ])("stops at the end of a shorter month: %s less %i", (date, months, expected) => {
    expect(monthsBefore(date, months)).toBe(expected);
  });
});

describe("yearOverYear", () => {
  it("compares each month with that month a year before, however many rows lie between", () => {
    const found = yearOverYear(CPI);
    expect(found.find(({ date }) => date === "2026-09-01")?.value).toBeCloseTo((110 / 105 - 1) * 100, 6);
    expect(found.find(({ date }) => date === "2026-11-01")?.value).toBeCloseTo((113.4 / 108 - 1) * 100, 6);
  });

  it("leaves out a month with nothing to compare with", () => {
    expect(yearOverYear(CPI).map(({ date }) => date)).toEqual([
      "2025-09-01",
      "2025-11-01",
      "2026-08-01",
      "2026-09-01",
      "2026-11-01",
    ]);
  });
});

describe("monthlyChange", () => {
  it("is the change from the month before", () => {
    closeTo(monthlyChange(points({ "2026-07-01": 158882, "2026-08-01": 159015, "2026-09-01": 159044 })), {
      "2026-08-01": 133,
      "2026-09-01": 29,
    });
  });

  it("crosses a new year", () => {
    closeTo(monthlyChange(points({ "2025-12-01": 100, "2026-01-01": 90 })), { "2026-01-01": -10 });
  });

  it("doesn't pass off a two-month change as one month's", () => {
    closeTo(monthlyChange(points({ "2025-09-01": 100, "2025-11-01": 120, "2025-12-01": 125 })), { "2025-12-01": 5 });
  });
});

describe("periodLabel", () => {
  it.each([
    ["2026-09-01", "M", "Sep 2026"],
    ["2026-01-01", "Q", "Q1 2026"],
    ["2026-04-01", "Q", "Q2 2026"],
    ["2026-07-01", "Q", "Q3 2026"],
    ["2026-10-01", "Q", "Q4 2026"],
    ["2025-01-01", "A", "2025"],
    ["2026-10-29", "D", "2026-10-29"],
    ["2026-10-24", "W", "2026-10-24"],
    ["2026-01-01", "SA", "2026-01-01"],
  ])("labels %s at frequency %s as %s", (date, frequency, label) => {
    expect(periodLabel(date, frequency)).toBe(label);
  });
});

describe("toIndicator", () => {
  const level: IndicatorDef = { id: "UNRATE", label: "Unemployment", frequency: "M", unit: "%", decimals: 1 };
  const row = toIndicator(level, points({ "2026-07-01": 4.1, "2026-08-01": 4.3, "2026-09-01": 4.2 }));

  it("reads the latest and prior values and names the period", () => {
    expect(row).toMatchObject({ id: "UNRATE", label: "Unemployment", latest: 4.2, prior: 4.3, period: "Sep 2026" });
  });

  it("carries how to show the numbers", () => {
    expect(row).toMatchObject({ unit: "%", decimals: 1 });
  });

  it("shows the transformed series, not the raw one", () => {
    const yoy = toIndicator({ ...level, id: "CPIAUCSL", transform: yearOverYear }, CPI);
    expect(yoy.latest).toBeCloseTo((113.4 / 108 - 1) * 100, 6);
    expect(yoy.prior).toBeCloseTo((110 / 105 - 1) * 100, 6);
    expect(yoy.period).toBe("Nov 2026");
  });

  it("trends over the two years up to the latest reading, however old it is", () => {
    const ended = toIndicator(level, points({ "2018-08-01": 1, "2018-09-01": 2, "2020-09-01": 3, "2020-10-01": 4 }));
    expect(ended.trend).toEqual([3, 4]);
    expect(toIndicator(level, points({ "2018-10-01": 1, "2019-10-01": 2, "2020-10-01": 3 })).trend).toEqual([1, 2, 3]);
  });
});

describe("INDICATORS", () => {
  const def = (id: string) => INDICATORS.find((indicator) => indicator.id === id)!;

  it("lists the ten series the dashboard shows", () => {
    expect(INDICATORS.map(({ id }) => id)).toEqual([
      "FEDFUNDS",
      "DGS2",
      "DGS10",
      "T10Y2Y",
      "CPIAUCSL",
      "CPILFESL",
      "UNRATE",
      "PAYEMS",
      "A191RL1Q225SBEA",
      "ICSA",
    ]);
  });

  it.each(["CPIAUCSL", "CPILFESL"])("shows %s as a yearly rate", (id) => {
    expect(def(id).transform).toBe(yearOverYear);
  });

  it("shows payrolls, which FRED gives in thousands, as the month's change", () => {
    const row = toIndicator(def("PAYEMS"), points({ "2026-07-01": 158882, "2026-08-01": 159015, "2026-09-01": 159044 }));
    expect(formatIndicator(row.latest, row)).toBe("+29K");
    expect(formatIndicator(row.prior, row)).toBe("+133K");
  });

  it("shows claims, which FRED gives in people, in thousands", () => {
    const row = toIndicator(def("ICSA"), points({ "2026-10-17": 195000, "2026-10-24": 194000 }));
    expect(formatIndicator(row.latest, row)).toBe("194K");
  });
});

describe("formatIndicator", () => {
  it("adds the unit at the indicator's precision", () => {
    expect(formatIndicator(3.75, { unit: "%", decimals: 2 })).toBe("3.75%");
    expect(formatIndicator(4.2, { unit: "%", decimals: 1 })).toBe("4.2%");
  });

  it("keeps a negative sign", () => {
    expect(formatIndicator(-0.42, { unit: "%", decimals: 2 })).toBe("-0.42%");
    expect(formatIndicator(-92, { unit: "K", decimals: 0, signed: true })).toBe("-92K");
  });
});

describe("sparkPoints", () => {
  it("runs left to right with the highest value at the top", () => {
    expect(sparkPoints([1, 2, 3], 100, 20)).toBe("0,20 50,10 100,0");
  });

  it("draws a flat series along the middle", () => {
    expect(sparkPoints([5, 5, 5], 100, 20)).toBe("0,10 50,10 100,10");
  });

  it("handles a single value", () => {
    expect(sparkPoints([5], 100, 20)).toBe("0,10");
  });
});

describe("toChart", () => {
  const series: MacroSeries = {
    id: "GNPCA",
    title: "Real Gross National Product",
    units: "Bil. of Chn. 2017 $",
    frequency: "Annual",
    frequencyShort: "A",
    decimals: 3,
    observations: points({ "1960-01-01": 3, "2010-01-01": 5, "2016-01-01": 6, "2020-01-01": 7, "2021-01-01": 8 }),
  };
  const time = (date: string) => Date.parse(date) / 1000;

  it("draws each observation as a flat bar on its UTC date, with no volume", () => {
    expect(toChart(series, "Max").bars[0]).toEqual({
      time: time("1960-01-01"),
      open: 3,
      high: 3,
      low: 3,
      close: 3,
      volume: 0,
    });
  });

  it("keeps the series' name and precision, in UTC so dates stay put", () => {
    expect(toChart(series, "Max")).toMatchObject({ symbol: "GNPCA", range: "Max", decimals: 3, timeZone: "UTC" });
  });

  it("starts a range that far before the last reading, not before today", () => {
    expect(toChart(series, "1Y").from).toBe(time("2020-01-01"));
    expect(toChart(series, "5Y").from).toBe(time("2016-01-01"));
    expect(toChart(series, "10Y").from).toBe(time("2011-01-01"));
  });

  it("shows the whole series under Max, even from before 1970", () => {
    expect(toChart(series, "Max").from).toBe(time("1960-01-01"));
  });
});
