// Market mood: the "Thesis check" indicator's home-made copy of CNN's Fear & Greed Index. The rules are the script's.
import { sma } from "./indicators";
import type { DailyClose, Mood, MoodPart, Observation } from "./types";

const RANK_DAYS = 250;
const MOMENTUM_DAYS = 125;
const VIX_DAYS = 50;
const PUT_CALL_DAYS = 5;
const SAFE_HAVEN_DAYS = 20;

/** What the inputs are worked out from. A source that failed is simply missing. */
export interface MoodInputs {
  sp500?: DailyClose[];
  vix?: DailyClose[];
  /** Long Treasuries: TLT. */
  bonds?: DailyClose[];
  highYield?: Observation[];
  investmentGrade?: Observation[];
  /** Cboe's total put/call ratio, oldest first. */
  putCall?: number[];
}

/** The share of the previous `length` values at or below the last, in percent, as `ta.percentrank`. Undefined without that many. */
export function percentRank(values: number[], length = RANK_DAYS): number | undefined {
  if (values.length <= length) return undefined;
  const latest = values[values.length - 1];
  return (values.slice(-length - 1, -1).filter((value) => value <= latest).length / length) * 100;
}

const known = (values: (number | undefined)[]) => values.filter((value): value is number => value !== undefined);
const closesOf = (days: DailyClose[]) => days.map((day) => day.close);
const readingsOf = (days: DailyClose[]): Observation[] => days.map(({ date, close }) => ({ date, value: close }));
/** The fear-side inputs: a high reading is a low score. */
const flipped = (score: number | undefined) => (score === undefined ? undefined : 100 - score);

/** How far each value is above its own average, as a fraction. */
const aboveAverage = (values: number[], days: number) =>
  known(sma(values, days).map((average, i) => (average === undefined ? undefined : values[i] / average - 1)));

/** The change over `days`, as a fraction. */
const changes = (values: number[], days: number) => values.slice(days).map((value, i) => value / values[i] - 1);

/** `merge` of the two series, on the dates both have. */
function combine(left: Observation[], right: Observation[], merge: (a: number, b: number) => number): number[] {
  const others = new Map(right.map(({ date, value }) => [date, value]));
  return left.flatMap(({ date, value }) => {
    const other = others.get(date);
    return other === undefined ? [] : [merge(value, other)];
  });
}

/** Each input ranked against its past year of daily values, and the average of those available. */
export function readMood({ sp500, vix, bonds, highYield, investmentGrade, putCall }: MoodInputs): Mood {
  const parts: MoodPart[] = [
    { name: "Momentum", score: sp500 && percentRank(aboveAverage(closesOf(sp500), MOMENTUM_DAYS)) },
    // There's no free daily history of NYSE highs and lows, or of its up and down volume, so these two have no score.
    { name: "New highs vs lows" },
    { name: "Breadth" },
    { name: "Put/call", score: putCall && flipped(percentRank(known(sma(putCall, PUT_CALL_DAYS)))) },
    { name: "VIX", score: vix && flipped(percentRank(aboveAverage(closesOf(vix), VIX_DAYS))) },
    {
      name: "Stocks vs bonds",
      score:
        sp500 && bonds && percentRank(changes(combine(readingsOf(sp500), readingsOf(bonds), (stocks, tlt) => stocks / tlt), SAFE_HAVEN_DAYS)),
    },
    {
      name: "Junk bonds",
      score: highYield && investmentGrade && flipped(percentRank(combine(highYield, investmentGrade, (junk, grade) => junk - grade))),
    },
  ];
  const scores = parts.flatMap(({ score }) => score ?? []);
  return { parts, ...(scores.length > 0 && { score: scores.reduce((sum, score) => sum + score) / scores.length }) };
}

/** CNN's bands, as the script draws them. */
export function moodBand(score: number): { name: string; tone?: "up" | "down" | "amber" } {
  if (score < 25) return { name: "Extreme fear", tone: "down" };
  if (score < 45) return { name: "Fear", tone: "amber" };
  if (score <= 55) return { name: "Neutral" };
  return { name: score <= 75 ? "Greed" : "Extreme greed", tone: "up" };
}
