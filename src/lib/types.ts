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

/** A US stock's or fund's latest trade, from Finnhub's stream. */
export interface Trade {
  symbol: string;
  price: number;
  /** Epoch seconds, to the millisecond. */
  time: number;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** The close adjusted for dividends paid since, so an ex-dividend drop doesn't read as a loss. Daily and weekly bars only. */
  adjClose?: number;
  volume: number;
}

export const CHART_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export const MACRO_RANGES = ["1Y", "5Y", "10Y", "Max"] as const;
export type MacroRange = (typeof MACRO_RANGES)[number];

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

export interface NewsItem {
  title: string;
  url: string;
  /** Epoch seconds. */
  time: number;
  /** "Yahoo Finance", "SeekingAlpha", "fool.com", … */
  source: string;
  summary?: string;
}

export interface News {
  /** Newest first, a story only once. */
  items: NewsItem[];
  /** Sources that failed or are off, and why. */
  notes: string[];
}

/** One common-stock transaction from a Form 4. */
export interface InsiderTrade {
  /** As filed, usually last name first. A joint filing's owners are joined with "and". */
  insider: string;
  /** "CEO, Director", "10% owner", … */
  role: string;
  date: string;
  /** The SEC's transaction code: P, S, A, M, F, G, … */
  code: string;
  /** Shares acquired, or else disposed of. */
  acquired: boolean;
  shares: number;
  /** Per share. Missing when the filing gives it only in a footnote. */
  price?: number;
  sharesAfter?: number;
  /** Held directly, rather than through a trust, family member or fund. */
  direct: boolean;
  filed: string;
  /** The filing on sec.gov. */
  url: string;
}

export interface InsiderTrades {
  symbol: string;
  name: string;
  /** Newest first. */
  trades: InsiderTrade[];
  /** How many Form 4 filings were read, and how many of those couldn't be. */
  filings: number;
  skipped: number;
  /** Filings about another company's stock, which a large holder files too, and which are left out. */
  aboutOthers: number;
  /** When the oldest of them was filed. */
  since?: string;
}

export interface Observation {
  /** As FRED dates it: a day, a week's last day, or the first day of a month, quarter or year. */
  date: string;
  value: number;
}

export interface MacroSeries {
  id: string;
  title: string;
  /** Short form, e.g. "%" or "Index 1982-1984=100". */
  units: string;
  /** e.g. "Monthly" or "Weekly, Ending Saturday". */
  frequency: string;
  /** FRED's code: "D", "W", "M", "Q", "A", … */
  frequencyShort: string;
  /** How many decimals FRED writes the values to. */
  decimals: number;
  /** Oldest first. A period with no reading has no entry. */
  observations: Observation[];
}

export interface MacroIndicator {
  id: string;
  label: string;
  /** Thousands are shown as "K". */
  unit: "%" | "K";
  decimals: number;
  /** Shows a plus sign: the value is a change. */
  signed?: boolean;
  latest: number;
  prior: number;
  /** What the latest value covers, e.g. "Sep 2026" or "Q3 2026". */
  period: string;
  /** The last two years, oldest first. */
  trend: number[];
}

export interface CurvePoint {
  /** "1M", "10Y", … */
  tenor: string;
  /** Yields in percent. */
  latest: number;
  monthAgo: number;
  yearAgo: number;
  /** It yields less than the tenor before it. */
  inverted: boolean;
}

export interface YieldCurve {
  /** The day each of the three curves is from. */
  dates: { latest: string; monthAgo: string; yearAgo: string };
  /** Shortest maturity first. */
  points: CurvePoint[];
}

export interface Chart {
  symbol: string;
  range: ChartRange | MacroRange;
  /** Bar size, e.g. "5m", "1d", "1wk". */
  interval: string;
  currency?: string;
  /** Overrides the decimals that `priceDecimals` picks. */
  decimals?: number;
  /** The exchange's IANA time zone, for axis labels. */
  timeZone: string;
  /** Where the range starts. Earlier bars are history, so 200-bar averages cover the whole range. */
  from: number;
  bars: Bar[];
}

/** A market's close for one week. */
export type WeekClose = Pick<Bar, "time" | "close">;

/** A symbol's whole history in weeks. A week's `time` is its Monday at 00:00 UTC. */
export interface Weekly {
  symbol: string;
  currency?: string;
  weeks: Bar[];
}

