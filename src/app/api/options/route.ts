import type { NextRequest } from "next/server";
import { ApiError, readSymbol, respond } from "@/lib/api";
import * as yahoo from "@/lib/providers/yahoo";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/options?symbol=AAPL&expiry=2026-11-20 → OptionChain. Without an expiry, the nearest. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(async () => {
    const symbol = readSymbol(params, "symbol");
    const expiry = params.get("expiry") ?? undefined;
    if (expiry !== undefined && !DAY.test(expiry)) throw new ApiError(400, "expiry must be a date such as 2026-11-20");
    return yahoo.options(symbol, expiry);
  });
}
