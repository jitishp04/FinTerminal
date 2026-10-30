import { formatCompact, formatFraction, formatPrice } from "./format";
import type { Profile } from "./types";

/** A stat's label and formatted value; undefined when the source has no value. */
export type Stat = [label: string, value: string | undefined];

const FUNDS = new Set(["ETF", "MUTUALFUND"]);

const TYPE_LABELS: Record<string, string> = {
  EQUITY: "Stock",
  ETF: "ETF",
  MUTUALFUND: "Mutual fund",
  INDEX: "Index",
  CURRENCY: "Currency",
  FUTURE: "Future",
  CRYPTOCURRENCY: "Crypto",
};

/** `"EQUITY"` → `"Stock"`. */
export const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;

const as = (value: number | undefined, format: (n: number) => string) => (value === undefined ? undefined : format(value));
const ratio = (value: number | undefined) => as(value, (n) => formatPrice(n, 2));

/** The stats that apply to this kind of security, in display order. */
export function keyStats(p: Profile): Stat[] {
  const range =
    p.week52Low !== undefined && p.week52High !== undefined
      ? `${formatPrice(p.week52Low)} – ${formatPrice(p.week52High)}`
      : undefined;
  // Yahoo reports 0 average volume for currencies.
  const volume: Stat = ["Avg volume", p.averageVolume ? formatCompact(p.averageVolume) : undefined];

  if (p.type === "EQUITY") {
    return [
      ["Market cap", as(p.marketCap, formatCompact)],
      ["P/E (TTM)", ratio(p.peRatio)],
      ["Forward P/E", ratio(p.forwardPE)],
      ["EPS (TTM)", ratio(p.eps)],
      ["Dividend yield", as(p.dividendYield, formatFraction)],
      ["Beta", ratio(p.beta)],
      ["52-week range", range],
      volume,
      ["Shares out", as(p.sharesOutstanding, formatCompact)],
      ["Gross margin", as(p.grossMargin || undefined, formatFraction)],
      ["Operating margin", as(p.operatingMargin, formatFraction)],
      ["Profit margin", as(p.profitMargin, formatFraction)],
    ];
  }
  if (FUNDS.has(p.type)) {
    return [
      ["Total assets", as(p.totalAssets, formatCompact)],
      ["Expense ratio", as(p.expenseRatio, formatFraction)],
      ["Yield", as(p.dividendYield, formatFraction)],
      ["P/E (TTM)", ratio(p.peRatio)],
      ["Beta", ratio(p.beta)],
      ["52-week range", range],
      volume,
    ];
  }
  return [["52-week range", range], volume];
}
