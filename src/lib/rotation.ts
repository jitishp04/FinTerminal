// ROT: where each sector stands against SPY, on weekly closes. These are our own
// measures, not any published rotation indicator's:
//   rs = sector / SPY
//   trend = 100 × rs / SMA(rs, 13)
//   momentum = 100 × trend / SMA(trend, 5)
import { wallClock } from "./chartData";
import { sma } from "./indicators";
import { SECTORS } from "./monitors";
import type { Bar, Chart, Rotation, WeeklyClose, WeeklySeries } from "./types";

const BENCHMARK = "SPY";

// Starting values: shorter averages make the map jumpier, longer ones make it lag.
export const TREND_WEEKS = 13;
export const MOMENTUM_WEEKS = 5;

/** A year: more than the longest tail needs (29 weeks), so the averages can be tuned without changing the route. */
export const WEEKS_SENT = 52;

/** Clockwise from top right, the way sectors tend to move through them. */
export const QUADRANTS = ["Leading", "Weakening", "Lagging", "Improving"] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export interface RotationPoint {
  week: string;
  trend: number;
  momentum: number;
}

const DAY = 86_400;

/**
 * One close per week, oldest first. Yahoo adds a bar for the latest trade on top of
 * that week's own, so a week's last bar is the one kept.
 */
export function toWeeks(bars: Bar[], timeZone: string): WeeklyClose[] {
  const weeks: WeeklyClose[] = [];
  for (const bar of bars) {
    const day = Math.floor(wallClock(bar.time, timeZone) / DAY);
    // Day 0 was a Thursday, so this counts back to Monday.
    const monday = day - ((day + 3) % 7);
    const week = new Date(monday * DAY * 1000).toISOString().slice(0, 10);
    const close = bar.adjClose ?? bar.close;
    if (weeks.at(-1)?.week === week) weeks[weeks.length - 1].close = close;
    else weeks.push({ week, close });
  }
  return weeks;
}

/**
 * A sector's trend and momentum for each week, oldest first. Weeks SPY has no close
 * for are left out, and so are the first 16: they don't have enough history before them.
 */
export function rotation(sector: WeeklyClose[], benchmark: WeeklyClose[]): RotationPoint[] {
  const spy = new Map(benchmark.map(({ week, close }) => [week, close]));
  const weeks = sector.filter(({ week }) => spy.has(week));
  const rs = weeks.map(({ week, close }) => close / spy.get(week)!);

  const rsAverage = sma(rs, TREND_WEEKS);
  // trend[i] is for weeks[i + TREND_WEEKS - 1].
  const trend = rs.slice(TREND_WEEKS - 1).map((value, i) => (100 * value) / rsAverage[i + TREND_WEEKS - 1]!);
  const trendAverage = sma(trend, MOMENTUM_WEEKS);
  return trend.flatMap((value, i) => {
    const average = trendAverage[i];
    if (average === undefined) return [];
    return [{ week: weeks[i + TREND_WEEKS - 1].week, trend: value, momentum: (100 * value) / average }];
  });
}

/** Split at 100 on both axes. Exactly 100 counts as above. */
export function quadrant({ trend, momentum }: Pick<RotationPoint, "trend" | "momentum">): Quadrant {
  if (trend >= 100) return momentum >= 100 ? "Leading" : "Weakening";
  return momentum >= 100 ? "Improving" : "Lagging";
}

/** The % change over the last `weeks` weeks, dividends included. Undefined without that much history. */
export function change(closes: WeeklyClose[], weeks: number): number | undefined {
  const latest = closes.at(-1);
  const before = closes.at(-1 - weeks);
  return latest && before ? 100 * (latest.close / before.close - 1) : undefined;
}

/**
 * Weekly closes for SPY and every sector, from `load`. A sector that fails is named in
 * `missing`, and the rest still come back. If SPY fails, so does this, with SPY's error.
 */
export async function loadRotation(load: (symbol: string) => Promise<Chart>): Promise<Rotation> {
  const series = async (symbol: string): Promise<WeeklySeries> => {
    const { bars, timeZone } = await load(symbol);
    return { symbol, weeks: toWeeks(bars, timeZone).slice(-WEEKS_SENT) };
  };
  const [benchmark, ...sectors] = await Promise.allSettled([BENCHMARK, ...SECTORS.map((s) => s.symbol)].map(series));
  if (benchmark.status === "rejected") throw benchmark.reason;
  return {
    benchmark: benchmark.value,
    sectors: sectors.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
    missing: SECTORS.filter((_, i) => sectors[i].status === "rejected").map((s) => s.symbol),
  };
}
