import { describe, expect, it } from "vitest";
import { isSymbol } from "./commands";
import { WORLD_INDICES } from "./monitors";
import { MAX_QUOTE_SYMBOLS } from "./types";

describe("WORLD_INDICES", () => {
  const symbols = WORLD_INDICES.flatMap((group) => group.items.map((item) => item.symbol));

  it("groups by region", () => {
    expect(WORLD_INDICES.map((group) => group.title)).toEqual(["Americas", "EMEA", "Asia-Pacific"]);
  });

  it("lists each symbol once, in a form the quote route accepts", () => {
    expect(symbols.filter((symbol) => !isSymbol(symbol))).toEqual([]);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("fits in one quote request", () => {
    expect(symbols.length).toBeLessThanOrEqual(MAX_QUOTE_SYMBOLS);
  });
});
