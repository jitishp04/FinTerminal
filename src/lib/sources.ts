export const SOURCES = {
  yahoo: "Yahoo Finance",
  sec: "SEC EDGAR",
  fred: "FRED",
  finnhub: "Finnhub",
  coinbase: "Coinbase",
} as const;

export type SourceId = keyof typeof SOURCES;

export interface SourceHealth {
  id: SourceId;
  name: string;
  /** "idle": nothing has asked it since the server started. "off": it needs a setting in .env.local. */
  state: "idle" | "ok" | "down" | "off";
  /** When it last answered, in epoch ms. */
  lastOk?: number;
}
