// DCA: what investing a fixed amount on a schedule would have done, on real daily closes.
// Past results only: nothing here predicts which schedule will do best.
import { monthsBefore } from "./macro";
import type { DailyClose, Dividend } from "./types";

export const FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface Schedule {
  frequency: Frequency;
  /** 1 (Monday) to 5 (Friday) for weekly and biweekly; the day of the month, 1 to 28, for monthly. */
  day: number;
}

export interface Plan {
  /** Put in at each buy, the fee included. */
  amount: number;
  /** Taken from each buy before it buys shares. */
  fee: number;
  /** Dividends buy more shares, through Yahoo's adjusted close. Otherwise they're paid out and kept as cash. */
  reinvest: boolean;
}

export interface Flow {
  date: string;
  /** Money in is negative, money out positive. */
  amount: number;
}

export interface Outcome {
  firstBuy: string;
  /** The last day: the value is taken at its close. */
  end: string;
  buys: number;
  invested: number;
  shares: number;
  /** The shares at the last close, plus any dividends kept as cash. */
  value: number;
  /** Money put in per share owned. */
  averageCost: number;
  /** Money-weighted return a year, in %, with a spreadsheet's XIRR conventions. */
  xirr: number | undefined;
  /** The most the account fell below its high plus money added since, in %. */
  largestDrop: number;
}

const DAY_MS = 864e5;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

/** The dates a schedule calls for from `from` to `to`, before moving any off weekends and holidays. */
export function buyDates({ frequency, day }: Schedule, from: string, to: string): string[] {
  const dates: string[] = [];
  if (frequency === "monthly") {
    for (let month = from.slice(0, 7); `${month}-01` <= to; month = addDays(`${month}-28`, 4).slice(0, 7)) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date >= from && date <= to) dates.push(date);
    }
    return dates;
  }
  const first = addDays(from, (day - new Date(from).getUTCDay() + 7) % 7);
  for (let date = first; date <= to; date = addDays(date, frequency === "weekly" ? 7 : 14)) dates.push(date);
  return dates;
}

/**
 * Buys at the close of the first trading day on or after each date in `dates`, from
 * `days` onward, and values the account at the last day's close. Undefined with no buys.
 */
export function simulate(days: DailyClose[], dividends: Dividend[], plan: Plan, dates: string[]): Outcome | undefined {
  const flows: Flow[] = [];
  let shares = 0;
  let cash = 0;
  let value = 0;
  let high = 0;
  let largestDrop = 0;
  let next = 0;
  let dividend = 0;
  for (const day of days) {
    // A dividend goes to the shares held at the previous close, before today's buys.
    for (; dividend < dividends.length && dividends[dividend].date <= day.date; dividend++) {
      if (!plan.reinvest) cash += shares * dividends[dividend].amount;
    }
    const price = plan.reinvest ? day.adjClose : day.close;
    let added = 0;
    for (; next < dates.length && dates[next] <= day.date; next++) {
      shares += (plan.amount - plan.fee) / price;
      added += plan.amount - plan.fee;
      flows.push({ date: day.date, amount: -plan.amount });
    }
    if (flows.length === 0) continue;
    value = shares * price + cash;
    high = Math.max(high + added, value);
    largestDrop = Math.max(largestDrop, 1 - value / high);
  }
  if (flows.length === 0) return undefined;

  const end = days[days.length - 1].date;
  const invested = flows.length * plan.amount;
  return {
    firstBuy: flows[0].date,
    end,
    buys: flows.length,
    invested,
    shares,
    value,
    averageCost: invested / shares,
    xirr: xirr([...flows, { date: end, amount: value }]),
    largestDrop: 100 * largestDrop,
  };
}

/**
 * The yearly rate, in %, at which the money put in would grow to the end value, counting days
 * apart over 365 as a spreadsheet's XIRR does. `flows` are buys (negative) and then the end value.
 * Undefined when there's no such rate, as when everything happens on one day.
 */
