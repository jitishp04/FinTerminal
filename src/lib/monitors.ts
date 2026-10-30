// The instruments behind each monitor panel. Names are ours: Yahoo's are uneven
// ("DAX                           P"), and a row keeps its name if a quote is missing.
export interface MonitorItem {
  symbol: string;
  name: string;
}

export interface MonitorGroup {
  title: string;
  items: MonitorItem[];
}

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
