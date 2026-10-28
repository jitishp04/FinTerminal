// What the API routes return, whatever the source. Times are epoch seconds (UTC).

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
}
