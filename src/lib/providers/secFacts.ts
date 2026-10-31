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

// About three years' filings: enough to outvote stale cover pages, and recent enough to
// follow a company that changed how it numbers its years, as TJX did in 2022.
const NUMBERING_VOTES = 15;
// A 52-week year can end a few days into January, and it's still the year before.
const YEAR_END_GRACE_DAYS = 7;

/** What a filing reports about the shares behind a period's per-share figures. A combined tag serves as either kind. */
const SHARE_BASIS = {
  basicShares: {
    tags: ["WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
    units: "shares",
  },
  dilutedShares: {
    tags: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
    units: "shares",
  },
  basicEps: { tags: ["EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"], units: "USD/shares" },
  dilutedEps: { tags: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], units: "USD/shares" },
  netIncome: { tags: ["NetIncomeLoss", "ProfitLoss"], units: "USD" },
  commonIncome: { tags: ["NetIncomeLossAvailableToCommonStockholdersBasic"], units: "USD" },
};

/** Each kind of count, and the EPS that goes with it. */
const COUNT_KINDS = [
  { count: "basicShares", eps: "basicEps" },
  { count: "dilutedShares", eps: "dilutedEps" },
] as const;

/** Share counts and EPS are rounded, so restated figures land near a split's ratio, not on it. */
const SPLIT_TOLERANCE = 0.02;
// A split multiplies every count alike, so one with income restated has to land this close. A merger only lands near.
const EXACT_SPLIT_TOLERANCE = 0.0025;
// Accounting changes can restate income beside a split, by 1.49 times at ICE. A merger's new history moves it further.
const LARGEST_INCOME_RESTATEMENT = 2;
// Stock dividends of a few percent stay as filed: they look too much like an accounting change.
const SMALLEST_SPLIT = 1.15;
// Filings sometimes tag a share count in thousands or millions by mistake, and that's a factor of 1,000 or more.
const LARGEST_SPLIT = 500;
const LARGEST_SPLIT_DENOMINATOR = 5;
const EPS_ROUNDING = 0.005;
// Below this, that rounding moves EPS by more than the tolerance.
const SMALLEST_TELLING_EPS = 0.25;
// EPS can be restated by less than this for other reasons, while income stays the same.
const SMALLEST_SPLIT_FROM_EPS_ALONE = 2;

/** A count in the wrong scale is off by a power of this: thousands, millions, or three zeros too many. */
const SCALE_STEP = 1000;
// Preferred dividends and rounding to the cent keep a right count this far from income over EPS.
const SCALE_TOLERANCE = 2;

type Gaap = NonNullable<CompanyFacts["facts"]["us-gaap"]>;
/** A line's reported values by `end/quarters`, where 0 quarters is a point in time. */
type Series = Map<string, number>;

interface FiscalPeriod {
  end: string;
  fiscalYear: number;
  /** 4 for the full year, which also ends Q4. */
  quarter: number;
}

type ShareBasis = Partial<Record<keyof typeof SHARE_BASIS, number>> & {
  accn: string;
  end: string;
  quarters: number;
  filed: string;
};

type CountKind = (typeof COUNT_KINDS)[number];

/** A filing's count for a period, and the scale income over EPS puts it in. */
interface ScaledCount {
  key: string;
  end: string;
  count: number;
  scale: number;
}

/** Two filings of a period, and how far its share count moved between them by each measure, as new over old. */
interface Restatement {
  older: ShareBasis;
  newer: ShareBasis;
  ratios: number[];
}

/** `factor` new shares for each old one, from the first filing on the new basis. */
interface StockSplit {
  filed: string;
  factor: number;
}

/** A filing's count for the latest period it reports. */
interface OwnCount {
  filed: string;
  count: number;
}

export type Statements = Omit<Financials, "symbol">;

const seriesKey = (end: string, quarters: number) => `${end}/${quarters}`;

// Only 10-Ks and 10-Qs. Proxy statements repeat figures later and rounded, which would
// otherwise win as the latest filing, and foreign filers' 20-Fs are out of scope.
const isPeriodicReport = (fact: Fact) => /^10-[KQ]/.test(fact.form);

