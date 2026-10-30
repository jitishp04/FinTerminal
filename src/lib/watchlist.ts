import { isSymbol } from "./commands";
import { createLocalStore } from "./localStore";
import { MAX_QUOTE_SYMBOLS } from "./types";

export const watchlistStore = createLocalStore("finterminal.watchlist.v1");

export const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "SPY", "^GSPC", "EURUSD=X", "GC=F"];

/** Parses a stored list. Anything malformed falls back to the default; a stored empty list stays empty. */
export function parseWatchlist(raw: string | null): string[] {
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return DEFAULT_WATCHLIST;
  }
  if (!Array.isArray(data)) return DEFAULT_WATCHLIST;
  const symbols = data.filter((s): s is string => typeof s === "string" && isSymbol(s));
  return [...new Set(symbols)].slice(0, MAX_QUOTE_SYMBOLS);
}

export type AddResult = { ok: true; symbols: string[] } | { ok: false; error: string };

export function addSymbol(symbols: string[], input: string): AddResult {
  const symbol = input.trim().toUpperCase();
  if (!isSymbol(symbol)) return { ok: false, error: `Invalid symbol: ${symbol}` };
  if (symbols.includes(symbol)) return { ok: false, error: `${symbol} is already on your list` };
  if (symbols.length >= MAX_QUOTE_SYMBOLS) {
    return { ok: false, error: `Your list is full at ${MAX_QUOTE_SYMBOLS} symbols. Remove one first.` };
  }
  return { ok: true, symbols: [...symbols, symbol] };
}

export const removeSymbol = (symbols: string[], symbol: string) => symbols.filter((s) => s !== symbol);
