import { describe, expect, it } from "vitest";
import { moodBand, percentRank, readMood } from "./mood";
import type { DailyClose, Observation } from "./types";

const date = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const closes = (values: number[]): DailyClose[] => values.map((close, i) => ({ date: date(i), close, adjClose: close }));
const readings = (values: number[]): Observation[] => values.map((value, i) => ({ date: date(i), value }));
const part = (name: string, inputs: Parameters<typeof readMood>[0]) => readMood(inputs).parts.find((each) => each.name === name)?.score;

// Rising by 1, so each new one tops the year before it, unless a test changes the last. Momentum needs 125 + 250 days.
const rising = Array.from({ length: 400 }, (_, i) => 100 + i);
const withLast = (values: number[], last: number) => [...values.slice(0, -1), last];

describe("percentRank", () => {
  it("is the share of the previous values at or below the last", () => {
    expect(percentRank([1, 2, 3, 4, 3], 4)).toBe(75);
  });

  it("counts an equal value as at or below", () => {
    expect(percentRank([5, 5, 5, 5, 5], 4)).toBe(100);
  });

  it("leaves the last value out of its own count", () => {
    expect(percentRank([9, 9, 9, 9, 1], 4)).toBe(0);
  });

  it("looks only `length` values back", () => {
    expect(percentRank([9, 1, 2, 3], 2)).toBe(100);
  });

  it("is undefined without that many previous values", () => {
    expect(percentRank([1, 2, 3], 3)).toBeUndefined();
    expect(percentRank([1, 2, 3, 4], 3)).toBe(100);
  });
});

describe("moodBand", () => {
  it.each([
    [0, "Extreme fear", "down"],
    [24.9, "Extreme fear", "down"],
    [25, "Fear", "amber"],
    [44.9, "Fear", "amber"],
    [45, "Neutral", undefined],
    [55, "Neutral", undefined],
    [55.1, "Greed", "up"],
    [75, "Greed", "up"],
    [75.1, "Extreme greed", "up"],
    [100, "Extreme greed", "up"],
  ])("%d is %s", (score, name, tone) => {
    expect(moodBand(score)).toEqual({ name, tone });
  });
});

describe("the inputs", () => {
  it("ranks the S&P 500 against its 125-day average for momentum", () => {
    expect(part("Momentum", { sp500: closes(withLast(rising, 999)) })).toBe(100);
    expect(part("Momentum", { sp500: closes(withLast(rising, 100)) })).toBe(0);
  });

  it("flips the put/call ratio's 5-day average: more puts is more fear", () => {
    const ratios = Array.from({ length: 300 }, (_, i) => 0.5 + i / 1000);
    expect(part("Put/call", { putCall: ratios })).toBe(0);
    expect(part("Put/call", { putCall: [...ratios.slice(0, -5), 0.1, 0.1, 0.1, 0.1, 0.1] })).toBe(100);
  });

  it("uses five days of put/call, so one low day doesn't reach the bottom", () => {
    const ratios = Array.from({ length: 300 }, (_, i) => 0.5 + i / 1000);
    expect(part("Put/call", { putCall: withLast(ratios, 0.1) })).toBeGreaterThan(0);
    expect(part("Put/call", { putCall: withLast(ratios, 0.1) })).toBeLessThan(100);
  });

  it("flips the VIX against its 50-day average: a high VIX is fear", () => {
    expect(part("VIX", { vix: closes(withLast(Array(300).fill(20), 40)) })).toBe(0);
    expect(part("VIX", { vix: closes(withLast(Array(300).fill(20), 10)) })).toBe(100);
  });

  it("ranks the 20-day change of stocks against long Treasuries", () => {
    const bonds = closes(Array(300).fill(100));
    expect(part("Stocks vs bonds", { sp500: closes(withLast(Array(300).fill(100), 120)), bonds })).toBe(100);
    expect(part("Stocks vs bonds", { sp500: closes(withLast(Array(300).fill(100), 80)), bonds })).toBe(0);
  });

  it("matches stocks and bonds by date, skipping a day only one has", () => {
    const sp500 = closes(rising);
    const bonds = closes(Array(300).fill(100)).filter((_, i) => i !== 150);
    expect(part("Stocks vs bonds", { sp500, bonds })).toBeDefined();
  });

  it("flips the gap between junk and investment-grade spreads: a wide gap is fear", () => {
    const investmentGrade = readings(Array(300).fill(1));
    expect(part("Junk bonds", { highYield: readings(withLast(Array(300).fill(3), 6)), investmentGrade })).toBe(0);
    expect(part("Junk bonds", { highYield: readings(withLast(Array(300).fill(3), 2)), investmentGrade })).toBe(100);
  });

  it("needs both sides of a comparison", () => {
    expect(part("Stocks vs bonds", { sp500: closes(rising) })).toBeUndefined();
    expect(part("Junk bonds", { highYield: readings(rising) })).toBeUndefined();
  });

  it("gives no score without a year of values to rank against", () => {
    expect(part("VIX", { vix: closes(Array(100).fill(20)) })).toBeUndefined();
  });
});

describe("readMood", () => {
  const everything = {
    sp500: closes(rising),
    vix: closes(Array(300).fill(20)),
    bonds: closes(Array(300).fill(100)),
    highYield: readings(Array(300).fill(3)),
    investmentGrade: readings(Array(300).fill(1)),
    putCall: Array(300).fill(0.9),
  };

  it("lists the seven inputs in the script's order", () => {
    expect(readMood({}).parts.map((each) => each.name)).toEqual([
      "Momentum",
      "New highs vs lows",
      "Breadth",
      "Put/call",
      "VIX",
      "Stocks vs bonds",
      "Junk bonds",
    ]);
  });

  it("leaves out the two inputs with no free source", () => {
    const { parts } = readMood(everything);
    expect(parts.find((each) => each.name === "New highs vs lows")?.score).toBeUndefined();
    expect(parts.find((each) => each.name === "Breadth")?.score).toBeUndefined();
  });

  it("averages the inputs it has", () => {
    const { parts, score } = readMood(everything);
    const scores = parts.flatMap((each) => each.score ?? []);
    expect(scores).toHaveLength(5);
    expect(score).toBeCloseTo(scores.reduce((a, b) => a + b) / 5, 9);
  });

  it("works with what's left when a source fails", () => {
    const { vix, putCall } = everything;
    const { parts, score } = readMood({ vix, putCall });
    expect(parts.flatMap((each) => each.score ?? [])).toHaveLength(2);
    expect(score).toBeDefined();
  });

  it("has no score with no inputs", () => {
    expect(readMood({}).score).toBeUndefined();
  });
});
