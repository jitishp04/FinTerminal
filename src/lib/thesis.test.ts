import { describe, expect, it } from "vitest";
import { benchmarkFor, dipped, readWeeks, toWeeks } from "./thesis";
import type { Bar, Thesis } from "./types";

const DAY = 86_400;
// Monday 5 January 2026, 00:00 UTC.
const MONDAY = Date.UTC(2026, 0, 5) / 1000;
const WEEK = 7 * DAY;

const day = (time: number, bar: Partial<Bar> = {}): Bar => ({ time, open: 10, high: 12, low: 9, close: 11, volume: 100, ...bar });

describe("toWeeks", () => {
  it("makes one bar of a week: first open, highest high, lowest low, last close, all the volume", () => {
    const days = [
      day(MONDAY + 14 * 3600, { open: 10, high: 12, low: 9, close: 11, volume: 100 }),
      day(MONDAY + DAY + 14 * 3600, { open: 11, high: 15, low: 10, close: 14, volume: 200 }),
      day(MONDAY + 4 * DAY + 14 * 3600, { open: 14, high: 14, low: 8, close: 9, volume: 300 }),
    ];
    expect(toWeeks(days, "UTC")).toEqual([{ time: MONDAY, open: 10, high: 15, low: 8, close: 9, volume: 600 }]);
  });

  it("starts a new bar each Monday, and marks a short week by its Monday", () => {
    const days = [day(MONDAY + 4 * DAY), day(MONDAY + 8 * DAY), day(MONDAY + 15 * DAY)];
    expect(toWeeks(days, "UTC").map((week) => week.time)).toEqual([MONDAY, MONDAY + WEEK, MONDAY + 2 * WEEK]);
  });

  it("goes by the date on the exchange, not in UTC", () => {
    // Late on Sunday in UTC is already Monday in Stockholm, and still Sunday in New York.
    const lateSunday = MONDAY + WEEK - 3600 / 2;
    expect(toWeeks([day(lateSunday)], "Europe/Stockholm")[0].time).toBe(MONDAY + WEEK);
    expect(toWeeks([day(lateSunday)], "America/New_York")[0].time).toBe(MONDAY);
  });

  it("counts a Sunday in the week that began the Monday before, as crypto trades", () => {
    expect(toWeeks([day(MONDAY + 6 * DAY)], "UTC")[0].time).toBe(MONDAY);
  });

  it("takes the later row when Yahoo sends a day twice, rather than counting its volume twice", () => {
    const days = [day(MONDAY + 3600, { close: 11, volume: 100 }), day(MONDAY + 7200, { close: 12, volume: 120 })];
    expect(toWeeks(days, "UTC")).toEqual([{ time: MONDAY, open: 10, high: 12, low: 9, close: 12, volume: 120 }]);
  });
});

describe("benchmarkFor", () => {
  it("uses OMXS30 for SEK listings and the S&P 500 otherwise", () => {
    expect(benchmarkFor("SEK")).toEqual({ symbol: "^OMX", name: "OMXS30" });
    expect(benchmarkFor("USD")).toEqual({ symbol: "^GSPC", name: "S&P" });
    expect(benchmarkFor("EUR").symbol).toBe("^GSPC");
    expect(benchmarkFor(undefined).symbol).toBe("^GSPC");
  });
});

/** A week closing at `close`, with a tight range around it unless told otherwise. */
const bar = (i: number, close: number, more: Partial<Bar> = {}): Bar => ({
  time: MONDAY + i * WEEK,
  open: close,
  high: close + 0.5,
  low: close - 0.5,
  close,
  volume: 1000,
  ...more,
});

/** `count` weeks rising by `step`, ending at `last`. */
const climb = (count: number, step = 2, last = 300) => Array.from({ length: count }, (_, i) => last - (count - 1 - i) * step);

function thesis(weeks: Bar[], benchmark = weeks.map(({ time }) => ({ time, close: 100 }))): Thesis {
  return { symbol: "TEST", currency: "USD", weeks, benchmark: { symbol: "^GSPC", name: "S&P", weeks: benchmark } };
}

const weeksOf = (closes: number[]) => closes.map((close, i) => bar(i, close));
// A line falling slowly enough for the next close, at 103, to be above it while it still falls.
const falling = weeksOf(Array.from({ length: 60 }, (_, i) => 106 - i * 0.1));
const labelled = (weeks: Bar[]) => readWeeks(thesis(weeks)).flatMap((week, i) => (week.label ? [[i, week.label]] : []));

