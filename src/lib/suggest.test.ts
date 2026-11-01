import { describe, expect, it } from "vitest";
import { formatCommand, parseCommand, type Command } from "./commands";
import { suggest } from "./suggest";

const command = (input: string): Command => {
  const result = parseCommand(input);
  if (!result.ok) throw new Error(result.error);
  return result.command;
};

/** Suggestions as command strings; `current` is the focused panel's command. */
const offered = (input: string, current?: string) =>
  suggest(input, current === undefined ? undefined : command(current)).map(formatCommand);

describe("suggest", () => {
  it("offers nothing for empty input", () => {
    expect(offered("   ")).toEqual([]);
  });

  it.each(["aapl gp", "W GP", "eco unrate", "WEI"])("puts the exact command first: %s", (input) => {
    expect(offered(input)[0]).toBe(input.toUpperCase());
  });

  it.each([
    ["movers", "MOST"],
    ["yield curve", "CURV"],
    ["yield cu", "CURV"],
    ["currencies", "FX"],
    ["?", "HELP"],
  ])("finds functions by plain words: %s → %s", (input, expected) => {
    expect(offered(input)[0]).toBe(expected);
  });

  it.each(["aapl chart", "chart aapl", "AAPL ch", "aapl price chart"])("pairs a ticker with a function: %s", (input) => {
    expect(offered(input)[0]).toBe("AAPL GP");
  });

  it("pairs ECO with a series id", () => {
    expect(offered("economy unrate")[0]).toBe("ECO UNRATE");
  });

  it("reuses the panel's ticker for a bare function", () => {
    expect(offered("des", "AAPL GP")[0]).toBe("AAPL DES");
    expect(offered("financials", "TSLA CF")[0]).toBe("TSLA FA");
  });

  it("falls back to the example ticker when the panel has none", () => {
    expect(offered("des", "WEI")[0]).toBe("MSFT DES");
    expect(offered("des")[0]).toBe("MSFT DES");
  });

  it("offers every security function for a lone ticker, keeping the panel's function first", () => {
    expect(offered("msft", "AAPL DES")).toEqual(["MSFT DES", "MSFT GP", "MSFT FA", "MSFT CF", "MSFT INS", "MSFT DCA", "MSFT DCF", "MSFT THS", "MSFT OMON", "MSFT N"]);
    expect(offered("msft", "N")[0]).toBe("MSFT N");
    expect(offered("msft", "WEI")[0]).toBe("MSFT GP");
  });

  it("offers N both ways: for the panel's symbol, and on its own", () => {
    // Then one row for a ticker called NEWS, as for any word that names a function.
    expect(offered("news", "AAPL DES").slice(0, 2)).toEqual(["AAPL N", "N"]);
    expect(offered("news")[0]).toBe("N");
    expect(offered("aapl news")).toContain("AAPL N");
    expect(offered("headlines tsla")).toContain("TSLA N");
  });

  it("lists functions before a ticker that shares the name", () => {
    expect(offered("gold")).toEqual(["CMDTY", "GOLD GP"]);
    expect(offered("w")).toEqual(["W", "WEI"]);
  });

  it("offers nothing when nothing matches", () => {
    expect(offered("zz zz zz")).toEqual([]);
  });

  it("caps the list", () => {
    expect(offered("s", undefined).length).toBeLessThanOrEqual(8);
    expect(suggest("c", undefined, 2)).toHaveLength(2);
  });
});
