// DCF: a range of values per share from discounted free cash flow. Estimates from the
// ranges given, not a forecast: the result is only as good as they are.
import type { DcfInputs } from "./types";

/** Years of explicit growth before the terminal value. */
export const YEARS = 10;
export const RUNS = 10_000;
/** Fixed, so the same inputs always give the same results. */
export const SEED = 1;
/** The equity risk premium's low, likely and high, in %. */
export const RISK_PREMIUM = { low: 4, likely: 5, high: 6 };
/** Long-run growth, in %: about inflation, which a company can't outgrow for ever. */
export const TERMINAL = { low: 2, likely: 2.5, high: 3 };

/** Rates in %. */
export interface Rates {
  /** Free cash flow's growth in year 1. It fades in a straight line to `terminal` by year 10. */
  growth: number;
  terminal: number;
  discount: number;
}

export interface Range {
  low: number;
  likely: number;
  high: number;
}

export type Ranges = Record<keyof Rates, Range>;

export interface Start {
  freeCashFlow: number;
  netDebt: number;
  shares: number;
}

/** Debt less cash and short-term investments. Negative when the company holds more cash than debt. */
export const netDebt = (b: DcfInputs["balance"]) => b.currentDebt + b.longTermDebt - b.cash - b.shortTermInvestments;

/**
 * Each year's free cash flow discounted at year-end, plus a terminal value at year 10
 * growing at `terminal` for ever, less net debt, over the diluted shares.
 */
export function valuePerShare({ freeCashFlow, netDebt, shares }: Start, { growth, terminal, discount }: Rates): number {
  const r = discount / 100;
  let fcf = freeCashFlow;
  let value = 0;
  for (let year = 1; year <= YEARS; year++) {
    fcf *= 1 + (growth + ((terminal - growth) * (year - 1)) / (YEARS - 1)) / 100;
    value += fcf / (1 + r) ** year;
  }
  value += (fcf * (1 + terminal / 100)) / (r - terminal / 100) / (1 + r) ** YEARS;
  return (value - netDebt) / shares;
}

/** A draw from the triangular distribution on `range`, for `u` in [0, 1). */
export function triangular(u: number, { low, likely, high }: Range): number {
  if (high === low) return low;
  const peak = (likely - low) / (high - low);
  return u < peak ? low + Math.sqrt(u * (high - low) * (likely - low)) : high - Math.sqrt((1 - u) * (high - low) * (high - likely));
}

/** A seeded generator of numbers in [0, 1): mulberry32, small and fast, and plenty for 30,000 draws. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A run whose draws keep putting terminal growth at or above the discount rate gives up after this many.
const MAX_DRAWS = 1000;

/** `runs` values per share from rates drawn on `ranges`, lowest first. */
export function simulate(start: Start, ranges: Ranges, runs = RUNS, seed = SEED): number[] {
  const next = random(seed);
  const values: number[] = [];
  for (let run = 0; run < runs; run++) {
    let rates: Rates | undefined;
    for (let draw = 0; draw < MAX_DRAWS && !rates; draw++) {
      const growth = triangular(next(), ranges.growth);
      const terminal = triangular(next(), ranges.terminal);
      const discount = triangular(next(), ranges.discount);
      // Terminal growth at or above the discount rate has no finite value: draw again.
      if (terminal < discount) rates = { growth, terminal, discount };
    }
    if (!rates) throw new Error("Terminal growth is at or above the discount rate in almost every draw. Lower it, or raise the discount rate.");
    values.push(valuePerShare(start, rates));
  }
  return values.sort((a, b) => a - b);
}

/** The `p`th percentile of sorted values, interpolating as a spreadsheet's PERCENTILE.INC does. */
export function percentile(sorted: number[], p: number): number {
  const at = (p / 100) * (sorted.length - 1);
  const below = Math.floor(at);
  return below + 1 < sorted.length ? sorted[below] + (at - below) * (sorted[below + 1] - sorted[below]) : sorted[below];
}

/** How many sorted values fall in each of `bins` equal steps from `from` to `to`, the last one including `to`. */
export function histogram(sorted: number[], from: number, to: number, bins: number): number[] {
  const counts = Array<number>(bins).fill(0);
  const width = (to - from) / bins;
  for (const value of sorted) {
    if (value < from || value > to) continue;
    counts[Math.min(bins - 1, Math.floor((value - from) / width))]++;
  }
  return counts;
}

const tenth = (value: number) => Math.round(value * 10) / 10;

/**
 * Starting ranges, which the panel lets you change. Growth comes from revenue, steadier than
 * free cash flow: its slowest year, compound rate and fastest year. The discount rate is the
 * 10-year Treasury plus beta times the risk premium.
 */
export function prefill({ beta = 1, riskFree, revenue }: DcfInputs): Ranges {
  const values = revenue.map((r) => r.value).filter((v) => v > 0);
  const yearly = values.slice(1).map((value, i) => 100 * (value / values[i] - 1));
  const growth =
    yearly.length > 0
      ? {
          low: tenth(Math.min(...yearly)),
          likely: tenth(100 * ((values[values.length - 1] / values[0]) ** (1 / yearly.length) - 1)),
          high: tenth(Math.max(...yearly)),
        }
      : { low: 0, likely: 5, high: 10 };
  const discount = (premium: number) => tenth(riskFree.value + beta * premium);
  return {
    growth,
    terminal: { ...TERMINAL },
    discount: { low: discount(RISK_PREMIUM.low), likely: discount(RISK_PREMIUM.likely), high: discount(RISK_PREMIUM.high) },
  };
}
