import { isSymbol } from "./commands";

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
