import { FUNCTION_BY_CODE, type FunctionDef } from "./functions";

export interface Command {
  fn: string;
  symbol?: string;
  args: string[];
}

export type ParseResult = { ok: true; command: Command } | { ok: false; error: string };

// AAPL, ^GSPC, EURUSD=X, BRK-B, BRK.B, GC=F, 000001.SS
const SYMBOL = /^[A-Z0-9^=.-]{1,15}$/;
// FRED series ids, e.g. UNRATE, A191RL1Q225SBEA
const ARG = /^[A-Z0-9_]{1,30}$/;

const fail = (error: string): ParseResult => ({ ok: false, error });

/** Parses `[SYMBOL] FUNCTION [ARG]`, case-insensitive. */
export function parseCommand(input: string): ParseResult {
  const tokens = input.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return fail("Type a command, e.g. AAPL GP. HELP lists all functions.");

  const [first, second] = tokens.map((t) => FUNCTION_BY_CODE.get(t));

  // Check "<SYM> <FN>" first so tickers that collide with codes still work ("W GP").
  if (second?.symbol === "required") return build(second, tokens[0], tokens.slice(2));
  if (first) {
    if (first.symbol === "required") return fail(`${first.code} needs a symbol, e.g. ${first.example}`);
    return build(first, undefined, tokens.slice(1));
  }
  if (second) return fail(`${second.code} doesn't take a symbol. Try: ${second.example}`);
  return fail(`Unknown function: ${tokens[1] ?? tokens[0]}. Type HELP.`);
}

function build(def: FunctionDef, symbol: string | undefined, args: string[]): ParseResult {
  if (symbol !== undefined && !SYMBOL.test(symbol)) return fail(`Invalid symbol: ${symbol}`);
  if (args.length > 0 && !def.arg) return fail(`${def.code} takes no arguments`);
  if (args.length > 1) return fail(`${def.code} takes one argument, e.g. ${def.example}`);
  if (args.length === 1 && !ARG.test(args[0])) return fail(`Invalid argument: ${args[0]}`);
  return { ok: true, command: symbol === undefined ? { fn: def.code, args } : { fn: def.code, symbol, args } };
}
