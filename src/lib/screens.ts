// EQS: Yahoo's predefined stock screens, and sorting and filtering what one returns.
import type { ScreenRow } from "./types";

/** The equity screens, in the order the panel offers them. Gainers, losers and the most active are in MOST. */
export const SCREENS = [
  { id: "undervalued_growth_stocks", label: "Undervalued growth" },
  { id: "growth_technology_stocks", label: "Growth tech" },
  { id: "undervalued_large_caps", label: "Undervalued large caps" },
  { id: "aggressive_small_caps", label: "Aggressive small caps" },
  { id: "small_cap_gainers", label: "Small-cap gainers" },
  { id: "most_shorted_stocks", label: "Most shorted" },
] as const;
export type ScreenId = (typeof SCREENS)[number]["id"];

export const isScreenId = (id: string): id is ScreenId => SCREENS.some((screen) => screen.id === id);

/** Columns the table sorts by. "range" is where the price sits in its 52-week range. */
export type SortKey = "symbol" | "name" | "price" | "changePercent" | "volume" | "marketCap" | "peRatio" | "range";
export interface Sort {
  key: SortKey;
  descending: boolean;
}

/** Where the price sits in its 52-week range: 0 at the low, 1 at the high. Missing without a range. */
export function rangePosition({ price, week52Low, week52High }: ScreenRow): number | undefined {
  if (week52Low === undefined || week52High === undefined || week52High <= week52Low) return undefined;
  return Math.min(1, Math.max(0, (price - week52Low) / (week52High - week52Low)));
}

const valueOf = (row: ScreenRow, key: SortKey) => (key === "range" ? rangePosition(row) : row[key]);

/** A first click sorts biggest first, or A to Z for words; another click on the same column turns it round. */
export function nextSort(current: Sort | null, key: SortKey): Sort {
  if (current?.key === key) return { key, descending: !current.descending };
  return { key, descending: key !== "symbol" && key !== "name" };
}

/** The rows by `sort`, those missing its value last either way, ties in Yahoo's order. Without a sort, Yahoo's order. */
export function sortRows(rows: ScreenRow[], sort: Sort | null): ScreenRow[] {
  if (!sort) return rows;
  const { key, descending } = sort;
  return [...rows].sort((a, b) => {
    const x = valueOf(a, key);
    const y = valueOf(b, key);
    if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0);
    const order = typeof x === "string" ? x.localeCompare(y as string, "en") : x - (y as number);
    return descending ? -order : order;
  });
}

/** Market-cap floors, from the usual small, mid, large and mega lines. */
export const MARKET_CAPS = [
  { label: "Any size", value: 0 },
  { label: "$300M and up", value: 300e6 },
  { label: "$2B and up", value: 2e9 },
  { label: "$10B and up", value: 10e9 },
  { label: "$200B and up", value: 200e9 },
] as const;

export interface Filters {
  /** 0 for any. */
  minMarketCap: number;
  minPe?: number;
  maxPe?: number;
}

/** The rows that pass every filter set. One without the value a filter needs, such as a P/E for a loss-maker, doesn't. */
export function filterRows(rows: ScreenRow[], { minMarketCap, minPe, maxPe }: Filters): ScreenRow[] {
  return rows.filter(({ marketCap, peRatio }) => {
    if (minMarketCap > 0 && (marketCap === undefined || marketCap < minMarketCap)) return false;
    if (minPe === undefined && maxPe === undefined) return true;
    if (peRatio === undefined) return false;
    return (minPe === undefined || peRatio >= minPe) && (maxPe === undefined || peRatio <= maxPe);
  });
}