// Not a 10-K/A, which can repeat a year with the wrong dates, as RBC Bearings' does.
const isFullYearReport = (fact: Fact) => fact.form === "10-K";
// A transition report closes a year too, but it's the stub left by moving the year-end.
const isYearEndReport = (fact: Fact) => isFullYearReport(fact) || fact.form === "10-KT";

/** How long a fact covers: 0 quarters for a balance, 1 to 4 for a period, undefined for anything else. */
function quartersSpanned(fact: Fact): number | undefined {
  if (!fact.start) return 0;
  const days = (Date.parse(fact.end) - Date.parse(fact.start)) / DAY_MS;
  const quarters = Math.round(days / DAYS_PER_QUARTER);
  const regular = Math.abs(days - quarters * DAYS_PER_QUARTER) <= LENGTH_TOLERANCE_DAYS;
  return quarters >= 1 && quarters <= 4 && regular ? quarters : undefined;
}

const nearSplit = (ratio: number, factor: number) => Math.abs(ratio / factor - 1) <= SPLIT_TOLERANCE;

/** The ratio a split would give for a change in shares, like 3/2 or 1/8, or undefined if it isn't one. */
function splitFactor(ratio: number): number | undefined {
  const size = Math.max(ratio, 1 / ratio);
  if (size < SMALLEST_SPLIT || size > LARGEST_SPLIT) return undefined;
  for (let denominator = 1; denominator <= LARGEST_SPLIT_DENOMINATOR; denominator++) {
    const simple = Math.round(size * denominator) / denominator;
    if (nearSplit(size, simple)) return ratio > 1 ? simple : 1 / simple;
  }
  return undefined;
}

/** Each period's filings, oldest first, with what each reports about its shares. */
function filedShareBases(gaap: Gaap): ShareBasis[][] {
  const periods = new Map<string, Map<string, ShareBasis>>();
  for (const [field, { tags, units }] of Object.entries(SHARE_BASIS)) {
    for (const tag of tags) {
      for (const fact of gaap[tag]?.units[units] ?? []) {
        const quarters = quartersSpanned(fact);
        if (!quarters || !isPeriodicReport(fact)) continue;
        const key = seriesKey(fact.end, quarters);
        const filings = periods.get(key) ?? new Map<string, ShareBasis>();
        const basis = filings.get(fact.accn) ?? { accn: fact.accn, end: fact.end, quarters, filed: fact.filed };
        basis[field as keyof typeof SHARE_BASIS] ??= fact.val;
        periods.set(key, filings.set(fact.accn, basis));
      }
    }
  }
  return [...periods.values()].map((filings) =>
    [...filings.values()].sort((a, b) => a.filed.localeCompare(b.filed)),
  );
}

/** The power of 1,000 that brings a count nearest to `other`: 1 if they're in the same scale. */
const scaleBetween = (count: number, other: number) =>
  SCALE_STEP ** Math.round(Math.log(other / count) / Math.log(SCALE_STEP));

/** The scale that makes a count match income over EPS, or undefined if none clearly does. */
function scaleFromIncome(count: number, eps: number | undefined, netIncome: number | undefined) {
  if (!eps || !netIncome) return undefined;
  const implied = Math.abs(netIncome / eps);
  const scale = scaleBetween(count, implied);
  const fit = (count * scale) / implied;
  return fit >= 1 / SCALE_TOLERANCE && fit <= SCALE_TOLERANCE ? scale : undefined;
}

const countKey = (accn: string, end: string, quarters: number) => `${accn}/${seriesKey(end, quarters)}`;

/** Every count of a kind in a company's filings that income over EPS can place. */
function scaledCounts(gaap: Gaap, { count, eps }: CountKind): ScaledCount[] {
  return filedShareBases(gaap)
    .flat()
    .flatMap((basis) => {
      const { accn, end, quarters, netIncome, commonIncome } = basis;
      const shares = basis[count];
      const scale = shares ? scaleFromIncome(shares, basis[eps], netIncome ?? commonIncome) : undefined;
      return shares && scale ? [{ key: countKey(accn, end, quarters), end, count: shares, scale }] : [];
    });
}

