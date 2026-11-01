import { describe, expect, it } from "vitest";
import {
  buyDates,
  lookback,
  luckCheck,
  rank,
  SCHEDULES,
  scheduleLabel,
  simulate,
  xirr,
  type Plan,
} from "./dca";
import type { DailyClose } from "./types";

/** Days with no dividends: the adjusted close is the close. */
const days = (closes: Record<string, number>): DailyClose[] =>
  Object.entries(closes).map(([date, close]) => ({ date, close, adjClose: close }));

const plan: Plan = { amount: 100, fee: 1, reinvest: true };

describe("buyDates", () => {
  it("steps a week or two from the first chosen weekday on or after the start", () => {
    // 7 January 2026 is a Wednesday.
    expect(buyDates({ frequency: "weekly", day: 1 }, "2026-01-07", "2026-02-02")).toEqual([
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
      "2026-02-02",
    ]);
    expect(buyDates({ frequency: "biweekly", day: 5 }, "2026-01-01", "2026-02-12")).toEqual([
      "2026-01-02",
      "2026-01-16",
      "2026-01-30",
    ]);
  });

  it("takes the chosen day of each month from the start on", () => {
    expect(buyDates({ frequency: "monthly", day: 15 }, "2026-01-20", "2026-04-01")).toEqual(["2026-02-15", "2026-03-15"]);
    expect(buyDates({ frequency: "monthly", day: 1 }, "2026-01-01", "2026-01-01")).toEqual(["2026-01-01"]);
  });
});

