import { isSymbol } from "./commands";
import { MAX_QUOTE_SYMBOLS } from "./types";

/** An error a route answers with as `{ error }` and this HTTP status. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Runs a route's work and answers with its JSON. Never throws: failures become `{ error }`. */
export async function respond(work: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await work());
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "The data source failed. Try again shortly." }, { status: 502 });
  }
}

/** The `name` query parameter as an upper-case symbol, or a 400. */
export function readSymbol(params: URLSearchParams, name: string): string {
  const value = params.get(name)?.trim().toUpperCase();
  if (!value) throw new ApiError(400, `Missing ?${name}=, e.g. ?${name}=AAPL`);
  if (!isSymbol(value)) throw new ApiError(400, `Invalid symbol: ${value}`);
  return value;
}

/** The `name` query parameter as a comma-separated list of upper-case symbols, or a 400. */
export function readSymbols(params: URLSearchParams, name: string): string[] {
  const symbols = (params.get(name) ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (symbols.length === 0) throw new ApiError(400, `Missing ?${name}=, e.g. ?${name}=AAPL,MSFT`);
  if (symbols.length > MAX_QUOTE_SYMBOLS) throw new ApiError(400, `At most ${MAX_QUOTE_SYMBOLS} symbols per request`);
  const invalid = symbols.find((s) => !isSymbol(s));
  if (invalid) throw new ApiError(400, `Invalid symbol: ${invalid}`);
  return symbols;
}
