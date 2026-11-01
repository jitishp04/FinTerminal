import { describe, expect, it } from "vitest";
import { bollinger, ema, rsi, sma } from "./indicators";

const u = undefined;

describe("rsi", () => {
  it("matches Wilder's worked example, as StockCharts publishes it", () => {
    const closes = [
      44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282,
      46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7137, 46.4515, 45.7835, 45.3548, 44.0288, 44.1783, 44.2181,
      44.5672, 43.4205, 42.6628, 43.1314,
    ];
    const published = [
      70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.3, 33.08, 37.77,
    ];
    const result = rsi(closes, 14);
    expect(result.slice(0, 14)).toEqual(Array(14).fill(u));
    published.forEach((value, i) => expect(result[14 + i]).toBeCloseTo(value, 1));
  });

  it("is 100 with no falls and 0 with no rises", () => {
    expect(rsi([1, 2, 3, 4], 2)[3]).toBe(100);
    expect(rsi([4, 3, 2, 1], 2)[3]).toBe(0);
  });

  it("is undefined when nothing moved, rather than not a number", () => {
    expect(rsi([5, 5, 5, 5], 2)).toEqual([u, u, u, u]);
  });

  it("stays undefined when there are too few values", () => {
    expect(rsi([1, 2], 2)).toEqual([u, u]);
    expect(rsi([], 2)).toEqual([]);
  });
});

describe("bollinger", () => {
  it("sets the bands `width` population standard deviations from the average", () => {
    // Mean 5 and population standard deviation 2. The sample one would be 2.14.
    const { upper, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(upper[7]).toBeCloseTo(9, 9);
    expect(lower[7]).toBeCloseTo(1, 9);
  });

  it("uses only the last `period` values", () => {
    const { upper } = bollinger([1000, 2, 4, 4, 4, 5, 5, 7, 9], 8, 1);
    expect(upper[8]).toBeCloseTo(7, 9);
  });

  it("stays undefined until `period` values are in", () => {
    expect(bollinger([1, 2], 3, 2)).toEqual({ upper: [u, u], lower: [u, u] });
  });

  it("closes up when nothing moves", () => {
    expect(bollinger([3, 3, 3], 3, 2)).toEqual({ upper: [u, u, 3], lower: [u, u, 3] });
  });
});

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
