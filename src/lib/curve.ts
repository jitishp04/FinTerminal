import { monthsBefore } from "./macro";
import type { CurvePoint, Observation, YieldCurve } from "./types";

/** The maturities on the curve, shortest first: each one's FRED series and its name on screen. */
export const TENORS = [
  { id: "DGS1MO", label: "1M" },
  { id: "DGS3MO", label: "3M" },
  { id: "DGS6MO", label: "6M" },
  { id: "DGS1", label: "1Y" },
  { id: "DGS2", label: "2Y" },
  { id: "DGS3", label: "3Y" },
  { id: "DGS5", label: "5Y" },
  { id: "DGS7", label: "7Y" },
  { id: "DGS10", label: "10Y" },
  { id: "DGS20", label: "20Y" },
  { id: "DGS30", label: "30Y" },
];

/** The nearest of `days`, oldest first, on or before `target`. */
const onOrBefore = (days: string[], target: string) => days.findLast((day) => day <= target)!;

/** The curve from each tenor's observations, in TENORS order and oldest first. */
export function toCurve(series: Observation[][]): YieldCurve {
  const byDate = series.map((points) => new Map(points.map(({ date, value }) => [date, value])));
  // Only days every tenor has, so that each of the three curves is one day's.
  const days = series[0].map(({ date }) => date).filter((date) => byDate.every((values) => values.has(date)));
  const latest = days[days.length - 1];
  const monthAgo = onOrBefore(days, monthsBefore(latest, 1));
  const yearAgo = onOrBefore(days, monthsBefore(latest, 12));

  const points: CurvePoint[] = TENORS.map(({ label }, i) => ({
    tenor: label,
    latest: byDate[i].get(latest)!,
    monthAgo: byDate[i].get(monthAgo)!,
    yearAgo: byDate[i].get(yearAgo)!,
    inverted: i > 0 && byDate[i].get(latest)! < byDate[i - 1].get(latest)!,
  }));
  return { dates: { latest, monthAgo, yearAgo }, points };
}

/** From yields in percent: `4.98` against `5.05` is `-7`. Rounded, as subtracting decimals leaves noise. */
export const bpChange = (yieldNow: number, yieldThen: number) => Math.round((yieldNow - yieldThen) * 100);

/** Where the curve slopes down: `["20Y–30Y"]`. */
export function invertedSegments(points: CurvePoint[]): string[] {
  return points.flatMap(({ tenor, inverted }, i) => (inverted ? [`${points[i - 1].tenor}–${tenor}`] : []));
}
