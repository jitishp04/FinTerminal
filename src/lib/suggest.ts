import { formatCommand, isArg, isSymbol, parseCommand, type Command } from "./commands";
import { FUNCTION_BY_CODE, FUNCTIONS, type FunctionDef } from "./functions";

const SECURITY_FUNCTIONS = FUNCTIONS.filter((f) => f.symbol === "required");

/**
 * What to offer for the command bar's text, best first. `current` is the focused
 * panel's command: a bare function reuses its symbol ("DES" → "AAPL DES"), and a
 * bare ticker keeps its function ("MSFT" → "MSFT DES").
 */
export function suggest(input: string, current?: Command, limit = 8): Command[] {
  const text = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (!text) return [];

  const found: Command[] = [];
  const add = (command: Command) => {
    const key = formatCommand(command);
    if (!found.some((c) => formatCommand(c) === key)) found.push(command);
  };

  // Exactly what was typed: "AAPL GP", "W GP", "ECO UNRATE".
  const exact = parseCommand(text);
  if (exact.ok) add(exact.command);

  // The whole text names a function: "DES", "movers", "yield curve".
  const named = matchFunctions(text);
  for (const fn of named) add(openFunction(fn, current?.symbol));

  // A ticker (or ECO's series id) beside a function, either order: "AAPL chart", "chart AAPL", "economy UNRATE".
  const tokens = text.split(" ");
  if (tokens.length > 1) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (isSymbol(first)) {
      for (const fn of matchFunctions(tokens.slice(1).join(" "))) {
        if (fn.symbol === "required") add({ fn: fn.code, symbol: first, args: [] });
      }
    }
    for (const fn of matchFunctions(tokens.slice(0, -1).join(" "))) {
      if (fn.symbol === "required" && isSymbol(last)) add({ fn: fn.code, symbol: last, args: [] });
      else if (fn.arg && isArg(last)) add({ fn: fn.code, args: [last] });
    }
  }

  // A lone ticker: what you can open for it, the panel's current function first.
  // Words that also name a function ("gold") get one ticker row, not five.
  if (tokens.length === 1 && isSymbol(text) && !FUNCTION_BY_CODE.has(text)) {
    const currentFn = current && FUNCTION_BY_CODE.get(current.fn);
    const fns = currentFn?.symbol === "required" ? [currentFn, ...SECURITY_FUNCTIONS] : SECURITY_FUNCTIONS;
    for (const fn of named.length > 0 ? fns.slice(0, 1) : fns) add({ fn: fn.code, symbol: text, args: [] });
  }

  return found.slice(0, limit);
}

/** A function with nothing else typed. Symbol functions use `symbol`, or their example's. */
export function openFunction(fn: FunctionDef, symbol?: string): Command {
  if (fn.symbol === "none") return { fn: fn.code, args: [] };
  return { fn: fn.code, symbol: symbol ?? fn.example.split(" ")[0], args: [] };
}

/** Functions whose code, title or keywords start with `query`, best match first. */
function matchFunctions(query: string): FunctionDef[] {
  return FUNCTIONS.map((fn) => ({ fn, score: score(fn, query) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.fn);
}

function score(fn: FunctionDef, query: string): number {
  if (fn.code === query) return 3;
  if (fn.code.startsWith(query)) return 2;
  const phrases = [fn.title, ...fn.keywords].map((p) => p.toUpperCase());
  // One letter would match half the list, so words need two unless they match exactly ("?").
  const matches = (phrase: string) =>
    phrase === query || (query.length >= 2 && (phrase.startsWith(query) || phrase.split(" ").some((w) => w.startsWith(query))));
  return phrases.some(matches) ? 1 : 0;
}
