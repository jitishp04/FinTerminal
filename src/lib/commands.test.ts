import { describe, expect, it } from "vitest";
import { commandTitle, formatCommand, parseCommand, tickerCommand } from "./commands";

function ok(input: string) {
  const result = parseCommand(input);
  if (!result.ok) throw new Error(`expected "${input}" to parse, got: ${result.error}`);
  return result.command;
}

function error(input: string) {
  const result = parseCommand(input);
  if (result.ok) throw new Error(`expected "${input}" to fail, got: ${JSON.stringify(result.command)}`);
  return result.error;
}

describe("parseCommand", () => {
  it("parses symbol + function, case-insensitive", () => {
    expect(ok("aapl gp")).toEqual({ fn: "GP", symbol: "AAPL", args: [] });
    expect(ok("  MSFT   DES ")).toEqual({ fn: "DES", symbol: "MSFT", args: [] });
  });

  it("parses function-only commands", () => {
    expect(ok("wei")).toEqual({ fn: "WEI", args: [] });
    expect(ok("HELP")).toEqual({ fn: "HELP", args: [] });
  });

  it("parses function + argument", () => {
    expect(ok("eco unrate")).toEqual({ fn: "ECO", args: ["UNRATE"] });
    expect(ok("ECO A191RL1Q225SBEA")).toEqual({ fn: "ECO", args: ["A191RL1Q225SBEA"] });
    expect(ok("ECO")).toEqual({ fn: "ECO", args: [] });
  });

  it.each(["^GSPC", "EURUSD=X", "BRK-B", "GC=F", "000001.SS", "BRK.B"])("accepts symbol %s", (symbol) => {
    expect(ok(`${symbol} GP`)).toEqual({ fn: "GP", symbol, args: [] });
  });

  it("treats a ticker that matches a function code as a symbol when followed by a security function", () => {
    expect(ok("W GP")).toEqual({ fn: "GP", symbol: "W", args: [] });
    expect(ok("W")).toEqual({ fn: "W", args: [] });
  });

  it("takes an optional symbol for N: market news on its own, a symbol's news with one", () => {
    expect(ok("n")).toEqual({ fn: "N", args: [] });
    expect(ok("aapl n")).toEqual({ fn: "N", symbol: "AAPL", args: [] });
    expect(ok("BRK-B N")).toEqual({ fn: "N", symbol: "BRK-B", args: [] });
    // A ticker called N, charted.
    expect(ok("N GP")).toEqual({ fn: "GP", symbol: "N", args: [] });
    expect(error("N AAPL")).toMatch(/takes no arguments/);
  });

  it("rejects empty input", () => {
    expect(error("")).toMatch(/type a command/i);
    expect(error("   ")).toMatch(/type a command/i);
  });

  it("rejects unknown functions", () => {
    expect(error("XYZ")).toMatch(/unknown function: XYZ/i);
    expect(error("AAPL FOO")).toMatch(/unknown function: FOO/i);
  });

  it("rejects a security function without a symbol", () => {
    expect(error("GP")).toMatch(/GP needs a symbol/);
  });

  it("rejects a symbol on a function that takes none", () => {
    expect(error("AAPL WEI")).toMatch(/WEI doesn't take a symbol/);
  });

  it("rejects extra arguments", () => {
    expect(error("WEI EXTRA")).toMatch(/WEI takes no arguments/);
    expect(error("AAPL GP 1Y")).toMatch(/GP takes no arguments/);
    expect(error("ECO UNRATE CPI")).toMatch(/ECO takes one argument/);
  });

  it("rejects malformed symbols and arguments", () => {
    expect(error("AAPL$ GP")).toMatch(/invalid symbol/i);
    expect(error("ECO UN-RATE")).toMatch(/invalid argument/i);
  });
});

describe("formatCommand", () => {
  it.each(["AAPL GP", "WEI", "ECO UNRATE", "W GP", "EURUSD=X GP"])("round-trips %s", (input) => {
    expect(formatCommand(ok(input))).toBe(input);
  });
});

describe("commandTitle", () => {
  it.each([
    ["AAPL GP", "AAPL · Price chart"],
    ["ECO UNRATE", "Economy · UNRATE"],
    ["W", "Watchlist"],
    ["N", "News"],
    ["AAPL N", "AAPL · News"],
  ])("%s → %s", (input, expected) => {
    const result = parseCommand(input);
    if (!result.ok) throw new Error(result.error);
    expect(commandTitle(result.command)).toBe(expected);
  });
});

describe("tickerCommand", () => {
  it("opens a clicked ticker's thesis check, which parses back to the same command", () => {
    expect(tickerCommand("AAPL")).toEqual({ fn: "THS", symbol: "AAPL", args: [] });
    for (const symbol of ["AAPL", "BRK-B", "^GSPC", "EURUSD=X", "BTC-USD"]) {
      expect(ok(formatCommand(tickerCommand(symbol)))).toEqual(tickerCommand(symbol));
    }
  });
});