describe("the 40-week line", () => {
  const read = readWeeks(thesis(weeksOf(climb(46))));

  it("starts at week 40 as the average of the last 40 closes", () => {
    expect(read[38].trend).toBeUndefined();
    expect(read[39].trend).toBeCloseTo(climb(46).slice(0, 40).reduce((a, b) => a + b) / 40, 9);
  });

  it("says nothing about rising until it can look back 4 weeks", () => {
    expect(read[42].rising).toBeUndefined();
    expect(read[43].rising).toBe(true);
  });

  it("is falling when it's below where it was 4 weeks ago", () => {
    const falling = readWeeks(thesis(weeksOf(climb(46).reverse())));
    expect(falling[45].rising).toBe(false);
  });

  it("isn't rising when it's level with 4 weeks ago", () => {
    expect(readWeeks(thesis(weeksOf(Array(46).fill(100))))[45].rising).toBe(false);
  });
});

describe("the other lines", () => {
  it("starts the bands at week 20 and RSI at week 15", () => {
    const read = readWeeks(thesis(weeksOf(climb(30))));
    expect(read[18].upper).toBeUndefined();
    expect(read[19].upper).toBeGreaterThan(read[19].lower!);
    expect(read[13].rsi).toBeUndefined();
    expect(read[14].rsi).toBe(100);
  });
});

describe("relative strength", () => {
  const steady = (count: number) => Array.from({ length: count }, (_, i) => ({ time: MONDAY + i * WEEK, close: 100 }));

  it("is 0 while the stock keeps level with the market", () => {
    const read = readWeeks(thesis(weeksOf(Array(60).fill(50)), steady(60)));
    expect(read[50].strength).toBeUndefined();
    expect(read[51].strength).toBeCloseTo(0, 9);
  });

  it("compares this week's ratio with its own 52-week average, in percent", () => {
    const closes = [...Array(51).fill(100), 153];
    // The ratios average (51 × 1 + 1.53) / 52 = 1.0102.
    const read = readWeeks(thesis(weeksOf(closes), steady(52)));
    expect(read[51].strength).toBeCloseTo((1.53 / 1.0101923) * 100 - 100, 3);
    expect(read[51].strength).toBeGreaterThan(0);
  });

  it("is below 0 when the stock lags", () => {
    const closes = [...Array(51).fill(100), 50];
    expect(readWeeks(thesis(weeksOf(closes), steady(52)))[51].strength).toBeLessThan(0);
  });

  it("uses the market's last close for a week it didn't trade", () => {
    const market = steady(60).filter((_, i) => i !== 55);
    const read = readWeeks(thesis(weeksOf(Array(60).fill(50)), market));
    expect(read[55].strength).toBeCloseTo(0, 9);
  });

  it("waits for the market's history to begin", () => {
    const market = steady(120).slice(60);
    const read = readWeeks(thesis(weeksOf(Array(120).fill(50)), market));
    expect(read[110].strength).toBeUndefined();
    expect(read[111].strength).toBeCloseTo(0, 9);
  });

  it("has nothing to say without a market", () => {
    expect(readWeeks(thesis(weeksOf(Array(60).fill(50)), []))[59].strength).toBeUndefined();
  });
});

describe("BUY", () => {
  const uptrend = weeksOf(climb(60));
  const next = 60;

  it("marks a touch of the lower band above a rising 40-week line", () => {
    const close = 302;
    const lower = readWeeks(thesis([...uptrend, bar(next, close)]))[next].lower!;
    expect(labelled([...uptrend, bar(next, close, { low: lower + 1 })])).toEqual([]);
    expect(labelled([...uptrend, bar(next, close, { low: lower })])).toEqual([[next, "BUY"]]);
  });

  it("counts a touch of the band, or RSI at 40 or below, as a dip", () => {
    expect(dipped(90, 90, 60)).toBe(true);
    expect(dipped(89, 90, 60)).toBe(true);
    expect(dipped(91, 90, 40)).toBe(true);
    expect(dipped(91, 90, 40.1)).toBe(false);
    expect(dipped(91, undefined, 40)).toBe(true);
    expect(dipped(91, 90, undefined)).toBe(false);
    expect(dipped(91, undefined, undefined)).toBe(false);
  });

  it("marks only the first week of a run", () => {
    const weeks = [...uptrend, bar(next, 302, { low: 1 }), bar(next + 1, 304, { low: 1 })];
    expect(labelled(weeks)).toEqual([[next, "BUY"]]);
  });

  it("marks a new run after a week without", () => {
    const weeks = [...uptrend, bar(next, 302, { low: 1 }), bar(next + 1, 304), bar(next + 2, 306, { low: 1 })];
    expect(labelled(weeks)).toEqual([
      [next, "BUY"],
      [next + 2, "BUY"],
    ]);
  });

  it("wants the close above the line", () => {
    const weeks = [...uptrend, bar(next, 200, { low: 1 })];
    expect(readWeeks(thesis(weeks))[next].rising).toBe(true);
    expect(labelled(weeks)).toEqual([]);
  });

  it("wants the line rising", () => {
    const weeks = [...falling, bar(next, 103, { low: 1 })];
    const read = readWeeks(thesis(weeks))[next];
    expect(read.bar.close).toBeGreaterThan(read.trend!);
    expect(read.rising).toBe(false);
    expect(labelled(weeks)).toEqual([]);
  });

  it("wants 44 weeks of history first", () => {
    const short = weeksOf(climb(42));
    expect(labelled([...short, bar(42, 302, { low: 1 })])).toEqual([]);
  });
});

