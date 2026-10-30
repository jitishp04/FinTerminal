import { describe, expect, it } from "vitest";
import { MAX_QUOTE_SYMBOLS } from "./types";
import { addSymbol, DEFAULT_WATCHLIST, parseWatchlist, removeSymbol } from "./watchlist";

const full = Array.from({ length: MAX_QUOTE_SYMBOLS }, (_, i) => `S${i}`);

describe("parseWatchlist", () => {
  it("starts new users on the default list", () => {
    expect(parseWatchlist(null)).toEqual(DEFAULT_WATCHLIST);
  });

  it("keeps a list the user has emptied", () => {
    expect(parseWatchlist("[]")).toEqual([]);
  });

  it("falls back to the default when the stored value is malformed", () => {
    expect(parseWatchlist("{not json")).toEqual(DEFAULT_WATCHLIST);
    expect(parseWatchlist('{"symbols":["AAPL"]}')).toEqual(DEFAULT_WATCHLIST);
  });

  it("drops invalid and repeated entries", () => {
    expect(parseWatchlist('["AAPL", 7, "bad symbol!", "AAPL", "^GSPC"]')).toEqual(["AAPL", "^GSPC"]);
  });

  it("never loads more than /api/quote accepts", () => {
    expect(parseWatchlist(JSON.stringify([...full, "EXTRA"]))).toEqual(full);
  });
});

describe("addSymbol", () => {
  it("adds the symbol to the end, tidied up", () => {
    expect(addSymbol(["AAPL"], "  eurusd=x ")).toEqual({ ok: true, symbols: ["AAPL", "EURUSD=X"] });
  });

  it("rejects an invalid symbol", () => {
    expect(addSymbol(["AAPL"], "not a symbol")).toEqual({ ok: false, error: "Invalid symbol: NOT A SYMBOL" });
  });

  it("rejects a symbol already on the list", () => {
    expect(addSymbol(["AAPL"], "aapl")).toEqual({ ok: false, error: "AAPL is already on your list" });
  });

  it("rejects a symbol once the list is full", () => {
    const result = addSymbol(full, "TSLA");
    expect(result.ok).toBe(false);
  });
});

describe("removeSymbol", () => {
  it("removes only that symbol", () => {
    expect(removeSymbol(["AAPL", "MSFT"], "AAPL")).toEqual(["MSFT"]);
  });
});
