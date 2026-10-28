export interface FunctionDef {
  code: string;
  title: string;
  group: "Security" | "Market" | "Macro" | "System";
  /** "required": typed as `<SYM> <CODE>`. "none": typed as `<CODE>`. */
  symbol: "required" | "none";
  /** Accepts one optional argument after the code, e.g. `ECO UNRATE`. */
  arg?: "optional";
  example: string;
}

export const FUNCTIONS: FunctionDef[] = [
  { code: "GP", title: "Price chart", group: "Security", symbol: "required", example: "AAPL GP" },
  { code: "DES", title: "Description and key stats", group: "Security", symbol: "required", example: "MSFT DES" },
  { code: "FA", title: "Financial statements", group: "Security", symbol: "required", example: "NVDA FA" },
  { code: "CF", title: "SEC filings", group: "Security", symbol: "required", example: "TSLA CF" },
  { code: "INS", title: "Insider filings", group: "Security", symbol: "required", example: "AAPL INS" },
  { code: "W", title: "Watchlist", group: "Market", symbol: "none", example: "W" },
  { code: "WEI", title: "World equity indices", group: "Market", symbol: "none", example: "WEI" },
  { code: "SECT", title: "Sector heatmap", group: "Market", symbol: "none", example: "SECT" },
  { code: "MOST", title: "Gainers, losers, most active", group: "Market", symbol: "none", example: "MOST" },
  { code: "FX", title: "Currency monitor", group: "Market", symbol: "none", example: "FX" },
  { code: "CMDTY", title: "Commodities", group: "Market", symbol: "none", example: "CMDTY" },
  { code: "ECO", title: "Macro dashboard, or chart a FRED series", group: "Macro", symbol: "none", arg: "optional", example: "ECO UNRATE" },
  { code: "CURV", title: "Treasury yield curve", group: "Macro", symbol: "none", example: "CURV" },
  { code: "HELP", title: "List all functions", group: "System", symbol: "none", example: "HELP" },
];

export const FUNCTION_BY_CODE = new Map(FUNCTIONS.map((f) => [f.code, f]));