describe("simulate", () => {
  // Monthly on the 1st, $100 a buy with a $1 fee. 1 January 2024 is a holiday, so the first buy is on the 2nd.
  const fixture = days({ "2024-01-02": 10, "2024-02-01": 8, "2024-03-01": 12.5, "2024-03-28": 11 });
  const dates = buyDates({ frequency: "monthly", day: 1 }, "2024-01-01", "2024-03-28");

  it("matches the totals, shares, value and average cost worked out by hand", () => {
    const outcome = simulate(fixture, [], plan, dates)!;

    // $99 of each $100 buys shares: 99 / 10 + 99 / 8 + 99 / 12.5 = 9.9 + 12.375 + 7.92.
    expect(outcome.shares).toBeCloseTo(30.195, 9);
    expect(outcome).toMatchObject({ firstBuy: "2024-01-02", end: "2024-03-28", buys: 3, invested: 300 });
    expect(outcome.value).toBeCloseTo(30.195 * 11, 9);
    expect(outcome.averageCost).toBeCloseTo(300 / 30.195, 9);
  });

  it("matches a spreadsheet's XIRR for the same buys", () => {
    // LibreOffice: =XIRR({-100; -100; -100; 332.145}, {2024-01-02; 2024-02-01; 2024-03-01; 2024-03-28}).
    expect(simulate(fixture, [], plan, dates)!.xirr).toBeCloseTo(92.2248352965486, 6);
  });

  it("measures the largest drop from the account's high plus money added since", () => {
    // 1 Feb: $99 at 10 is worth 79.20 at 8; with the new $99, $178.20 against $198 put in is 10% down.
    // 28 Mar: 30.195 shares fall from 12.50 to 11, 12% down from the high of $377.44.
    expect(simulate(fixture, [], plan, dates)!.largestDrop).toBeCloseTo(12, 9);
    expect(simulate(fixture.slice(0, 3), [], plan, dates)!.largestDrop).toBeCloseTo(10, 9);
  });

  it("buys on the next trading day after a weekend or holiday", () => {
    // Saturday 1 June 2024, and Juneteenth on Wednesday the 19th, from NVDA's real days.
    const june = days({ "2024-06-03": 115, "2024-06-18": 135.58, "2024-06-20": 130.78, "2024-06-21": 126.57 });

    expect(simulate(june, [], plan, ["2024-06-01"])!.firstBuy).toBe("2024-06-03");
    const weekly = simulate(june, [], { ...plan, fee: 0 }, ["2024-06-19"])!;
    expect(weekly.firstBuy).toBe("2024-06-20");
    expect(weekly.shares).toBeCloseTo(100 / 130.78, 9);
  });

  it("shows no jump across NVDA's 10-for-1 split in June 2024", () => {
    // Yahoo's closes from 3 to 21 June 2024, already adjusted for the split on the 10th.
    const nvda = days({
      "2024-06-03": 115, "2024-06-04": 116.437, "2024-06-05": 122.44, "2024-06-06": 120.998, "2024-06-07": 120.888,
      "2024-06-10": 121.79, "2024-06-11": 120.91, "2024-06-12": 125.2, "2024-06-13": 129.61, "2024-06-14": 131.88,
      "2024-06-17": 130.98, "2024-06-18": 135.58, "2024-06-20": 130.78, "2024-06-21": 126.57,
    });
    const weekly = buyDates({ frequency: "weekly", day: 1 }, "2024-06-03", "2024-06-21");

    // The real worst stretch: 135.58 on the 18th to 126.57 on the 21st.
    expect(simulate(nvda, [], plan, weekly)!.largestDrop).toBeLessThan(7);
    // Pre-split prices as they traded, ten times higher, would make the first week's shares lose 90% on the 10th:
    // 99 / 1150 = 0.0861 shares fall from $105.40 to $10.48. With the 10th's 99 / 121.79 = 0.8129 shares,
    // 0.8990 shares close at 120.91 on the 11th: $108.69 against the $105.40 high plus $99 added, 46.8% down.
    const unadjusted = nvda.map((d) => (d.date < "2024-06-10" ? { ...d, close: d.close * 10, adjClose: d.close * 10 } : d));
    expect(simulate(unadjusted, [], plan, weekly)!.largestDrop).toBeCloseTo(46.82, 2);
  });

  describe("dividends", () => {
    // $0.50 a share goes ex on 15 January. Yahoo's adjusted close before it is 10 × (1 − 0.5 / 10) = 9.5.
    const history: DailyClose[] = [
      { date: "2024-01-12", close: 10, adjClose: 9.5 },
      { date: "2024-01-15", close: 9.5, adjClose: 9.5 },
      { date: "2024-01-31", close: 10, adjClose: 10 },
    ];
    const dividends = [{ date: "2024-01-15", amount: 0.5 }];
    const once = { amount: 100, fee: 0 };

    it("pays them out as cash when not reinvested, on shares held the day before", () => {
      const outcome = simulate(history, dividends, { ...once, reinvest: false }, ["2024-01-12"])!;
      // 10 shares at $10, $5 of dividends, and the shares worth $100 again at the end.
      expect(outcome.shares).toBeCloseTo(10, 9);
      expect(outcome.value).toBeCloseTo(105, 9);
    });

    it("doesn't pay them on shares bought on the ex-date", () => {
      const outcome = simulate(history, dividends, { ...once, reinvest: false }, ["2024-01-15"])!;
      expect(outcome.value).toBeCloseTo((100 / 9.5) * 10, 9);
    });

    it("buys more shares with them when reinvested, through the adjusted close", () => {
      const outcome = simulate(history, dividends, { ...once, reinvest: true }, ["2024-01-12"])!;
      // $100 at 9.5 is 10.526 shares: the 10 bought, and $5 reinvested at the ex-date's 9.5.
      expect(outcome.shares).toBeCloseTo(100 / 9.5, 9);
      expect(outcome.value).toBeCloseTo((100 / 9.5) * 10, 9);
    });
  });

  it("is undefined with no buys in range", () => {
    expect(simulate(fixture, [], plan, ["2024-04-01"])).toBeUndefined();
  });
});

