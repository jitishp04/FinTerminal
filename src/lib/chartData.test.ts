import { describe, expect, it } from "vitest";
import { toSeries, wallClock } from "./chartData";
import type { Bar, Chart } from "./types";

const seconds = (iso: string) => Date.parse(iso) / 1000;

describe("wallClock", () => {
  it("shows New York's time of day, across the daylight-saving change", () => {
    expect(wallClock(seconds("2026-10-28T13:30:00Z"), "America/New_York")).toBe(seconds("2026-10-28T09:30:00Z"));
    expect(wallClock(seconds("2026-11-02T14:30:00Z"), "America/New_York")).toBe(seconds("2026-11-02T09:30:00Z"));
  });

  it("puts a daily bar on its exchange date", () => {
    // London's midnight in summer is 23:00 UTC the day before.
    expect(wallClock(seconds("2026-06-30T23:00:00Z"), "Europe/London")).toBe(seconds("2026-07-01T00:00:00Z"));
  });

  it("leaves UTC alone", () => {
    expect(wallClock(seconds("2026-10-28T00:00:00Z"), "UTC")).toBe(seconds("2026-10-28T00:00:00Z"));
  });
});

describe("toSeries", () => {
  const day = (i: number, close: number): Bar => ({
    time: seconds("2026-01-01T00:00:00Z") + i * 86400,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  });
  const chart = (bars: Bar[], fromIndex: number): Chart => ({
    symbol: "X",
    range: "1Y",
    interval: "1d",
    timeZone: "UTC",
    from: bars[fromIndex]?.time ?? 0,
    bars,
  });

  it("draws the range only, with averages that already include the history before it", () => {
    const bars = Array.from({ length: 260 }, (_, i) => day(i, i + 1));
    const series = toSeries(chart(bars, 250));

    expect(series.bars).toHaveLength(10);
    expect(series.bars[0].close).toBe(251);
    // SMA 200 at bar 250 averages closes 52..251.
    expect(series.overlays["SMA 200"][0]).toEqual({ time: bars[250].time, value: 151.5 });
    expect(series.overlays["SMA 200"]).toHaveLength(10);
    expect(series.overlays["EMA 20"]).toHaveLength(10);
  });

  it("leaves an average out where there is too little history", () => {
    const bars = Array.from({ length: 30 }, (_, i) => day(i, 10));
    const series = toSeries(chart(bars, 0));
    expect(series.overlays["SMA 50"]).toEqual([]);
    expect(series.overlays["EMA 20"][0]).toEqual({ time: bars[19].time, value: 10 });
  });

  it("drops a bar that does not come after the one before it", () => {
    const bars = [day(0, 1), day(1, 2), day(1, 3), day(2, 4)];
    expect(toSeries(chart(bars, 0)).bars.map((b) => b.close)).toEqual([1, 2, 4]);
  });
});
