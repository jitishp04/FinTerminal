import type { NextRequest } from "next/server";
import { readSymbols, respond } from "@/lib/api";
import { quotes } from "@/lib/providers/quotes";

/** GET /api/quote?symbols=AAPL,^GSPC,EURUSD=X → { quotes: Quote[] }. Unknown symbols are left out. */
export async function GET(request: NextRequest) {
  // Read outside respond(): reading the query is how the build learns the route is dynamic, and respond() would catch that.
  const params = request.nextUrl.searchParams;
  return respond(async () => ({ quotes: await quotes(readSymbols(params, "symbols")) }));
}