/** The factor that puts each of a kind's counts right, by filing and period. */
function wrongScales(gaap: Gaap, kind: CountKind) {
  const counts = scaledCounts(gaap, kind);
  const matching = counts.filter(({ scale }) => scale === 1);
  const wrongScale = new Map<string, number>();
  if (matching.length === 0) return wrongScale;

  for (const { key, end, count, scale } of counts) {
    if (scale === 1) continue;
    const apart = (other: ScaledCount) => Math.abs(Date.parse(other.end) - Date.parse(end));
    const nearest = matching.reduce((best, other) => (apart(other) < apart(best) ? other : best));
    if (scaleBetween(count, nearest.count) === scale) wrongScale.set(key, scale);
  }
  return wrongScale;
}

/**
 * A company's facts with its counts in whole shares. Filings sometimes tag a count
 * in thousands or millions, or with three zeros too many. Income over EPS shows that
 * something's off, but not what: Halliburton's counts are right and its EPS is tagged in
 * millions. So the count that matches income nearest in time has to show the same scale,
 * and any count where they differ stays as filed. It's nearest in time as a company's
 * shares can change a lot over the years, and a filing's own columns can be in two scales.
 * Basic and diluted counts are judged apart, as one can be in scale beside the other.
 */
function inWholeShares(gaap: Gaap): Gaap {
  const corrected = { ...gaap };
  for (const kind of COUNT_KINDS) {
    const wrongScale = wrongScales(gaap, kind);
    if (wrongScale.size === 0) continue;

    const inScale = (fact: Fact) => {
      const scale = wrongScale.get(countKey(fact.accn, fact.end, quartersSpanned(fact) ?? 0));
      return scale ? { ...fact, val: Math.round(fact.val * scale) } : fact;
    };
    for (const tag of SHARE_BASIS[kind.count].tags) {
      const shares = gaap[tag]?.units.shares;
      if (shares) corrected[tag] = { units: { ...gaap[tag].units, shares: shares.map(inScale) } };
    }
  }
  return corrected;
}

// Basic first. Only a split changes a past period's basic count, while an accounting
// change can move diluted shares.
const reportedCounts = ({ basicShares, dilutedShares }: ShareBasis) => [basicShares, dilutedShares];

/** Shares implied by income and EPS, where EPS is large enough for that to mean anything. */
const countsFromEps = ({ basicEps, dilutedEps, netIncome }: ShareBasis) =>
  [basicEps, dilutedEps].map((eps) =>
    netIncome && eps && Math.abs(eps) >= SMALLEST_TELLING_EPS ? Math.abs(netIncome / eps) : undefined,
  );

const reportsShares = (basis: ShareBasis) => reportedCounts(basis).some(Boolean);

/** How far a period's share count moved between two filings, best evidence first. */
function shareRatios(older: ShareBasis, newer: ShareBasis) {
  const measure = reportsShares(newer) ? reportedCounts : countsFromEps;
  const before = measure(older);
  return measure(newer).flatMap((count, i) => {
    const old = before[i];
    return count && old ? [count / old] : [];
  });
}

/**
 * Whether EPS moved as a change in shares says it should, allowing for rounding to the
 * cent and for income restated alongside, or undefined if the filings don't both have it.
 * Even a small EPS can rule a split out, if not show one.
 */
function epsAgrees(older: ShareBasis, newer: ShareBasis, shares: number): boolean | undefined {
  const income = older.netIncome && newer.netIncome ? newer.netIncome / older.netIncome : 1;
  const verdicts = (["basicEps", "dilutedEps"] as const).flatMap((field) => {
    const [before, after] = [older[field], newer[field]];
    if (!before || !after) return [];
    const expected = before * income;
    const rounding = EPS_ROUNDING * (Math.abs(shares) + Math.abs(income));
    return [Math.abs(after * shares - expected) <= rounding + SPLIT_TOLERANCE * Math.abs(expected)];
  });
  return verdicts.length > 0 ? verdicts.includes(true) : undefined;
}

/** Without share counts, a split has to be the one thing that changed, by too much to be anything else. */
function epsAloneShowsSplit({ netIncome: before = 0 }: ShareBasis, { netIncome: after = 0 }: ShareBasis, factor: number) {
  return nearSplit(after / before, 1) && Math.max(factor, 1 / factor) >= SMALLEST_SPLIT_FROM_EPS_ALONE;
}

