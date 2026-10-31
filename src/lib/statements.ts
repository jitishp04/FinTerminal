import { formatFraction, formatInteger, formatPercent, formatPrice } from "./format";
import type { Financials, FinancialPeriod, StatementLine, StatementPeriod } from "./types";

export const STATEMENT_TABS = [
  { key: "income", label: "Income statement" },
  { key: "balance", label: "Balance sheet" },
  { key: "cashFlow", label: "Cash flow" },
] as const;
export type StatementTab = (typeof STATEMENT_TABS)[number]["key"];

export type CellKind = "money" | "perShare" | "shares" | "margin" | "growth";
type Values = (number | null)[];

export interface StatementRow {
  key: string;
  label: string;
  kind: CellKind;
  /** A main total, shown stronger than the lines around it. */
  total: boolean;
  /** One per period, in the view's order. Margins are fractions, growth is in percent. */
  values: Values;
}

/** Columns on screen. The API sends one more year, so that the oldest of them can show growth. */
const COLUMNS: Record<FinancialPeriod, number> = { annual: 5, quarterly: 8 };

const TOTALS = new Set([
  "revenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "totalAssets",
  "totalLiabilities",
  "equity",
  "operatingCashFlow",
  "freeCashFlow",
]);

const toRow = ({ key, label, unit, values }: StatementLine): StatementRow => ({
  key,
  label,
  kind: unit ?? "money",
  total: TOTALS.has(key),
  values,
});

const derivedRow = (key: string, label: string, kind: CellKind, values: Values): StatementRow => ({
  key,
  label,
  kind,
  total: TOTALS.has(key),
  values,
});

const valuesOf = (lines: StatementLine[], key: string): Values => lines.find((line) => line.key === key)?.values ?? [];

/** Applies `combine` period by period, blank wherever either side is. */
function combined(a: Values, b: Values, combine: (a: number, b: number) => number | null): Values {
  return a.map((value, i) => {
    const other = b[i] ?? null;
    return value === null || other === null ? null : combine(value, other);
  });
}

const difference = (a: Values, b: Values) => combined(a, b, (x, y) => x - y);
const share = (part: Values, whole: Values) => combined(part, whole, (x, y) => (y === 0 ? null : x / y));

/**
 * Where each period's same period a year earlier sits. By name: a missing quarter would
 * throw off a fixed offset. A 10-KT's column compares with nothing, but a year with no
 * full year before it can compare with that column's 12-month figures. A quarter in a
 * transition period was numbered on from the year before, so the year in its label is
 * the one to compare with.
 */
function yearAgoIndexes(periods: StatementPeriod[]) {
  const indexes = new Map(periods.map(({ label }, i) => [label, i]));
  return periods.map(({ label, transition }) => {
    if (transition) return label.startsWith("Q") ? indexes.get(label.slice(0, -1)) : undefined;
    const yearAgo = label.replace(/\d+$/, (year) => String(Number(year) - 1));
    return indexes.get(yearAgo) ?? (label.startsWith("FY") ? indexes.get(`${yearAgo}T`) : undefined);
  });
}

/** Percent change on a year earlier. Blank from a loss or zero, where a percentage means nothing. */
function growth(values: Values, yearAgo: (number | undefined)[]): Values {
  return values.map((value, i) => {
    const earlier = yearAgo[i];
    const base = earlier === undefined ? null : values[earlier];
    return value === null || base === null || base <= 0 ? null : ((value - base) / base) * 100;
  });
}

function incomeRows({ income, periods }: Financials): StatementRow[] {
  const revenue = valuesOf(income, "revenue");
  const worked = difference(revenue, valuesOf(income, "costOfRevenue"));
  const grossProfit = valuesOf(income, "grossProfit").map((value, i) => value ?? worked[i] ?? null);
  const yearAgo = yearAgoIndexes(periods);

  const derived: Record<string, StatementRow> = {
    revenue: derivedRow("revenueGrowth", "Revenue growth (YoY)", "growth", growth(revenue, yearAgo)),
    grossProfit: derivedRow("grossMargin", "Gross margin", "margin", share(grossProfit, revenue)),
    operatingIncome: derivedRow(
      "operatingMargin",
      "Operating margin",
      "margin",
      share(valuesOf(income, "operatingIncome"), revenue),
    ),
    netIncome: derivedRow(
      "netIncomeGrowth",
      "Net income growth (YoY)",
      "growth",
      growth(valuesOf(income, "netIncome"), yearAgo),
    ),
  };

  return income.flatMap((line) => {
    const row = line.key === "grossProfit" ? { ...toRow(line), values: grossProfit } : toRow(line);
    const after = derived[line.key];
    return after ? [row, after] : [row];
  });
}

function cashFlowRows({ cashFlow }: Financials): StatementRow[] {
  const freeCashFlow = difference(valuesOf(cashFlow, "operatingCashFlow"), valuesOf(cashFlow, "capitalExpenditures"));
  return cashFlow.flatMap((line) =>
    line.key === "capitalExpenditures"
      ? [toRow(line), derivedRow("freeCashFlow", "Free cash flow", "money", freeCashFlow)]
      : [toRow(line)],
  );
}

/** One statement as a table: the periods to show, and the rows with something to show in them. */
export function statementView(financials: Financials, tab: StatementTab) {
  const rows =
    tab === "income"
      ? incomeRows(financials)
      : tab === "cashFlow"
        ? cashFlowRows(financials)
        : financials.balance.map(toRow);
  const columns = COLUMNS[financials.period];
  return {
    periods: financials.periods.slice(0, columns),
    rows: rows
      .map((row) => ({ ...row, values: row.values.slice(0, columns) }))
      .filter((row) => row.values.some((value) => value !== null)),
  };
}

export function formatCell(kind: CellKind, value: number | null): string {
  if (value === null) return "—";
  if (kind === "perShare") return formatPrice(value, 2);
  if (kind === "margin") return formatFraction(value);
  if (kind === "growth") return formatPercent(value);
  return formatInteger(value / 1_000_000);
}

const WITHOUT_STATEMENTS: Record<string, string> = {
  ETF: "ETFs",
  MUTUALFUND: "mutual funds",
  INDEX: "indices",
  CURRENCY: "currencies",
  FUTURE: "futures",
};

/** Why a security has no statements, when its type explains it. */
export function notAvailableMessage(type: string | undefined): string | undefined {
  const kind = type && WITHOUT_STATEMENTS[type];
  return kind ? `Financial statements aren't available for ${kind}.` : undefined;
}
