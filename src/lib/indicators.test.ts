import { describe, expect, it } from "vitest";
import { ema, sma } from "./indicators";

const u = undefined;

describe("sma", () => {
  it("averages the last `period` values", () => {
    expect(sma([2, 4, 6, 8, 13], 3)).toEqual([u, u, 4, 6, 9]);
  });

  it("is the input itself for a period of 1", () => {
    expect(sma([3, 1, 2], 1)).toEqual([3, 1, 2]);
  });

  it("stays undefined when there are fewer values than the period", () => {
    expect(sma([1, 2], 3)).toEqual([u, u]);
    expect(sma([], 3)).toEqual([]);
  });

  it("matches a direct average over a long series", () => {
    const values = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 7) * 10 + i * 0.1);
    const result = sma(values, 200);
    const direct = values.slice(100, 300).reduce((a, b) => a + b, 0) / 200;
    expect(result[198]).toBeUndefined();
    expect(result[299]).toBeCloseTo(direct, 9);
  });
});

describe("ema", () => {
  it("starts at the simple average, then weights new values by 2 / (period + 1)", () => {
    // k = 0.5: seed (2+4+6)/3 = 4, then 4 + 0.5·(8−4) = 6, then 6 + 0.5·(12−6) = 9
    expect(ema([2, 4, 6, 8, 12], 3)).toEqual([u, u, 4, 6, 9]);
  });

  it("stays flat on a flat series", () => {
    expect(ema([5, 5, 5, 5, 5, 5], 4)).toEqual([u, u, u, 5, 5, 5]);
  });

  it("stays undefined when there are fewer values than the period", () => {
    expect(ema([1, 2], 3)).toEqual([u, u]);
  });

  it("matches the textbook 20-period EMA", () => {
    const values = Array.from({ length: 40 }, (_, i) => i + 1);
    const result = ema(values, 20);
    // On a straight line the EMA lags the price by (period − 1) / 2 once settled: 40 − 9.5.
    expect(result[39]).toBeCloseTo(30.5, 0);
    expect(result[19]).toBe(10.5);
  });
});
