// THS: a stock's weekly picture, after two TradingView indicators, "Thesis check" and "BB RSI". The rules are theirs, unchanged.
import { wallClock } from "./chartData";
import { bollinger, rsi, sma } from "./indicators";
import type { Bar, Thesis, WeekClose } from "./types";

const DAY = 86_400;
const TREND_WEEKS = 40;
/** The trend line is rising when it's above where it was this many weeks ago. */
const SLOPE_WEEKS = 4;
const STRENGTH_WEEKS = 52;
const BAND_WEEKS = 20;
const BAND_WIDTH = 2;
const RSI_WEEKS = 14;
const VOLUME_WEEKS = 20;
/** Heavy volume is more than this many times the average. */
const HEAVY_VOLUME = 2;
const PULLBACK_RSI = 40;
const MOMENTUM_RSI = 70;

/** The date of `time` in `timeZone`, as 00:00 UTC on that date. */
function dateIn(time: number, timeZone: string): number {
  const local = wallClock(time, timeZone);
  return local - (local % DAY);
}

/** The Monday of the week holding `date`. */
const mondayOf = (date: number) => date - ((new Date(date * 1000).getUTCDay() + 6) % 7) * DAY;

/** Daily bars as weeks from Monday, as TradingView draws them. A week's `time` is its Monday at 00:00 UTC. */
export function toWeeks(days: Bar[], timeZone: string): Bar[] {
  // Yahoo can send today twice while the market is open, and the later row is the fuller one.
  const byDate = new Map(days.map((day) => [dateIn(day.time, timeZone), day]));
  const weeks: Bar[] = [];
  for (const [date, { open, high, low, close, volume }] of byDate) {
    const time = mondayOf(date);
    const week = weeks.at(-1);
    if (week?.time !== time) {
      weeks.push({ time, open, high, low, close, volume });
      continue;
    }
    week.high = Math.max(week.high, high);
    week.low = Math.min(week.low, low);
    week.close = close;
    week.volume += volume;
  }
  return weeks;
}

/** The market a stock is measured against: OMXS30 for SEK listings, otherwise the S&P 500. */
export const benchmarkFor = (currency: string | undefined) =>
  currency === "SEK" ? { symbol: "^OMX", name: "OMXS30" } : { symbol: "^GSPC", name: "S&P" };

export type SignalLabel = "BUY" | "VOL" | "BUY+VOL";

/** One week and what the indicators say about it. Each value is undefined until it has the history it needs. */
export interface ThesisWeek {
  bar: Bar;
  /** The 40-week simple average. */
  trend?: number;
  /** Whether that average is above where it was 4 weeks ago. */
  rising?: boolean;
  upper?: number;
  lower?: number;
  rsi?: number;
  /** Mansfield relative strength: how far the stock's ratio to the market is above its own 52-week average, in percent. */
  strength?: number;
  label?: SignalLabel;
  /** The first week of a close above the upper band with RSI at 70 or more. */
  momentum: boolean;
}

/** Whether a week dipped enough for BUY: it touched the lower band, or RSI fell to 40 or below. */
export function dipped(low: number, lower: number | undefined, rsiValue: number | undefined): boolean {
  return (lower !== undefined && low <= lower) || (rsiValue !== undefined && rsiValue <= PULLBACK_RSI);
}

/** The market's latest close at or before each week, as TradingView lines up another symbol. */
function closesOn(weeks: Bar[], market: WeekClose[]): (number | undefined)[] {
  let next = 0;
  let close: number | undefined;
  return weeks.map(({ time }) => {
    while (next < market.length && market[next].time <= time) close = market[next++].close;
    return close;
  });
}

function relativeStrength(closes: number[], market: (number | undefined)[]): (number | undefined)[] {
  const first = market.findIndex((close) => close !== undefined);
  if (first === -1) return closes.map(() => undefined);
  const ratios = closes.slice(first).map((close, i) => close / market[first + i]!);
  const averages = sma(ratios, STRENGTH_WEEKS);
  const strength = ratios.map((ratio, i) => {
    const average = averages[i];
    return average === undefined ? undefined : (ratio / average - 1) * 100;
  });
  return [...Array<undefined>(first).fill(undefined), ...strength];
}