/** Each pair of a period's filings that disagree on its share count, by the later filing, in the order they were filed. */
function restatements(gaap: Gaap): Restatement[][] {
  const found = new Map<string, Restatement[]>();
  for (const filings of filedShareBases(gaap)) {
    // Quarterly tables in 10-Ks have EPS but no share counts, and can repeat EPS as first
    // filed, so they're only held against each other.
    for (const comparable of [filings.filter(reportsShares), filings.filter((basis) => !reportsShares(basis))]) {
      for (let i = 1; i < comparable.length; i++) {
        const [older, newer] = [comparable[i - 1], comparable[i]];
        const ratios = shareRatios(older, newer);
        if (ratios.length > 0 && !nearSplit(ratios[0], 1)) {
          found.set(newer.filed, [...(found.get(newer.filed) ?? []), { older, newer, ratios }]);
        }
      }
    }
  }
  return [...found.keys()].sort().map((filed) => found.get(filed) ?? []);
}

/** New shares for each old one, from the splits first reported after `date` and up to `until`. */
const sharesPerShare = (splits: StockSplit[], date: string, until = "9999-12-31") =>
  splits.reduce((shares, { filed, factor }) => (filed > date && filed <= until ? shares * factor : shares), 1);

/** Whether income moved too far between two filings for both to be one company's history. */
function incomeReplaced({ netIncome: before }: ShareBasis, { netIncome: after }: ShareBasis) {
  if (!before || !after) return false;
  const income = after / before;
  return income < 1 / LARGEST_INCOME_RESTATEMENT || income > LARGEST_INCOME_RESTATEMENT;
}

/** Whether two filings disagree on income. Nothing against something counts, as a new SPAC's first quarter can be zero. */
const incomeRestated = ({ netIncome: before }: ShareBasis, { netIncome: after }: ShareBasis) =>
  before !== undefined && after !== undefined && Math.abs(after - before) > SPLIT_TOLERANCE * Math.abs(before);

function landsOnSplit(ratio: number) {
  const factor = splitFactor(ratio);
  return factor !== undefined && Math.abs(ratio / factor - 1) <= EXACT_SPLIT_TOLERANCE;
}

/**
 * Whether a filing put another company's history in place of this one's, as a reverse
 * merger or a SPAC's merger does. That restates share counts, often by a ratio near a
 * split's, and EPS follows them, so what gives it away is income moving too. A split can
 * come with restated income, as at ICE, or a different tag for it, as at Tenet, so a period
 * that lands on a split with income in reach clears the filing, whatever its others do.
 */
function replacesHistory(filing: Restatement[]) {
  const clears = ({ older, newer, ratios }: Restatement) => landsOnSplit(ratios[0]) && !incomeReplaced(older, newer);
  return filing.some(({ older, newer }) => incomeRestated(older, newer)) && !filing.some(clears);
}

/** Each filing's count for its latest and shortest period, as a year to date lags. Oldest filing first. */
function ownCounts(gaap: Gaap): OwnCount[] {
  const own = new Map<string, ShareBasis>();
  for (const basis of filedShareBases(gaap).flat()) {
    const held = own.get(basis.accn);
    const later = !held || basis.end > held.end || (basis.end === held.end && basis.quarters < held.quarters);
    if (reportsShares(basis) && later) own.set(basis.accn, basis);
  }
  return [...own.values()]
    .map((basis) => ({ filed: basis.filed, count: reportedCounts(basis).find(Boolean) ?? 0 }))
    .sort((a, b) => a.filed.localeCompare(b.filed));
}

/**
 * The first filing on a split's new basis: the one whose count stepped by the split from
 * the filing before, once splits already known come out. That can be long before anything
 * can be compared, as at Aebi Schmidt. Undefined if no step is nearer to the split than to
 * no change.
 */
function firstOnNewBasis(counts: OwnCount[], older: ShareBasis, newer: ShareBasis, factor: number, splits: StockSplit[]) {
  let first: string | undefined;
  let nearest = Math.abs(Math.log(factor)) / 2;
  for (let i = 1; i < counts.length; i++) {
    const [before, after] = [counts[i - 1], counts[i]];
    if (after.filed <= older.filed || after.filed > newer.filed) continue;
    const step = after.count / before.count / sharesPerShare(splits, before.filed, after.filed);
    const distance = Math.abs(Math.log(step / factor));
    if (distance < nearest) [first, nearest] = [after.filed, distance];
  }
  return first;
}

