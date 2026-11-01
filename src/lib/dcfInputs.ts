// What DCF starts from: trailing free cash flow, net debt and shares from the SEC, price and
// beta from Yahoo, the 10-year Treasury from FRED. Or why a DCF doesn't fit the symbol.
import { formatInteger } from "./format";
import { typeLabel } from "./keyStats";
import type { DcfInputs, DcfUnfit, Financials, Observation, Profile } from "./types";

/** Why a DCF doesn't fit this kind of security or business, or undefined if it does. */
export function unfitReason({ symbol, type, industry = "" }: Profile): string | undefined {
  if (type !== "EQUITY") {
    const kind = type === "ETF" ? "ETF" : typeLabel(type).toLowerCase();
    return `A DCF values a company from its cash flows, and ${symbol} is ${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}.`;
  }
  if (/^Banks\b/.test(industry)) {
    return `Free cash flow says little about a bank, whose cash moves with deposits and loans, so a DCF doesn't fit ${symbol}.`;
  }
  if (/^Insurance - /.test(industry)) {
    return `Free cash flow says little about an insurer, whose cash moves with premiums and claims, so a DCF doesn't fit ${symbol}.`;
  }
  return undefined;
}

interface Sources {
  profile: Profile;
  price: number;
  annual: Financials;
  quarterly: Financials;
  riskFree: Observation;
}

const line = (statements: Financials, section: "income" | "balance" | "cashFlow", key: string) =>
  statements[section].find((l) => l.key === key)?.values ?? [];

const millions = (value: number) => `${value < 0 ? "-" : ""}$${formatInteger(Math.abs(value) / 1e6)}M`;

/** Operating cash flow less capital expenditures, over the last 4 quarters or else the latest fiscal year. */
function trailingFreeCashFlow({ annual, quarterly }: Sources): DcfInputs["freeCashFlow"] | undefined {
  // The newest 4 values added up, or null if there aren't 4.
  const lastFour = (values: (number | null)[]) => {
    const four = values.slice(0, 4);
    return four.length === 4 && four.every((v) => v !== null) ? four.reduce<number>((sum, v) => sum + v!, 0) : null;
  };
  const quarters = quarterly.periods.slice(0, 4);
  if (!quarters.some((p) => p.transition)) {
    const operating = lastFour(line(quarterly, "cashFlow", "operatingCashFlow"));
    const capex = lastFour(line(quarterly, "cashFlow", "capitalExpenditures"));
    if (operating !== null && capex !== null) {
      return { value: operating - capex, operatingCashFlow: operating, capitalExpenditures: capex, period: `the 4 quarters to ${quarters[0].end}` };
    }
  }
  const operating = line(annual, "cashFlow", "operatingCashFlow")[0] ?? null;
  const capex = line(annual, "cashFlow", "capitalExpenditures")[0] ?? null;
  if (operating === null || capex === null) return undefined;
  return { value: operating - capex, operatingCashFlow: operating, capitalExpenditures: capex, period: annual.periods[0].label };
}

/** The inputs, or why a DCF doesn't fit when the filings don't support one. */
export function toDcfInputs(sources: Sources): DcfInputs | DcfUnfit {
  const { profile, price, annual, quarterly, riskFree } = sources;
  const symbol = profile.symbol;
  const freeCashFlow = trailingFreeCashFlow(sources);
  if (!freeCashFlow) {
    return {
      symbol,
      reason: `${symbol}'s filings don't give operating cash flow and capital expenditures for the last year, so there's no free cash flow to start from.`,
    };
  }
  if (freeCashFlow.value <= 0) {
    return {
      symbol,
      reason: `${symbol}'s free cash flow was ${millions(freeCashFlow.value)} over ${freeCashFlow.period}. A DCF grows positive cash flow, so it doesn't fit.`,
    };
  }

  // The latest quarter's count, or the year's: a 10-K's fourth quarter has none of its own.
  const quarterShares = line(quarterly, "income", "sharesDiluted")[0] ?? null;
  const yearShares = line(annual, "income", "sharesDiluted")[0] ?? null;
  const shares =
    quarterShares !== null
      ? { value: quarterShares, period: quarterly.periods[0].label }
      : yearShares !== null
        ? { value: yearShares, period: annual.periods[0].label }
        : undefined;
  if (!shares) return { symbol, reason: `${symbol}'s filings don't give a diluted share count, so there's no value per share.` };

  const latest = (key: string) => line(quarterly, "balance", key)[0] ?? 0;
  const revenue = annual.periods.flatMap((period, i) => {
    const value = line(annual, "income", "revenue")[i];
    return value === null || value === undefined ? [] : [{ period: period.label, value }];
  });
  return {
    symbol,
    name: profile.name,
    currency: profile.currency,
    price,
    beta: profile.beta,
    riskFree,
    freeCashFlow,
    balance: {
      date: quarterly.periods[0].end,
      cash: latest("cash"),
      shortTermInvestments: latest("shortTermInvestments"),
      currentDebt: latest("currentDebt"),
      longTermDebt: latest("longTermDebt"),
    },
    shares,
    revenue: revenue.reverse(),
  };
}
