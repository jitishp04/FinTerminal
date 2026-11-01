import { describe, expect, it } from "vitest";
import { isSymbol } from "./commands";
import { COMMODITIES, CRYPTO, CURRENCIES, MONITORS, SECTORS, WORLD_INDICES } from "./monitors";
import { MAX_QUOTE_SYMBOLS } from "./types";

const titles = (groups: typeof WORLD_INDICES) => groups.map((group) => group.title);

describe("monitor groups", () => {
  it("sorts each list as the issue asks", () => {
    expect(titles(WORLD_INDICES)).toEqual(["Americas", "EMEA", "Asia-Pacific"]);
    expect(titles(CURRENCIES)).toEqual(["Majors", "Crosses", "Emerging markets", "US dollar"]);
    expect(titles(COMMODITIES)).toEqual(["Energy", "Metals", "Agriculture"]);
    expect(titles(CRYPTO)).toEqual(["Bitcoin and Ether", "Other coins"]);
  });
});

describe("SECTORS", () => {
  it("lists the 11 sector ETFs once each, in a form the quote route accepts", () => {
    const symbols = SECTORS.map((sector) => sector.symbol);
    expect(new Set(symbols).size).toBe(11);
    expect(symbols.filter((symbol) => !isSymbol(symbol))).toEqual([]);
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
