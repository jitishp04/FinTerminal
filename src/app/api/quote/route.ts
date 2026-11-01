import type { NextRequest } from "next/server";
import { ApiError, respond } from "@/lib/api";
import { isSymbol } from "@/lib/commands";
import { quotes } from "@/lib/providers/quotes";
import { MAX_QUOTE_SYMBOLS } from "@/lib/types";

/** GET /api/quote?symbols=AAPL,^GSPC,EURUSD=X → { quotes: Quote[] }. Unknown symbols are left out. */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  return respond(async () => {
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) throw new ApiError(400, "Missing ?symbols=, e.g. ?symbols=AAPL,MSFT");
    if (symbols.length > MAX_QUOTE_SYMBOLS) throw new ApiError(400, `At most ${MAX_QUOTE_SYMBOLS} symbols per request`);
    const invalid = symbols.find((s) => !isSymbol(s));
    if (invalid) throw new ApiError(400, `Invalid symbol: ${invalid}`);
    return { quotes: await quotes(symbols) };
  });
}
