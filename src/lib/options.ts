// OMON: an option chain laid out by strike, with what the panel works out from it.
import type { OptionChain, OptionContract } from "./types";

/** How many strikes each side of the price the chain shows unless asked for all. */
export const NEAR_STRIKES = 10;

export interface StrikeRow {
  strike: number;
  call?: OptionContract;
  put?: OptionContract;
}

/** One row for each strike either side has, lowest first. */
export function strikeRows({ calls, puts }: Pick<OptionChain, "calls" | "puts">): StrikeRow[] {
  const rows = new Map<number, StrikeRow>();
  for (const call of calls) rows.set(call.strike, { strike: call.strike, call });
  for (const put of puts) rows.set(put.strike, { ...(rows.get(put.strike) ?? { strike: put.strike }), put });
  return [...rows.values()].sort((a, b) => a.strike - b.strike);
}

/** Where the price falls among the rows: the index of the first strike at or above it. */
export const priceIndex = (rows: StrikeRow[], price: number) => {
  const index = rows.findIndex(({ strike }) => strike >= price);
  return index === -1 ? rows.length : index;
};

/** The `count` strikes below the price and the `count` at or above it, fewer where the chain runs out. */
export function nearStrikes(rows: StrikeRow[], price: number, count = NEAR_STRIKES): StrikeRow[] {
  const at = priceIndex(rows, price);
  return rows.slice(Math.max(0, at - count), at + count);
}

/** A call is in the money with its strike below the price, a put with its strike above it. */
export const inTheMoney = (side: "call" | "put", strike: number, price: number) => (side === "call" ? strike < price : strike > price);

const NEW_YORK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar days from today in New York, where US options expire, to an expiration such as "2026-11-20". 0 on the day. */
export function daysToExpiry(expiration: string, now: Date): number {
  const { year, month, day } = Object.fromEntries(NEW_YORK.formatToParts(now).map(({ type, value }) => [type, value]));
  return Math.round((Date.parse(expiration) - Date.UTC(Number(year), Number(month) - 1, Number(day))) / 86_400_000);
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const WITH_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/** "Nov 20 · 19d", with the year when it isn't this one: "Jan 15, 2027 · 75d". */
export function expiryLabel(expiration: string, now: Date): string {
  const date = new Date(`${expiration}T00:00:00Z`);
  const format = expiration.slice(0, 4) === String(now.getFullYear()) ? MONTH_DAY : WITH_YEAR;
  return `${format.format(date)} · ${daysToExpiry(expiration, now)}d`;
}

/** Puts over calls, by the day's volume and by open interest. Missing when no calls count. */
export function putCallRatios({ calls, puts }: Pick<OptionChain, "calls" | "puts">): { volume?: number; openInterest?: number } {
  const ratio = (key: "volume" | "openInterest") => {
    const sum = (side: OptionContract[]) => side.reduce((total, contract) => total + (contract[key] ?? 0), 0);
    const callTotal = sum(calls);
    return callTotal > 0 ? sum(puts) / callTotal : undefined;
  };
  return { volume: ratio("volume"), openInterest: ratio("openInterest") };
}
