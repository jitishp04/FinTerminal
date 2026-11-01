import type { NextRequest } from "next/server";
import { readSymbols, respond } from "@/lib/api";
import { quotes } from "@/lib/providers/quotes";

/** GET /api/quote?symbols=AAPL,^GSPC,EURUSD=X → { quotes: Quote[] }. Unknown symbols are left out. */
export async function GET(request: NextRequest) {
  return respond(async () => ({ quotes: await quotes(readSymbols(request.nextUrl.searchParams, "symbols")) }));
}