describe("VOL", () => {
  const uptrend = weeksOf(climb(60));
  const next = 60;
  const heavy = (more: Partial<Bar> = {}) => bar(next, 302, { high: 303, low: 299, volume: 3000, ...more });

  it("marks an up week closing in the top half on heavy volume, above a rising line", () => {
    expect(labelled([...uptrend, heavy()])).toEqual([[next, "VOL"]]);
  });

  it("needs more than twice the 20-week average, which includes the week itself", () => {
    // 19 weeks of 1000 and one of v average (19000 + v) / 20, so it takes more than 2111.
    expect(labelled([...uptrend, heavy({ volume: 2111 })])).toEqual([]);
    expect(labelled([...uptrend, heavy({ volume: 2112 })])).toEqual([[next, "VOL"]]);
  });

  it("wants an up week", () => {
    expect(labelled([...uptrend, bar(next, 299, { high: 300, low: 297, volume: 3000 })])).toEqual([]);
    expect(labelled([...uptrend, bar(next, 300, { high: 301, low: 298, volume: 3000 })])).toEqual([]);
  });

  it("wants the close above the middle of the week's range", () => {
    expect(labelled([...uptrend, heavy({ high: 305, low: 299 })])).toEqual([]);
    expect(labelled([...uptrend, heavy({ high: 304, low: 299 })])).toEqual([[next, "VOL"]]);
  });

  it("wants an uptrend", () => {
    expect(labelled([...falling, bar(next, 103, { high: 103.5, low: 100, volume: 3000 })])).toEqual([]);
  });

  it("marks only the first week of a run", () => {
    const weeks = [...uptrend, heavy(), bar(next + 1, 306, { high: 307, low: 303, volume: 6000 })];
    expect(labelled(weeks)).toEqual([[next, "VOL"]]);
  });

  it("never fires without volume data", () => {
    const silent = uptrend.map((week) => ({ ...week, volume: 0 }));
    expect(labelled([...silent, heavy({ volume: 0 })])).toEqual([]);
  });
});

describe("BUY+VOL", () => {
  it("marks both firing in the same week", () => {
    const weeks = [...weeksOf(climb(60)), bar(60, 302, { high: 302, low: 1, volume: 3000 })];
    expect(labelled(weeks)).toEqual([[60, "BUY+VOL"]]);
  });

  it("isn't for a run of one meeting the first week of the other", () => {
    const weeks = [
      ...weeksOf(climb(60)),
      bar(60, 302, { low: 1 }),
      bar(61, 304, { high: 304, low: 1, volume: 3000 }),
    ];
    expect(labelled(weeks)).toEqual([
      [60, "BUY"],
      [61, "VOL"],
    ]);
  });
});

describe("strong momentum", () => {
  const flat = Array(30).fill(100);

  it("marks a close above the upper band with RSI at 70 or more, in any trend", () => {
    const read = readWeeks(thesis(weeksOf([...flat, 130])));
    expect(read[30].rsi).toBeGreaterThanOrEqual(70);
    expect(read[30].trend).toBeUndefined();
    expect(read[30].momentum).toBe(true);
  });

  it("marks only the first week of a run", () => {
    const read = readWeeks(thesis(weeksOf([...flat, 130, 170])));
    expect(read[31].rsi).toBeGreaterThanOrEqual(70);
    expect(read[31].bar.close).toBeGreaterThan(read[31].upper!);
    expect(read[31].momentum).toBe(false);
  });

  it("leaves a steady climb unmarked, inside the band", () => {
    expect(readWeeks(thesis(weeksOf(climb(60)))).some((week) => week.momentum)).toBe(false);
  });

  it("wants RSI at 70 or more as well as the close above the band", () => {
    // Choppy, so RSI stays near the middle, then a jump above a narrow band.
    const chop = Array.from({ length: 40 }, (_, i) => (i % 2 ? 100 : 101));
    const read = readWeeks(thesis(weeksOf([...chop, 99, 100, 99, 100, 99, 100.5, 102.2])));
    const last = read.at(-1)!;
    expect(last.bar.close).toBeGreaterThan(last.upper!);
    expect(last.rsi).toBeLessThan(70);
    expect(last.momentum).toBe(false);
  });
});
