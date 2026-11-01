// Cboe's daily market statistics: one public file a trading day, no key. Market mood reads the put/call ratio from them.
import { cached } from "../cache";
import { tracked } from "./health";

const FILES = "https://cdn.cboe.com/data/us/options/market_statistics/daily";
const TOTAL = "TOTAL PUT/CALL RATIO";

const DAY = 24 * 60 * 60 * 1000;
// A past day's file doesn't change.
const FILE_TTL = 30 * DAY;
// The list gains a day at most once a day.
const LIST_TTL = 4 * 60 * 60 * 1000;
const FILE_TIMEOUT = 10_000;
/** Weekdays to ask for: over a year, to hold the 255 trading days the mood ranks, with holidays, which have no file. */
const WEEKDAYS = 270;
const AT_ONCE = 12;

/** The newest `count` weekdays up to `now`, oldest first. */
function weekdays(now: Date, count: number): string[] {
  const dates: string[] = [];
  for (let day = now; dates.length < count; day = new Date(day.getTime() - DAY)) {
    if (day.getUTCDay() % 6 !== 0) dates.push(day.toISOString().slice(0, 10));
  }
  return dates.reverse();
}

/** A day with no file yet, or none at all. Thrown so the cache doesn't keep the miss. */
class NoFile extends Error {}

/** A day's total put/call ratio, or undefined if it has no file: Cboe's CDN answers 403 for one it doesn't have. */
function ratioOn(date: string): Promise<number | undefined> {
  return cached(`cboe:${date}`, FILE_TTL, async () => {
    const response = await fetch(`${FILES}/${date}_daily_options`, { signal: AbortSignal.timeout(FILE_TIMEOUT) });
    if (response.status === 403 || response.status === 404) throw new NoFile();
    if (!response.ok) throw new Error(`Cboe answered ${response.status} for ${date}`);
    const { ratios } = (await response.json()) as { ratios: { name: string; value: string }[] };
    const ratio = Number(ratios.find(({ name }) => name === TOTAL)?.value);
    if (Number.isNaN(ratio)) throw new NoFile();
    return ratio;
  }).catch((error) => {
    if (error instanceof NoFile) return undefined;
    throw error;
  });
}

/** The total put/call ratio of each recent trading day, oldest first. */
export function totalPutCall(): Promise<number[]> {
  return cached("cboe:put-call", LIST_TTL, () =>
    tracked("cboe", async () => {
      const dates = weekdays(new Date(), WEEKDAYS);
      const ratios: (number | undefined)[] = [];
      for (let i = 0; i < dates.length; i += AT_ONCE) {
        ratios.push(...(await Promise.all(dates.slice(i, i + AT_ONCE).map(ratioOn))));
      }
      const found = ratios.filter((ratio): ratio is number => ratio !== undefined);
      if (found.length === 0) throw new Error("Cboe has none of the daily files it should");
      return found;
    }),
  );
}