/**
 * A company's splits, from its own restatements. Later filings repeat a past period
 * on the new basis, which shows a split's size and when it reached the filings. A jump
 * from one period to the next shows neither, as a merger makes one too. The evidence is
 * a share count moved by a split-like ratio, with a second measure agreeing, as a single
 * number can be a tagging mistake. EPS is that measure where it's tagged, as basic and
 * diluted counts come from one table and share its mistakes. Splits already known from
 * earlier filings come out first, as one restatement can span two of them.
 *
 * Once a filing replaces a company's history, nothing filed before it says anything about
 * what's filed after, however close later figures happen to come.
 */
function stockSplits(gaap: Gaap): StockSplit[] {
  const counts = ownCounts(gaap);
  const splits: StockSplit[] = [];
  let replaced = "";
  for (const restated of restatements(gaap)) {
    const comparable = restated.filter(({ older }) => older.filed >= replaced);
    if (replacesHistory(comparable)) {
      replaced = restated[0].newer.filed;
      continue;
    }
    for (const { older, newer, ratios } of comparable) {
      const known = sharesPerShare(splits, older.filed, newer.filed);
      const factor = splitFactor(ratios[0] / known);
      if (!factor) continue;
      const measuresAgree = ratios.length > 1 && nearSplit(ratios[1] / known, factor);
      const confirmed = reportsShares(newer)
        ? (epsAgrees(older, newer, factor * known) ?? measuresAgree)
        : measuresAgree && epsAloneShowsSplit(older, newer, factor);
      if (!confirmed) continue;
      const first = firstOnNewBasis(counts, older, newer, factor, splits);
      // A share issue can hide a split's step, as at Service Properties, but then its ratio has to be
      // exact: Enliven's 2.21 is one bad tag. EPS is rounded, so a table with no counts can't be.
      if (first || !reportsShares(newer) || landsOnSplit(ratios[0] / known)) {
        splits.push({ filed: first ?? newer.filed, factor });
      }
    }
  }
  return splits;
}

/** A value on the basis of its filing, moved to the basis of the latest one. Dollar amounts have no basis. */
function onLatestBasis(value: number, unit: LineSpec["unit"], filed: string, splits: StockSplit[]) {
  if (unit === "shares") return value * sharesPerShare(splits, filed);
  if (unit === "perShare") return value / sharesPerShare(splits, filed);
  return value;
}

/** For each period, the first tag with a value, from its latest filing so that restatements apply. */
function readSeries(gaap: Gaap, { tags, unit }: LineSpec, splits: StockSplit[]): Series {
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
  return new Map([...best].map(([key, { filed, value }]) => [key, onLatestBasis(value, unit, filed, splits)]));
}

/**
 * The fact for each filing's own period, oldest first. That's the latest one in it:
 * earlier ones are comparison columns, and a period ending after the filing is a forecast.
 */
function ownPeriods(gaap: Gaap): Fact[] {
  const ownPeriod = new Map<string, Fact>();
  for (const { tags } of [...INCOME, ...CASH_FLOW]) {
    for (const tag of tags) {
      for (const facts of Object.values(gaap[tag]?.units ?? {})) {
        for (const fact of facts) {
          const held = ownPeriod.get(fact.accn);
          const reported = fact.start && isPeriodicReport(fact) && fact.end <= fact.filed;
          if (reported && (!held || fact.end > held.end)) ownPeriod.set(fact.accn, fact);
        }
      }
    }
  }
  return [...ownPeriod.values()].sort((a, b) => a.end.localeCompare(b.end));
}

/** The most common value, or the earliest of them on a tie: a stale tag comes after the one it copied. */
function mostCommon(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const highest = Math.max(...counts.values());
  return values.find((value) => counts.get(value) === highest);
}

const quartersBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS / DAYS_PER_QUARTER);

const closingYear = (end: string) => new Date(Date.parse(end) - YEAR_END_GRACE_DAYS * DAY_MS).getUTCFullYear();

