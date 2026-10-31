import { ema, sma } from "./indicators";
import type { Bar, Chart } from "./types";

/** The moving averages a chart can overlay, computed from closes. */
export const OVERLAYS = {
  "EMA 20": (closes: number[]) => ema(closes, 20),
  "SMA 50": (closes: number[]) => sma(closes, 50),
  "SMA 200": (closes: number[]) => sma(closes, 200),
};
export type Overlay = keyof typeof OVERLAYS;

// The chart library's own limit, and the narrowest plot that should still fit every bar.
const DEFAULT_MIN_BAR_SPACING = 0.5;
const NARROWEST_PLOT = 200;

/** Decades of daily readings are denser than the library's limit, which would cut off their start. */
export const minBarSpacing = (bars: number) => Math.min(DEFAULT_MIN_BAR_SPACING, NARROWEST_PLOT / bars);

export interface LinePoint {
  time: number;
  value: number;
}

export interface ChartSeries {
  /** The range's bars, on wall-clock time. */
  bars: Bar[];
  overlays: Record<Overlay, LinePoint[]>;
}

const formats = new Map<string, Intl.DateTimeFormat>();

/**
 * Epoch seconds shifted to `timeZone`'s wall-clock time read as UTC. The chart
 * works in UTC only, so this is how it shows exchange hours and dates.
 */
export function wallClock(time: number, timeZone: string): number {
  if (timeZone === "UTC") return time;
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formats.set(timeZone, format);
  }
  const part = Object.fromEntries(format.formatToParts(time * 1000).map((p) => [p.type, Number(p.value)]));
  return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) / 1000;
}

/**
 * What the chart draws: bars from `chart.from` on, and averages that use the
 * history before it. Times are wall-clock and strictly increasing, as the chart requires.
 */
export function toSeries(chart: Chart): ChartSeries {
  const all: Bar[] = [];
  for (const bar of chart.bars) {
    const time = wallClock(bar.time, chart.timeZone);
    if (all.length === 0 || time > all[all.length - 1].time) all.push({ ...bar, time });
  }
  const from = wallClock(chart.from, chart.timeZone);
  const first = all.findIndex((b) => b.time >= from);
  const start = first === -1 ? all.length : first;
  const closes = all.map((b) => b.close);

  const overlays = {} as Record<Overlay, LinePoint[]>;
  for (const [name, compute] of Object.entries(OVERLAYS) as [Overlay, (closes: number[]) => (number | undefined)[]][]) {
    overlays[name] = compute(closes).flatMap((value, i) =>
      i >= start && value !== undefined ? [{ time: all[i].time, value }] : [],
    );
  }
  return { bars: all.slice(start), overlays };
}