export function xirr(flows: Flow[]): number | undefined {
  const end = Date.parse(flows[flows.length - 1].date);
  const years = flows.map((flow) => (end - Date.parse(flow.date)) / DAY_MS / 365);
  // Everything's worth at the end, and its slope, at a growth of e^u a year. Worth falls as u rises, so there's one root.
  const worth = (u: number) => {
    let sum = 0;
    let slope = 0;
    flows.forEach((flow, i) => {
      const grown = flow.amount * Math.exp(years[i] * u);
      sum += grown;
      slope += grown * years[i];
    });
    return [sum, slope];
  };

  let low = -20;
  let high = 20;
  if (!(worth(low)[0] > 0 && worth(high)[0] < 0)) return undefined;
  // Newton's method, halving the bracket instead when a step would leave it.
  let u = 0;
  for (let i = 0; i < 100; i++) {
    const [sum, slope] = worth(u);
    if (sum > 0) low = u;
    else high = u;
    const newton = u - sum / slope;
    const next = newton > low && newton < high ? newton : (low + high) / 2;
    if (Math.abs(next - u) < 1e-12) return 100 * (Math.exp(next) - 1);
    u = next;
  }
  return 100 * (Math.exp(u) - 1);
}

/** The days from `years` before the last one, or all of them. `short` when the history doesn't reach back that far. */
export function lookback(days: DailyClose[], years: number | undefined): { from: string; days: DailyClose[]; short: boolean } {
  const first = days[0].date;
  const wanted = years === undefined ? first : monthsBefore(days[days.length - 1].date, 12 * years);
  if (wanted <= first) return { from: first, days, short: wanted < first };
  return { from: wanted, days: days.filter((day) => day.date >= wanted), short: false };
}

/** Every schedule the comparison tries: each weekday every week and every 2 weeks, and each day 1–28 every month. */
export const SCHEDULES: Schedule[] = [
  ...[1, 2, 3, 4, 5].map((day) => ({ frequency: "weekly" as const, day })),
  ...[1, 2, 3, 4, 5].map((day) => ({ frequency: "biweekly" as const, day })),
  ...Array.from({ length: 28 }, (_, i) => ({ frequency: "monthly" as const, day: i + 1 })),
];

export interface Ranked {
  schedule: Schedule;
  outcome: Outcome;
}

/** Every schedule over the same days from `from`, best yearly return first. */
export function rank(days: DailyClose[], dividends: Dividend[], plan: Plan, from: string): Ranked[] {
  const to = days[days.length - 1].date;
  return SCHEDULES.flatMap((schedule) => {
    const outcome = simulate(days, dividends, plan, buyDates(schedule, from, to));
    return outcome ? [{ schedule, outcome }] : [];
  }).sort((a, b) => (b.outcome.xirr ?? -Infinity) - (a.outcome.xirr ?? -Infinity));
}

export interface LuckCheck {
  /** The first day of the second half. */
  middle: string;
  /** The best schedule on the first half. */
  firstBest: Schedule;
  /** Where it ranked on the second half, from 1. */
  laterRank: number;
  /** How many schedules were ranked. */
  count: number;
  secondBest: Schedule;
}

/**
 * Finds the best schedule on the first half of the days and where it ranked on the second.
 * A schedule with a real edge would stay near the top; one that was lucky needn't.
 */
export function luckCheck(days: DailyClose[], dividends: Dividend[], plan: Plan, from: string): LuckCheck | undefined {
  const middle = new Date((Date.parse(from) + Date.parse(days[days.length - 1].date)) / 2).toISOString().slice(0, 10);
  const firstHalf = days.filter((day) => day.date < middle);
  const secondHalf = days.filter((day) => day.date >= middle);
  if (firstHalf.length === 0 || secondHalf.length === 0) return undefined;
  const first = rank(firstHalf, dividends, plan, from);
  const second = rank(secondHalf, dividends, plan, middle);
  if (first.length === 0 || second.length === 0) return undefined;
  const same = (s: Schedule) => s.frequency === first[0].schedule.frequency && s.day === first[0].schedule.day;
  return {
    middle,
    firstBest: first[0].schedule,
    laterRank: second.findIndex((r) => same(r.schedule)) + 1,
    count: second.length,
    secondBest: second[0].schedule,
  };
}

/** "1st", "22nd", "13th". */
export const ordinal = (n: number) => {
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
};

/** "Every week on Monday", "Every 2 weeks on Friday", "Every month on the 1st". */
export function scheduleLabel({ frequency, day }: Schedule): string {
  if (frequency === "monthly") return `Every month on the ${ordinal(day)}`;
  return `${frequency === "weekly" ? "Every week" : "Every 2 weeks"} on ${WEEKDAYS[day]}`;
}