describe("xirr", () => {
  it("finds the yearly rate that makes the buys grow into the end value", () => {
    // 100 a year apart, worth 231 a year after the second: 100 × 1.1² + 100 × 1.1 = 231, so 10% a year.
    const flows = [
      { date: "2023-01-02", amount: -100 },
      { date: "2024-01-02", amount: -100 },
      { date: "2025-01-01", amount: 231 },
    ];
    expect(xirr(flows)).toBeCloseTo(10, 9);
  });

  it("goes negative for a loss", () => {
    // 81 two years after 100: 0.9² = 0.81.
    expect(xirr([{ date: "2023-01-02", amount: -100 }, { date: "2025-01-01", amount: 81 }])).toBeCloseTo(-10, 9);
  });

  it("is undefined when everything happens on one day", () => {
    expect(xirr([{ date: "2024-01-02", amount: -100 }, { date: "2024-01-02", amount: 100 }])).toBeUndefined();
  });
});

describe("lookback", () => {
  const history = days({ "2016-03-01": 1, "2021-10-29": 2, "2023-11-01": 3, "2026-10-30": 4 });

  it("starts the chosen number of years before the last day", () => {
    expect(lookback(history, 3)).toEqual({ from: "2023-10-30", days: history.slice(2), short: false });
  });

  it("starts at the first day for Max, or when the history is younger than the lookback", () => {
    expect(lookback(history, undefined)).toEqual({ from: "2016-03-01", days: history, short: false });
    expect(lookback(history, 20)).toEqual({ from: "2016-03-01", days: history, short: true });
  });
});

/** Two years of weekdays from Monday 6 January 2025, with a price that wanders. */
const wandering = (): DailyClose[] => {
  const out: DailyClose[] = [];
  for (let t = Date.UTC(2025, 0, 6), i = 0; t <= Date.UTC(2026, 11, 31); t += 864e5, i++) {
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const close = 100 + 10 * Math.sin(i / 9) + i / 20;
    out.push({ date: new Date(t).toISOString().slice(0, 10), close, adjClose: close });
  }
  return out;
};

describe("rank", () => {
  it("tries every weekday for weekly and every 2 weeks, and every day 1–28 for monthly", () => {
    expect(SCHEDULES).toHaveLength(5 + 5 + 28);
  });

  it("orders every schedule by its yearly return, best first", () => {
    const history = wandering();
    const ranked = rank(history, [], plan, history[0].date);

    expect(ranked).toHaveLength(38);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].outcome.xirr!).toBeGreaterThanOrEqual(ranked[i].outcome.xirr!);
  });
});

describe("luckCheck", () => {
  it("ranks the first half's best schedule on the second half", () => {
    const history = wandering();
    const check = luckCheck(history, [], plan, history[0].date)!;

    // Halfway between 6 January 2025 and 31 December 2026.
    expect(check.middle).toBe("2026-01-03");
    const first = rank(history.filter((d) => d.date < check.middle), [], plan, history[0].date);
    const second = rank(history.filter((d) => d.date >= check.middle), [], plan, check.middle);
    expect(check.firstBest).toEqual(first[0].schedule);
    expect(check.secondBest).toEqual(second[0].schedule);
    expect(second[check.laterRank - 1].schedule).toEqual(first[0].schedule);
    expect(check.count).toBe(38);
  });
});

describe("scheduleLabel", () => {
  it("names a schedule in words", () => {
    expect(scheduleLabel({ frequency: "weekly", day: 1 })).toBe("Every week on Monday");
    expect(scheduleLabel({ frequency: "biweekly", day: 5 })).toBe("Every 2 weeks on Friday");
    expect(scheduleLabel({ frequency: "monthly", day: 1 })).toBe("Every month on the 1st");
    expect(scheduleLabel({ frequency: "monthly", day: 22 })).toBe("Every month on the 22nd");
    expect(scheduleLabel({ frequency: "monthly", day: 11 })).toBe("Every month on the 11th");
    expect(scheduleLabel({ frequency: "monthly", day: 12 })).toBe("Every month on the 12th");
    expect(scheduleLabel({ frequency: "monthly", day: 13 })).toBe("Every month on the 13th");
    expect(scheduleLabel({ frequency: "monthly", day: 23 })).toBe("Every month on the 23rd");
  });
});
