import { describe, expect, it } from "vitest";
import { isSymbol } from "./commands";
import { COMMODITIES, CURRENCIES, MONITORS, WORLD_INDICES } from "./monitors";
import { MAX_QUOTE_SYMBOLS } from "./types";

const titles = (groups: typeof WORLD_INDICES) => groups.map((group) => group.title);

describe("monitor groups", () => {
  it("sorts each list as the issue asks", () => {
    expect(titles(WORLD_INDICES)).toEqual(["Americas", "EMEA", "Asia-Pacific"]);
    expect(titles(CURRENCIES)).toEqual(["Majors", "Crosses", "Emerging markets", "US dollar"]);
    expect(titles(COMMODITIES)).toEqual(["Energy", "Metals", "Agriculture"]);
  });
});

describe.each(Object.entries(MONITORS))("%s", (_code, groups) => {
  const symbols = groups.flatMap((group) => group.items.map((item) => item.symbol));

  it("lists each symbol once, in a form the quote route accepts", () => {
    expect(symbols.filter((symbol) => !isSymbol(symbol))).toEqual([]);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("fits in one quote request", () => {
    expect(symbols.length).toBeLessThanOrEqual(MAX_QUOTE_SYMBOLS);
  });
});
