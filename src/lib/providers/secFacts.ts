import type { Financials, FinancialPeriod, StatementLine, StatementPeriod } from "../types";

// Turns SEC "company facts" (every number a company has tagged in its filings)
// into statements. Most of the work is that a number's meaning isn't in the data
// directly: 10-Qs report cash flow as year-to-date, Q4 is never filed on its own,
// and tags change over the years.

export interface Fact {
  /** Absent on balance sheet items, which are a point in time. */
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number | null;
  fp: string | null;
  form: string;
  filed: string;
}

export interface CompanyFacts {
  entityName: string;
  facts: { "us-gaap"?: Record<string, { units: Record<string, Fact[]> }> };
}

interface LineSpec {
  key: string;
  label: string;
  /**
   * Tried in order, for each period on its own: companies change tags over the years.
   * Only tags that mean the whole line: a narrower one would show a believable wrong number.
   */
  tags: string[];
  unit?: StatementLine["unit"];
}

const INCOME: LineSpec[] = [
  {
    key: "revenue",
    label: "Revenue",
    tags: [
      "RevenuesNetOfInterestExpense",
      // Ahead of contract revenue, which leaves out lease income and insurance premiums.
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
    ],
  },
  {
    key: "costOfRevenue",
    label: "Cost of revenue",
    tags: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices"],
  },
  { key: "grossProfit", label: "Gross profit", tags: ["GrossProfit"] },
  {
    key: "researchAndDevelopment",
    label: "Research and development",
    tags: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"],
  },
  { key: "sellingGeneralAdministrative", label: "Selling, general and admin", tags: ["SellingGeneralAndAdministrativeExpense"] },
  {
    key: "operatingExpenses",
    label: "Operating expenses",
    tags: ["OperatingExpenses", "CostsAndExpenses", "NoninterestExpense"],
  },
  { key: "operatingIncome", label: "Operating income", tags: ["OperatingIncomeLoss"] },
  {
    key: "pretaxIncome",
    label: "Pre-tax income",
    tags: [
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ],
  },
  { key: "incomeTax", label: "Income tax", tags: ["IncomeTaxExpenseBenefit"] },
  {
    key: "netIncome",
    label: "Net income",
    tags: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  },
  {
    key: "epsDiluted",
    label: "Diluted EPS",
    tags: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"],
    unit: "perShare",
  },
  {
    key: "sharesDiluted",
    label: "Diluted shares",
    tags: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
    unit: "shares",
  },
];

