import { formatChange, formatPrice } from "./format";
import type { Chart, MacroIndicator, MacroRange, MacroSeries, Observation } from "./types";

/** How often macro panels ask again. Releases come out days apart, so this only has to catch them the same morning. */
export const MACRO_REFRESH = 60 * 60_000;

const TREND_YEARS = 2;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toTime = (date: string) => Date.parse(date) / 1000;

/** Epoch seconds `years` before a date. */
function yearsBefore(date: string, years: number): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year - years, month - 1, day) / 1000;
}

/** The same day `months` earlier, or that month's last day if it's shorter: a month before 31 March is 28 February. */
export function monthsBefore(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - months, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 - months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/**
 * Each month against one `months` earlier, found by date. Series have holes, so counting rows
 * back would land on the wrong month: there's no October 2025 CPI, and a month with no match gets no value.
 */
function againstEarlier(
  points: Observation[],
  months: number,
  compare: (value: number, earlier: number) => number,
): Observation[] {
  const byDate = new Map(points.map(({ date, value }) => [date, value]));
  return points.flatMap(({ date, value }) => {
    const earlier = byDate.get(monthsBefore(date, months));
    return earlier === undefined ? [] : [{ date, value: compare(value, earlier) }];
  });
}

/** Percent change from the same month a year before. */
export const yearOverYear = (points: Observation[]) =>
  againstEarlier(points, 12, (value, earlier) => (value / earlier - 1) * 100);

/** Change from the month before. */
export const monthlyChange = (points: Observation[]) => againstEarlier(points, 1, (value, earlier) => value - earlier);

const thousands = (points: Observation[]) => points.map(({ date, value }) => ({ date, value: value / 1000 }));

export interface IndicatorDef extends Pick<MacroIndicator, "id" | "label" | "unit" | "decimals" | "signed"> {
  /** FRED's frequency code, for naming the period. */
  frequency: string;
  /** Turns the series FRED gives into the one shown. */
  transform?: (points: Observation[]) => Observation[];
}

/** The ECO dashboard, top to bottom. */
export const INDICATORS: IndicatorDef[] = [
  { id: "FEDFUNDS", label: "Fed funds rate", frequency: "M", unit: "%", decimals: 2 },
  { id: "DGS2", label: "2-year Treasury", frequency: "D", unit: "%", decimals: 2 },
  { id: "DGS10", label: "10-year Treasury", frequency: "D", unit: "%", decimals: 2 },
  { id: "T10Y2Y", label: "10-year minus 2-year", frequency: "D", unit: "%", decimals: 2 },
  { id: "CPIAUCSL", label: "CPI, year on year", frequency: "M", unit: "%", decimals: 1, transform: yearOverYear },
  { id: "CPILFESL", label: "Core CPI, year on year", frequency: "M", unit: "%", decimals: 1, transform: yearOverYear },
  { id: "UNRATE", label: "Unemployment rate", frequency: "M", unit: "%", decimals: 1 },
  {
    id: "PAYEMS",
    label: "Payrolls, monthly change",
    frequency: "M",
    unit: "K",
    decimals: 0,
    signed: true,
    transform: monthlyChange,
  },
  { id: "A191RL1Q225SBEA", label: "Real GDP growth, annualized", frequency: "Q", unit: "%", decimals: 1 },
  { id: "ICSA", label: "Initial jobless claims", frequency: "W", unit: "K", decimals: 0, transform: thousands },
];

/** What a date stands for at a frequency: `Sep 2026`, `Q3 2026`, `2025`. Days and weeks keep their date. */
export function periodLabel(date: string, frequency: string): string {
  const [year, month] = date.split("-").map(Number);
  if (frequency === "A") return String(year);
  if (frequency === "Q") return `Q${Math.ceil(month / 3)} ${year}`;
  if (frequency === "M") return `${MONTHS[month - 1]} ${year}`;
  return date;
}

/** One dashboard row from a series' observations, oldest first. */
export function toIndicator(def: IndicatorDef, observations: Observation[]): MacroIndicator {
  const { id, label, unit, decimals, signed, frequency, transform } = def;
  const points = transform ? transform(observations) : observations;
  const latest = points[points.length - 1];
  const since = yearsBefore(latest.date, TREND_YEARS);
  return {
    id,
    label,
    unit,
    decimals,
    signed,
    latest: latest.value,
    prior: points[points.length - 2].value,
    period: periodLabel(latest.date, frequency),
    trend: points.filter(({ date }) => toTime(date) >= since).map(({ value }) => value),
  };
}

/** `3.75%`, `4.2%`, `+29K`, `194K`. */
export function formatIndicator(
  value: number,
  { unit, decimals, signed }: Pick<MacroIndicator, "unit" | "decimals" | "signed">,
): string {
  return `${signed ? formatChange(value, decimals) : formatPrice(value, decimals)}${unit}`;
}

const tenths = (value: number) => Math.round(value * 10) / 10;

/** Values as SVG polyline points: left to right, highest at the top, and a flat series along the middle. */
export function sparkPoints(values: number[], width: number, height: number): string {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const last = values.length - 1;
  return values
    .map((value, i) => {
      const x = last === 0 ? 0 : (i / last) * width;
      const y = high === low ? height / 2 : ((high - value) / (high - low)) * height;
      return `${tenths(x)},${tenths(y)}`;
    })
    .join(" ");
}

/**
 * A series in the form GP's chart draws, as flat bars with no volume. Ranges run back
 * from the last reading, so a series that has ended still has something to show.
 */
export function toChart({ id, decimals, observations }: MacroSeries, range: MacroRange): Chart {
  const bars = observations.map(({ date, value }) => ({
    time: toTime(date),
    open: value,
    high: value,
    low: value,
    close: value,
    volume: 0,
  }));
  const last = observations[observations.length - 1];
  const from = range === "Max" ? bars[0].time : yearsBefore(last.date, Number.parseInt(range));
  return { symbol: id, range, interval: "1d", timeZone: "UTC", decimals, from, bars };
}
