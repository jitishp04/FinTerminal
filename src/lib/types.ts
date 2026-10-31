// What the API routes return, whatever the source. Times are epoch seconds (UTC).

export const MAX_QUOTE_SYMBOLS = 50;

export interface Quote {
  symbol: string;
  name: string;
  /** "EQUITY", "ETF", "INDEX", "CURRENCY", "FUTURE", … */
  type: string;
  currency?: string;
  /** Display name, e.g. "NasdaqGS". */
  exchange?: string;
  price: number;
  change?: number;
  /** In percent: -0.76 means -0.76%. */
  changePercent?: number;
  previousClose?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  /** "REGULAR", "PRE", "POST", "CLOSED", … */
  marketState?: string;
  time?: number;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const CHART_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export const MOVER_TYPES = ["gainers", "losers", "actives"] as const;
export type MoverType = (typeof MOVER_TYPES)[number];

export const FINANCIAL_PERIODS = ["annual", "quarterly"] as const;
export type FinancialPeriod = (typeof FINANCIAL_PERIODS)[number];

export interface StatementPeriod {
  /** Date the period ended, e.g. "2025-09-27". */
  end: string;
  /** The company's own fiscal naming, e.g. "FY2025" or "Q3 FY2026", or "FY2025T" for a transition period. */
  label: string;
  /** Part of a transition period: the stub filed when a company moves its year-end. */
  transition?: boolean;
}

export interface StatementLine {
  key: string;
  label: string;
  /** Dollars unless set. */
  unit?: "perShare" | "shares";
  /** One per period, in the same order. Null where the company didn't report it. */
  values: (number | null)[];
}

export interface Financials {
  symbol: string;
  name: string;
  period: FinancialPeriod;
  /** Newest first. */
  periods: StatementPeriod[];
  income: StatementLine[];
  balance: StatementLine[];
  cashFlow: StatementLine[];
}

export interface Filing {
  form: string;
  /** Date filed, e.g. "2025-10-31". */
  filed: string;
  /** The date the form gives: a period's end, an event, an insider's trade, a proxy's meeting. */
  reportDate: string | null;
  url: string;
}

export interface Filings {
  symbol: string;
  name: string;
  /** It also files insider forms as a large holder of other companies' stock, so one here can be about them. */
  filesAsHolder: boolean;
  /** Newest first. */
  filings: Filing[];
}

export interface Chart {
  symbol: string;
  range: ChartRange;
  /** Bar size, e.g. "5m", "1d", "1wk". */
  interval: string;
  currency?: string;
  /** The exchange's IANA time zone, for axis labels. */
  timeZone: string;
  /** Where the range starts. Earlier bars are history, so 200-bar averages cover the whole range. */
  from: number;
  bars: Bar[];
}

export interface Profile {
  symbol: string;
  name: string;
  type: string;
  currency?: string;
  exchange?: string;
  description?: string;
  sector?: string;
  industry?: string;
  country?: string;
  website?: string;
  employees?: number;
  /** Funds: e.g. "Large Blend". */
  category?: string;
  marketCap?: number;
  /** Funds: assets under management. */
  totalAssets?: number;
  /** Funds, as a fraction: 0.000945 means 0.0945% a year. */
  expenseRatio?: number;
  peRatio?: number;
  forwardPE?: number;
  eps?: number;
  /** A fraction: 0.004 means 0.4%. */
  dividendYield?: number;
  beta?: number;
  week52High?: number;
  week52Low?: number;
  averageVolume?: number;
  sharesOutstanding?: number;
  /** Fractions of revenue, trailing twelve months. */
  grossMargin?: number;
  operatingMargin?: number;
  profitMargin?: number;
}