const BALANCE: LineSpec[] = [
  {
    key: "cash",
    label: "Cash and equivalents",
    tags: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashAndDueFromBanks",
      "Cash",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    ],
  },
  {
    key: "shortTermInvestments",
    label: "Short-term investments",
    tags: [
      "MarketableSecuritiesCurrent",
      "ShortTermInvestments",
      "OtherShortTermInvestments",
      "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    ],
  },
  { key: "receivables", label: "Receivables", tags: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"] },
  { key: "inventory", label: "Inventory", tags: ["InventoryNet"] },
  { key: "currentAssets", label: "Current assets", tags: ["AssetsCurrent"] },
  { key: "totalAssets", label: "Total assets", tags: ["Assets"] },
  {
    key: "accountsPayable",
    label: "Accounts payable",
    tags: ["AccountsPayableCurrent", "AccountsPayableAndAccruedLiabilitiesCurrent"],
  },
  { key: "currentLiabilities", label: "Current liabilities", tags: ["LiabilitiesCurrent"] },
  {
    key: "longTermDebt",
    label: "Long-term debt",
    tags: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongTermDebt"],
  },
  { key: "totalLiabilities", label: "Total liabilities", tags: ["Liabilities"] },
  {
    key: "equity",
    label: "Shareholders' equity",
    tags: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  },
];

const CASH_FLOW: LineSpec[] = [
  {
    key: "operatingCashFlow",
    label: "Operating cash flow",
    tags: [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
  },
  {
    key: "capitalExpenditures",
    label: "Capital expenditures",
    tags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  },
  {
    key: "investingCashFlow",
    label: "Investing cash flow",
    tags: [
      "NetCashProvidedByUsedInInvestingActivities",
      "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
    ],
  },
  {
    key: "financingCashFlow",
    label: "Financing cash flow",
    tags: [
      "NetCashProvidedByUsedInFinancingActivities",
      "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
    ],
  },
  {
    key: "depreciation",
    label: "Depreciation and amortization",
    tags: [
      "DepreciationDepletionAndAmortization",
      "DepreciationAmortizationAndAccretionNet",
      "DepreciationAndAmortization",
    ],
  },
  { key: "stockCompensation", label: "Stock-based compensation", tags: ["ShareBasedCompensation"] },
  {
    key: "dividendsPaid",
    label: "Dividends paid",
    tags: ["PaymentsOfDividends", "PaymentsOfOrdinaryDividends", "PaymentsOfDividendsCommonStock"],
  },
  { key: "shareBuybacks", label: "Share buybacks", tags: ["PaymentsForRepurchaseOfCommonStock"] },
];

/** Dates and labels for a screen's columns, plus a spare year for year-over-year growth. */
const ANNUAL_PERIODS = 6;
const QUARTERLY_PERIODS = 12;

const DAY_MS = 86_400_000;
const DAYS_PER_QUARTER = 91.3;
// Wide enough for uneven calendars, like Costco's 252-day three quarters, but too narrow for periods to overlap.
const LENGTH_TOLERANCE_DAYS = 25;

const FISCAL_QUARTERS: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, FY: 4 };

type Gaap = NonNullable<CompanyFacts["facts"]["us-gaap"]>;
/** A line's reported values by `end/quarters`, where 0 quarters is a point in time. */
type Series = Map<string, number>;

interface FiscalPeriod {
  end: string;
  fiscalYear: number;
  /** 4 for the full year, which also ends Q4. */
  quarter: number;
}

export type Statements = Omit<Financials, "symbol">;

const seriesKey = (end: string, quarters: number) => `${end}/${quarters}`;

// Only 10-Ks and 10-Qs. Proxy statements repeat figures later and rounded, which would
// otherwise win as the latest filing, and foreign filers' 20-Fs are out of scope.
const isPeriodicReport = (fact: Fact) => /^10-[KQ]/.test(fact.form);

/** How long a fact covers: 0 quarters for a balance, 1 to 4 for a period, undefined for anything else. */
function quartersSpanned(fact: Fact): number | undefined {
  if (!fact.start) return 0;
  const days = (Date.parse(fact.end) - Date.parse(fact.start)) / DAY_MS;
  const quarters = Math.round(days / DAYS_PER_QUARTER);
  const regular = Math.abs(days - quarters * DAYS_PER_QUARTER) <= LENGTH_TOLERANCE_DAYS;
  return quarters >= 1 && quarters <= 4 && regular ? quarters : undefined;
}

/** For each period, the first tag with a value, from its latest filing so that restatements apply. */
function readSeries(gaap: Gaap, { tags, unit }: LineSpec): Series {
  const units = unit === "perShare" ? "USD/shares" : unit === "shares" ? "shares" : "USD";
  const best = new Map<string, { tag: string; filed: string; value: number }>();
  for (const tag of tags) {
    for (const fact of gaap[tag]?.units[units] ?? []) {
      const quarters = quartersSpanned(fact);
      if (quarters === undefined || !isPeriodicReport(fact)) continue;
      const key = seriesKey(fact.end, quarters);
      const held = best.get(key);
      if (!held || (held.tag === tag && fact.filed >= held.filed)) {
        best.set(key, { tag, filed: fact.filed, value: fact.val });
      }
    }
  }
  return new Map([...best].map(([key, { value }]) => [key, value]));
}

/**
 * Every fiscal period the company reported on, oldest first. A filing's own period is
 * the latest one in it: earlier ones are comparison columns, which carry that filing's
 * fy and fp rather than their own.
 */
function fiscalCalendar(gaap: Gaap): FiscalPeriod[] {
  const ownPeriod = new Map<string, Fact>();
  for (const { tags } of [...INCOME, ...CASH_FLOW]) {
    for (const tag of tags) {
      for (const facts of Object.values(gaap[tag]?.units ?? {})) {
        for (const fact of facts) {
          const held = ownPeriod.get(fact.accn);
          if (fact.start && isPeriodicReport(fact) && (!held || fact.end > held.end)) ownPeriod.set(fact.accn, fact);
        }
      }
    }
  }

  const byEnd = new Map<string, FiscalPeriod>();
  for (const { end, fy, fp } of ownPeriod.values()) {
    const quarter = FISCAL_QUARTERS[fp ?? ""];
    if (quarter && fy) byEnd.set(end, { end, fiscalYear: fy, quarter });
  }
  return [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
}

/**
 * Each quarter's value, by end date. Uses the three-month figure where there is one.
 * Otherwise it's the year-to-date figure less the year's earlier quarters: that's all
 * a 10-Q gives for cash flow, and all there is for any Q4.
 */
function quarterValues(series: Series, calendar: FiscalPeriod[], additive: boolean) {
  const values = new Map<string, number | null>();
  let fiscalYear: number | undefined;
  let nextQuarter = 1;
  let yearSoFar: number | null = 0;

  for (const period of calendar) {
    if (period.fiscalYear !== fiscalYear) {
      fiscalYear = period.fiscalYear;
      nextQuarter = 1;
      yearSoFar = 0;
    }
    if (period.quarter !== nextQuarter) yearSoFar = null;
    nextQuarter = period.quarter + 1;

    const threeMonths = series.get(seriesKey(period.end, 1));
    const yearToDate = series.get(seriesKey(period.end, period.quarter));
    const derived: number | null =
      additive && yearSoFar !== null && yearToDate !== undefined ? yearToDate - yearSoFar : null;
    const value: number | null = threeMonths ?? derived;

    yearSoFar = yearSoFar === null || value === null ? null : yearSoFar + value;
    values.set(period.end, value);
  }
  return values;
}

/** One period's statements from a company's facts, or null if it has none on 10-Ks and 10-Qs. */
export function toFinancials(facts: CompanyFacts, period: FinancialPeriod): Statements | null {
  const gaap = facts.facts["us-gaap"];
  if (!gaap) return null;

  const calendar = fiscalCalendar(gaap);
  const annual = period === "annual";
  const hasQuarters = calendar.some(({ quarter }) => quarter < 4);
  const available = annual ? calendar.filter(({ quarter }) => quarter === 4) : hasQuarters ? calendar : [];
  if (available.length === 0) return null;

  const shown = available.slice(annual ? -ANNUAL_PERIODS : -QUARTERLY_PERIODS).reverse();

  // Per-share figures and share counts don't add up across quarters, so they're only ever as reported.
  const flowLine = (spec: LineSpec): StatementLine => {
    const series = readSeries(gaap, spec);
    const quarters = quarterValues(series, calendar, spec.unit === undefined);
    const values = shown.map(({ end }) =>
      annual ? (series.get(seriesKey(end, 4)) ?? null) : (quarters.get(end) ?? null),
    );
    return lineOf(spec, values);
  };
  const balanceLine = (spec: LineSpec): StatementLine => {
    const series = readSeries(gaap, spec);
    return lineOf(spec, shown.map(({ end }) => series.get(seriesKey(end, 0)) ?? null));
  };

  return {
    name: facts.entityName,
    period,
    periods: shown.map(toStatementPeriod(annual)),
    income: INCOME.map(flowLine),
    balance: BALANCE.map(balanceLine),
    cashFlow: CASH_FLOW.map(flowLine),
  };
}

function lineOf({ key, label, unit }: LineSpec, values: (number | null)[]): StatementLine {
  return { key, label, ...(unit && { unit }), values };
}

const toStatementPeriod =
  (annual: boolean) =>
  ({ end, fiscalYear, quarter }: FiscalPeriod): StatementPeriod => ({
    end,
    label: annual ? `FY${fiscalYear}` : `Q${quarter} FY${fiscalYear}`,
  });
