// The instruments behind each monitor panel. Names are ours: Yahoo's are uneven
// ("DAX                           P"), and a row keeps its name if a quote is missing.
export interface MonitorItem {
  symbol: string;
  name: string;
  /** Only where `priceDecimals` gets it wrong. Yahoo's own hint isn't reliable: it gives copper and silver 2. */
  decimals?: number;
  /** What the price is quoted in, where that isn't obvious. Grains and coffee trade in cents. */
  unit?: string;
}

export interface MonitorGroup {
  title: string;
  items: MonitorItem[];
}

/** The SPDR sector ETFs, largest first, as `SECT` lays them out. */
export const SECTORS: MonitorItem[] = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLV", name: "Health Care" },
  { symbol: "XLY", name: "Discretionary" },
  { symbol: "XLP", name: "Staples" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLC", name: "Communication" },
];

export const WORLD_INDICES: MonitorGroup[] = [
  {
    title: "Americas",
    items: [
      { symbol: "^GSPC", name: "S&P 500" },
      { symbol: "^DJI", name: "Dow Jones" },
      { symbol: "^IXIC", name: "Nasdaq Composite" },
      { symbol: "^RUT", name: "Russell 2000" },
      { symbol: "^VIX", name: "VIX" },
      { symbol: "^GSPTSE", name: "S&P/TSX Composite" },
      { symbol: "^BVSP", name: "Bovespa" },
    ],
  },
  {
    title: "EMEA",
    items: [
      { symbol: "^FTSE", name: "FTSE 100" },
      { symbol: "^GDAXI", name: "DAX" },
      { symbol: "^FCHI", name: "CAC 40" },
      { symbol: "^STOXX50E", name: "Euro Stoxx 50" },
    ],
  },
  {
    title: "Asia-Pacific",
    items: [
      { symbol: "^N225", name: "Nikkei 225" },
      { symbol: "^HSI", name: "Hang Seng" },
      { symbol: "000001.SS", name: "Shanghai Composite" },
      { symbol: "^NSEI", name: "Nifty 50" },
      { symbol: "^AXJO", name: "ASX 200" },
      { symbol: "^KS11", name: "KOSPI" },
    ],
  },
];

export const CURRENCIES: MonitorGroup[] = [
  {
    title: "Majors",
    items: [
      { symbol: "EURUSD=X", name: "EUR/USD" },
      { symbol: "USDJPY=X", name: "USD/JPY" },
      { symbol: "GBPUSD=X", name: "GBP/USD" },
      { symbol: "USDCHF=X", name: "USD/CHF" },
      { symbol: "AUDUSD=X", name: "AUD/USD" },
      { symbol: "USDCAD=X", name: "USD/CAD" },
      { symbol: "NZDUSD=X", name: "NZD/USD" },
    ],
  },
  {
    title: "Crosses",
    items: [
      { symbol: "EURGBP=X", name: "EUR/GBP" },
      { symbol: "EURJPY=X", name: "EUR/JPY" },
    ],
  },
  {
    title: "Emerging markets",
    items: [
      { symbol: "USDCNH=X", name: "USD/CNH" },
      { symbol: "USDINR=X", name: "USD/INR" },
      { symbol: "USDMXN=X", name: "USD/MXN", decimals: 4 },
    ],
  },
  {
    title: "US dollar",
    items: [{ symbol: "DX-Y.NYB", name: "US Dollar Index" }],
  },
];

export const COMMODITIES: MonitorGroup[] = [
  {
    title: "Energy",
    items: [
      { symbol: "CL=F", name: "WTI crude", unit: "$/bbl" },
      { symbol: "BZ=F", name: "Brent crude", unit: "$/bbl" },
      { symbol: "NG=F", name: "Natural gas", unit: "$/MMBtu", decimals: 3 },
    ],
  },
  {
    title: "Metals",
    items: [
      { symbol: "GC=F", name: "Gold", unit: "$/oz" },
      { symbol: "SI=F", name: "Silver", unit: "$/oz", decimals: 3 },
      { symbol: "HG=F", name: "Copper", unit: "$/lb" },
      { symbol: "PL=F", name: "Platinum", unit: "$/oz" },
    ],
  },
  {
    title: "Agriculture",
    items: [
      { symbol: "ZC=F", name: "Corn", unit: "¢/bu" },
      { symbol: "ZW=F", name: "Wheat", unit: "¢/bu" },
      { symbol: "ZS=F", name: "Soybeans", unit: "¢/bu" },
      { symbol: "KC=F", name: "Coffee", unit: "¢/lb" },
    ],
  },
];

/** Coins against the US dollar, each one Coinbase streams under the same name Yahoo quotes it by. */
export const CRYPTO: MonitorGroup[] = [
  {
    title: "Bitcoin and Ether",
    items: [
      { symbol: "BTC-USD", name: "Bitcoin" },
      { symbol: "ETH-USD", name: "Ether" },
    ],
  },
  {
    title: "Other coins",
    items: [
      { symbol: "SOL-USD", name: "Solana" },
      { symbol: "XRP-USD", name: "XRP" },
      { symbol: "DOGE-USD", name: "Dogecoin", decimals: 5 },
      { symbol: "ADA-USD", name: "Cardano" },
      { symbol: "AVAX-USD", name: "Avalanche" },
      { symbol: "LINK-USD", name: "Chainlink" },
      { symbol: "LTC-USD", name: "Litecoin" },
      { symbol: "BCH-USD", name: "Bitcoin Cash" },
      { symbol: "DOT-USD", name: "Polkadot" },
      { symbol: "XLM-USD", name: "Stellar" },
      { symbol: "SHIB-USD", name: "Shiba Inu", decimals: 8 },
    ],
  },
];

/** The panels drawn from these lists, by function code. */
export const MONITORS: Record<string, MonitorGroup[]> = {
  WEI: WORLD_INDICES,
  FX: CURRENCIES,
  CMDTY: COMMODITIES,
  CRYPTO,
};