/**
 * A filing's quarter, and its year as the calendar year it closes in. A quarter counts
 * back from the 10-K closing its year, which holds if the year-end moves. Without one
 * whose year the filing's period fits in, the year is still open or its 10-K is missing,
 * so it counts on from the last year-end.
 */
function placeByDate(filing: Fact, yearEnds: string[], fullYearEnds: string[]) {
  if (isYearEndReport(filing)) return { year: closingYear(filing.end), quarter: 4 };

  const closing = fullYearEnds.find((end) => end >= filing.end);
  if (closing && quartersBetween(filing.start ?? filing.end, closing) <= 4) {
    return { year: closingYear(closing), quarter: 4 - quartersBetween(filing.end, closing) };
  }

  const yearEnd = yearEnds.findLast((end) => end < filing.end) ?? yearEnds[0];
  const quarters = quartersBetween(yearEnd, filing.end) || 1;
  const yearsOn = Math.ceil(quarters / 4);
  return { year: closingYear(yearEnd) + yearsOn, quarter: quarters - 4 * (yearsOn - 1) };
}

/**
 * Every filing's period by its dates. The fy tags only say how far a company's numbering
 * sits from the calendar: Walmart's year ending January 2026 is FY2026, but Target's is
 * FY2025. A 10-K counts double, as some companies' 10-Qs give the calendar year instead.
 */
function periodsByDate(filings: Fact[]): FiscalPeriod[] {
  const endsOf = (reports: Fact[]) => reports.map(({ end }) => end);
  const yearEnds = endsOf(filings.filter(isYearEndReport));
  const fullYearEnds = endsOf(filings.filter(isFullYearReport));
  const placed = filings.map((filing) => ({ ...filing, ...placeByDate(filing, yearEnds, fullYearEnds) }));

  const votes = placed.flatMap((filing) => {
    if (!filing.fy) return [];
    const offset = filing.fy - filing.year;
    return isYearEndReport(filing) ? [offset, offset] : [offset];
  });
  const offset = mostCommon(votes.slice(-NUMBERING_VOTES)) ?? 0;
  return placed.map(({ end, year, quarter }) => ({ end, fiscalYear: year + offset, quarter }));
}

const periodsByTag = (filings: Fact[]): FiscalPeriod[] =>
  filings.flatMap(({ end, fy, fp }) => {
    const quarter = FISCAL_QUARTERS[fp ?? ""];
    return quarter && fy ? [{ end, fiscalYear: fy, quarter }] : [];
  });

/**
 * Every fiscal period the company reported on, oldest first. A filing's fy and fp come
 * from its cover page, where they can be left over from an earlier filing: Honeywell's
 * 10-K for 2021 says 2020, and its 10-Q for that year's third quarter says Q2. So dates
 * place a period, counted from the 10-Ks. A company with no 10-K yet only has the tags.
 */
function fiscalCalendar(gaap: Gaap): FiscalPeriod[] {
  const filings = ownPeriods(gaap);
  const periods = filings.some(isYearEndReport) ? periodsByDate(filings) : periodsByTag(filings);
  return [...new Map(periods.map((period) => [period.end, period])).values()];
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
  const filed = facts.facts["us-gaap"];
  if (!filed) return null;

  const gaap = inWholeShares(filed);
  const calendar = fiscalCalendar(gaap);
  const annual = period === "annual";
  const hasQuarters = calendar.some(({ quarter }) => quarter < 4);
  const available = annual ? calendar.filter(({ quarter }) => quarter === 4) : hasQuarters ? calendar : [];
  if (available.length === 0) return null;

  const shown = available.slice(annual ? -ANNUAL_PERIODS : -QUARTERLY_PERIODS).reverse();
  const splits = stockSplits(gaap);

  // Per-share figures and share counts don't add up across quarters, so they're never worked out from totals.
  const flowLine = (spec: LineSpec): StatementLine => {
    const series = readSeries(gaap, spec, splits);
    const quarters = quarterValues(series, calendar, spec.unit === undefined);
    const values = shown.map(({ end }) =>
      annual ? (series.get(seriesKey(end, 4)) ?? null) : (quarters.get(end) ?? null),
    );
    return lineOf(spec, values);
  };
  const balanceLine = (spec: LineSpec): StatementLine => {
    const series = readSeries(gaap, spec, splits);
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