/** Every week of `thesis`, with the lines and signals of the two indicators. */
export function readWeeks({ weeks, benchmark }: Thesis): ThesisWeek[] {
  const closes = weeks.map((week) => week.close);
  const trend = sma(closes, TREND_WEEKS);
  const { upper, lower } = bollinger(closes, BAND_WEEKS, BAND_WIDTH);
  const rsis = rsi(closes, RSI_WEEKS);
  const averageVolume = sma(
    weeks.map((week) => week.volume),
    VOLUME_WEEKS,
  );
  const strength = relativeStrength(closes, closesOn(weeks, benchmark.weeks));

  const rising = (i: number) => {
    const [now, before] = [trend[i], trend[i - SLOPE_WEEKS]];
    return now === undefined || before === undefined ? undefined : now > before;
  };
  const upTrend = (i: number) => rising(i) === true && closes[i] > trend[i]!;
  const pullback = (i: number) => upTrend(i) && dipped(weeks[i].low, lower[i], rsis[i]);
  const heavyBuying = (i: number) => {
    const average = averageVolume[i];
    if (!upTrend(i) || average === undefined) return false;
    const { high, low, close, volume } = weeks[i];
    return volume > HEAVY_VOLUME * average && close > closes[i - 1] && close > (high + low) / 2;
  };
  const strongMomentum = (i: number) => {
    const [band, strengthIndex] = [upper[i], rsis[i]];
    return band !== undefined && strengthIndex !== undefined && closes[i] > band && strengthIndex >= MOMENTUM_RSI;
  };

  return weeks.map((bar, i) => {
    const buy = pullback(i) && !pullback(i - 1);
    const vol = heavyBuying(i) && !heavyBuying(i - 1);
    return {
      bar,
      trend: trend[i],
      rising: rising(i),
      upper: upper[i],
      lower: lower[i],
      rsi: rsis[i],
      strength: strength[i],
      label: buy && vol ? "BUY+VOL" : buy ? "BUY" : vol ? "VOL" : undefined,
      momentum: strongMomentum(i) && !strongMomentum(i - 1),
    };
  });
}

export interface SummaryRow {
  label: string;
  value: string;
  tone?: "up" | "down" | "amber";
}

/** A whole percent with its sign, as the indicator's table shows it. */
const percent = (value: number | undefined) => (value === undefined ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`);

/** How far `now` is above `then`, in percent, if both are known. */
const gain = (now: number | undefined, then: number | undefined) =>
  now === undefined || then === undefined ? undefined : (now / then - 1) * 100;

/** Each report's week: the stock's return less the market's, in points, where both have the week before. */
function earningsMoves({ weeks, earnings, timeZone }: Thesis, market: (number | undefined)[]): number[] {
  return earnings.flatMap((date) => {
    const monday = mondayOf(dateIn(date, timeZone));
    const i = weeks.findIndex((week) => week.time === monday);
    const [marketNow, marketBefore] = [market[i], market[i - 1]];
    if (i < 1 || marketNow === undefined || marketBefore === undefined) return [];
    return [(weeks[i].close / weeks[i - 1].close - marketNow / marketBefore) * 100];
  });
}

function trendRow({ bar, trend, rising }: ThesisWeek): SummaryRow {
  const label = "Trend";
  if (trend === undefined || rising === undefined) return { label, value: "Not enough history" };
  if (bar.close > trend && rising) return { label, value: "Uptrend", tone: "up" };
  if (bar.close < trend && !rising) return { label, value: "Downtrend: re-check", tone: "down" };
  return { label, value: "Mixed", tone: "amber" };
}

function strengthRow({ strength }: ThesisWeek): SummaryRow {
  const label = "Rel. strength";
  if (strength === undefined) return { label, value: "n/a" };
  return strength >= 0 ? { label, value: "Beating market", tone: "up" } : { label, value: "Lagging market", tone: "down" };
}

/** The indicator's table, for the latest week of `read`. */
export function summaryRows(thesis: Thesis, read: ThesisWeek[]): SummaryRow[] {
  const { weeks, benchmark } = thesis;
  const last = read.length - 1;
  const latest = read[last];
  const { close } = latest.bar;
  const market = closesOn(weeks, benchmark.weeks);
  const year = weeks.slice(Math.max(last + 1 - STRENGTH_WEEKS, 0));
  const high = year.length === STRENGTH_WEEKS ? Math.max(...year.map((week) => week.high)) : undefined;
  const yearReturn = percent(gain(close, weeks[last - STRENGTH_WEEKS]?.close));
  const marketReturn = percent(gain(market[last], market[last - STRENGTH_WEEKS]));
  const moves = earningsMoves(thesis, market).map((move) => `${move >= 0 ? "+" : ""}${move.toFixed(0)}`);

  return [
    trendRow(latest),
    { label: "vs 40w line", value: percent(gain(close, latest.trend)) },
    { label: "12m return", value: `${yearReturn} (${benchmark.name} ${marketReturn})` },
    strengthRow(latest),
    { label: "From 52w high", value: percent(gain(close, high)) },
    { label: "Earnings weeks vs mkt", value: moves.length === 0 ? "n/a" : `${moves.join("  ")} %` },
  ];
}