/** What THS draws: a symbol's weeks, and those of the market it's measured against. */
export interface Thesis extends Weekly {
  benchmark: { symbol: string; name: string; weeks: WeekClose[] };
}

/** One option contract, as Yahoo quotes it, 15 minutes delayed. */
export interface OptionContract {
  /** The OCC symbol, e.g. "AAPL261120C00275000". */
  contract: string;
  strike: number;
  bid?: number;
  ask?: number;
  last?: number;
  /** The last price's change on the day. */
  change?: number;
  volume?: number;
  openInterest?: number;
  /** Yahoo's, as a fraction a year: 0.32 means 32%. */
  impliedVolatility?: number;
  /** When it last traded, in epoch seconds. */
  lastTrade?: number;
}

/** One expiration's calls and puts on a stock, fund or index. */
export interface OptionChain {
  symbol: string;
  currency?: string;
  /** The underlying's last price, from the same answer. */
  price: number;
  /** Every expiration Yahoo lists, nearest first, e.g. "2026-11-20". */
  expirations: string[];
  /** The one these contracts expire on. */
  expiration: string;
  /** Lowest strike first. Calls and puts need not have the same strikes. */
  calls: OptionContract[];
  puts: OptionContract[];
}

/** A stock a screen found: its quote, and what the screen table shows besides. */
export interface ScreenRow extends Quote {
  marketCap?: number;
  /** Trailing. Missing for a company without earnings. */
  peRatio?: number;
  week52Low?: number;
  week52High?: number;
}

export interface Screen {
  id: string;
  /** Yahoo's account of what it looks for, e.g. "Stocks with earnings growth rates better than 25%…". */
  description: string;
  /** How many stocks match, of which `rows` are the first, in Yahoo's order. */
  total: number;
  rows: ScreenRow[];
}

/** What a DCF starts from, each with where it came from. Money is in US dollars, as the SEC has it. */
export interface DcfInputs {
  symbol: string;
  name: string;
  /** The price's currency. */
  currency?: string;
  price: number;
  /** Yahoo's. Missing for some companies. */
  beta?: number;
  /** The 10-year Treasury yield in %, FRED's DGS10. */
  riskFree: Observation;
  freeCashFlow: {
    value: number;
    operatingCashFlow: number;
    capitalExpenditures: number;
    /** "the 4 quarters to 2026-09-30", or "FY2026" when a quarter is missing. */
    period: string;
  };
  /** The latest balance sheet. A line the company didn't report is 0. */
  balance: { date: string; cash: number; shortTermInvestments: number; currentDebt: number; longTermDebt: number };
  /** Diluted, weighted over the period. */
  shares: { value: number; period: string };
  /** Annual, oldest first. */
  revenue: { period: string; value: number }[];
}

/** Why a DCF doesn't fit a symbol, instead of its inputs. */
export interface DcfUnfit {
  symbol: string;
  reason: string;
}

export interface DailyClose {
  /** The trading day, in the exchange's time zone, e.g. "2024-06-07". */
  date: string;
  /** Adjusted for splits, as all of Yahoo's prices are. */
  close: number;
  /** Also adjusted for dividends paid since. The same as `close` where there have been none. */
  adjClose: number;
}

export interface Dividend {
  /** The ex-dividend date: shares held at the close the day before get it. */
  date: string;
  /** Per share, adjusted for splits like the closes. */
  amount: number;
}

export interface History {
  symbol: string;
  /** "EQUITY", "ETF", "MUTUALFUND", "INDEX", "CURRENCY", "FUTURE", … */
  type: string;
  currency?: string;
  /** Oldest first, to the last full day: today's may still be trading, so it's left out. */
  days: DailyClose[];
  /** Oldest first, on the same days. */
  dividends: Dividend[];
}

export interface WeeklyClose {
  /** The Monday the week starts on, in the exchange's time zone, e.g. "2026-10-26". */
  week: string;
  /** The week's last close, adjusted for dividends. The latest week's may still be trading. */
  close: number;
}

export interface WeeklySeries {
  symbol: string;
  /** Oldest first. */
  weeks: WeeklyClose[];
}

export interface Rotation {
  /** SPY, which the sectors are measured against. */
  benchmark: WeeklySeries;
  /** The sectors Yahoo answered for, in `SECTORS` order. */
  sectors: WeeklySeries[];
  /** The sectors it didn't answer for. */
  missing: string[];
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
