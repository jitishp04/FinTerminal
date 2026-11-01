export interface FunctionDef {
  code: string;
  title: string;
  /** One line, shown in search results and HELP. */
  description: string;
  /** Plain words that find this function in search, e.g. "chart" → GP. */
  keywords: string[];
  group: "Security" | "Market" | "Macro" | "System";
  /** "required": typed as `<SYM> <CODE>`. "none": typed as `<CODE>`. */
  symbol: "required" | "none";
  /** Accepts one optional argument after the code, e.g. `ECO UNRATE`. */
  arg?: "optional";
  example: string;
}

export const FUNCTIONS: FunctionDef[] = [
  {
    code: "GP",
    title: "Price chart",
    description: "Price history with moving averages and volume",
    keywords: ["chart", "graph", "price", "quote", "history"],
    group: "Security",
    symbol: "required",
    example: "AAPL GP",
  },
  {
    code: "DES",
    title: "Company overview",
    description: "What the company does, plus key stats",
    keywords: ["description", "overview", "profile", "about", "company", "stats"],
    group: "Security",
    symbol: "required",
    example: "MSFT DES",
  },
  {
    code: "FA",
    title: "Financial statements",
    description: "Income statement, balance sheet and cash flow",
    keywords: ["financials", "fundamentals", "income statement", "balance sheet", "cash flow", "earnings", "revenue"],
    group: "Security",
    symbol: "required",
    example: "NVDA FA",
  },
  {
    code: "CF",
    title: "SEC filings",
    description: "Annual and quarterly reports and other filings",
    keywords: ["filings", "sec", "10-k", "10-q", "8-k", "reports"],
    group: "Security",
    symbol: "required",
    example: "TSLA CF",
  },
  {
    code: "INS",
    title: "Insider filings",
    description: "Forms 3, 4 and 5 filed by executives and directors",
    keywords: ["insiders", "insider trading", "form 4"],
    group: "Security",
    symbol: "required",
    example: "AAPL INS",
  },
  {
    code: "DCA",
    title: "DCA backtest",
    description: "How buying a fixed amount on a schedule would have done",
    keywords: ["dca", "dollar cost averaging", "backtest", "regular investing", "lump sum"],
    group: "Security",
    symbol: "required",
    example: "SPY DCA",
  },
  {
    code: "W",
    title: "Watchlist",
    description: "Your symbols with live prices",
    keywords: ["watchlist", "portfolio", "favorites", "my stocks"],
    group: "Market",
    symbol: "none",
    example: "W",
  },
  {
    code: "WEI",
    title: "World indices",
    description: "Major stock indices around the world",
    keywords: ["indices", "indexes", "markets", "world", "global", "s&p 500", "dow", "nasdaq"],
    group: "Market",
    symbol: "none",
    example: "WEI",
  },
  {
    code: "SECT",
    title: "Sector heatmap",
    description: "How the 11 US stock market sectors are doing",
    keywords: ["sectors", "heatmap", "industries"],
    group: "Market",
    symbol: "none",
    example: "SECT",
  },
  {
    code: "ROT",
    title: "Sector rotation",
    description: "Which sectors are beating the market, fading or turning",
    keywords: ["rotation", "relative strength", "momentum", "trend"],
    group: "Market",
    symbol: "none",
    example: "ROT",
  },
  {
    code: "MOST",
    title: "Top movers",
    description: "Biggest gainers, losers and most active stocks",
    keywords: ["movers", "gainers", "losers", "most active", "trending"],
    group: "Market",
    symbol: "none",
    example: "MOST",
  },
  {
    code: "FX",
    title: "Currencies",
    description: "Major exchange rates",
    keywords: ["currencies", "forex", "exchange rates", "dollar", "euro"],
    group: "Market",
    symbol: "none",
    example: "FX",
  },
  {
    code: "CMDTY",
    title: "Commodities",
    description: "Oil, gold, natural gas, grains and more",
    keywords: ["commodities", "oil", "gold", "silver", "gas", "futures"],
    group: "Market",
    symbol: "none",
    example: "CMDTY",
  },
  {
    code: "ECO",
    title: "Economy",
    description: "Key US economic indicators, or chart any FRED series",
    keywords: ["economy", "macro", "fred", "inflation", "cpi", "unemployment", "gdp", "interest rates"],
    group: "Macro",
    symbol: "none",
    arg: "optional",
    example: "ECO UNRATE",
  },
  {
    code: "CURV",
    title: "Yield curve",
    description: "US Treasury yields by maturity",
    keywords: ["yield curve", "yields", "treasuries", "bonds"],
    group: "Macro",
    symbol: "none",
    example: "CURV",
  },
  {
    code: "HELP",
    title: "All functions",
    description: "Everything you can open, with examples",
    keywords: ["help", "functions", "menu", "?"],
    group: "System",
    symbol: "none",
    example: "HELP",
  },
];

export const FUNCTION_BY_CODE = new Map(FUNCTIONS.map((f) => [f.code, f]));

export const GROUPS: FunctionDef["group"][] = ["Security", "Market", "Macro", "System"];
